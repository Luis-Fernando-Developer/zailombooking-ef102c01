import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, Save, ShieldCheck, Info } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

const RESERVED = new Set(["www", "booking", "flow", "api", "api-booking", "api-flowbuilder", "wa", "mail", "email", "admin", "app", "suporte"]);

export function CompanyDomainSettings({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [addressType, setAddressType] = useState<"custom_domain" | "subdomain" | "path">("path");
  const [subdomain, setSubdomain] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [domainStatus, setDomainStatus] = useState("not_configured");
  const [saving, setSaving] = useState(false);
  const suffix = import.meta.env.VITE_COMPANY_DOMAIN_SUFFIX || "zailom.com";

  useEffect(() => {
    let active = true;
    supabase.from("companies").select("booking_url_type, booking_subdomain, custom_domain, custom_domain_status")
      .eq("id", companyId).single().then(({ data, error }) => {
        if (!active || error || !data) return;
        setAddressType(data.booking_url_type || (data.custom_domain ? "custom_domain" : data.booking_subdomain ? "subdomain" : "path"));
        setSubdomain(data.booking_subdomain || "");
        setCustomDomain(data.custom_domain || "");
        setDomainStatus(data.custom_domain_status || "not_configured");
      });
    return () => { active = false; };
  }, [companyId]);

  const save = async () => {
    const normalizedSubdomain = subdomain.trim().toLowerCase();
    const normalizedDomain = customDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (addressType === "subdomain" && (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(normalizedSubdomain) || RESERVED.has(normalizedSubdomain))) {
      toast({ title: "Subdomínio inválido", description: "Use de 3 a 40 caracteres, letras minúsculas, números e hífen. Esse nome pode estar reservado.", variant: "destructive" });
      return;
    }
    if (addressType === "custom_domain" && (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(normalizedDomain) || normalizedDomain === suffix)) {
      toast({ title: "Domínio inválido", description: "Informe um domínio válido, por exemplo agenda.suaempresa.com.br.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("companies").update({
        booking_subdomain: normalizedSubdomain || null,
        custom_domain: normalizedDomain || null,
        custom_domain_status: normalizedDomain ? (normalizedDomain === customDomain && domainStatus === "verified" ? "verified" : "pending") : "not_configured",
        custom_domain_verified_at: normalizedDomain === customDomain && domainStatus === "verified" ? undefined : null,
      } as any).eq("id", companyId);
      if (error) throw error;
      setSubdomain(normalizedSubdomain);
      setCustomDomain(normalizedDomain);
      setDomainStatus(normalizedDomain ? (normalizedDomain === customDomain && domainStatus === "verified" ? "verified" : "pending") : "not_configured");
      toast({ title: "Endereços salvos", description: "O subdomínio Zailom fica disponível após a configuração DNS wildcard. O domínio próprio ficará pendente até a validação DNS." });
    } catch (error: any) {
      toast({ title: "Não foi possível salvar", description: error.message || "Verifique se o nome já está em uso.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />Domínio personalizado</CardTitle>
      <CardDescription>Defina como seus clientes acessarão sua página pública de agendamento.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="booking-url-type">Tipo de endereço</Label>
        <Select value={addressType} onValueChange={(value: "custom_domain" | "subdomain" | "path") => setAddressType(value)} disabled={!canManage}>
          <SelectTrigger id="booking-url-type"><SelectValue placeholder="Selecione o modelo de endereço" /></SelectTrigger>
          <SelectContent><SelectItem value="custom_domain">URL própria</SelectItem><SelectItem value="subdomain">Subdomínio</SelectItem><SelectItem value="path">Path</SelectItem></SelectContent>
        </Select>
      </div>
      {addressType === "custom_domain" && <div className="space-y-2">
        <Label htmlFor="custom-domain">Digite seu domínio</Label>
        <Input id="custom-domain" value={customDomain} onChange={e => setCustomDomain(e.target.value.toLowerCase())} placeholder="agenda.suaempresa.com.br" disabled={!canManage} />
        <div className="rounded-md border p-3 space-y-2 text-sm"><div className="flex items-center gap-2 font-medium"><Info className="h-4 w-4" />Configuração DNS necessária</div><p className="text-muted-foreground">Crie um registro CNAME apontando seu domínio para <strong>booking.zailom.com</strong>. A ativação depende da validação DNS e emissão do certificado HTTPS.</p>{customDomain && <div className="rounded bg-muted p-2 font-mono text-xs break-all">CNAME {customDomain.split(".")[0]} → booking.zailom.com</div>}</div>
        <div className="flex items-center gap-2">{domainStatus === "verified" ? <Badge className="gap-1"><ShieldCheck className="h-3 w-3"/>Verificado</Badge> : domainStatus === "pending" ? <Badge variant="secondary">Aguardando validação DNS</Badge> : <Badge variant="outline">Não configurado</Badge>}</div>
      </div>}
      {addressType === "subdomain" && <div className="space-y-2">
        <Label htmlFor="booking-subdomain">Digite o endereço de domínio</Label>
        <div className="flex flex-col sm:flex-row gap-2"><Input id="booking-subdomain" value={subdomain} onChange={e => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="minha-empresa" disabled={!canManage} /><div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground whitespace-nowrap">.{suffix}</div></div>
        <p className="text-xs text-muted-foreground">Endereço: https://{subdomain || "minha-empresa"}.{suffix}</p>
      </div>}
      {addressType === "path" && <div className="space-y-2">
        <Label htmlFor="booking-path">URL Personalizada</Label>
        <div className="flex items-center gap-2"><div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground whitespace-nowrap">booking.zailom.com/</div><Input id="booking-path" value={slug || ""} readOnly disabled /></div>
        <p className="text-xs text-muted-foreground">O endereço por caminho atual continua funcionando sem alterações.</p>
      </div>}
      {canManage && <Button onClick={save} disabled={saving} className="gap-2"><Save className="h-4 w-4"/>{saving ? "Salvando..." : "Salvar endereço"}</Button>}
      <p className="text-xs text-muted-foreground">Os novos endereços dependem da configuração DNS e HTTPS da infraestrutura. O Path permanece disponível durante esta fase de testes.</p>
    </CardContent>
  </Card>;
}
