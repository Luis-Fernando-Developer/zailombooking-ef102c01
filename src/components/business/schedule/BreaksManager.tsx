import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Coffee, Save, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchScheduledEmployeesInActiveCycle,
  fetchBreaks,
  upsertBreaksBulk,
  deleteBreak,
  type BreakType,
  type EmployeeBreak,
} from "@/lib/api/breaks";

interface BreaksManagerProps {
  companyId: string;
  canManage?: boolean;
}

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

export function BreaksManager({ companyId, canManage = true }: BreaksManagerProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [breakType, setBreakType] = useState<BreakType>("fixed");
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [durationMin, setDurationMin] = useState(60);
  const [windowStart, setWindowStart] = useState("11:00");
  const [windowEnd, setWindowEnd] = useState("15:00");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);

  const employeesQuery = useQuery({
    queryKey: ["scheduled-employees", companyId],
    queryFn: () => fetchScheduledEmployeesInActiveCycle(companyId),
    enabled: !!companyId,
  });

  const breaksQuery = useQuery({
    queryKey: ["employee-breaks", companyId],
    queryFn: () => fetchBreaks(companyId),
    enabled: !!companyId,
  });

  const breaksByEmployee = useMemo(() => {
    const m = new Map<string, EmployeeBreak[]>();
    (breaksQuery.data ?? []).forEach((b) => {
      const arr = m.get(b.employee_id) ?? [];
      arr.push(b);
      m.set(b.employee_id, arr);
    });
    return m;
  }, [breaksQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (selectedIds.length === 0) throw new Error("Selecione ao menos 1 colaborador.");
      if (weekdays.length === 0) throw new Error("Selecione ao menos 1 dia da semana.");
      await upsertBreaksBulk(companyId, null, selectedIds, {
        break_type: breakType,
        start_time: breakType === "fixed" ? startTime : null,
        end_time: breakType === "fixed" ? endTime : null,
        duration_min: breakType === "flexible" ? durationMin : null,
        window_start: breakType === "flexible" ? windowStart : null,
        window_end: breakType === "flexible" ? windowEnd : null,
        weekdays,
      });
    },
    onSuccess: () => {
      toast({ title: "Intervalos salvos", description: "Configuração aplicada com sucesso." });
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ["employee-breaks", companyId] });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message ?? "Falha ao salvar.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBreak(id),
    onSuccess: () => {
      toast({ title: "Removido", description: "Intervalo removido." });
      qc.invalidateQueries({ queryKey: ["employee-breaks", companyId] });
    },
  });

  const toggleEmployee = (id: string) => {
    setSelectedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const toggleWeekday = (d: number) => {
    setWeekdays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort()));
  };

  const employees = employeesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-primary" />
            Intervalos dos Colaboradores
          </CardTitle>
          <CardDescription>
            Configure pausas fixas ou flexíveis para colaboradores escalados no ciclo vigente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Lista de colaboradores */}
          <div>
            <Label className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4" />
              Colaboradores escalados
            </Label>
            {employeesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : employees.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum colaborador escalado encontrado.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {employees.map((e) => {
                  const existing = breaksByEmployee.get(e.id) ?? [];
                  const checked = selectedIds.includes(e.id);
                  return (
                    <div
                      key={e.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                        checked ? "border-primary bg-primary/5" : "border-border bg-card",
                      )}
                    >
                      <Checkbox
                        id={`emp-${e.id}`}
                        checked={checked}
                        onCheckedChange={() => canManage && toggleEmployee(e.id)}
                        disabled={!canManage}
                      />
                      <div className="flex-1 min-w-0">
                        <Label htmlFor={`emp-${e.id}`} className="cursor-pointer font-medium block">
                          {e.name}
                        </Label>
                        {e.role && (
                          <p className="text-xs text-muted-foreground capitalize">{e.role}</p>
                        )}
                        {existing.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {existing.map((b) => (
                              <div
                                key={b.id}
                                className="flex items-center justify-between gap-2 text-xs"
                              >
                                <Badge variant="secondary" className="font-normal">
                                  {b.break_type === "fixed"
                                    ? `Fixa ${b.start_time?.slice(0, 5)}–${b.end_time?.slice(0, 5)}`
                                    : `Flex ${b.duration_min}min`}
                                </Badge>
                                {canManage && (
                                  <button
                                    type="button"
                                    onClick={() => deleteMutation.mutate(b.id)}
                                    className="text-muted-foreground hover:text-destructive"
                                    aria-label="Remover intervalo"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {canManage && selectedIds.length > 0 && (
            <>
              <Separator />

              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">Tipo de pausa</Label>
                  <RadioGroup
                    value={breakType}
                    onValueChange={(v) => setBreakType(v as BreakType)}
                    className="flex flex-wrap gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="fixed" id="bt-fixed" />
                      <Label htmlFor="bt-fixed" className="cursor-pointer">
                        Pausa fixa
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="flexible" id="bt-flex" />
                      <Label htmlFor="bt-flex" className="cursor-pointer">
                        Pausa flexível
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {breakType === "fixed" ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <Label className="text-sm mb-1 block">Início</Label>
                      <Input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-32"
                      />
                    </div>
                    <div>
                      <Label className="text-sm mb-1 block">Fim</Label>
                      <Input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-32"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <Label className="text-sm mb-1 block">Duração (min)</Label>
                      <Input
                        type="number"
                        min={5}
                        max={480}
                        value={durationMin}
                        onChange={(e) => setDurationMin(Number(e.target.value) || 0)}
                        className="w-28"
                      />
                    </div>
                    <div>
                      <Label className="text-sm mb-1 block">Janela início</Label>
                      <Input
                        type="time"
                        value={windowStart}
                        onChange={(e) => setWindowStart(e.target.value)}
                        className="w-32"
                      />
                    </div>
                    <div>
                      <Label className="text-sm mb-1 block">Janela fim</Label>
                      <Input
                        type="time"
                        value={windowEnd}
                        onChange={(e) => setWindowEnd(e.target.value)}
                        className="w-32"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <Label className="mb-2 block">Dias da semana</Label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((d) => {
                      const on = weekdays.includes(d.value);
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => toggleWeekday(d.value)}
                          className={cn(
                            "px-3 py-1.5 rounded-md text-sm border transition-colors",
                            on
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card text-foreground border-border hover:bg-muted",
                          )}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saveMutation.isPending
                    ? "Salvando…"
                    : `Aplicar a ${selectedIds.length} colaborador(es)`}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
