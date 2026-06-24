import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Wallet, CheckCircle2, Copy, ExternalLink } from "lucide-react";

interface Props {
  employeeId: string;
  companyId: string;
}

type Provider = "asaas" | "mercadopago" | "stripe" | "pagarme";

const PROVIDER_INFO: Record<Provider, {
  label: string; keyPlaceholder: string; keyHelp: string;
  webhookSlug: string; panelUrl: string; webhookHelp: string;
}> = {
  asaas: {
    label: "Asaas",
    keyPlaceholder: "$aact_...",
    keyHelp: "Painel Asaas → Integrações → Chave de API.",
    webhookSlug: "asaas-webhook",
    panelUrl: "https://www.asaas.com/customerWebhook/list",
    webhookHelp: "Evento TRANSFER_CREATED / TRANSFER_DONE.",
  },
  mercadopago: {
    label: "Mercado Pago",
    keyPlaceholder: "APP_USR-...",
    keyHelp: "MP → Suas integrações → Credenciais → Access Token de produção.",
    webhookSlug: "mercadopago-webhook",
    panelUrl: "https://www.mercadopago.com.br/developers/panel/app",
    webhookHelp: "Tópico: money_movements.",
  },
  stripe: {
    label: "Stripe",
    keyPlaceholder: "sk_live_... ou sk_test_...",
    keyHelp: "Stripe Dashboard → Developers → API keys → Secret key.",
    webhookSlug: "stripe-webhook",
    panelUrl: "https://dashboard.stripe.com/webhooks",
    webhookHelp: "Evento payout.paid / payout.failed.",
  },
  pagarme: {
    label: "Pagar.me",
    keyPlaceholder: "sk_...",
    keyHelp: "Painel Pagar.me → Configurações → Chaves → Secret Key.",
    webhookSlug: "pagarme-webhook",
    panelUrl: "https://dash.pagar.me/",
    webhookHelp: "Evento transfer.* .",
  },
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function AutonomousPayoutSettings({ employeeId, companyId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validatedAccount, setValidatedAccount] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [settings, setSettings] = useState<any>({
    provider: "asaas" as Provider,
    pix_key: "",
    payout_rule: "per_service",
    payout_interval_days: 7,
    is_active: true,
  });
  const [resolvedFlow, setResolvedFlow] = useState<"via_company" | "direct_to_autonomous">("via_company");

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [employeeId]);

  async function load() {
    setLoading(true);
    const [{ data }, { data: emp }, { data: comp }] = await Promise.all([
      (supabase as any).from("employee_payment_settings")
        .select("*").eq("employee_id", employeeId).maybeSingle(),
      (supabase as any).from("employees")
        .select("payout_flow_override").eq("id", employeeId).maybeSingle(),
      (supabase as any).from("company_payment_settings")
        .select("payout_flow").eq("company_id", companyId).maybeSingle(),
    ]);
    if (data) {
      setSettings({
        provider: data.provider || "asaas",
        pix_key: data.pix_key || "",
        payout_rule: data.payout_rule || "per_service",
        payout_interval_days: data.payout_interval_days || 7,
        is_active: data.is_active ?? true,
      });
      setHasStoredKey(!!data.api_key_encrypted);
    }
    setResolvedFlow(
      (emp?.payout_flow_override as any) || (comp?.payout_flow as any) || "via_company"
    );
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    try {
      const payload: any = {
        employee_id: employeeId,
        company_id: companyId,
        provider: settings.provider,
        pix_key: settings.pix_key || null,
        payout_rule: settings.payout_rule,
        payout_interval_days: settings.payout_rule === "interval_days" ? settings.payout_interval_days : null,
        is_active: settings.is_active,
        updated_at: new Date().toISOString(),
      };
      if (apiKeyInput.trim()) {
        payload.api_key_encrypted = apiKeyInput.trim().replace(/[\r\n\t]/g, "");
        if (validatedAccount) payload.account_name = validatedAccount;
      }
      const { error } = await (supabase as any)
        .from("employee_payment_settings")
        .upsert(payload, { onConflict: "employee_id" });
      if (error) throw error;
      toast({ title: "Conta de repasse salva" });
      setApiKeyInput("");
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function validateKey() {
    if (!apiKeyInput.trim()) {
      toast({ title: "Cole a API key primeiro", variant: "destructive" }); return;
    }
    setValidating(true); setValidatedAccount(null);
    try {
      const { data, error } = await supabase.functions.invoke("validate-own-gateway-key", {
        body: { api_key: apiKeyInput.trim(), provider: settings.provider },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setValidatedAccount((data as any).account_name || "Conta validada");
      toast({ title: "Chave válida", description: (data as any).account_name });
    } catch (e: any) {
      toast({ title: "Falha ao validar", description: e.message, variant: "destructive" });
    } finally { setValidating(false); }
  }

  function copy(t: string) { navigator.clipboard.writeText(t); toast({ title: "Copiado!" }); }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  const info = PROVIDER_INFO[settings.provider as Provider];
  const webhookUrl = `${SUPABASE_URL}/functions/v1/${info.webhookSlug}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" /> Minha conta de recebimento (Autônomo)
          </CardTitle>
          <CardDescription>
            Cada autônomo configura sua própria conta. Quando um cliente paga um serviço seu, o sistema
            envia automaticamente o seu percentual para esta conta. Se você usar o mesmo provedor da empresa,
            usamos o split nativo (mais rápido e barato). Se for diferente, fazemos a transferência via API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="font-medium mb-1">Fluxo de repasse acordado com a empresa</div>
            <p className="text-xs text-muted-foreground">
              {resolvedFlow === "direct_to_autonomous"
                ? "Pagamentos dos clientes caem direto na SUA conta. Você repassa o % combinado para a empresa."
                : "Pagamentos dos clientes caem na conta da EMPRESA. Ela repassa o seu % para a conta abaixo."}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Apenas a empresa pode alterar esse fluxo.
            </p>
          </div>
          <div>
            <Label>Provedor</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              {(Object.keys(PROVIDER_INFO) as Provider[]).map((p) => (
                <button key={p} type="button"
                  onClick={() => { setSettings({ ...settings, provider: p }); setValidatedAccount(null); }}
                  className={`p-3 border rounded-lg text-sm font-medium transition-colors text-left ${
                    settings.provider === p ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/50"
                  }`}>
                  {PROVIDER_INFO[p].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>API Key {hasStoredKey && <Badge variant="secondary" className="ml-2">Salva</Badge>}</Label>
              {validatedAccount && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {validatedAccount}
                </span>
              )}
            </div>
            <Input type="password" value={apiKeyInput}
              onChange={(e) => { setApiKeyInput(e.target.value); setValidatedAccount(null); }}
              placeholder={hasStoredKey ? "•••••••••• (cole nova chave para substituir)" : info.keyPlaceholder} />
            <p className="text-xs text-muted-foreground mt-1">{info.keyHelp}</p>
            <Button type="button" variant="outline" size="sm" className="mt-2"
              onClick={validateKey} disabled={validating || !apiKeyInput.trim()}>
              {validating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Testar conexão
            </Button>
          </div>

          <div>
            <Label>Chave PIX (opcional — usada para transferência cross-gateway)</Label>
            <Input value={settings.pix_key}
              onChange={(e) => setSettings({ ...settings, pix_key: e.target.value })}
              placeholder="CPF, e-mail, telefone ou aleatória" />
          </div>

          <div>
            <Label>Quando receber</Label>
            <div className="grid sm:grid-cols-3 gap-2 mt-2">
              {[
                { v: "per_service", l: "Por serviço concluído" },
                { v: "end_of_day", l: "No fim do dia" },
                { v: "interval_days", l: "A cada N dias" },
              ].map(o => (
                <button key={o.v} type="button"
                  onClick={() => setSettings({ ...settings, payout_rule: o.v })}
                  className={`p-3 border rounded-lg text-sm text-left ${
                    settings.payout_rule === o.v ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/50"
                  }`}>{o.l}</button>
              ))}
            </div>
            {settings.payout_rule === "interval_days" && (
              <div className="mt-2">
                <Label>Intervalo (dias)</Label>
                <Input type="number" min={1} max={60} value={settings.payout_interval_days}
                  onChange={(e) => setSettings({ ...settings, payout_interval_days: parseInt(e.target.value || "7", 10) })} />
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
            <div className="font-medium text-sm">Webhook de repasse (opcional)</div>
            <p className="text-xs text-muted-foreground">
              Cadastre no painel do {info.label} para receber confirmações de transferência.
              {" "}{info.webhookHelp}
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={() => copy(webhookUrl)}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <a href={info.panelUrl} target="_blank" rel="noreferrer"
              className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
              Abrir painel {info.label} <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
