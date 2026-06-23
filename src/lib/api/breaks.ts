import { supabase } from "@/lib/supabaseClient";

export type BreakType = "fixed" | "flexible";

export interface EmployeeBreak {
  id: string;
  company_id: string;
  employee_id: string;
  cycle_id: string | null;
  break_type: BreakType;
  start_time: string | null;
  end_time: string | null;
  duration_min: number | null;
  window_start: string | null;
  window_end: string | null;
  weekdays: number[];
  created_at: string;
  updated_at: string;
}

export interface BreakConfig {
  break_type: BreakType;
  start_time?: string | null;
  end_time?: string | null;
  duration_min?: number | null;
  window_start?: string | null;
  window_end?: string | null;
  weekdays: number[];
}

export interface ScheduledEmployee {
  id: string;
  name: string;
  role: string | null;
}

/**
 * Busca colaboradores escalados no período aprovado mais recente que cobre hoje.
 * Fallback: lista todos os employees ativos da empresa.
 */
export async function fetchScheduledEmployeesInActiveCycle(
  companyId: string,
): Promise<ScheduledEmployee[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: schedule } = await supabase
    .from("schedules")
    .select("id")
    .eq("tenant_id", companyId)
    .in("status", ["approved", "partially_approved"])
    .lte("period_start", today)
    .gte("period_end", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (schedule?.id) {
    const { data: entries } = await supabase
      .from("schedule_entries")
      .select("employee_id")
      .eq("schedule_id", schedule.id)
      .eq("decision_status", "approved")
      .eq("entry_type", "T");

    const ids = Array.from(new Set((entries ?? []).map((e: any) => e.employee_id)));
    if (ids.length > 0) {
      const { data: emps } = await supabase
        .from("employees")
        .select("id, name, role")
        .in("id", ids);
      return (emps ?? []) as ScheduledEmployee[];
    }
  }

  // Fallback
  const { data: all } = await supabase
    .from("employees")
    .select("id, name, role")
    .eq("company_id", companyId)
    .order("name");
  return (all ?? []) as ScheduledEmployee[];
}

export async function fetchBreaks(
  companyId: string,
  cycleId?: string | null,
): Promise<EmployeeBreak[]> {
  let q = supabase.from("employee_breaks").select("*").eq("company_id", companyId);
  if (cycleId) q = q.eq("cycle_id", cycleId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmployeeBreak[];
}

export async function upsertBreaksBulk(
  companyId: string,
  cycleId: string | null,
  employeeIds: string[],
  config: BreakConfig,
): Promise<void> {
  if (employeeIds.length === 0) return;

  // Remove configs anteriores do ciclo para esses colaboradores
  let del = supabase
    .from("employee_breaks")
    .delete()
    .eq("company_id", companyId)
    .in("employee_id", employeeIds);
  if (cycleId) del = del.eq("cycle_id", cycleId);
  await del;

  const rows = employeeIds.map((employee_id) => ({
    company_id: companyId,
    employee_id,
    cycle_id: cycleId,
    break_type: config.break_type,
    start_time: config.break_type === "fixed" ? config.start_time ?? null : null,
    end_time: config.break_type === "fixed" ? config.end_time ?? null : null,
    duration_min: config.break_type === "flexible" ? config.duration_min ?? null : null,
    window_start: config.break_type === "flexible" ? config.window_start ?? null : null,
    window_end: config.break_type === "flexible" ? config.window_end ?? null : null,
    weekdays: config.weekdays,
  }));

  const { error } = await supabase.from("employee_breaks").insert(rows);
  if (error) throw error;
}

export async function deleteBreak(id: string): Promise<void> {
  const { error } = await supabase.from("employee_breaks").delete().eq("id", id);
  if (error) throw error;
}
