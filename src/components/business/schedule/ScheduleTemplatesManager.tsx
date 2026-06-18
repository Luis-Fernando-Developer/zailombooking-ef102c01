import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save } from "lucide-react";
import { fetchTemplates, saveTemplate, deleteTemplate, ScheduleTemplate } from "@/lib/api/schedules";

interface Props { tenantId: string; }

type Draft = Omit<ScheduleTemplate, "id" | "tenant_id" | "created_at"> & { id?: string };

const EMPTY_DAY = { work: false, start: "08:00", end: "17:00", break_start: null, break_end: null };

export function ScheduleTemplatesManager({ tenantId }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<ScheduleTemplate[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => fetchTemplates(tenantId).then(setItems).catch(() => {});
  useEffect(() => { load(); }, [tenantId]);

  const newDraft = () => setDraft({ name: "", description: "", pattern_days: [{ ...EMPTY_DAY }], cycle_length_days: 1 });
  const editDraft = (t: ScheduleTemplate) => setDraft({
    id: t.id, name: t.name, description: t.description ?? "",
    pattern_days: t.pattern_days?.length ? t.pattern_days : [{ ...EMPTY_DAY }],
    cycle_length_days: t.cycle_length_days,
  });

  const setLen = (n: number) => {
    if (!draft) return;
    const days = [...draft.pattern_days];
    while (days.length < n) days.push({ ...EMPTY_DAY });
    days.length = n;
    setDraft({ ...draft, pattern_days: days, cycle_length_days: n });
  };

  const updateDay = (idx: number, patch: Partial<Draft["pattern_days"][number]>) => {
    if (!draft) return;
    const days = draft.pattern_days.map((d, i) => i === idx ? { ...d, ...patch } : d);
    setDraft({ ...draft, pattern_days: days });
  };

  const handleSave = async () => {
    if (!draft || !draft.name.trim()) return;
    setBusy(true);
    try {
      await saveTemplate({ ...draft, tenant_id: tenantId });
      toast({ title: "Modelo salvo" });
      setDraft(null);
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este modelo?")) return;
    try { await deleteTemplate(id); await load(); } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">Modelos de Escala</CardTitle>
          <CardDescription>Padrões reutilizáveis (5x2, 6x1, 12x36, etc.)</CardDescription>
        </div>
        {!draft && (
          <Button size="sm" onClick={newDraft}><Plus className="w-4 h-4 mr-1" /> Novo modelo</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!draft && (
          <div className="space-y-2">
            {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum modelo cadastrado.</p>}
            {items.map((t) => (
              <div key={t.id} className="flex items-center justify-between border border-border rounded-md p-3">
                <div>
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Ciclo de {t.cycle_length_days} dia(s) · {(t.pattern_days ?? []).filter((p) => p.work).length} dia(s) de trabalho
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => editDraft(t)}>Editar</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {draft && (
          <div className="space-y-4 border border-border rounded-md p-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: 6x1" />
              </div>
              <div className="space-y-1">
                <Label>Tamanho do ciclo (dias)</Label>
                <Input type="number" min={1} max={31} value={draft.cycle_length_days} onChange={(e) => setLen(Math.max(1, Math.min(31, +e.target.value)))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea rows={2} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Padrão do ciclo</Label>
              <div className="space-y-2">
                {draft.pattern_days.map((d, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 border border-border rounded-md p-2">
                    <span className="text-xs font-medium w-12">Dia {idx + 1}</span>
                    <Switch checked={d.work} onCheckedChange={(v) => updateDay(idx, { work: v })} />
                    <span className="text-xs text-muted-foreground">{d.work ? "Trabalha" : "Folga"}</span>
                    {d.work && (
                      <>
                        <Input type="time" value={d.start ?? ""} onChange={(e) => updateDay(idx, { start: e.target.value })} className="w-28" />
                        <span className="text-xs">→</span>
                        <Input type="time" value={d.end ?? ""} onChange={(e) => updateDay(idx, { end: e.target.value })} className="w-28" />
                        <span className="text-xs text-muted-foreground ml-2">Intervalo</span>
                        <Input type="time" value={d.break_start ?? ""} onChange={(e) => updateDay(idx, { break_start: e.target.value || null })} className="w-28" />
                        <Input type="time" value={d.break_end ?? ""} onChange={(e) => updateDay(idx, { break_end: e.target.value || null })} className="w-28" />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>Cancelar</Button>
              <Button onClick={handleSave} disabled={busy || !draft.name.trim()}>
                <Save className="w-4 h-4 mr-1" /> Salvar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
