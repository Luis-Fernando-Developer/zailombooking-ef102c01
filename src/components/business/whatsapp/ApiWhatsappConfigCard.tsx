import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getEdgeFunctionUrl } from "@/lib/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Smartphone, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props { companyId: string; onChanged?: () => void; }

interface IntegrationPublic {
  id: string; evolution_base_url: string; api_key_prefix: string | null;
  is_active: boolean; has_global_key: boolean; last_synced_at: string | null;
}

export function ApiWhatsappConfigCard({ companyId, onChanged }: Props) {
  const [integ, setInteg] = useState<IntegrationPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [globalKey, setGlobalKey] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("whatsapp_integration_public")
      .select("*").eq("company_id", companyId).maybeSingle();
    setInteg((data as IntegrationPublic | null) ?? null);
    if (data) setBaseUrl((data as IntegrationPublic).evolution_base_url ?? "");
    setLoading(false);
  };
  useEffect(() => { load(); }, [companyId]);

  const call = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(getEdgeFunctionUrl("whatsapp-integration"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ company_id: companyId, ...body }),
    });
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
  };

  const save = async () => {
    if (!baseUrl.trim()) return toast.error("Informe a Base URL da API WhatsApp");
    setSaving(true);
    const r = await call({ action: "save", base_url: baseUrl.trim(), global_api_key: globalKey.trim() || undefined });
    setSaving(false);
    if (!r.ok) return toast.error(r.body?.message || r.body?.error || "Falha ao conectar");
    toast.success("Configuração salva!");
    setGlobalKey("");
    await load();
    onChanged?.();
  };

  const disconnect = async () => {
    if (!confirm("Remover conexão e todas as instâncias associadas?")) return;
    setSaving(true);
    const r = await call({ action: "disconnect" });
    setSaving(false);
    if (!r.ok) return toast.error("Falha ao desconectar");
    toast.success("Desconectado");
    setBaseUrl(""); setGlobalKey("");
    await load();
    onChanged?.();
  };

  if (loading) {
    return <Card><CardContent className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>;
  }

  const connected = integ?.is_active;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" /> API WhatsApp própria
          {connected && <Badge className="bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" />Conectada</Badge>}
        </CardTitle>
        <CardDescription>
          Configure sua própria stack de API WhatsApp. A chave global é opcional — sem ela você ainda pode
          registrar instâncias individuais usando as chaves específicas de cada uma.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Base URL da API</Label>
          <Input placeholder="https://api-whatsapp.suaempresa.com"
            value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label>Chave global da API {integ?.has_global_key && <span className="text-xs text-muted-foreground">(salva: {integ.api_key_prefix}…)</span>}</Label>
          <Input type="password"
            placeholder={integ?.has_global_key ? "Deixe em branco para manter a atual" : "Chave global (opcional)"}
            value={globalKey} onChange={(e) => setGlobalKey(e.target.value)} disabled={saving} />
          <p className="text-xs text-muted-foreground">Necessária para criar/listar conexões automaticamente.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {connected ? "Atualizar" : "Conectar"}
          </Button>
          {connected && (
            <Button variant="destructive" onClick={disconnect} disabled={saving}>
              <Trash2 className="h-4 w-4 mr-2" />Desconectar tudo
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
