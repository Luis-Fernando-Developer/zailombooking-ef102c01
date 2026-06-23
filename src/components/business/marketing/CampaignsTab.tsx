import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Send, Ban } from "lucide-react";
import {
  listCampaigns, listMaterials, createCampaign, updateCampaign,
  setCampaignMaterials, submitCampaignForApproval, revokeCampaign,
  type MarketingCampaign, type PlacementConfig, type PlacementCTA,
} from "@/lib/api/marketing";
import { supabase } from "@/lib/supabaseClient";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho", pending_approval: "Em aprovação", approved: "Aprovada",
  scheduled: "Agendada", active: "Ativa", ended: "Encerrada",
  cancelled: "Cancelada", rejected: "Reprovada",
};

const PLACEMENTS = [
  { v: 'hero', l: 'Hero da Landing Page' },
  { v: 'hero_carousel', l: 'Carrossel do Hero' },
  { v: 'top_bar', l: 'Barra superior informativa' },
  { v: 'popup', l: 'Popup' },
  { v: 'client_area', l: 'Área do Cliente' },
  { v: 'employee_area', l: 'Área do Colaborador' },
  { v: 'notifications', l: 'Notificações internas' },
  { v: 'whatsapp', l: 'WhatsApp (em breve)' },
  { v: 'sms', l: 'SMS (em breve)' },
];

const AUDIENCES = [
  { v: 'all', l: 'Todos os usuários' },
  { v: 'all_employees', l: 'Todos os colaboradores' },
  { v: 'clients', l: 'Apenas clientes' },
  { v: 'employees', l: 'Apenas colaboradores' },
  { v: 'segmented', l: 'Segmentado' },
];

export function CampaignsTab({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MarketingCampaign | null>(null);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: "", description: "", objective: "",
    start_at: "", end_at: "",
    placements: [] as string[],
    audience_type: 'all',
    audience_filters: '{}',
    placement_config: {} as PlacementConfig,
  });

  const campsQ = useQuery({ queryKey: ['mkt-campaigns', companyId], queryFn: () => listCampaigns(companyId) });
  const matsQ = useQuery({ queryKey: ['mkt-materials-approved', companyId], queryFn: () => listMaterials(companyId) });
  const approvedMaterials = (matsQ.data ?? []).filter((m) => m.status === 'approved');

  const reset = () => {
    setForm({ name: "", description: "", objective: "", start_at: "", end_at: "", placements: [], audience_type: 'all', audience_filters: '{}', placement_config: {} });
    setSelectedMaterials([]); setEditing(null);
  };

  const updatePlacementCfg = (p: string, patch: Partial<PlacementCTA>) => {
    setForm((f) => ({
      ...f,
      placement_config: { ...f.placement_config, [p]: { ...(f.placement_config[p] ?? {}), ...patch } },
    }));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error("Nome obrigatório");
      let af: Record<string, unknown> = {};
      try { af = JSON.parse(form.audience_filters || '{}'); } catch { throw new Error("audience_filters: JSON inválido"); }
      const payload = {
        company_id: companyId,
        name: form.name,
        description: form.description || null,
        objective: form.objective || null,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        placements: form.placements,
        audience_type: form.audience_type,
        audience_filters: af,
      };
      const camp = editing
        ? await updateCampaign(editing.id, payload)
        : await createCampaign(payload as any);
      await setCampaignMaterials(camp.id, selectedMaterials.map((id) => ({ material_id: id })));
      return camp;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mkt-campaigns', companyId] });
      setOpen(false); reset();
      toast({ title: "Campanha salva" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const submitMut = useMutation({
    mutationFn: (id: string) => submitCampaignForApproval(id, []),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mkt-campaigns', companyId] }); toast({ title: "Enviada p/ aprovação" }); },
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const reason = prompt("Motivo da revogação:") || "Revogada manualmente";
      return revokeCampaign(id, reason, u.user!.id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mkt-campaigns', companyId] }); toast({ title: "Campanha revogada" }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Campanhas</h2>
          <p className="text-sm text-muted-foreground">Use materiais aprovados para criar campanhas.</p>
        </div>
        {canEdit && (
          <Button onClick={() => { reset(); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Nova Campanha
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {campsQ.data?.map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-base">{c.name}</CardTitle>
                <Badge>{STATUS_LABEL[c.status]}</Badge>
              </div>
              <CardDescription>
                {c.start_at ? new Date(c.start_at).toLocaleString() : '—'} → {c.end_at ? new Date(c.end_at).toLocaleString() : '—'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
              <div className="flex flex-wrap gap-1">
                {c.placements.map((p) => <Badge key={p} variant="outline" className="text-xs">{PLACEMENTS.find(x => x.v === p)?.l ?? p}</Badge>)}
              </div>
              {canEdit && (
                <div className="flex gap-2 pt-2 flex-wrap">
                  {c.status === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => submitMut.mutate(c.id)}>
                      <Send className="w-3 h-3 mr-1" /> Enviar p/ aprovação
                    </Button>
                  )}
                  {(c.status === 'active' || c.status === 'scheduled' || c.status === 'approved') && (
                    <Button size="sm" variant="destructive" onClick={() => revokeMut.mutate(c.id)}>
                      <Ban className="w-3 h-3 mr-1" /> Revogar
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {campsQ.data?.length === 0 && <p className="text-muted-foreground col-span-full text-center py-12">Nenhuma campanha cadastrada.</p>}
      </div>

      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); setOpen(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Nova'} Campanha</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Objetivo</Label>
              <Input value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Início</Label><Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} /></div>
              <div><Label>Fim</Label><Input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} /></div>
            </div>

            <div>
              <Label>Publicação</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {PLACEMENTS.map((p) => (
                  <label key={p.v} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.placements.includes(p.v)}
                      onCheckedChange={(v) => {
                        setForm({ ...form, placements: v ? [...form.placements, p.v] : form.placements.filter(x => x !== p.v) });
                      }}
                    />
                    {p.l}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label>Público</Label>
              <Select value={form.audience_type} onValueChange={(v) => setForm({ ...form, audience_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {form.audience_type === 'segmented' && (
              <div>
                <Label>Filtros (JSON: cargo, serviço, unidade, status)</Label>
                <Textarea
                  value={form.audience_filters}
                  onChange={(e) => setForm({ ...form, audience_filters: e.target.value })}
                  placeholder='{"role":"employee","unit":"matriz"}'
                />
              </div>
            )}

            <div>
              <Label>Materiais aprovados</Label>
              <div className="border rounded p-2 max-h-48 overflow-y-auto space-y-1">
                {approvedMaterials.length === 0 && <p className="text-sm text-muted-foreground">Nenhum material aprovado disponível.</p>}
                {approvedMaterials.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedMaterials.includes(m.id)}
                      onCheckedChange={(v) => {
                        setSelectedMaterials(v ? [...selectedMaterials, m.id] : selectedMaterials.filter(x => x !== m.id));
                      }}
                    />
                    <Badge variant="outline" className="text-xs">{m.material_type}</Badge>
                    {m.title}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? 'Salvando...' : 'Salvar como rascunho'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
