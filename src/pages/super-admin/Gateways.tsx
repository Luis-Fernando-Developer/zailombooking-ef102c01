import { useEffect, useState } from "react";
import { SuperAdminSidebar } from "@/components/admin/SuperAdminSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, CreditCard, DollarSign, RefreshCw, ExternalLink, Save, Eye, EyeOff, KeyRound, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const GATEWAY_GROUPS = [
  {
    key: "asaas",
    name: "Asaas",
    description: "Gateway padrão para checkout de assinaturas e pagamentos de agendamentos (Pix, boleto, cartão).",
    icon: Wallet,
    docsUrl: "https://docs.asaas.com/",
    badge: "Ativo",
    configs: [
      { key: "ASAAS_API_KEY", label: "Chave de API", isSecret: true, placeholder: "$aact_... ou sandbox key" },
      { key: "ASAAS_WEBHOOK_TOKEN", label: "Token do Webhook", isSecret: true, placeholder: "Token configurado no Asaas" },
    ],
  },
  {
    key: "stripe",
    name: "Stripe",
    description: "Alternativa internacional (cartões, assinaturas recorrentes).",
    icon: CreditCard,
    docsUrl: "https://stripe.com/docs",
    badge: "Opcional",
    configs: [
      { key: "STRIPE_SECRET_KEY", label: "Secret Key", isSecret: true, placeholder: "sk_..." },
      { key: "STRIPE_WEBHOOK_SECRET", label: "Webhook Secret", isSecret: true, placeholder: "whsec_..." },
    ],
  },
  {
    key: "whatsapp",
    name: "WhatsApp (Evolution API)",
    description: "Serviço global de instâncias WhatsApp usado por todas as empresas.",
    icon: KeyRound,
    docsUrl: "https://docs.evolution-api.com/",
    badge: "Opcional",
    configs: [
      { key: "EVOLUTION_GLOBAL_API_KEY", label: "API Key", isSecret: true, placeholder: "Chave da Evolution API" },
      { key: "EVOLUTION_GLOBAL_URL", label: "URL Base", isSecret: false, placeholder: "https://wa.zailom.com" },
    ],
  },
];

type GatewayConfig = {
  id?: string;
  provider: string;
  key: string;
  value: string | null;
  is_secret: boolean;
  description: string | null;
  updated_at: string | null;
};

export default function SuperAdminGateways() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [configs, setConfigs] = useState<GatewayConfig[]>([]);
  const [stats, setStats] = useState<{ totalRevenue: number; activeSubs: number; pending: number }>({
    totalRevenue: 0, activeSubs: 0, pending: 0,
  });

  const loadStats = async () => {
    // Buscar faturamento total das empresas via faturas pagas (mais preciso)
    const { data: invoices } = await supabase
      .from("company_invoices")
      .select("amount")
      .eq("status", "paid");
      
    const totalRevenue = (invoices ?? []).reduce((s: number, inv: any) => s + Number(inv.amount ?? 0), 0);

    const { data: payments } = await supabase
      .from("booking_payments")
      .select("amount,status");
    
    const pending = (payments ?? []).filter((p: any) => String(p.status).toLowerCase() === "pending").length;

    const { count: activeSubs } = await supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    setStats({ totalRevenue, activeSubs: activeSubs ?? 0, pending });
  };

  const loadConfigs = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Sessão não encontrada.");

      const res = await fetch(`${SUPABASE_URL}/functions/v1/super-admin-gateway-config`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      const { configs: list } = await res.json();
      setConfigs(list ?? []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar configurações",
        description: error.message || "Não foi possível buscar as credenciais.",
        variant: "destructive",
      });
    }
  };

  const load = async () => {
    setLoading(true);
    await Promise.all([loadStats(), loadConfigs()]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const getConfigValue = (provider: string, key: string) => {
    const found = configs.find((c) => c.provider === provider && c.key === key);
    return found?.value ?? "";
  };

  const isConfigured = (provider: string, key: string) => {
    return (getConfigValue(provider, key) || "").trim().length > 0;
  };

  const updateLocalValue = (provider: string, key: string, value: string) => {
    setConfigs((prev) => {
      const idx = prev.findIndex((c) => c.provider === provider && c.key === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], value };
        return next;
      }
      return [...prev, { provider, key, value, is_secret: true, description: null, updated_at: null }];
    });
  };

  const saveConfig = async (provider: string, key: string) => {
    const value = getConfigValue(provider, key);
    setSavingKeys((prev) => new Set(prev).add(`${provider}:${key}`));
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Sessão não encontrada.");

      const res = await fetch(`${SUPABASE_URL}/functions/v1/super-admin-gateway-config`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider, key, value }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      toast({ title: "Salvo", description: `${key} atualizado com sucesso.` });
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar a configuração.",
        variant: "destructive",
      });
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(`${provider}:${key}`);
        return next;
      });
    }
  };

  const toggleSecretVisibility = (key: string) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <SuperAdminSidebar />
        <div className="flex-1 p-4 sm:p-6 space-y-6 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
                <Wallet className="h-6 w-6 sm:h-7 sm:w-7" /> Gateways de Pagamento
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Controle central dos provedores de pagamento e integrações usados na plataforma.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={load} className="self-start sm:self-auto" disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Atualizar
            </Button>
          </div>

          <Card className="border-dashed bg-amber-500/5">
            <CardContent className="py-4">
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Como funcionam as credenciais</p>
                  <p>
                    As configurações salvas aqui são armazenadas no banco de dados com acesso restrito a super admins.
                    Se houver variáveis de ambiente configuradas no Supabase Secrets (ex: <code className="text-xs bg-muted px-1 rounded">ASAAS_API_KEY</code>), elas têm <strong>prioridade</strong> sobre os valores digitados nesta tela.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Faturamento consolidado */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Faturamento total</CardDescription>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  {loading ? <Skeleton className="h-6 w-24" /> : `R$ ${stats.totalRevenue.toFixed(2)}`}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Empresas ativas</CardDescription>
                <CardTitle className="text-2xl">
                  {loading ? <Skeleton className="h-6 w-16" /> : stats.activeSubs}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pagamentos pendentes</CardDescription>
                <CardTitle className="text-2xl">
                  {loading ? <Skeleton className="h-6 w-16" /> : stats.pending}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Gateways */}
          <div className="grid gap-4 lg:grid-cols-2">
            {GATEWAY_GROUPS.map((g) => {
              const Icon = g.icon;
              const configuredCount = g.configs.filter((c) => isConfigured(g.key, c.key)).length;
              const totalCount = g.configs.length;
              const allConfigured = configuredCount === totalCount;

              return (
                <Card key={g.key} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Icon className="h-5 w-5" /> {g.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant={allConfigured ? "default" : "secondary"}>
                          {allConfigured ? "Configurado" : g.badge}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {configuredCount}/{totalCount}
                        </span>
                      </div>
                    </div>
                    <CardDescription>{g.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 flex-1">
                    <div className="space-y-4">
                      {g.configs.map((cfg) => {
                        const compositeKey = `${g.key}:${cfg.key}`;
                        const value = getConfigValue(g.key, cfg.key);
                        const configured = isConfigured(g.key, cfg.key);
                        const visible = visibleSecrets.has(compositeKey);

                        return (
                          <div key={cfg.key} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label htmlFor={compositeKey} className="text-sm font-medium">
                                {cfg.label}
                              </Label>
                              {configured ? (
                                <Badge variant="outline" className="text-xs">Preenchido</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">Vazio</Badge>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <Input
                                  id={compositeKey}
                                  type={cfg.isSecret && !visible ? "password" : "text"}
                                  value={value}
                                  placeholder={cfg.placeholder}
                                  onChange={(e) => updateLocalValue(g.key, cfg.key, e.target.value)}
                                  className="pr-10 font-mono text-sm"
                                />
                                {cfg.isSecret && (
                                  <button
                                    type="button"
                                    onClick={() => toggleSecretVisibility(compositeKey)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    tabIndex={-1}
                                  >
                                    {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </button>
                                )}
                              </div>
                              <Button
                                size="sm"
                                onClick={() => saveConfig(g.key, cfg.key)}
                                disabled={savingKeys.has(compositeKey)}
                              >
                                <Save className="h-4 w-4 mr-1" />
                                {savingKeys.has(compositeKey) ? "Salvando..." : "Salvar"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {g.docsUrl && (
                      <a
                        href={g.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline pt-2"
                      >
                        Documentação <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
