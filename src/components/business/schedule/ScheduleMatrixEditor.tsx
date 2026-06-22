import { useEffect, useMemo, useState } from "react";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Save, Send, RefreshCw, Wand2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  ScheduleRow, ScheduleEntry, EntryType, ENTRY_TYPE_LABEL, ENTRY_TYPE_COLOR,
  fetchScheduleEntries, upsertScheduleEntry, bulkUpdateEntries,
  generateSchedule, fetchTemplates, ScheduleTemplate,
} from "@/lib/api/schedules";
import { SubmitScheduleDialog } from "./SubmitScheduleDialog";

interface Props {
  schedule: ScheduleRow;
  tenantId: string;
  readOnly?: boolean;
  onChanged?: () => void;
  onClose?: () => void;
}

interface Emp { id: string; name: string; }

const ENTRY_TYPES: EntryType[] = ["T", "F", "A", "FA", "D"];

export function ScheduleMatrixEditor({ schedule, tenantId, readOnly, onChanged, onClose }: Props) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<string>(schedule.template_id ?? "");
  const [selectedEmps, setSelectedEmps] = useState<string[]>([]);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const days = useMemo(
    () => eachDayOfInterval({ start: parseISO(schedule.period_start), end: parseISO(schedule.period_end) }),
    [schedule.period_start, schedule.period_end]
  );

  const load = async () => {
    const [empsRes, ents, tpls] = await Promise.all([
      supabase.from("employees").select("id, name").eq("company_id", tenantId).eq("is_active", true).order("name"),
      fetchScheduleEntries(schedule.id),
      fetchTemplates(tenantId),
    ]);
    setEmployees((empsRes.data ?? []) as Emp[]);
    setEntries(ents);
    setTemplates(tpls);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [schedule.id]);

  // Map (empId|date) -> entry
  const entryMap = useMemo(() => {
    const m = new Map<string, ScheduleEntry>();
    entries.forEach((e) => m.set(`${e.employee_id}|${e.entry_date}`, e));
    return m;
  }, [entries]);

  const visibleEmployees = useMemo(() => {
    // Mostra apenas employees com entries OU se ainda não há entries, todos
    if (entries.length === 0) return employees;
    const ids = new Set(entries.map((e) => e.employee_id));
    return employees.filter((e) => ids.has(e.id));
  }, [employees, entries]);

  const handleGenerate = async () => {
    if (!selectedEmps.length) {
      toast({ title: "Selecione colaboradores", description: "Marque ao menos 1 colaborador.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await generateSchedule({
        tenant_id: tenantId,
        schedule_id: schedule.id,
        template_id: selectedTpl || null,
        employee_ids: selectedEmps,
      });
      await load();
      onChanged?.();
      toast({ title: "Escala gerada" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const toggleCell = (empId: string, date: string) => {
    if (readOnly) return;
    const key = `${empId}|${date}`;
    const next = new Set(selectedCells);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelectedCells(next);
  };

  const bulkSetType = async (type: EntryType) => {
    const ids = Array.from(selectedCells).map((k) => entryMap.get(k)?.id).filter(Boolean) as string[];
    if (!ids.length) return;
    setBusy(true);
    try {
      await bulkUpdateEntries(ids, { entry_type: type });
      await load();
      setSelectedCells(new Set());
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const handleCellChange = async (entry: ScheduleEntry, patch: Partial<ScheduleEntry>) => {
    setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, ...patch } : e));
    try {
      await upsertScheduleEntry({ id: entry.id, ...patch });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      await load();
    }
  };

  const [submitOpen, setSubmitOpen] = useState(false);

  const handleSubmit = () => setSubmitOpen(true);

  const canEdit = !readOnly && (schedule.status === "draft" || schedule.status === "revision_requested");


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm font-medium">{schedule.name}</span>
        <span className="text-xs text-muted-foreground">
          {format(parseISO(schedule.period_start), "dd/MM/yy")} → {format(parseISO(schedule.period_end), "dd/MM/yy")}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{schedule.status}</span>
      </div>

      {canEdit && entries.length === 0 && (
        <div className="border border-dashed border-border rounded-md p-4 space-y-3">
          <p className="text-sm font-medium">Gerar escala automaticamente</p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Modelo (opcional)</label>
              <Select value={selectedTpl || "__none__"} onValueChange={(v) => setSelectedTpl(v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Sem modelo (usa horários)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem modelo</SelectItem>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
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
                  <label key={e.id} className="flex items-center gap-2 text-xs border border-border rounded-md px-2 py-1 cursor-pointer">
                    <Checkbox checked={checked} onCheckedChange={(v) => {
                      setSelectedEmps((prev) => v ? [...prev, e.id] : prev.filter((x) => x !== e.id));
                    }} />
                    {e.name}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {canEdit && selectedCells.size > 0 && (
        <div className="flex flex-wrap gap-2 items-center p-2 border border-primary/30 bg-primary/5 rounded-md">
          <span className="text-xs">{selectedCells.size} célula(s) selecionada(s):</span>
          {ENTRY_TYPES.map((t) => (
            <Button key={t} size="sm" variant="outline" disabled={busy} onClick={() => bulkSetType(t)}>
              {t} · {ENTRY_TYPE_LABEL[t]}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelectedCells(new Set())}>Limpar</Button>
        </div>
      )}

      {entries.length > 0 && (
        <div className="overflow-auto border border-border rounded-md">
          <table className="text-xs min-w-full">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <th className="text-left p-2 sticky left-0 bg-muted/40 z-10 border-r border-border">Colaborador</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className="p-1 text-center border-r border-border min-w-[64px]">
                    <div className="text-[10px] text-muted-foreground">{format(d, "EEE", { locale: ptBR })}</div>
                    <div>{format(d, "dd/MM")}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.map((emp) => (
                <tr key={emp.id} className="border-t border-border">
                  <td className="p-2 sticky left-0 bg-background z-10 border-r border-border font-medium">{emp.name}</td>
                  {days.map((d) => {
                    const date = format(d, "yyyy-MM-dd");
                    const entry = entryMap.get(`${emp.id}|${date}`);
                    if (!entry) return <td key={date} className="p-1 border-r border-border bg-muted/10" />;
                    const key = `${emp.id}|${date}`;
                    const selected = selectedCells.has(key);
                    return (
                      <td
                        key={date}
                        onClick={() => toggleCell(emp.id, date)}
                        className={`p-1 border-r border-border cursor-pointer ${selected ? "ring-2 ring-primary ring-inset" : ""}`}
                      >
                        <div className={`text-center rounded border px-1 py-0.5 ${ENTRY_TYPE_COLOR[entry.entry_type]}`}>
                          {entry.entry_type}
                        </div>
                        {entry.entry_type === "T" && canEdit && (
                          <div className="mt-1 space-y-0.5" onClick={(e) => e.stopPropagation()}>
                            <Input type="time" value={entry.start_time ?? ""}
                              onChange={(e) => handleCellChange(entry, { start_time: e.target.value || null })}
                              className="h-6 text-[10px] px-1" />
                            <Input type="time" value={entry.end_time ?? ""}
                              onChange={(e) => handleCellChange(entry, { end_time: e.target.value || null })}
                              className="h-6 text-[10px] px-1" />
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="ghost" onClick={onClose}>Fechar</Button>
        {canEdit && entries.length > 0 && (
          <>
            <Button variant="outline" onClick={load} disabled={busy}><RefreshCw className="w-4 h-4 mr-1" /> Recarregar</Button>
            <Button onClick={handleSubmit} disabled={busy}><Send className="w-4 h-4 mr-1" /> Enviar para aprovação</Button>
          </>
        )}
      </div>

      <SubmitScheduleDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        tenantId={tenantId}
        scheduleId={schedule.id}
        scheduleName={schedule.name}
        onSubmitted={() => { onChanged?.(); onClose?.(); }}
      />
    </div>
  );
}
