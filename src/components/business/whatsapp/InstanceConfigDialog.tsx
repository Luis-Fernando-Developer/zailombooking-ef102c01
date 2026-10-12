import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getEdgeFunctionUrl } from "@/lib/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Loader2, LogOut, RotateCw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  instanceId: string;
  instanceName: string;
  displayName?: string;
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

interface BotState {
  enabled: boolean;
  description: string;
  apiUrl: string;
  apiKey: string;
  triggerType: string;
  triggerKeyword: string;
  triggerOperator: string;
  expire: number;
  keywordFinish: string;
  delayMessage: number;
  unknownMessage: string;
  listeningFromMe: boolean;
  stopBotFromMe: boolean;
  keepOpen: boolean;
  debounceTime: number;
  splitMessages: boolean;
  ignoreJids: string;
}
interface PublishedBot { id: string; public_id: string; name: string; description?: string; is_published: boolean; }

const DEFAULT_BOT: BotState = {
  enabled: false,
  description: "Evolution Bot Settings",
  apiUrl: "https://api-flowbuilder.zailom.com/webhook/whatsapp",
  apiKey: "",
  triggerType: "Keyword",
  triggerKeyword: "",
  triggerOperator: "Contains",
  expire: 300,
  keywordFinish: "bye",
  delayMessage: 1000,
  unknownMessage: "Sorry, I dont understand",
  listeningFromMe: false,
  stopBotFromMe: false,
  keepOpen: false,
  debounceTime: 1,
  splitMessages: false,
  ignoreJids: "",
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

export function InstanceConfigDialog({ open, onOpenChange, companyId, instanceId, instanceName, displayName, onChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [webhook, setWebhook] = useState<WebhookState>(DEFAULT_WEBHOOK);
  const [botSettings, setBotSettings] = useState<BotState>(DEFAULT_BOT);
  const [availableBots, setAvailableBots] = useState<PublishedBot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState("");
  const [botDirty, setBotDirty] = useState(false);
  const [botSaving, setBotSaving] = useState(false);
  const [botError, setBotError] = useState("");


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

  const callFlow = async (payload: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(getEdgeFunctionUrl("chatbot-integration"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ company_id: companyId, ...payload }),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body: body as Record<string, any> };
  };

  const load = async () => {
    setLoading(true);
    const [s, w, bot, botList, binding] = await Promise.all([
      call({ action: "get-settings" }),
      call({ action: "get-webhook" }),
      call({ action: "get-bot" }),
      callFlow({ action: "flow-fetch", path: "/v1/bots" }),
      callFlow({ action: "binding-get", instance_name: instanceName }),
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
    if (bot.ok) {
      const raw = (bot.body.bot ?? {}) as Record<string, any>;
      setBotSettings({
        ...DEFAULT_BOT,
        ...raw,
        enabled: !!raw.enabled,
        description: typeof raw.description === "string" ? raw.description : DEFAULT_BOT.description,
        apiUrl: typeof raw.apiUrl === "string" && raw.apiUrl ? raw.apiUrl : DEFAULT_BOT.apiUrl,
        apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
        triggerType: raw.triggerType || "Keyword",
        triggerKeyword: raw.triggerKeyword || raw.triggerValue || "",
        triggerOperator: raw.triggerOperator || "Contains",
        expire: Number(raw.expire ?? 300),
        keywordFinish: raw.keywordFinish ?? "bye",
        delayMessage: Number(raw.delayMessage ?? 1000),
        unknownMessage: raw.unknownMessage ?? DEFAULT_BOT.unknownMessage,
        listeningFromMe: !!raw.listeningFromMe,
        stopBotFromMe: !!raw.stopBotFromMe,
        keepOpen: !!raw.keepOpen,
        debounceTime: Number(raw.debounceTime ?? 1),
        splitMessages: !!raw.splitMessages,
        ignoreJids: Array.isArray(raw.ignoreJids) ? raw.ignoreJids.join(", ") : String(raw.ignoreJids ?? ""),
      });
      setBotDirty(false);
      setBotError("");
    } else {
      setBotError(String(bot.body.error ?? "Não foi possível carregar o Evolution Bot."));
    }

    if (botList.ok) {
      const rawList = botList.body.data?.data ?? botList.body.data?.bots ?? botList.body.data;
      const list = Array.isArray(rawList) ? rawList : [];
      setAvailableBots(list.filter((item: any) => item?.is_published && (item?.public_id || item?.id))
        .map((item: any) => ({ id: String(item.id ?? item.public_id), public_id: String(item.public_id ?? item.id), name: String(item.name ?? "Bot sem nome"), description: item.description, is_published: true })));
    } else {
      setAvailableBots([]);
      setBotError(String(botList.body.message ?? botList.body.error ?? "Não foi possível listar os bots publicados do Flow."));
    }
    if (binding.ok) {
      setSelectedBotId(String(binding.body.binding?.bot_public_id ?? ""));
    } else {
      setBotError(String(binding.body.error ?? "Não foi possível carregar o vínculo do bot."));
    }
    setLoading(false);
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, instanceId]);
  // The shared service owns Evolution Bot settings; Flow's Supabase owns the
  // published-bot binding. Poll while this dialog is open so changes made in
  // the other panel appear without closing/reopening, but never overwrite edits.
  useEffect(() => {
    if (!open || botDirty) return;
    let cancelled = false;
    const sync = async () => {
      const [bot, binding] = await Promise.all([
        call({ action: "get-bot" }),
        callFlow({ action: "binding-get", instance_name: instanceName }),
      ]);
      if (cancelled || botDirty) return;
      if (bot.ok) {
        const raw = (bot.body.bot ?? {}) as Record<string, any>;
        setBotSettings({
          ...DEFAULT_BOT,
          ...raw,
          enabled: !!raw.enabled,
          description: typeof raw.description === "string" ? raw.description : DEFAULT_BOT.description,
          apiUrl: typeof raw.apiUrl === "string" && raw.apiUrl ? raw.apiUrl : DEFAULT_BOT.apiUrl,
          apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
          triggerType: raw.triggerType || "Keyword",
          triggerKeyword: raw.triggerKeyword || raw.triggerValue || "",
          triggerOperator: raw.triggerOperator || "Contains",
          expire: Number(raw.expire ?? 300),
          keywordFinish: raw.keywordFinish ?? "bye",
          delayMessage: Number(raw.delayMessage ?? 1000),
          unknownMessage: raw.unknownMessage ?? DEFAULT_BOT.unknownMessage,
          listeningFromMe: !!raw.listeningFromMe,
          stopBotFromMe: !!raw.stopBotFromMe,
          keepOpen: !!raw.keepOpen,
          debounceTime: Number(raw.debounceTime ?? 1),
          splitMessages: !!raw.splitMessages,
          ignoreJids: Array.isArray(raw.ignoreJids) ? raw.ignoreJids.join(", ") : String(raw.ignoreJids ?? ""),
        });
      }
      if (binding.ok) setSelectedBotId(String(binding.body.binding?.bot_public_id ?? ""));
    };
    const timer = window.setInterval(() => void sync(), 8000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [open, instanceId, instanceName, botDirty]);


  const updateBot = (patch: Partial<BotState>) => {
    setBotSettings((current) => ({ ...current, ...patch }));
    setBotDirty(true);
  };

  const saveBot = async () => {
    if (botSettings.enabled && !selectedBotId) {
      return toast.error("Selecione um bot publicado do Flow para habilitar esta conexão.");
    }
    if (!botSettings.apiUrl.trim()) return toast.error("Informe a API URL do Evolution Bot.");
    if (botSettings.triggerType.toLowerCase() === "keyword" && !botSettings.triggerKeyword.trim()) {
      return toast.error("Informe a palavra-chave do gatilho.");
    }
    setBotSaving(true);
    try {
      const botResult = await call({
        action: "set-bot",
        bot_settings: botSettings,
      });
      if (!botResult.ok) throw new Error(String(botResult.body.error ?? "Falha ao salvar Evolution Bot"));

      const bindingResult = selectedBotId
        ? await callFlow({ action: "binding-set", instance_name: instanceName, bot_public_id: selectedBotId })
        : await callFlow({ action: "binding-delete", instance_name: instanceName });
      if (!bindingResult.ok) throw new Error(String(bindingResult.body.error ?? "Falha ao salvar vínculo com o bot publicado"));

      setBotDirty(false);
      setBotError("");
      toast.success("Evolution Bot e vínculo compartilhados salvos.");
      onChanged?.();
    } catch (error: any) {
      toast.error(error?.message ?? "Erro ao salvar Evolution Bot");
    } finally {
      setBotSaving(false);
    }
  };

  const deleteBot = async () => {
    if (!confirm("Remover o Evolution Bot e o vínculo desta instância?")) return;
    setBotSaving(true);
    try {
      const remote = await call({ action: "delete-bot" });
      if (!remote.ok) throw new Error(String(remote.body.error ?? "Falha ao remover Evolution Bot"));
      const binding = await callFlow({ action: "binding-delete", instance_name: instanceName });
      if (!binding.ok) throw new Error(String(binding.body.error ?? "Falha ao remover vínculo"));
      setBotSettings(DEFAULT_BOT);
      setSelectedBotId("");
      setBotDirty(false);
      toast.success("Evolution Bot removido.");
      onChanged?.();
    } catch (error: any) {
      toast.error(error?.message ?? "Erro ao remover Evolution Bot");
    } finally {
      setBotSaving(false);
    }
  };

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
          <DialogTitle>Configurações — {displayName ?? instanceName}</DialogTitle>
          <DialogDescription>Ajuste comportamento, webhook e ações desta conexão.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Tabs defaultValue="settings" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="webhook">Webhook</TabsTrigger>
              <TabsTrigger value="bot"><Bot className="mr-1 h-4 w-4" />Evolution Bot</TabsTrigger>
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

            <TabsContent value="bot" className="flex-1 overflow-y-auto space-y-4 pr-1">
              {botError && <p className="rounded border border-destructive/40 p-3 text-xs text-destructive">{botError}</p>}
              <div className="flex items-center justify-between rounded border p-3">
                <div><p className="text-sm font-medium">Habilitar Bot</p><p className="text-xs text-muted-foreground">Ativa ou pausa o Evolution Bot nesta conexão compartilhada.</p></div>
                <Switch checked={botSettings.enabled} onCheckedChange={(v) => updateBot({ enabled: v })} />
              </div>
              <div className="space-y-2">
                <Label>Vincular ao Flow Builder</Label>
                <Select value={selectedBotId} onValueChange={(value) => { setSelectedBotId(value); setBotDirty(true); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione um bot publicado..." /></SelectTrigger>
                  <SelectContent>
                    {availableBots.map((bot) => <SelectItem key={bot.public_id} value={bot.public_id}>{bot.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Somente bots publicados no workspace do Flow vinculado a esta empresa.</p>
              </div>
              <div className="space-y-2"><Label>Descrição</Label><Input value={botSettings.description} onChange={(e) => updateBot({ description: e.target.value })} /></div>
              <div className="space-y-2"><Label>API URL</Label><Input value={botSettings.apiUrl} onChange={(e) => updateBot({ apiUrl: e.target.value })} placeholder="https://api-flowbuilder.zailom.com/webhook/whatsapp" /></div>
              <div className="space-y-2"><Label>API Key (Bot/Externo)</Label><Input type="password" autoComplete="new-password" value={botSettings.apiKey} onChange={(e) => updateBot({ apiKey: e.target.value })} placeholder="Key do Typebot ou API externa" /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2"><Label>Trigger Type</Label><Select value={botSettings.triggerType} onValueChange={(v) => updateBot({ triggerType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Keyword">Keyword</SelectItem><SelectItem value="All">All messages</SelectItem><SelectItem value="None">None</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>Trigger Operator</Label><Select value={botSettings.triggerOperator} onValueChange={(v) => updateBot({ triggerOperator: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Contains">Contains</SelectItem><SelectItem value="Equals">Equals</SelectItem><SelectItem value="StartsWith">Starts with</SelectItem></SelectContent></Select></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2"><Label>Trigger Keyword</Label><Input value={botSettings.triggerKeyword} onChange={(e) => updateBot({ triggerKeyword: e.target.value })} placeholder="Palavra-chave" /></div>
                <div className="space-y-2"><Label>Keyword Finish</Label><Input value={botSettings.keywordFinish} onChange={(e) => updateBot({ keywordFinish: e.target.value })} /></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2"><Label>Expire (minutos)</Label><Input type="number" min={0} value={botSettings.expire} onChange={(e) => updateBot({ expire: Math.max(0, Number(e.target.value)) })} /></div>
                <div className="space-y-2"><Label>Delay (ms)</Label><Input type="number" min={0} value={botSettings.delayMessage} onChange={(e) => updateBot({ delayMessage: Math.max(0, Number(e.target.value)) })} /></div>
                <div className="space-y-2"><Label>Debounce (s)</Label><Input type="number" min={0} value={botSettings.debounceTime} onChange={(e) => updateBot({ debounceTime: Math.max(0, Number(e.target.value)) })} /></div>
              </div>
              <div className="space-y-2"><Label>Mensagem Desconhecida</Label><Textarea value={botSettings.unknownMessage} onChange={(e) => updateBot({ unknownMessage: e.target.value })} /></div>
              {[
                ["listeningFromMe", "Ouvir minhas mensagens", "Permite processar mensagens enviadas pelo próprio número."],
                ["stopBotFromMe", "Parar bot de mim", "Permite interromper o bot por mensagem enviada pelo próprio número."],
                ["keepOpen", "Manter Aberto", "Mantém a sessão do bot aberta."],
                ["splitMessages", "Dividir Mensagens", "Divide respostas longas em várias mensagens."],
              ].map(([key, title, description]) => (
                <div key={key} className="flex items-center justify-between rounded border p-3">
                  <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div>
                  <Switch checked={botSettings[key as keyof BotState] as boolean} onCheckedChange={(v) => updateBot({ [key]: v } as Partial<BotState>)} />
                </div>
              ))}
              <div className="space-y-2"><Label>Ignorar JIDs (separados por vírgula)</Label><Textarea value={botSettings.ignoreJids} onChange={(e) => updateBot({ ignoreJids: e.target.value })} placeholder="5511999999999@s.whatsapp.net, ..." /></div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={saveBot} disabled={botSaving}>{botSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar Evolution Bot</Button>
                <Button variant="outline" onClick={deleteBot} disabled={botSaving}>Remover Bot</Button>
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
