import { useEffect, useMemo, useState } from "react";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Send, RefreshCw, Wand2, Trash2, UserPlus } from "lucide-react";
import {
  ScheduleRow,
  ScheduleEntry,
  EntryType,
  ENTRY_TYPE_LABEL,
  ENTRY_TYPE_COLOR,
  fetchScheduleEntries,
  upsertScheduleEntry,
  bulkUpdateEntries,
  generateSchedule,
  fetchTemplates,
  ScheduleTemplate,
  listSchedulableEmployees,
  addEmployeesToSchedule,
  removeEmployeesFromSchedule,
  SCHEDULE_STATUS_LABEL,
} from "@/lib/api/schedules";
import { SubmitScheduleDialog } from "./SubmitScheduleDialog";

interface Props {
  schedule: ScheduleRow;
  tenantId: string;
  readOnly?: boolean;
  onChanged?: () => void;
  onClose?: () => void;
}

interface Emp {
  id: string;
  name: string;
}

const ENTRY_TYPES: EntryType[] = ["T", "F", "A", "FA", "D"];

export function ScheduleMatrixEditor({ schedule, tenantId, readOnly, onChanged, onClose }: Props) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<string>(schedule.template_id ?? "");
  const [selectedEmps, setSelectedEmps] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const days = useMemo(
    () => eachDayOfInterval({ start: parseISO(schedule.period_start), end: parseISO(schedule.period_end) }),
    [schedule.period_start, schedule.period_end],
  );

  const load = async () => {
    const [emps, ents, tpls] = await Promise.all([
      listSchedulableEmployees(tenantId).catch(() => [] as Array<{ id: string; name: string }>),
      fetchScheduleEntries(schedule.id),
      fetchTemplates(tenantId),
    ]);
    setEmployees(emps.map((e) => ({ id: e.id, name: e.name })));
    setEntries(ents);
    setTemplates(tpls);
    setSelectedRows(new Set());
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [schedule.id]);

  const entryMap = useMemo(() => {
    const m = new Map<string, ScheduleEntry>();
    entries.forEach((e) => m.set(`${e.employee_id}|${e.entry_date}`, e));
    return m;
  }, [entries]);

  const visibleEmployees = useMemo(() => {
    if (entries.length === 0) return [] as Emp[];
    const ids = new Set(entries.map((e) => e.employee_id));
    return employees.filter((e) => ids.has(e.id));
  }, [employees, entries]);

  const availableToAdd = useMemo(() => {
    const inMatrix = new Set(visibleEmployees.map((e) => e.id));
    return employees.filter((e) => !inMatrix.has(e.id));
  }, [employees, visibleEmployees]);

  const canEdit = !readOnly;

  const handleGenerate = async () => {
    if (!selectedEmps.length) {
      toast({ title: "Selecione colaboradores", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // Se a escala não está em draft, usa modo append para não apagar entradas existentes
      const isDraft = schedule.status === 'draft';
      await generateSchedule({
        tenant_id: tenantId,
        schedule_id: schedule.id,
        template_id: selectedTpl || null,
        employee_ids: selectedEmps,
        append: !isDraft,
      } as any);
      await load();
      onChanged?.();
      toast({ title: "Escala gerada" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleAddEmployee = async (empId: string) => {
    setBusy(true);
    try {
      await addEmployeesToSchedule({
        tenant_id: tenantId,
        schedule_id: schedule.id,
        template_id: schedule.template_id,
        employee_ids: [empId],
      });
      await load();
      onChanged?.();
      toast({ title: "Colaborador adicionado à escala" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveSelected = async () => {
    const ids = Array.from(selectedRows);
    if (!ids.length) return;
    if (
      !confirm(`Remover ${ids.length} colaborador(es) desta escala? Os agendamentos existentes não serão cancelados.`)
    )
      return;
    setBusy(true);
    try {
      await removeEmployeesFromSchedule(schedule.id, ids);
      await load();
      onChanged?.();
      toast({ title: "Colaboradores removidos" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleCell = (empId: string, date: string) => {
    if (!canEdit) return;
    const key = `${empId}|${date}`;
    const next = new Set(selectedCells);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelectedCells(next);
  };

  const bulkSetType = async (type: EntryType) => {
    const ids = Array.from(selectedCells)
      .map((k) => entryMap.get(k)?.id)
      .filter(Boolean) as string[];
    if (!ids.length) return;
    setBusy(true);
    try {
      await bulkUpdateEntries(ids, { entry_type: type });
      await load();
      setSelectedCells(new Set());
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleCellChange = async (entry: ScheduleEntry, patch: Partial<ScheduleEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, ...patch } : e)));
    try {
      await upsertScheduleEntry({ id: entry.id, ...patch });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      await load();
    }
  };

  const toggleRow = (id: string) => {
    const n = new Set(selectedRows);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelectedRows(n);
  };
  const toggleAllRows = () => {
    if (selectedRows.size === visibleEmployees.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(visibleEmployees.map((e) => e.id)));
  };

  const allChecked = visibleEmployees.length > 0 && selectedRows.size === visibleEmployees.length;

  return (
    <>
      {/* Description 1: período + status + ações */}
      <div className="px-4 py-2 border-b border-border shrink-0 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{schedule.name}</span>
        <span className="text-xs text-muted-foreground">
          {format(parseISO(schedule.period_start), "dd/MM/yy")} → {format(parseISO(schedule.period_end), "dd/MM/yy")}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
          {SCHEDULE_STATUS_LABEL[schedule.status] ?? schedule.status}
        </span>

        {canEdit && entries.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy || availableToAdd.length === 0}>
                <UserPlus className="w-4 h-4 mr-1" /> Colaborador
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-auto">
              <DropdownMenuLabel>Adicionar à escala</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableToAdd.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum disponível</div>
              )}
              {availableToAdd.map((e) => (
                <DropdownMenuItem key={e.id} onClick={() => handleAddEmployee(e.id)}>
                  {e.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {canEdit && selectedRows.size > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={handleRemoveSelected}
            disabled={busy}
          >
            <Trash2 className="w-4 h-4 mr-1" /> Remover linha ({selectedRows.size})
          </Button>
        )}
      </div>

      {/* Description 2: toolbar de células selecionadas */}
      {canEdit && selectedCells.size > 0 && (
        <div className="px-4 py-2 border-b border-border shrink-0 flex flex-wrap gap-2 items-center bg-primary/5">
          <span className="text-xs">{selectedCells.size} célula(s) selecionada(s):</span>
          {ENTRY_TYPES.map((t) => (
            <Button key={t} size="sm" variant="outline" disabled={busy} onClick={() => bulkSetType(t)}>
              {t} · {ENTRY_TYPE_LABEL[t]}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelectedCells(new Set())}>
            Limpar
          </Button>
        </div>
      )}

      {/* Content: tabela com scroll, colunas fixas */}
      <div className="flex-1 overflow-hidden p-4 min-h-0">
        {entries.length === 0 ? (
          canEdit ? (
            <div className="border border-dashed border-border rounded-md p-4 space-y-3 h-full overflow-auto">
              <p className="text-sm font-medium">Gerar escala automaticamente</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Modelo (opcional)</label>
                  <Select
                    value={selectedTpl || "__none__"}
                    onValueChange={(v) => setSelectedTpl(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem modelo</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleGenerate} disabled={busy || !selectedEmps.length}>
                  <Wand2 className="w-4 h-4 mr-1" /> Gerar
                </Button>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Colaboradores:</p>
                <div className="flex flex-wrap gap-2">
                  {employees.map((e) => {
                    const checked = selectedEmps.includes(e.id);
                    return (
                      <label
                        key={e.id}
                        className="flex items-center gap-2 text-xs border border-border rounded-md px-2 py-1 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setSelectedEmps((prev) => (v ? [...prev, e.id] : prev.filter((x) => x !== e.id)));
                          }}
                        />
                        {e.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma entrada nesta escala.</p>
          )
        ) : (
          <div className="h-full overflow-auto border border-border rounded-md">
            <table className="text-xs border-separate border-spacing-0">
              <thead>
                <tr>
                  <th
                    style={{ width: 32, minWidth: 32, maxWidth: 32, left: 0 }}
                    className="sticky top-0 z-30 bg-muted/60 backdrop-blur border-b border-r border-border p-0 text-center align-middle"
                  >
                    {canEdit && (
                      <div className="flex items-center justify-center">
                        <Checkbox checked={allChecked} onCheckedChange={toggleAllRows} aria-label="Selecionar todos" />
                      </div>
                    )}
                  </th>
                  <th
                    style={{ left: 32, minWidth: 160 }}
                    className="sticky top-0 z-30 bg-muted/60 backdrop-blur border-b border-r border-border text-left px-2"
                  >
                    Colaborador
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.toISOString()}
                      className="sticky top-0 z-20 bg-muted/60 backdrop-blur p-1 text-center border-b border-r border-border min-w-[72px]"
                    >
                      <div className="text-[10px] text-muted-foreground">{format(d, "EEE", { locale: ptBR })}</div>
                      <div>{format(d, "dd/MM")}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.map((emp) => {
                  const rowSelected = selectedRows.has(emp.id);
                  return (
                    <tr key={emp.id}>
                      <td
                        style={{ width: 32, minWidth: 32, maxWidth: 32, left: 0 }}
                        className={`sticky z-10 ${rowSelected ? "bg-primary/10" : "bg-background"} border-b border-r border-border p-0 text-center align-middle`}
                      >
                        {canEdit && (
                          <div className="flex items-center justify-center">
                            <Checkbox
                              checked={rowSelected}
                              onCheckedChange={() => toggleRow(emp.id)}
                              aria-label={`Selecionar ${emp.name}`}
                            />
                          </div>
                        )}
                      </td>
                      <td
                        style={{ left: 32 }}
                        className={`sticky z-10 ${rowSelected ? "bg-primary/10" : "bg-background"} border-b border-r border-border px-2 py-2 font-medium`}
                      >
                        {emp.name}
                      </td>
                      {days.map((d) => {
                        const date = format(d, "yyyy-MM-dd");
                        const entry = entryMap.get(`${emp.id}|${date}`);
                        if (!entry)
                          return <td key={date} className="p-1 border-b border-r border-border bg-muted/10" />;
                        const key = `${emp.id}|${date}`;
                        const selected = selectedCells.has(key);
                        return (
                          <td
                            key={date}
                            onClick={() => toggleCell(emp.id, date)}
                            className={`p-1 border-b border-r border-border align-top ${canEdit ? "cursor-pointer" : ""} ${selected ? "ring-2 ring-primary ring-inset" : ""}`}
                          >
                            <div
                              className={`text-center rounded border px-1 py-0.5 ${ENTRY_TYPE_COLOR[entry.entry_type]}`}
                            >
                              {entry.entry_type}
                            </div>
                            {entry.entry_type === "T" && canEdit && (
                              <div className="mt-1 space-y-0.5" onClick={(e) => e.stopPropagation()}>
                                <Input
                                  type="time"
                                  value={entry.start_time ?? ""}
                                  onChange={(e) => handleCellChange(entry, { start_time: e.target.value || null })}
                                  className="h-6 text-[10px] px-1"
                                />
                                <Input
                                  type="time"
                                  value={entry.end_time ?? ""}
                                  onChange={(e) => handleCellChange(entry, { end_time: e.target.value || null })}
                                  className="h-6 text-[10px] px-1"
                                />
                              </div>
                            )}
                            {entry.entry_type === "T" && !canEdit && (
                              <div className="text-[10px] text-center text-muted-foreground mt-0.5">
                                {entry.start_time?.slice(0, 5)}–{entry.end_time?.slice(0, 5)}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border shrink-0 flex flex-wrap gap-2 justify-end">
        {canEdit && entries.length > 0 && (
          <>
            <Button variant="outline" onClick={load} disabled={busy}>
              <RefreshCw className="w-4 h-4 mr-1" /> Recarregar
            </Button>
            {(schedule.status === "draft" || schedule.status === "revision_requested") && (
              <Button onClick={() => setSubmitOpen(true)} disabled={busy}>
                <Send className="w-4 h-4 mr-1" /> Enviar para aprovação
              </Button>
            )}
          </>
        )}
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      </div>

      <SubmitScheduleDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        tenantId={tenantId}
        scheduleId={schedule.id}
        scheduleName={schedule.name}
        onSubmitted={() => {
          onChanged?.();
          onClose?.();
        }}
      />
    </>
  );
}
