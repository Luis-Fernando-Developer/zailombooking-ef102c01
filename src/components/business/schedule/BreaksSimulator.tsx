import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Activity, Wand2, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import type { EmployeeBreak } from "@/lib/api/breaks";
import {
  distributeFlexibleBreaks,
  simulateCoverage,
  type FlexAssignment,
} from "@/lib/breaks/distribution";

interface Props {
  companyId: string;
  employees: { id: string; name: string }[];
  breaks: EmployeeBreak[];
  canManage: boolean;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function BreaksSimulator({ companyId, employees, breaks, canManage }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [weekday, setWeekday] = useState<number>(new Date().getDay());
  const [dayStart, setDayStart] = useState("08:00");
  const [dayEnd, setDayEnd] = useState("18:00");
  const [minCoverage, setMinCoverage] = useState(1);
  const [assignments, setAssignments] = useState<FlexAssignment[] | null>(null);

  // Lê a "Duração do Slot" configurada em Regras → vincula a granularidade da simulação.
  const settingsQuery = useQuery({
    queryKey: ["company-schedule-settings", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_schedule_settings")
        .select("slot_duration_minutes")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
  const slotMin = settingsQuery.data?.slot_duration_minutes ?? 30;

  const employeeIds = useMemo(() => employees.map((e) => e.id), [employees]);
  const empName = useMemo(
    () => new Map(employees.map((e) => [e.id, e.name])),
    [employees],
  );

  const coverage = useMemo(
    () =>
      simulateCoverage({
        employeeIds,
        breaks,
        flexAssignments: assignments ?? undefined,
        dayStart,
        dayEnd,
        weekday,
        stepMin: slotMin,
        minCoverage,
      }),
    [employeeIds, breaks, assignments, dayStart, dayEnd, weekday, slotMin, minCoverage],
  );

  const peak = useMemo(
    () => coverage.reduce((acc, s) => Math.max(acc, s.onBreak), 0),
    [coverage],
  );
  const understaffedSlots = coverage.filter((s) => s.understaffed);

  const handleDistribute = () => {
    const result = distributeFlexibleBreaks({
      employeeIds,
      breaks,
      dayStart,
      dayEnd,
      weekday,
      stepMin: 15,
    });
    setAssignments(result);
    toast({
      title: "Distribuição calculada",
      description: `${result.length} pausa(s) flexível(eis) alocada(s).`,
    });
  };

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!assignments?.length) return;
      for (const a of assignments) {
        const flexRow = breaks.find(
          (b) =>
            b.employee_id === a.employee_id &&
            b.break_type === "flexible" &&
            Array.isArray(b.weekdays) &&
            b.weekdays.includes(weekday),
        );
        if (!flexRow) continue;
        const { error } = await supabase
          .from("employee_breaks")
          .update({
            break_type: "fixed",
            start_time: a.start_time,
            end_time: a.end_time,
            duration_min: null,
            window_start: null,
            window_end: null,
          })
          .eq("id", flexRow.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Pausas aplicadas",
        description: "Distribuição convertida em pausas fixas.",
      });
      setAssignments(null);
      qc.invalidateQueries({ queryKey: ["employee-breaks", companyId] });
    },
    onError: (e: any) =>
      toast({
        title: "Erro ao aplicar",
        description: e.message ?? "Falha ao aplicar distribuição.",
        variant: "destructive",
      }),
  });

  return (
    <Card className="card-glow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Simulador de cobertura & distribuição
        </CardTitle>
        <CardDescription>
          Visualize quantos colaboradores ficam ativos a cada{" "}
          <strong>{slotMin} min</strong> (igual à "Duração do Slot" em Regras) e distribua
          pausas flexíveis automaticamente para reduzir gargalos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-sm mb-1 block">Dia da semana</Label>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setWeekday(i)}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-md border transition-colors",
                    weekday === i
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border hover:bg-muted",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-sm mb-1 block">Início do dia</Label>
            <Input
              type="time"
              value={dayStart}
              onChange={(e) => setDayStart(e.target.value)}
              className="w-28"
            />
          </div>
          <div>
            <Label className="text-sm mb-1 block">Fim do dia</Label>
            <Input
              type="time"
              value={dayEnd}
              onChange={(e) => setDayEnd(e.target.value)}
              className="w-28"
            />
          </div>
          <div>
            <Label className="text-sm mb-1 block">Cobertura mínima</Label>
            <Input
              type="number"
              min={1}
              max={employees.length || 1}
              value={minCoverage}
              onChange={(e) => setMinCoverage(Math.max(1, Number(e.target.value) || 1))}
              className="w-24"
            />
          </div>
          {canManage && (
            <Button onClick={handleDistribute} variant="secondary">
              <Wand2 className="w-4 h-4 mr-2" />
              Distribuir flex automaticamente
            </Button>
          )}
        </div>

        {understaffedSlots.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Gargalo de cobertura</AlertTitle>
            <AlertDescription>
              {understaffedSlots.length} slot(s) abaixo do mínimo
              {assignments
                ? " mesmo após a distribuição. Considere ampliar janelas ou reduzir duração das pausas."
                : ". Tente distribuir flex automaticamente."}
            </AlertDescription>
          </Alert>
        )}

        {coverage.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Defina a janela do dia para gerar a simulação.
          </p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Slot (30 min)</span>
              <span>Ativos / Escalados • Pico em pausa: {peak}</span>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {coverage.map((s) => {
                const pct = s.scheduled === 0 ? 0 : (s.active / s.scheduled) * 100;
                return (
                  <div
                    key={s.time}
                    className="grid grid-cols-[60px_1fr_80px] items-center gap-3 px-3 py-1.5"
                  >
                    <span className="text-xs font-mono text-muted-foreground">{s.time}</span>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all",
                          s.understaffed ? "bg-destructive" : "bg-primary",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium text-right",
                        s.understaffed && "text-destructive",
                      )}
                    >
                      {s.active}/{s.scheduled}
                      {s.onBreak > 0 && (
                        <span className="text-muted-foreground"> · -{s.onBreak}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {assignments && assignments.length > 0 && (
          <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Distribuição sugerida ({WEEKDAYS[weekday]})
            </div>
            <div className="flex flex-wrap gap-2">
              {assignments.map((a) => (
                <Badge key={a.employee_id} variant="secondary" className="font-normal">
                  {empName.get(a.employee_id) ?? a.employee_id.slice(0, 6)}: {a.start_time}–
                  {a.end_time}
                </Badge>
              ))}
            </div>
            {canManage && (
              <Button
                size="sm"
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending}
              >
                {applyMutation.isPending
                  ? "Aplicando…"
                  : "Aplicar como pausas fixas"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
