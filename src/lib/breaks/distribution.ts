// Algoritmos puros de simulação de cobertura e distribuição inteligente
// de pausas flexíveis. Sem dependências de UI ou rede — fácil de testar.

import type { EmployeeBreak } from "@/lib/api/breaks";

export interface CoverageSlot {
  /** "HH:mm" */
  time: string;
  /** Total de colaboradores escalados no slot. */
  scheduled: number;
  /** Colaboradores em pausa (fixa ou flex já alocada) neste slot. */
  onBreak: number;
  /** scheduled - onBreak. */
  active: number;
  /** active < minCoverage. */
  understaffed: boolean;
}

export interface FlexAssignment {
  employee_id: string;
  start_time: string; // "HH:mm"
  end_time: string;   // "HH:mm"
}

export interface DistributionInput {
  /** Lista de colaboradores considerados ativos no dia (id). */
  employeeIds: string[];
  /** Todas as pausas configuradas (fixas e flex) — usamos as do weekday. */
  breaks: EmployeeBreak[];
  /** Janela de trabalho do dia: "HH:mm". */
  dayStart: string;
  dayEnd: string;
  /** Granularidade da grade. Default 30. */
  stepMin?: number;
  /** Cobertura mínima desejada por slot. */
  minCoverage?: number;
  /** Dia da semana (0=Dom..6=Sáb) — filtra pausas aplicáveis. */
  weekday: number;
}

const toMin = (t: string): number => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};

const fromMin = (m: number): string => {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${h}:${mm}`;
};

const breakAppliesToDay = (b: EmployeeBreak, weekday: number): boolean =>
  Array.isArray(b.weekdays) && b.weekdays.includes(weekday);

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean =>
  aStart < bEnd && aEnd > bStart;

/**
 * Distribui pausas flexíveis dentro de cada janela individual, minimizando
 * o pico de simultaneidade (greedy). Pausas fixas são respeitadas como
 * pré-alocação e não são alteradas.
 */
export function distributeFlexibleBreaks(input: DistributionInput): FlexAssignment[] {
  const { breaks, dayStart, dayEnd, weekday } = input;
  const step = input.stepMin ?? 15;

  const dayStartMin = toMin(dayStart);
  const dayEndMin = toMin(dayEnd);

  // Pré-aloca pausas fixas como ocupação inicial.
  const occupancy = new Map<number, number>(); // slotMin -> count
  const addOccupancy = (s: number, e: number) => {
    for (let t = s; t < e; t += step) {
      occupancy.set(t, (occupancy.get(t) ?? 0) + 1);
    }
  };

  const applicable = breaks.filter((b) => breakAppliesToDay(b, weekday));

  for (const b of applicable) {
    if (b.break_type !== "fixed" || !b.start_time || !b.end_time) continue;
    addOccupancy(toMin(b.start_time), toMin(b.end_time));
  }

  // Ordena flex pelos mais restritivos primeiro (janela mais curta).
  const flexes = applicable
    .filter((b) => b.break_type === "flexible" && b.duration_min && b.window_start && b.window_end)
    .map((b) => ({
      employee_id: b.employee_id,
      duration: b.duration_min!,
      winStart: Math.max(toMin(b.window_start!), dayStartMin),
      winEnd: Math.min(toMin(b.window_end!), dayEndMin),
    }))
    .filter((f) => f.winEnd - f.winStart >= f.duration)
    .sort((a, b) => (a.winEnd - a.winStart) - (b.winEnd - b.winStart));

  const assignments: FlexAssignment[] = [];

  for (const f of flexes) {
    let bestStart = f.winStart;
    let bestPeak = Infinity;

    for (let start = f.winStart; start + f.duration <= f.winEnd; start += step) {
      let peak = 0;
      for (let t = start; t < start + f.duration; t += step) {
        peak = Math.max(peak, (occupancy.get(t) ?? 0) + 1);
      }
      if (peak < bestPeak) {
        bestPeak = peak;
        bestStart = start;
      }
    }

    const end = bestStart + f.duration;
    addOccupancy(bestStart, end);
    assignments.push({
      employee_id: f.employee_id,
      start_time: fromMin(bestStart),
      end_time: fromMin(end),
    });
  }

  return assignments;
}

/**
 * Calcula cobertura por slot considerando pausas fixas + flex já atribuídas.
 */
export function simulateCoverage(params: {
  employeeIds: string[];
  breaks: EmployeeBreak[];
  flexAssignments?: FlexAssignment[];
  dayStart: string;
  dayEnd: string;
  weekday: number;
  stepMin?: number;
  minCoverage?: number;
}): CoverageSlot[] {
  const step = params.stepMin ?? 30;
  const minCoverage = params.minCoverage ?? 1;
  const startM = toMin(params.dayStart);
  const endM = toMin(params.dayEnd);

  // Para cada slot, conta quantos colaboradores estão em pausa.
  const slots: CoverageSlot[] = [];
  const applicable = params.breaks.filter((b) => breakAppliesToDay(b, params.weekday));
  const flexMap = new Map((params.flexAssignments ?? []).map((a) => [a.employee_id, a]));

  for (let t = startM; t < endM; t += step) {
    const slotEnd = t + step;
    let onBreak = 0;

    for (const emp of params.employeeIds) {
      const empBreaks = applicable.filter((b) => b.employee_id === emp);
      let isOnBreak = false;

      for (const b of empBreaks) {
        let s: number | null = null;
        let e: number | null = null;
        if (b.break_type === "fixed" && b.start_time && b.end_time) {
          s = toMin(b.start_time);
          e = toMin(b.end_time);
        } else if (b.break_type === "flexible") {
          const assigned = flexMap.get(emp);
          if (assigned) {
            s = toMin(assigned.start_time);
            e = toMin(assigned.end_time);
          } else if (b.window_start && b.window_end) {
            // sem distribuição: contamos a janela inteira como "potencialmente ocupado".
            s = toMin(b.window_start);
            e = toMin(b.window_end);
          }
        }
        if (s !== null && e !== null && overlaps(t, slotEnd, s, e)) {
          isOnBreak = true;
          break;
        }
      }
      if (isOnBreak) onBreak += 1;
    }

    const scheduled = params.employeeIds.length;
    const active = scheduled - onBreak;
    slots.push({
      time: fromMin(t),
      scheduled,
      onBreak,
      active,
      understaffed: active < minCoverage,
    });
  }

  return slots;
}
