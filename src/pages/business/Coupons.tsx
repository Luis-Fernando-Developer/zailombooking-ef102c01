import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Save, Trash2, RefreshCw } from "lucide-react";

type ServiceItem = { id: string; name: string; price: number; is_active: boolean };
type ComboItem = { id: string; name: string; price?: number; combo_price?: number; is_active: boolean };
type Coupon = {
  id: string; company_id: string; code: string; description: string | null;
  discount_type: "percentage" | "fixed"; discount_value: number; apply_to_all: boolean;
  service_ids: string[]; combo_ids: string[]; starts_at: string | null; expires_at: string | null;
  max_redemptions: number | null; is_active: boolean; created_at: string;
};
type FormState = {
  id?: string; code: string; description: string; discount_type: "percentage" | "fixed";
  discount_value: string; apply_to_all: boolean; service_ids: string[]; combo_ids: string[];
  starts_at: string; expires_at: string; max_redemptions: string; is_active: boolean;
};
const emptyForm: FormState = {
  code: "", description: "", discount_type: "percentage", discount_value: "10",
  apply_to_all: true, service_ids: [], combo_ids: [], starts_at: "", expires_at: "",
  max_redemptions: "", is_active: true,
};
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const localDateTime = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "Sem limite";

export default function BusinessCoupons() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [company, setCompany] = useState<any>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [combos, setCombos] = useState<ComboItem[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [redemptionCounts, setRedemptionCounts] = useState<Record<string, number>>({});
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: companyData, error: companyError } = await supabase.from("companies").select("id,name,slug").eq("slug", slug).single();
      if (companyError || !companyData) throw companyError || new Error("Empresa não encontrada.");
      setCompany(companyData);
      const [serviceResult, comboResult, couponResult] = await Promise.all([
        supabase.from("services").select("id,name,price,is_active").eq("company_id", companyData.id).order("name"),
        supabase.from("service_combos").select("*").eq("company_id", companyData.id).order("name"),
        supabase.from("company_service_coupons").select("*").eq("company_id", companyData.id).order("created_at", { ascending: false }),
      ]);
      if (serviceResult.error) throw serviceResult.error;
      if (comboResult.error) throw comboResult.error;
      if (couponResult.error) throw couponResult.error;
      setServices((serviceResult.data || []) as ServiceItem[]);
      setCombos((comboResult.data || []) as ComboItem[]);
      const rows = (couponResult.data || []) as Coupon[];
      setCoupons(rows);
      if (rows.length) {
        const counts = await Promise.all(rows.map(async (coupon) => {
          const { count } = await supabase.from("company_service_coupon_redemptions")
            .select("id", { count: "exact", head: true })
            .eq("coupon_id", coupon.id).eq("status", "redeemed");
          return [coupon.id, count || 0] as const;
        }));
        setRedemptionCounts(Object.fromEntries(counts));
      } else setRedemptionCounts({});
    } catch (error: any) {
      console.error("[BUSINESS_COUPONS] Erro ao carregar cupons:", error);
      toast({ title: "Não foi possível carregar os cupons", description: error?.message || "Verifique as permissões da empresa.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [slug, toast]);

  useEffect(() => { void load(); }, [load]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleId = (key: "service_ids" | "combo_ids", id: string, checked: boolean) => {
    setForm((current) => ({ ...current, [key]: checked ? [...current[key], id] : current[key].filter((item) => item !== id) }));
  };
  const editCoupon = (coupon: Coupon) => setForm({
    id: coupon.id, code: coupon.code, description: coupon.description || "",
    discount_type: coupon.discount_type, discount_value: String(coupon.discount_value),
    apply_to_all: coupon.apply_to_all, service_ids: coupon.service_ids || [], combo_ids: coupon.combo_ids || [],
    starts_at: coupon.starts_at ? new Date(coupon.starts_at).toISOString().slice(0, 16) : "",
    expires_at: coupon.expires_at ? new Date(coupon.expires_at).toISOString().slice(0, 16) : "",
    max_redemptions: coupon.max_redemptions == null ? "" : String(coupon.max_redemptions),
    is_active: coupon.is_active,
  });

  const save = async () => {
    if (!company) return;
    const code = form.code.trim().toUpperCase();
    const value = Number(form.discount_value);
    if (!/^[A-Z0-9_-]{3,64}$/.test(code)) {
      toast({ title: "Código inválido", description: "Use de 3 a 64 caracteres: letras, números, hífen ou sublinhado.", variant: "destructive" }); return;
    }
    if (!Number.isFinite(value) || value <= 0 || (form.discount_type === "percentage" && value > 100)) {
      toast({ title: "Desconto inválido", description: form.discount_type === "percentage" ? "A porcentagem deve ser maior que 0 e até 100%." : "Informe um valor fixo maior que zero.", variant: "destructive" }); return;
    }
    if (!form.apply_to_all && !form.service_ids.length && !form.combo_ids.length) {
      toast({ title: "Selecione o escopo", description: "Escolha ao menos um serviço ou combo, ou marque todos.", variant: "destructive" }); return;
    }
    if (form.max_redemptions && (!Number.isInteger(Number(form.max_redemptions)) || Number(form.max_redemptions) < 1)) {
      toast({ title: "Limite inválido", description: "O limite de utilizações deve ser um número inteiro positivo.", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        company_id: company.id, code, description: form.description.trim() || null,
        discount_type: form.discount_type, discount_value: value, apply_to_all: form.apply_to_all,
        service_ids: form.apply_to_all ? [] : form.service_ids, combo_ids: form.apply_to_all ? [] : form.combo_ids,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
        is_active: form.is_active, created_by: user?.id || null, updated_at: new Date().toISOString(),
      };
      if (form.id) {
        const { error } = await supabase.from("company_service_coupons").update(payload).eq("id", form.id).eq("company_id", company.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("company_service_coupons").insert(payload);
        if (error) throw error;
      }
      toast({ title: "Cupom salvo", description: "As regras do cupom foram atualizadas." });
      setForm(emptyForm);
      await load();
    } catch (error: any) {
      toast({ title: "Erro ao salvar cupom", description: error?.message || "Tente novamente.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const remove = async (coupon: Coupon) => {
    if (!window.confirm(`Excluir o cupom ${coupon.code}? Cupons já utilizados não podem ser excluídos.`)) return;
    const { error } = await supabase.from("company_service_coupons").delete().eq("id", coupon.id).eq("company_id", company.id);
    if (error) {
      toast({ title: "Não foi possível excluir", description: "Se o cupom já tiver sido utilizado, desative-o em vez de excluí-lo.", variant: "destructive" });
      return;
    }
    toast({ title: "Cupom excluído" });
    if (form.id === coupon.id) setForm(emptyForm);
    await load();
  };

  return (
    <BusinessLayout>
      <div className="container mx-auto max-w-6xl p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Ticket className="h-7 w-7" /> Cupons promocionais</h1>
            <p className="text-muted-foreground">Crie descontos para clientes em serviços e combos pagos online de {company?.name || "sua empresa"}.</p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4 mr-2" />Atualizar</Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{form.id ? "Editar cupom" : "Novo cupom"}</CardTitle>
              <CardDescription>Um cupom por agendamento. O desconto só é aplicado no pagamento online.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label htmlFor="coupon-code">Código</Label><Input id="coupon-code" value={form.code} onChange={(e) => update("code", e.target.value.toUpperCase())} placeholder="BEMVINDO10" maxLength={64} /></div>
              <div className="space-y-2"><Label htmlFor="coupon-description">Descrição (opcional)</Label><Input id="coupon-description" value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Desconto para novos clientes" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="coupon-type">Tipo de desconto</Label><select id="coupon-type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.discount_type} onChange={(e) => update("discount_type", e.target.value as FormState["discount_type"])}><option value="percentage">Porcentagem (%)</option><option value="fixed">Valor fixo (R$)</option></select></div>
                <div className="space-y-2"><Label htmlFor="coupon-value">Desconto</Label><Input id="coupon-value" type="number" min="0.01" max={form.discount_type === "percentage" ? 100 : undefined} step="0.01" value={form.discount_value} onChange={(e) => update("discount_value", e.target.value)} /></div>
              </div>
              <div className="flex items-center gap-2"><input id="coupon-all" type="checkbox" checked={form.apply_to_all} onChange={(e) => update("apply_to_all", e.target.checked)} /><Label htmlFor="coupon-all">Aplicar a todos os serviços e combos</Label></div>
              {!form.apply_to_all && (
                <div className="space-y-3 rounded-md border p-3">
                  <div><p className="font-medium text-sm mb-2">Serviços</p>{services.filter((s) => s.is_active).length ? services.filter((s) => s.is_active).map((s) => <label key={s.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={form.service_ids.includes(s.id)} onChange={(e) => toggleId("service_ids", s.id, e.target.checked)} /><span>{s.name}</span><span className="ml-auto text-muted-foreground">{money(Number(s.price))}</span></label>) : <p className="text-xs text-muted-foreground">Nenhum serviço ativo.</p>}</div>
                  <div><p className="font-medium text-sm mb-2">Combos</p>{combos.filter((c) => c.is_active).length ? combos.filter((c) => c.is_active).map((combo) => <label key={combo.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={form.combo_ids.includes(combo.id)} onChange={(e) => toggleId("combo_ids", combo.id, e.target.checked)} /><span>{combo.name}</span><span className="ml-auto text-muted-foreground">{money(Number(combo.price ?? combo.combo_price ?? 0))}</span></label>) : <p className="text-xs text-muted-foreground">Nenhum combo ativo.</p>}</div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="coupon-start">Início (opcional)</Label><Input id="coupon-start" type="datetime-local" value={form.starts_at} onChange={(e) => update("starts_at", e.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="coupon-expiry">Validade até (opcional)</Label><Input id="coupon-expiry" type="datetime-local" value={form.expires_at} onChange={(e) => update("expires_at", e.target.value)} /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="coupon-limit">Limite de usos (opcional)</Label><Input id="coupon-limit" type="number" min="1" step="1" value={form.max_redemptions} onChange={(e) => update("max_redemptions", e.target.value)} placeholder="Ilimitado" /></div>
              <div className="flex items-center gap-2"><input id="coupon-active" type="checkbox" checked={form.is_active} onChange={(e) => update("is_active", e.target.checked)} /><Label htmlFor="coupon-active">Cupom ativo</Label></div>
              <div className="flex gap-2"><Button onClick={() => void save()} disabled={saving || loading} className="flex-1"><Save className="h-4 w-4 mr-2" />{saving ? "Salvando..." : "Salvar cupom"}</Button><Button variant="outline" onClick={() => setForm(emptyForm)}>Limpar</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Cupons cadastrados</CardTitle><CardDescription>Os usos são contabilizados quando o pagamento online é confirmado.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {loading ? <p className="text-sm text-muted-foreground">Carregando cupons...</p> : coupons.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum cupom criado ainda.</p> : coupons.map((coupon) => (
                <div key={coupon.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{coupon.code}</h3><Badge variant={coupon.is_active ? "default" : "secondary"}>{coupon.is_active ? "Ativo" : "Inativo"}</Badge></div><p className="text-sm text-muted-foreground">{coupon.description || (coupon.apply_to_all ? "Todos os serviços e combos" : "Serviços/combos selecionados")}</p></div>
                    <div className="text-right font-semibold">{coupon.discount_type === "percentage" ? `${coupon.discount_value}%` : money(Number(coupon.discount_value))}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground"><div>Início: {localDateTime(coupon.starts_at)}</div><div>Validade: {localDateTime(coupon.expires_at)}</div><div>Usos: {redemptionCounts[coupon.id] || 0}{coupon.max_redemptions ? ` / ${coupon.max_redemptions}` : " / ilimitado"}</div><div>Escopo: {coupon.apply_to_all ? "Todos" : `${coupon.service_ids.length} serviços, ${coupon.combo_ids.length} combos`}</div></div>
                  <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => editCoupon(coupon)}>Editar</Button><Button size="sm" variant="outline" onClick={() => void remove(coupon)}><Trash2 className="h-4 w-4 mr-1" />Excluir</Button></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </BusinessLayout>
  );
}
