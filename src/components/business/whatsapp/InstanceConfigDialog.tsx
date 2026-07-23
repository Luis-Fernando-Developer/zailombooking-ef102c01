import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getEdgeFunctionUrl } from "@/lib/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, LogOut, RotateCw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  instanceId: string;
  instanceName: string;
  onChanged?: () => void;
}

interface SettingsState {
  rejectCall: boolean;
  msgCall: string;
  groupsIgnore: boolean;
  alwaysOnline: boolean;
  readMessages: boolean;
  readStatus: boolean;
  syncFullHistory: boolean;
}

interface WebhookState {
  enabled: boolean;
  url: string;
  byEvents: boolean;
  base64: boolean;
  events: string[];
}

const DEFAULT_SETTINGS: SettingsState = {
  rejectCall: false, msgCall: "", groupsIgnore: false,
  alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false,
};

const DEFAULT_WEBHOOK: WebhookState = {
  enabled: true,
  url: "",
  byEvents: false,
  base64: true,
  events: ["MESSAGES_UPSERT"],
};


const AVAILABLE_EVENTS = [
  "APPLICATION_STARTUP", "CALL", "CHATS_DELETE", "CHATS_SET", "CHATS_UPDATE", "CHATS_UPSERT",
  "CONNECTION_UPDATE", "CONTACTS_SET", "CONTACTS_UPDATE", "CONTACTS_UPSERT",
  "GROUP_PARTICIPANTS_UPDATE", "GROUP_UPDATE", "GROUPS_UPSERT",
  "LABELS_ASSOCIATION", "LABELS_EDIT", "LOGOUT_INSTANCE",
  "MESSAGES_DELETE", "MESSAGES_SET", "MESSAGES_UPDATE", "MESSAGES_UPSERT",
  "PRESENCE_UPDATE", "QRCODE_UPDATED", "REMOVE_INSTANCE", "SEND_MESSAGE",
  "TYPEBOT_CHANGE_STATUS", "TYPEBOT_START",
];

export function InstanceConfigDialog({ open, onOpenChange, companyId, instanceId, instanceName, onChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [webhook, setWebhook] = useState<WebhookState>(DEFAULT_WEBHOOK);

  const call = async (payload: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(getEdgeFunctionUrl("whatsapp-integration"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ company_id: companyId, instance_id: instanceId, ...payload }),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body: body as Record<string, unknown> };
  };

  const load = async () => {
    setLoading(true);
    const [s, w] = await Promise.all([
      call({ action: "get-settings" }),
      call({ action: "get-webhook" }),
    ]);
    if (s.ok) {
      const raw = (s.body.settings ?? {}) as Record<string, unknown>;
      setSettings({
        rejectCall: !!raw.rejectCall,
        msgCall: typeof raw.msgCall === "string" ? raw.msgCall : "",
        groupsIgnore: !!raw.groupsIgnore,
        alwaysOnline: !!raw.alwaysOnline,
        readMessages: !!raw.readMessages,
        readStatus: !!raw.readStatus,
        syncFullHistory: !!raw.syncFullHistory,
      });
    } else setSettings(DEFAULT_SETTINGS);

    if (w.ok) {
      const raw = ((w.body.webhook as Record<string, unknown> | undefined)?.webhook
        ?? w.body.webhook ?? {}) as Record<string, unknown>;
      const loadedUrl = typeof raw.url === "string" ? raw.url : "";
      const loadedEvents = Array.isArray(raw.events) ? raw.events.filter((e): e is string => typeof e === "string") : [];
      const hasConfig = !!loadedUrl || loadedEvents.length > 0 || !!raw.enabled;
      setWebhook(hasConfig ? {
        enabled: !!raw.enabled,
        url: loadedUrl,
        byEvents: !!raw.byEvents,
        base64: !!raw.base64,
        events: loadedEvents,
      } : DEFAULT_WEBHOOK);
    } else setWebhook(DEFAULT_WEBHOOK);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, instanceId]);

  const saveSettings = async () => {
    setSaving(true);
    const r = await call({ action: "set-settings", settings });
    setSaving(false);
    if (!r.ok) return toast.error(String(r.body.error ?? "Falha ao salvar Settings"));
    toast.success("Settings salvos");
  };

  const saveWebhook = async () => {
    setSaving(true);
    const r = await call({ action: "set-webhook", webhook });
    setSaving(false);
    if (!r.ok) return toast.error(String(r.body.error ?? "Falha ao salvar Webhook"));
    toast.success("Webhook salvo");
  };

  const toggleEvent = (ev: string, on: boolean) => {
    setWebhook((w) => ({
      ...w,
      events: on ? [...new Set([...w.events, ev])] : w.events.filter((e) => e !== ev),
    }));
  };
  const markAll = () => setWebhook((w) => ({ ...w, events: [...AVAILABLE_EVENTS] }));
  const unmarkAll = () => setWebhook((w) => ({ ...w, events: [] }));

  const doAction = async (action: string, label: string) => {
    setSaving(true);
    const r = await call({ action });
    setSaving(false);
    if (!r.ok) return toast.error(String(r.body.error ?? `Falha: ${label}`));
    toast.success(`${label} executado`);
    onChanged?.();
    if (action === "logout-instance") onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Configurações — {instanceName}</DialogTitle>
          <DialogDescription>Ajuste comportamento, webhook e ações desta conexão.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Tabs defaultValue="settings" className="flex-1 overflow-hidden flex flex-col">
            <TabsList>
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="webhook">Webhook</TabsTrigger>
              <TabsTrigger value="actions">Ações</TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="flex-1 overflow-y-auto space-y-4 pr-1">
              {[
                ["rejectCall", "Rejeitar chamadas", "Recusa todas as chamadas recebidas"],
                ["groupsIgnore", "Ignorar grupos", "Ignora mensagens vindas de grupos"],
                ["alwaysOnline", "Sempre online", "Mantém o WhatsApp sempre online"],
                ["readMessages", "Marcar mensagens como lidas", "Marca todas as mensagens como lidas"],
                ["readStatus", "Marcar status como visto", "Marca todos os status como vistos"],
                ["syncFullHistory", "Sincronizar histórico completo", "Sincroniza todo o histórico ao ler o QR"],
              ].map(([key, title, desc]) => (
                <div key={key} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch
                    checked={settings[key as keyof SettingsState] as boolean}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, [key as keyof SettingsState]: v }))}
                  />
                </div>
              ))}
              {settings.rejectCall && (
                <div className="space-y-2">
                  <Label>Mensagem de rejeição de chamada</Label>
                  <Textarea
                    value={settings.msgCall}
                    onChange={(e) => setSettings((s) => ({ ...s, msgCall: e.target.value }))}
                    placeholder="Não posso atender chamadas neste número."
                  />
                </div>
              )}
              <div className="pt-2">
                <Button onClick={saveSettings} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar Settings
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="webhook" className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="flex items-center justify-between rounded border p-3">
                <div>
                  <p className="text-sm font-medium">Habilitado</p>
                  <p className="text-xs text-muted-foreground">Envia eventos para a URL configurada</p>
                </div>
                <Switch checked={webhook.enabled} onCheckedChange={(v) => setWebhook((w) => ({ ...w, enabled: v }))} />
              </div>
              <div className="space-y-2">
                <Label>URL do Webhook</Label>
                <Input value={webhook.url} onChange={(e) => setWebhook((w) => ({ ...w, url: e.target.value }))} placeholder="https://exemplo.com/webhook" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded border p-3">
                  <div>
                    <p className="text-sm font-medium">Webhook por eventos</p>
                    <p className="text-xs text-muted-foreground">Anexa o nome do evento à URL</p>
                  </div>
                  <Switch checked={webhook.byEvents} onCheckedChange={(v) => setWebhook((w) => ({ ...w, byEvents: v }))} />
                </div>
                <div className="flex items-center justify-between rounded border p-3">
                  <div>
                    <p className="text-sm font-medium">Base64 de mídia</p>
                    <p className="text-xs text-muted-foreground">Envia mídia como base64</p>
                  </div>
                  <Switch checked={webhook.base64} onCheckedChange={(v) => setWebhook((w) => ({ ...w, base64: v }))} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Eventos</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={markAll}>Marcar todos</Button>
                  <Button size="sm" variant="outline" onClick={unmarkAll}>Desmarcar todos</Button>
                </div>
              </div>
              <div className="rounded border divide-y">
                {AVAILABLE_EVENTS.map((ev) => (
                  <div key={ev} className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs font-mono">{ev}</span>
                    <Switch
                      checked={webhook.events.includes(ev)}
                      onCheckedChange={(v) => toggleEvent(ev, v)}
                    />
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <Button onClick={saveWebhook} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar Webhook
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="actions" className="flex-1 overflow-y-auto space-y-3 pr-1">
              <div className="flex items-center justify-between rounded border p-3">
                <div>
                  <p className="text-sm font-medium">Reiniciar instância</p>
                  <p className="text-xs text-muted-foreground">Reinicia a conexão sem apagar a sessão</p>
                </div>
                <Button variant="outline" onClick={() => doAction("restart-instance", "Restart")} disabled={saving}>
                  <RotateCw className="h-4 w-4 mr-2" />Reiniciar
                </Button>
              </div>
              <div className="flex items-center justify-between rounded border p-3">
                <div>
                  <p className="text-sm font-medium">Definir presença: Available</p>
                  <p className="text-xs text-muted-foreground">Marca o WhatsApp como disponível</p>
                </div>
                <Button variant="outline" onClick={() => doAction("set-presence", "Presence")} disabled={saving}>
                  Definir
                </Button>
              </div>
              <div className="flex items-center justify-between rounded border p-3 border-destructive/40">
                <div>
                  <p className="text-sm font-medium text-destructive">Logout da instância</p>
                  <p className="text-xs text-muted-foreground">Desconecta o número — precisará ler o QR novamente</p>
                </div>
                <Button variant="destructive" onClick={() => doAction("logout-instance", "Logout")} disabled={saving}>
                  <LogOut className="h-4 w-4 mr-2" />Logout
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
