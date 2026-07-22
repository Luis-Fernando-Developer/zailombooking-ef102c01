import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getEdgeFunctionUrl } from "@/lib/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";


import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, RefreshCw, Trash2, QrCode, Send, Star, Loader2, CheckCircle2, XCircle, Route, Bot, Smartphone, Ban, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { WHATSAPP_PROVIDERS, providerLabel, type WhatsappProviderId } from "./providers";

type Pref = "auto" | "flow_only" | "direct_only" | "disabled";
type ActiveChannel = "flow" | "direct" | "none";
type InstanceMode = "create" | "register";

interface CompanyChannelRow {
  whatsapp_channel_preference: Pref | null;
}

interface QrPayload {
  base64?: string;
  qrcode?: { base64?: string };
  code?: string;
}

interface ActionResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

interface InstanceRow {
  id: string;
  instance_name: string;
  friendly_name: string | null;
  provider: WhatsappProviderId;
  display_index: number | null;
  api_key_prefix: string | null;
  connected_number: string | null;
  status: string;
  is_default: boolean;
  channel_preference: Pref;
  last_synced_at: string | null;
  has_instance_key: boolean;
}

interface PlanLimits {
  plan_tier: string;
  max_connections: number | null;
  max_messages_month: number | null;
  current_connections: number;
  current_messages_month: number;
  connections_allowed: boolean;
  messages_allowed: boolean;
}

const preferenceLabels: Record<Pref, string> = {
  auto: "Automático",
  flow_only: "Via Chatbot Zailom",
  direct_only: "API WhatsApp direta",
  disabled: "Pausado",
};

const routeLabels: Record<ActiveChannel, string> = {
  flow: "Booking → Chatbot Zailom → WhatsApp",
  direct: "Booking → API WhatsApp → WhatsApp",
  none: "Nenhuma rota ativa",
};

function isPref(value: unknown): value is Pref {
  return value === "auto" || value === "flow_only" || value === "direct_only" || value === "disabled";
}

function isActiveChannel(value: unknown): value is ActiveChannel {
  return value === "flow" || value === "direct" || value === "none";
}

const statusBadge = (s: string) => {
  if (s === "connected")   return <Badge><CheckCircle2 className="h-3 w-3 mr-1" />Conectada</Badge>;
  if (s === "qrcode")      return <Badge variant="secondary"><QrCode className="h-3 w-3 mr-1" />Aguardando QR</Badge>;
  if (s === "connecting")  return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Conectando</Badge>;
  if (s === "disconnected")return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Desconectada</Badge>;
  return <Badge variant="secondary">Desconhecida</Badge>;
};

const fmtLimit = (max: number | null, current: number) =>
  max === null ? `${current} / ilimitado` : `${current} / ${max}`;

export function InstancesList({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<InstanceRow[]>([]);
  const [preference, setPreference] = useState<Pref>("auto");
  const [activeChannel, setActiveChannel] = useState<ActiveChannel>("none");
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [routingSaving, setRoutingSaving] = useState(false);
  const [qrOpen, setQrOpen] = useState<{ id: string; name: string } | null>(null);
  const [qrData, setQrData] = useState<QrPayload | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [testOpen, setTestOpen] = useState<InstanceRow | null>(null);
  const [testTo, setTestTo] = useState("");

  // create dialog state
  const [newOpen, setNewOpen] = useState(false);
  const [newProvider, setNewProvider] = useState<WhatsappProviderId>("evolution");
  const [newFriendly, setNewFriendly] = useState("");
  const [newPref, setNewPref] = useState<Pref>("auto");


  const call = async (body: Record<string, unknown>): Promise<ActionResult> => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(getEdgeFunctionUrl("whatsapp-integration"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ company_id: companyId, ...body }),
    });
    const parsed = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body: parsed as Record<string, unknown> };
  };

  const load = async () => {
    setLoading(true);
    const [{ data: instances }, { data: company }, { data: channel }, limitsRes] = await Promise.all([
      supabase.from("whatsapp_instances_public")
        .select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("companies").select("whatsapp_channel_preference").eq("id", companyId).maybeSingle(),
      supabase.rpc("resolve_whatsapp_channel", { p_company: companyId }),
      supabase.rpc("whatsapp_get_plan_limits", { p_company: companyId }),
    ]);
    const companyRow = company as CompanyChannelRow | null;
    setRows((instances as InstanceRow[] | null) ?? []);
    setPreference(isPref(companyRow?.whatsapp_channel_preference) ? companyRow.whatsapp_channel_preference : "auto");
    setActiveChannel(isActiveChannel(channel) ? channel : "none");
    setLimits((limitsRes.data as PlanLimits | null) ?? null);
    setLoading(false);
  };
  useEffect(() => { load(); }, [companyId]);

  const saveRouting = async (value: Pref) => {
    setRoutingSaving(true);
    const r = await call({ action: "set-channel-preference", preference: value });
    setRoutingSaving(false);
    if (!r.ok) return toast.error(String(r.body.message ?? r.body.error ?? "Erro ao salvar rota"));
    setPreference(value);
    toast.success("Rota WhatsApp atualizada");
    load();
  };

  const setInstancePref = async (id: string, value: Pref) => {
    const r = await call({ action: "set-instance-channel-preference", instance_id: id, preference: value });
    if (!r.ok) return toast.error(String(r.body.message ?? r.body.error ?? "Erro ao salvar"));
    toast.success("Rota da conexão atualizada");
    load();
  };

  const refresh = async (id?: string) => {
    setBusy(true);
    const r = await call({ action: "refresh-status", instance_id: id });
    setBusy(false);
    if (!r.ok) return toast.error(String(r.body.error ?? "Falha ao sincronizar"));
    toast.success(`Sincronizadas ${r.body?.updated ?? 0} conexão(ões)`);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta conexão? Isso também remove do painel da API WhatsApp.")) return;
    setBusy(true);
    const r = await call({ action: "delete-instance", instance_id: id });
    setBusy(false);
    if (!r.ok) return toast.error("Falha ao excluir");
    toast.success("Conexão excluída");
    load();
  };

  const setDefault = async (id: string) => {
    setBusy(true);
    await call({ action: "set-default-instance", instance_id: id });
    setBusy(false);
    load();
  };

  const openQr = async (row: InstanceRow) => {
    const displayName = row.friendly_name ?? row.instance_name;
    setQrOpen({ id: row.id, name: displayName });
    setQrData(null); setQrLoading(true);
    const r = await call({ action: "get-qrcode", instance_id: row.id });
    setQrLoading(false);
    if (!r.ok) return toast.error(String(r.body.error ?? "Falha ao obter QR"));
    setQrData((r.body.qrcode as QrPayload | undefined) ?? null);
  };

  const submitCreate = async () => {
    if (!newFriendly.trim()) return toast.error("Informe o nome desta conexão");
    setBusy(true);
    const r = await call({
      action: "create-instance",
      provider: newProvider,
      friendly_name: newFriendly.trim(),
      channel_preference: newPref,
    });
    setBusy(false);
    if (!r.ok) return toast.error(String(r.body.message ?? r.body.error ?? "Falha"));
    const createdId = typeof r.body.instance_id === "string" ? r.body.instance_id : null;
    if (createdId && newPref !== "auto") {
      await call({ action: "set-instance-channel-preference", instance_id: createdId, preference: newPref });
    }
    toast.success("Conexão criada!");
    setNewOpen(false); setNewFriendly(""); setNewPref("auto");
    load();
  };



  const submitTest = async () => {
    if (!testOpen || !testTo.trim()) return;
    setBusy(true);
    const r = await call({ action: "send-test", instance_id: testOpen.id, to: testTo.trim() });
    setBusy(false);
    if (!r.ok) return toast.error(String(r.body.error ?? "Falha ao enviar"));
    toast.success("Mensagem de teste enviada!");
    setTestOpen(null); setTestTo("");
  };

  const qrBase64 =
    qrData?.base64 ??
    qrData?.qrcode?.base64 ??
    (typeof qrData?.code === "string" && qrData.code.startsWith("data:") ? qrData.code : null);

  const hasConnectedInstance = rows.some((row) => row.status === "connected");
  const canCreateMore = limits ? limits.connections_allowed : true;

  const routingOptions: Array<{
    value: Pref;
    title: string;
    description: string;
    icon: LucideIcon;
    disabled?: boolean;
  }> = [
    {
      value: "auto",
      title: "Automático",
      description: "Usa o Chatbot Zailom quando ativo; se não estiver, usa a API WhatsApp direta.",
      icon: Route,
      disabled: rows.length === 0,
    },
    {
      value: "flow_only",
      title: "Somente Chatbot Zailom",
      description: "As mensagens saem exclusivamente pelo Chatbot Zailom.",
      icon: Bot,
    },
    {
      value: "direct_only",
      title: "Somente API WhatsApp",
      description: "As mensagens saem diretamente pela conexão padrão da API WhatsApp.",
      icon: Smartphone,
      disabled: !hasConnectedInstance,
    },
    {
      value: "disabled",
      title: "Pausar WhatsApp",
      description: "Nenhuma notificação WhatsApp será enviada pelo Booking.",
      icon: Ban,
    },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Conexões</CardTitle>
          <CardDescription>
            Todas as conexões de API WhatsApp vinculadas a esta empresa.
            {limits && (
              <span className="ml-1">
                Plano <span className="font-medium capitalize">{limits.plan_tier}</span> — conexões: {fmtLimit(limits.max_connections, limits.current_connections)} · mensagens/mês: {fmtLimit(limits.max_messages_month, limits.current_messages_month)}.
              </span>
            )}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh()} disabled={busy}>
            <RefreshCw className={`h-4 w-4 mr-2 ${busy ? "animate-spin" : ""}`} />Sincronizar
          </Button>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!canCreateMore}>
                <Plus className="h-4 w-4 mr-2" />Nova conexão
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar conexão</DialogTitle>
                <DialogDescription>Escolha o tipo de API e crie uma nova conexão, ou registre uma existente com apikey própria.</DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label>Tipo de API</Label>
                <Select value={newProvider} onValueChange={(v) => setNewProvider(v as WhatsappProviderId)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WHATSAPP_PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id} disabled={!p.enabled}>
                        <span className="flex items-center gap-2">
                          {p.label}
                          {!p.enabled && <Badge variant="secondary" className="text-[10px]">Em breve</Badge>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">A conexão será criada automaticamente no painel global da API WhatsApp.</p>
                <div className="space-y-2">
                  <Label>Nome desta conexão</Label>
                  <Input value={newFriendly} onChange={(e) => setNewFriendly(e.target.value)} placeholder="ex: recepcao, whatsapp-principal" />
                  <p className="text-[11px] text-muted-foreground">Só você vê esse nome. Escolha algo curto e único.</p>
                </div>
              </div>


              <div className="space-y-2">
                <Label>Rota de comunicação</Label>
                <Select value={newPref} onValueChange={(v) => setNewPref(v as Pref)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automática — usa Chatbot Zailom se ativo, senão API WhatsApp</SelectItem>
                    <SelectItem value="flow_only">Somente Chatbot Zailom</SelectItem>
                    <SelectItem value="direct_only">Somente API WhatsApp (direto)</SelectItem>
                    <SelectItem value="disabled">Pausada — não envia por esta conexão</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Define como esta conexão específica envia mensagens. Você pode alterar depois.</p>
              </div>

              <DialogFooter>
                <Button onClick={submitCreate} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>

        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma conexão cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const displayName = r.friendly_name ?? r.instance_name;
              return (
                <div key={r.id} className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{displayName}</span>
                      <Badge variant="outline" className="text-[11px]">{providerLabel(r.provider)}</Badge>
                      {r.is_default && <Badge variant="outline"><Star className="h-3 w-3 mr-1" />Padrão</Badge>}
                      {statusBadge(r.status)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {r.connected_number ? `📱 ${r.connected_number}` : "Sem número conectado"}
                      {r.api_key_prefix && ` · key ${r.api_key_prefix}…`}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={r.channel_preference} onValueChange={(v) => setInstancePref(r.id, v as Pref)}>
                      <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Rota: Automática</SelectItem>
                        <SelectItem value="flow_only">Rota: Chatbot Zailom</SelectItem>
                        <SelectItem value="direct_only">Rota: API WhatsApp</SelectItem>
                        <SelectItem value="disabled">Rota: Pausada</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" title="QR Code" onClick={() => openQr(r)}>
                        <QrCode className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Sincronizar" onClick={() => refresh(r.id)} disabled={busy}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Teste" onClick={() => setTestOpen(r)}>
                        <Send className="h-4 w-4" />
                      </Button>
                      {!r.is_default && (
                        <Button size="icon" variant="ghost" title="Definir padrão" onClick={() => setDefault(r.id)}>
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" title="Excluir" onClick={() => remove(r.id)} disabled={busy}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </CardContent>

      {/* QR Dialog */}
      <Dialog open={!!qrOpen} onOpenChange={(o) => !o && setQrOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR Code — {qrOpen?.name}</DialogTitle>
            <DialogDescription>Abra o WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            {qrLoading ? <Loader2 className="h-8 w-8 animate-spin" /> :
              qrBase64 ? <img src={qrBase64} alt="QR Code" className="w-64 h-64" /> :
              <p className="text-sm text-muted-foreground">QR não disponível — clique em Sincronizar após conectar.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => qrOpen && refresh(qrOpen.id)}>
              <RefreshCw className="h-4 w-4 mr-2" />Verificar status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send test dialog */}
      <Dialog open={!!testOpen} onOpenChange={(o) => !o && setTestOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar teste — {testOpen?.friendly_name ?? testOpen?.instance_name}</DialogTitle>
            <DialogDescription>Envia "Teste de conexão…" para o número informado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Número (com DDI, ex: 5511999999999)</Label>
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={submitTest} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
