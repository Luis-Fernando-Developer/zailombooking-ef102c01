import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plug, CheckCircle2, AlertCircle, Loader2, Trash2, ExternalLink,
  UserCheck, UserX, RefreshCw, Building2, Bot, Smartphone,
} from "lucide-react";
import { toast } from "sonner";

// ─── Tipos vindos do painel do Booking (o que persistimos) ────────────────
interface FlowWorkspace {
  id: string;
  name: string;
  slug: string;
  email?: string;
  plan?: string;
  status?: "active" | "suspended" | string;
  embed?: { source: string | null; is_embed: boolean };
  created_at?: string;
}
interface FlowInstance {
  id: string;
  name: string;
  instance_name?: string;
  status?: string;
  connection_state?: string;
  phone_number?: string;
  last_connected_at?: string | null;
}
interface FlowBot {
  id: string;
  public_id?: string;
  name: string;
  description?: string;
  is_published?: boolean;
  status?: string;
}
interface IntegrationRow {
  api_key_prefix: string | null;
  flow_api_base_url: string | null;
  connected_at: string | null;
  is_active: boolean;
  talkmap_provisioned?: boolean;
  talkmap_provisioned_at?: string | null;
  flow_workspace_data?: FlowWorkspace | null;
  flow_scopes?: string[] | null;
  flow_selected_instance_id?: string | null;
  flow_selected_instance_name?: string | null;
  flow_default_bot_id?: string | null;
  flow_default_bot_name?: string | null;
  flow_last_synced_at?: string | null;
}

const DEFAULT_BASE = "https://api-flowbuilder.zailom.com/functions/v1/flow-api";

export default function ChatbotIntegracao() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [integration, setIntegration] = useState<IntegrationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // form
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE);

  // dados vivos do Flow (após conectar)
  const [instances, setInstances] = useState<FlowInstance[] | null>(null);
  const [bots, setBots] = useState<FlowBot[] | null>(null);
  const [loadingLists, setLoadingLists] = useState(false);

  const connected = !!integration?.is_active && !!integration?.api_key_prefix;

  const refreshIntegration = useCallback(async (cid: string) => {
    const { data } = await supabase
      .from("chatbot_integration")
      .select("api_key_prefix, flow_api_base_url, connected_at, is_active, talkmap_provisioned, talkmap_provisioned_at, flow_workspace_data, flow_scopes, flow_selected_instance_id, flow_selected_instance_name, flow_default_bot_id, flow_default_bot_name, flow_last_synced_at")
      .eq("company_id", cid)
      .maybeSingle();
    setIntegration((data as IntegrationRow) ?? null);
  }, []);

  useEffect(() => {
    (async () => {
      if (!slug) return;
      const { data: company } = await supabase
        .from("companies").select("id, name").eq("slug", slug).maybeSingle();
      if (!company) { setLoading(false); return; }
      setCompanyId(company.id);
      setCompanyName(company.name);
      await refreshIntegration(company.id);
      setLoading(false);
    })();
  }, [slug, refreshIntegration]);

  // Após conectar (ou ao carregar página já conectada), buscar instâncias + bots
  const fetchFlowLists = useCallback(async (cid: string) => {
    setLoadingLists(true);
    try {
      const [insRes, botsRes] = await Promise.all([
        supabase.functions.invoke("chatbot-integration", {
          body: { action: "flow-fetch", company_id: cid, path: "/v1/instances" },
        }),
        supabase.functions.invoke("chatbot-integration", {
          body: { action: "flow-fetch", company_id: cid, path: "/v1/bots" },
        }),
      ]);
      if (insRes.error) throw new Error(insRes.error.message);
      if (botsRes.error) throw new Error(botsRes.error.message);
      setInstances((insRes.data?.data?.data as FlowInstance[]) ?? []);
      setBots((botsRes.data?.data?.data as FlowBot[]) ?? []);
    } catch (e) {
      toast.error(`Falha ao buscar dados do Flow: ${(e as Error).message}`);
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    if (connected && companyId) fetchFlowLists(companyId);
  }, [connected, companyId, fetchFlowLists]);

  async function toggleProvisioned(value: boolean) {
    if (!companyId) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("chatbot_integration").select("id").eq("company_id", companyId).maybeSingle();
      const patch = {
        talkmap_provisioned: value,
        talkmap_provisioned_at: value ? new Date().toISOString() : null,
      };
      if (existing) {
        await supabase.from("chatbot_integration").update(patch).eq("company_id", companyId);
      } else {
        await supabase.from("chatbot_integration").insert({
          company_id: companyId,
          flow_api_base_url: DEFAULT_BASE,
          is_active: false,
          ...patch,
        });
      }
      toast.success(value ? "Conta marcada como criada no ZailomFlow" : "Marcação removida");
      await refreshIntegration(companyId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleConnect() {
    if (!companyId || !apiKey.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("chatbot-integration", {
        method: "POST",
        body: {
          action: "save",
          company_id: companyId,
          api_key: apiKey.trim(),
          base_url: baseUrl.trim() || DEFAULT_BASE,
        },
      });
      if (error) {
        // supabase-js embrulha status != 2xx aqui — pegar body detalhado
        let details = error.message;
        try {
          // @ts-expect-error - context existe em FunctionsHttpError
          if (error.context?.text) details = await error.context.text();
        } catch { /* noop */ }
        throw new Error(details);
      }
      if (data?.error) {
        throw new Error(data.message || data.error);
      }
      toast.success(`Conectado ao workspace "${data?.workspace?.name ?? ""}"`);
      setApiKey("");
      await refreshIntegration(companyId);
    } catch (e) {
      toast.error(`Falha ao conectar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!companyId) return;
    if (!confirm("Desconectar a integração com o Zailom Flow?")) return;
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("chatbot-integration", {
        method: "POST",
        body: { action: "disconnect", company_id: companyId },
      });
      if (error) throw new Error(error.message);
      toast.success("Integração desconectada");
      setInstances(null); setBots(null);
      await refreshIntegration(companyId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    if (!companyId) return;
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("chatbot-integration", {
        body: { action: "sync", company_id: companyId },
      });
      if (error) throw new Error(error.message);
      await refreshIntegration(companyId);
      await fetchFlowLists(companyId);
      toast.success("Informações do Flow atualizadas");
    } catch (e) {
      toast.error(`Falha ao sincronizar: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function saveConfig(patch: Record<string, unknown>) {
    if (!companyId) return;
    try {
      const { error } = await supabase.functions.invoke("chatbot-integration", {
        body: { action: "save-config", company_id: companyId, ...patch },
      });
      if (error) throw new Error(error.message);
      await refreshIntegration(companyId);
    } catch (e) {
      toast.error(`Falha ao salvar: ${(e as Error).message}`);
    }
  }

  function onSelectInstance(id: string) {
    const inst = instances?.find((i) => i.id === id);
    saveConfig({ instance_id: id, instance_name: inst?.name ?? null });
    toast.success(`Instância selecionada: ${inst?.name ?? id}`);
  }

  function onSelectBot(id: string) {
    const bot = bots?.find((b) => b.id === id);
    saveConfig({ default_bot_id: id, default_bot_name: bot?.name ?? null });
    toast.success(`Bot padrão: ${bot?.name ?? id}`);
  }

  if (loading) {
    return (
      <BusinessLayout companySlug={slug!} companyName={companyName} companyId={companyId ?? undefined} userRole="owner" currentUser={user}>
        <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>
      </BusinessLayout>
    );
  }

  const workspace = integration?.flow_workspace_data ?? null;
  const publishedBots = (bots ?? []).filter((b) => b.is_published || b.status === "published");

  return (
    <BusinessLayout companySlug={slug!} companyName={companyName} companyId={companyId ?? undefined} userRole="owner" currentUser={user}>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Plug className="h-6 w-6" /> Integração Chatbot</h1>
          <p className="text-muted-foreground mt-1">
            Conecte sua conta do Zailom Flow para utilizar bots e instâncias WhatsApp junto ao sistema de agendamento.
          </p>
        </div>

        {/* ─── Card 1: Provisionamento (inalterado) ────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                {integration?.talkmap_provisioned
                  ? <UserCheck className="h-5 w-5 text-green-600" />
                  : <UserX className="h-5 w-5 text-amber-500" />}
                Conta no ZailomFlow
              </span>
              {integration?.talkmap_provisioned ? (
                <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Provisionada</Badge>
              ) : (
                <Badge variant="outline" className="border-amber-500 text-amber-600">
                  <AlertCircle className="h-3 w-3 mr-1" /> Pendente
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {integration?.talkmap_provisioned
                ? "Sua conta no Zailom Flow já foi criada. Conecte sua API Key abaixo."
                : "Sua conta no Zailom Flow deve ser provisionada pelo administrador."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!integration?.talkmap_provisioned && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 space-y-2 text-foreground/90">
                <p className="font-medium">⚠️ Provisionamento Pendente:</p>
                <p className="text-muted-foreground">
                  Caso tenha problemas, entre em contato com o suporte.
                </p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground mt-2">
                  <li>Acesse <a href="https://flow-builder.zailom.com" target="_blank" rel="noopener" className="text-primary inline-flex items-center gap-1">flow-builder.zailom.com <ExternalLink className="h-3 w-3" /></a></li>
                  <li>Tente fazer login com o e-mail: <strong>{user?.email}</strong></li>
                </ol>
              </div>
            )}
            {integration?.talkmap_provisioned && integration.talkmap_provisioned_at && (
              <p className="text-muted-foreground">
                Marcada em {new Date(integration.talkmap_provisioned_at).toLocaleString("pt-BR")}
              </p>
            )}
            <Button
              variant={integration?.talkmap_provisioned ? "outline" : "default"}
              size="sm"
              onClick={() => toggleProvisioned(!integration?.talkmap_provisioned)}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> :
                integration?.talkmap_provisioned ? <UserX className="h-4 w-4 mr-2" /> : <UserCheck className="h-4 w-4 mr-2" />}
              {integration?.talkmap_provisioned ? "Desmarcar" : "Já criei minha conta no ZailomFlow"}
            </Button>
          </CardContent>
        </Card>

        {/* ─── Card 2: Status conexão (inalterado quando desconectado) ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Status da Conexão
              {connected ? (
                <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Conectado</Badge>
              ) : (
                <Badge variant="outline"><AlertCircle className="h-3 w-3 mr-1" /> Não conectado</Badge>
              )}
            </CardTitle>
          </CardHeader>
          {connected && integration && (
            <CardContent className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Chave:</span> <code className="bg-muted px-2 py-0.5 rounded">{integration.api_key_prefix}…</code></div>
              <div><span className="text-muted-foreground">Base URL:</span> <code className="bg-muted px-2 py-0.5 rounded text-xs">{integration.flow_api_base_url}</code></div>
              <div><span className="text-muted-foreground">Conectado em:</span> {integration.connected_at ? new Date(integration.connected_at).toLocaleString("pt-BR") : "—"}</div>
              {integration.flow_last_synced_at && (
                <div><span className="text-muted-foreground">Última sincronização:</span> {new Date(integration.flow_last_synced_at).toLocaleString("pt-BR")}</div>
              )}
              <div className="flex flex-wrap gap-2 pt-3">
                <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                  {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Sincronizar
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={saving}>
                  <Trash2 className="h-4 w-4 mr-2" /> Desconectar
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* ─── Formulário de conexão (só quando não conectado) ────────── */}
        {!connected && (
          <Card>
            <CardHeader>
              <CardTitle>Conectar ZailomFlow</CardTitle>
              <CardDescription>Cole a chave de API gerada em <em>Configurações → Flow API Keys</em> no seu workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apikey">Chave de API</Label>
                <Input id="apikey" type="password" placeholder="zf_live_..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                <p className="text-xs text-muted-foreground">Deve começar com <code>zf_live_</code> e ter scopes <code>workspace:read</code>, <code>instances:read</code>, <code>bots:read</code>.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="baseurl">Base URL (avançado)</Label>
                <Input id="baseurl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                <p className="text-xs text-muted-foreground">Deixe o padrão a menos que o suporte tenha indicado outro host.</p>
              </div>
              <Button onClick={handleConnect} disabled={saving || !apiKey.trim()}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
                Conectar
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── Bloco conectado: workspace + instância + bot ────────────── */}
        {connected && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Workspace conectado</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {workspace ? (
                  <>
                    <div><span className="text-muted-foreground">Nome:</span> <strong>{workspace.name}</strong></div>
                    <div><span className="text-muted-foreground">Slug:</span> <code className="bg-muted px-2 py-0.5 rounded">{workspace.slug}</code></div>
                    {workspace.email && <div><span className="text-muted-foreground">E-mail:</span> {workspace.email}</div>}
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Plano:</span>
                      <Badge variant="secondary">{workspace.plan ?? "—"}</Badge>
                      <span className="text-muted-foreground">Status:</span>
                      {workspace.status === "active"
                        ? <Badge className="bg-green-600">Ativo</Badge>
                        : <Badge variant="destructive">{workspace.status ?? "—"}</Badge>}
                    </div>
                    {workspace.status === "suspended" && (
                      <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2 text-destructive text-xs mt-2">
                        Workspace suspenso no Flow — operações de disparo estão bloqueadas.
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">Sem dados do workspace. Clique em <em>Sincronizar</em>.</p>
                )}
              </CardContent>
            </Card>

            {/* Instância */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" /> Instância utilizada</CardTitle>
                <CardDescription>Selecione a instância WhatsApp do Flow que o Booking irá utilizar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingLists ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
                ) : instances && instances.length > 0 ? (
                  <>
                    <Select
                      value={integration?.flow_selected_instance_id ?? undefined}
                      onValueChange={onSelectInstance}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione uma instância" /></SelectTrigger>
                      <SelectContent>
                        {instances.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name} {i.phone_number ? `• ${i.phone_number}` : ""} {i.status ? `• ${i.status}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {integration?.flow_selected_instance_id && (() => {
                      const sel = instances.find((i) => i.id === integration.flow_selected_instance_id);
                      if (!sel) return null;
                      return (
                        <div className="text-xs text-muted-foreground space-y-1 pt-1">
                          <div>Número: <strong>{sel.phone_number ?? "—"}</strong></div>
                          <div>Status: <strong>{sel.status ?? "—"}</strong>{sel.connection_state ? ` (${sel.connection_state})` : ""}</div>
                          <div>Última conexão: {sel.last_connected_at ? new Date(sel.last_connected_at).toLocaleString("pt-BR") : "—"}</div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma instância disponível. Crie uma no{" "}
                    <a href="https://flow-builder.zailom.com" target="_blank" rel="noopener" className="text-primary">Zailom Flow</a>{" "}
                    e clique em Sincronizar.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Bot padrão */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> Bot padrão</CardTitle>
                <CardDescription>Bot que será usado por padrão. Suporte a bots por evento chegará em breve.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingLists ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
                ) : publishedBots.length > 0 ? (
                  <Select
                    value={integration?.flow_default_bot_id ?? undefined}
                    onValueChange={onSelectBot}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione um bot publicado" /></SelectTrigger>
                    <SelectContent>
                      {publishedBots.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhum bot publicado. Publique um bot no Zailom Flow e clique em Sincronizar.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Ajuda: como obter a chave (aparece só quando não conectado) */}
        {!connected && (
          <Card>
            <CardHeader><CardTitle>Como obter sua chave</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. Acesse <a href="https://flow-builder.zailom.com" target="_blank" rel="noopener" className="text-primary inline-flex items-center gap-1">flow-builder.zailom.com <ExternalLink className="h-3 w-3" /></a></p>
              <p>2. Abra <strong>Configurações → Flow API Keys</strong></p>
              <p>3. Gere uma nova chave com os scopes: <code>workspace:read</code>, <code>instances:read</code>, <code>bots:read</code></p>
              <p>4. Cole acima (começa com <code>zf_live_</code>) e clique em Conectar</p>
            </CardContent>
          </Card>
        )}
      </div>
    </BusinessLayout>
  );
}
