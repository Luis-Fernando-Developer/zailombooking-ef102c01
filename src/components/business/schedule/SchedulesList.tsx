import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit3, Download, Undo2 } from "lucide-react";
import {
  fetchSchedules, createSchedule, deleteSchedule, revokeSchedule,
  ScheduleRow, SCHEDULE_STATUS_LABEL,
} from "@/lib/api/schedules";
import { ScheduleMatrixEditor } from "./ScheduleMatrixEditor";
import { ExportScheduleDialog } from "./ExportScheduleDialog";

interface Props { tenantId: string; canManage: boolean; }

export function SchedulesList({ tenantId, canManage }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<ScheduleRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [exporting, setExporting] = useState<ScheduleRow | null>(null);

  const load = () => fetchSchedules(tenantId).then(setItems).catch(() => {});
  useEffect(() => { load(); }, [tenantId]);

  const handleCreate = async () => {
    if (!name.trim() || !start || !end) return;
    setBusy(true);
    try {
      const s = await createSchedule({ tenant_id: tenantId, name: name.trim(), period_start: start, period_end: end });
      setCreating(false);
      setName(""); setStart(""); setEnd("");
      await load();
      setEditing(s);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta escala?")) return;
    try { await deleteSchedule(id); await load(); }
    catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const handleRevoke = async (s: ScheduleRow) => {
    const msg =
      "Revogar esta escala irá retorná-la ao estado de RASCUNHO, " +
      "permitindo edição completa. Agendamentos existentes NÃO são " +
      "cancelados, mas a disponibilidade futura passará a respeitar " +
      "as novas alterações após nova aprovação.\n\nDeseja continuar?";
    if (!confirm(msg)) return;
    try {
      await revokeSchedule(s.id, tenantId);
      toast({ title: "Escala revogada", description: "Voltou para rascunho. Edite e reenvie para aprovação." });
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao revogar", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">Escalas Mensais</CardTitle>
          <CardDescription>Crie, edite e envie escalas para aprovação.</CardDescription>
        </div>
        {canManage && !creating && (
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1" /> Nova escala</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {creating && (
          <div className="border border-border rounded-md p-3 space-y-3">
            <div className="grid sm:grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Janeiro/2026" />
              </div>
              <div className="space-y-1">
                <Label>Início</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Fim</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={busy || !name.trim() || !start || !end}>Criar</Button>
            </div>
          </div>
        )}

        {items.length === 0 && !creating && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma escala criada ainda.</p>
        )}

        <div className="space-y-2">
          {items.map((s) => (
            <div key={s.id} className="flex items-center justify-between border border-border rounded-md p-3">
              <div>
                <p className="font-medium text-sm">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {format(parseISO(s.period_start), "dd/MM/yy")} → {format(parseISO(s.period_end), "dd/MM/yy")} ·{" "}
                  <span className="px-1.5 py-0.5 rounded bg-muted">{SCHEDULE_STATUS_LABEL[s.status]}</span>
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                <Button variant="outline" size="sm" onClick={() => setExporting(s)}>
                  <Download className="w-4 h-4 mr-1" /> Baixar
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
                  <Edit3 className="w-4 h-4 mr-1" />
                  {canManage ? "Editar" : "Ver"}
                </Button>
                {canManage && (s.status === "approved" || s.status === "partially_approved" || s.status === "pending_approval") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRevoke(s)}
                  >
                    <Undo2 className="w-4 h-4 mr-1" /> Revogar
                  </Button>
                )}
                {canManage && (s.status === "draft" || s.status === "revision_requested") && (
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 flex flex-col overflow-hidden gap-0">
            <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
              <DialogTitle>Escala</DialogTitle>
            </DialogHeader>
            {editing && (
              <ScheduleMatrixEditor
                schedule={editing}
                tenantId={tenantId}
                readOnly={!canManage}
                onChanged={load}
                onClose={() => setEditing(null)}
              />
            )}
          </DialogContent>
        </Dialog>

        <ExportScheduleDialog
          open={!!exporting}
          onOpenChange={(o) => !o && setExporting(null)}
          schedule={exporting}
          tenantId={tenantId}
        />
      </CardContent>
    </Card>
  );
}
