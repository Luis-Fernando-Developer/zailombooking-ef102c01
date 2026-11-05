import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, Save, ShieldCheck, Info, RefreshCw, Copy } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

const RESERVED = new Set(["www", "booking", "flow", "api", "api-booking", "api-flowbuilder", "wa", "mail", "email", "admin", "app", "suporte"]);

type ValidationRecord = {
  txt_name?: string;
  txt_record?: string;
  txt_value?: string;
  status?: string;
  [key: string]: unknown;
};

export function CompanyDomainSettings({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [addressType, setAddressType] = useState<"custom_domain" | "subdomain" | "path">("path");
  const [subdomain, setSubdomain] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [domainStatus, setDomainStatus] = useState("not_configured");
  const [validationRecords, setValidationRecords] = useState<ValidationRecord[]>([]);
  const [ownershipVerification, setOwnershipVerification] = useState<Record<string, unknown> | null>(null);
  const [cloudflareStatus, setCloudflareStatus] = useState("");
  const [sslStatus, setSslStatus] = useState("");
  const [flowDomainStatus, setFlowDomainStatus] = useState("not_configured");
  const [flowValidationRecords, setFlowValidationRecords] = useState<ValidationRecord[]>([]);
  const [flowOwnershipVerification, setFlowOwnershipVerification] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const suffix = import.meta.env.VITE_COMPANY_DOMAIN_SUFFIX || "zailom.com";

  const loadCompany = async () => {
    const { data, error } = await supabase.from("companies")
      .select("booking_url_type, booking_subdomain, custom_domain, custom_domain_status, custom_domain_validation_records, custom_domain_ownership_verification, flow_custom_domain_status, flow_custom_domain_validation_records, flow_custom_domain_ownership_verification")
      .eq("id", companyId).single();
    if (error || !data) return;
    setAddressType(data.booking_url_type || (data.custom_domain ? "custom_domain" : data.booking_subdomain ? "subdomain" : "path"));
    setSubdomain(data.booking_subdomain || "");
    setCustomDomain(data.custom_domain || "");
    setDomainStatus(data.custom_domain_status || "not_configured");
    setValidationRecords(Array.isArray(data.custom_domain_validation_records) ? data.custom_domain_validation_records : []);
    setOwnershipVerification(data.custom_domain_ownership_verification || null);
    setFlowDomainStatus(data.flow_custom_domain_status || "not_configured");
    setFlowValidationRecords(Array.isArray(data.flow_custom_domain_validation_records) ? data.flow_custom_domain_validation_records : []);
    setFlowOwnershipVerification(data.flow_custom_domain_ownership_verification || null);
  };

  useEffect(() => {
    void loadCompany();
  }, [companyId]);

  const invokeDomain = async (action: "configure" | "refresh" | "remove", extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("manage-company-domain", {
      method: "POST",
      body: { company_id: companyId, action, ...extra },
    });
    if (error) {
      let detail = error.message;
      try {
        const response = (error as any).context?.response;
        if (response) {
          const payload = await response.clone().json();
          detail = payload?.error || detail;
        }
      } catch { /* resposta sem JSON */ }
      throw new Error(detail);
    }
    if (!data?.success) throw new Error(data?.error || "Não foi possível processar o domínio.");
    return data;
  };

  const refreshStatus = async () => {
    setRefreshing(true);
    try {
      const result = await invokeDomain("refresh");
      setDomainStatus(result.status || "pending");
      setCloudflareStatus(result.cloudflare_status || "");
      setSslStatus(result.ssl_status || "");
      setValidationRecords(result.validation_records || []);
      setOwnershipVerification(result.ownership_verification || null);
      await loadCompany();
      toast({
        title: result.status === "verified" ? "Domínio ativado!" : "Validação ainda pendente",
        description: result.message || "O status foi atualizado.",
      });
    } catch (error: any) {
      toast({ title: "Não foi possível atualizar", description: error.message, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

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
      if (addressType === "custom_domain") {
        const result = await invokeDomain("configure", { custom_domain: normalizedDomain });
        setCustomDomain(normalizedDomain);
        setDomainStatus(result.status || "pending");
        setCloudflareStatus(result.cloudflare_status || "");
        setSslStatus(result.ssl_status || "");
        setValidationRecords(result.validation_records || []);
        setOwnershipVerification(result.ownership_verification || null);
        toast({
          title: result.status === "verified" ? "Domínio ativado!" : "Domínio cadastrado",
          description: result.message || "Configure os registros DNS exibidos abaixo.",
        });
      } else {
        await invokeDomain("remove", {
          booking_url_type: addressType,
          booking_subdomain: addressType === "subdomain" ? normalizedSubdomain : null,
        });
        setDomainStatus("not_configured");
        setValidationRecords([]);
        setOwnershipVerification(null);
        if (addressType === "subdomain") {
          const { error } = await supabase.from("companies").update({
            booking_url_type: "subdomain",
            booking_subdomain: normalizedSubdomain,
          }).eq("id", companyId);
          if (error) throw error;
        }
        setCustomDomain("");
        toast({ title: "Endereço salvo", description: "O endereço público da empresa foi atualizado." });
      }
      setSubdomain(addressType === "subdomain" ? normalizedSubdomain : "");
      await loadCompany();
    } catch (error: any) {
      toast({ title: "Não foi possível salvar", description: error.message || "Verifique se o domínio já está em uso.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copiado!" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const ownershipName = String(ownershipVerification?.name || ownershipVerification?.txt_name || "");
  const ownershipValue = String(ownershipVerification?.value || ownershipVerification?.txt_record || ownershipVerification?.txt_value || "");

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
          <SelectContent>
            <SelectItem value="custom_domain">URL própria</SelectItem>
            <SelectItem value="subdomain">Subdomínio</SelectItem>
            <SelectItem value="path">Path</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {addressType === "custom_domain" && <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="custom-domain">Digite seu domínio</Label>
          <Input id="custom-domain" value={customDomain} onChange={e => setCustomDomain(e.target.value.toLowerCase())} placeholder="agenda.suaempresa.com.br" disabled={!canManage} />
        </div>
        <div className="rounded-md border p-3 space-y-2 text-sm">
          <div className="flex items-center gap-2 font-medium"><Info className="h-4 w-4" />Registros DNS necessários</div>
          <p className="text-muted-foreground">Depois de salvar, a Zailom registra o domínio na Cloudflare e mostra os registros de validação. No provedor DNS da sua empresa, configure:</p>
          <div className="rounded bg-muted p-2 font-mono text-xs break-all">CNAME {customDomain || "agenda.suaempresa.com.br"} → fallback.zailom.com</div>
          <p className="text-xs text-muted-foreground">Mantenha o CNAME apontando para fallback.zailom.com. A ativação depende da validação de propriedade e do certificado HTTPS.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {domainStatus === "verified"
            ? <Badge className="gap-1"><ShieldCheck className="h-3 w-3"/>Verificado</Badge>
            : domainStatus === "pending"
              ? <Badge variant="secondary">Aguardando DNS/HTTPS</Badge>
              : domainStatus === "error"
                ? <Badge variant="destructive">Erro na configuração</Badge>
                : <Badge variant="outline">Não configurado</Badge>}
          {cloudflareStatus && <span className="text-xs text-muted-foreground">Cloudflare: {cloudflareStatus}</span>}
          {sslStatus && <span className="text-xs text-muted-foreground">SSL: {sslStatus}</span>}
          {domainStatus === "pending" && <Button type="button" size="sm" variant="outline" onClick={refreshStatus} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Verificando..." : "Atualizar validação"}
          </Button>}
        </div>
        {(ownershipName || ownershipValue) && <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">Verificação de propriedade (TXT)</p>
          {ownershipName && <div className="text-xs break-all"><span className="text-muted-foreground">Nome:</span> <code>{ownershipName}</code> <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyValue(ownershipName)}><Copy className="h-3 w-3" /></Button></div>}
          {ownershipValue && <div className="text-xs break-all"><span className="text-muted-foreground">Valor:</span> <code>{ownershipValue}</code> <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyValue(ownershipValue)}><Copy className="h-3 w-3" /></Button></div>}
        </div>}
        {validationRecords.length > 0 && <div className="rounded-md border p-3 space-y-3">
          <p className="text-sm font-medium">Validação do certificado HTTPS (TXT)</p>
          {validationRecords.map((record, index) => <div key={index} className="space-y-1 text-xs">
            <div className="break-all"><span className="text-muted-foreground">Nome:</span> <code>{record.txt_name || "—"}</code></div>
            <div className="break-all"><span className="text-muted-foreground">Valor:</span> <code>{record.txt_record || record.txt_value || "—"}</code></div>
            {record.txt_name && <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyValue(String(record.txt_name))}><Copy className="mr-1 h-3 w-3" />Copiar nome</Button>}
            {(record.txt_record || record.txt_value) && <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyValue(String(record.txt_record || record.txt_value))}><Copy className="mr-1 h-3 w-3" />Copiar valor</Button>}
          </div>)}
        </div>}
        {domainStatus === "verified" && <p className="text-sm text-green-600">Seu endereço público está pronto: https://{customDomain}</p>}
      </div>}

      {addressType === "subdomain" && <div className="space-y-2">
        <Label htmlFor="booking-subdomain">Digite o endereço de domínio</Label>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input id="booking-subdomain" value={subdomain} onChange={e => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="minha-empresa" disabled={!canManage} />
          <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground whitespace-nowrap">.{suffix}</div>
        </div>
        <p className="text-xs text-muted-foreground">Endereço: https://{subdomain || "minha-empresa"}.{suffix}</p>
      </div>}

      {addressType === "path" && <div className="space-y-2">
        <Label htmlFor="booking-path">URL Personalizada</Label>
        <div className="flex items-center gap-2">
          <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground whitespace-nowrap">booking.zailom.com/</div>
          <Input id="booking-path" value={slug || ""} readOnly disabled />
        </div>
        <p className="text-xs text-muted-foreground">O endereço por caminho atual continua funcionando sem alterações.</p>
      </div>}

      {canManage && <Button onClick={save} disabled={saving} className="gap-2"><Save className="h-4 w-4"/>{saving ? "Salvando..." : "Salvar endereço"}</Button>}
      <p className="text-xs text-muted-foreground">O domínio próprio será validado automaticamente pela Cloudflare. Após adicionar os registros DNS, use “Atualizar validação” para consultar a emissão do HTTPS.</p>
    </CardContent>
  </Card>;
}
