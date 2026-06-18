import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchScheduleEntries, bulkUpdateEntries,
  ScheduleEntry, ENTRY_TYPE_LABEL, ENTRY_TYPE_COLOR, EntryDecision,
} from "@/lib/api/schedules";

interface Props {
  scheduleId: string;
  tenantId: string;
  canDecide: boolean;
  onChanged?: () => void;
}

interface Emp { id: string; name: string; }

export function ScheduleApprovalTable({ scheduleId, tenantId, canDecide, onChanged }: Props) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [ents, emps] = await Promise.all([
      fetchScheduleEntries(scheduleId),
      supabase.from("employees").select("id, name").eq("company_id", tenantId),
    ]);
    setEntries(ents);
    setEmployees((emps.data ?? []) as Emp[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scheduleId]);

  const empName = useMemo(() => {
    const m = new Map(employees.map((e) => [e.id, e.name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [employees]);

  const counts = useMemo(() => ({
    total: entries.length,
    pending: entries.filter((e) => e.decision_status === "pending").length,
    approved: entries.filter((e) => e.decision_status === "approved").length,
    rejected: entries.filter((e) => e.decision_status === "rejected").length,
    revise: entries.filter((e) => e.decision_status === "revise").length,
  }), [entries]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === entries.length) setSelected(new Set());
    else setSelected(new Set(entries.map((e) => e.id)));
  };

  const applyDecision = async (decision: EntryDecision) => {
    const ids = selected.size > 0 ? Array.from(selected) : entries.map((e) => e.id);
    if (!ids.length) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await bulkUpdateEntries(ids, {
        decision_status: decision,
        decided_by: user?.id ?? null,
        decided_at: new Date().toISOString(),
      });
      setSelected(new Set());
      await load();
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 rounded bg-muted">Total: {counts.total}</span>
        <span className="px-2 py-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400">Pendentes: {counts.pending}</span>
        <span className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Aprovadas: {counts.approved}</span>
        <span className="px-2 py-1 rounded bg-destructive/15 text-destructive">Rejeitadas: {counts.rejected}</span>
        <span className="px-2 py-1 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400">Revisão: {counts.revise}</span>
      </div>

      {canDecide && (
        <div className="flex flex-wrap gap-2 items-center p-2 border border-border rounded-md">
          <span className="text-xs">
            {selected.size > 0 ? `${selected.size} selecionada(s)` : "Todas as linhas"}:
          </span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => applyDecision("approved")}>
            <CheckCircle className="w-3.5 h-3.5 mr-1" /> Aprovar
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => applyDecision("rejected")}>
            <XCircle className="w-3.5 h-3.5 mr-1" /> Rejeitar
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => applyDecision("revise")}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Revisão
          </Button>
        </div>
      )}

      <div className="overflow-auto border border-border rounded-md max-h-[50vh]">
        <table className="text-xs min-w-full">
          <thead className="bg-muted/40 sticky top-0">
            <tr>
              {canDecide && (
                <th className="p-2 w-8">
                  <Checkbox checked={selected.size === entries.length && entries.length > 0} onCheckedChange={toggleAll} />
                </th>
              )}
              <th className="p-2 text-left">Colaborador</th>
              <th className="p-2 text-left">Data</th>
              <th className="p-2 text-left">Tipo</th>
              <th className="p-2 text-left">Horário</th>
              <th className="p-2 text-left">Decisão</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Sem entradas.</td></tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-border">
                {canDecide && (
                  <td className="p-2"><Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} /></td>
                )}
                <td className="p-2">{empName(e.employee_id)}</td>
                <td className="p-2">{format(parseISO(e.entry_date), "dd/MM EEE", { locale: ptBR })}</td>
                <td className="p-2">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] ${ENTRY_TYPE_COLOR[e.entry_type]}`}>
                    {e.entry_type} · {ENTRY_TYPE_LABEL[e.entry_type]}
                  </span>
                </td>
                <td className="p-2">
                  {e.entry_type === "T" ? `${e.start_time?.slice(0, 5) ?? "—"}–${e.end_time?.slice(0, 5) ?? "—"}` : "—"}
                </td>
                <td className="p-2">
                  <span className={
                    e.decision_status === "approved" ? "text-emerald-600 dark:text-emerald-400" :
                    e.decision_status === "rejected" ? "text-destructive" :
                    e.decision_status === "revise" ? "text-blue-600 dark:text-blue-400" :
                    "text-muted-foreground"
                  }>
                    {e.decision_status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
