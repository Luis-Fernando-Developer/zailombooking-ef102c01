import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Percent, Plus, Save, Ticket, ToggleLeft, ToggleRight } from "lucide-react";

type Period = "monthly" | "quarterly" | "annual";
type Coupon = {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  duration_type: "first_payment" | "cycles";
  duration_cycles: number;
  plan_ids: string[];
  billing_periods: Period[];
  starts_at: string | null;
  expires_at: string | null;
  max_redemptions: number | null;
  is_active: boolean;
  created_at: string;
  subscription_coupon_redemptions?: { id: string; status: string; company_id: string }[];
};

type CouponForm = {
  code: string;
  description: string;
  discount_type: "percentage" | "fixed";
  discount_value: string;
  duration_type: "first_payment" | "cycles";
  duration_cycles: string;
  plan_ids: string[];
  billing_periods: Period[];
  starts_at: string;
  expires_at: string;
  max_redemptions: string;
  is_active: boolean;
};

const emptyForm: CouponForm = {
  code: "",
  description: "",
  discount_type: "percentage",
  discount_value: "10",
  duration_type: "first_payment",
  duration_cycles: "1",
  plan_ids: [],
  billing_periods: ["monthly", "quarterly", "annual"],
  starts_at: "",
  expires_at: "",
  max_redemptions: "",
  is_active: true,
};

const periodLabels: Record<Period, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  annual: "Anual",
};

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export default function SubscriptionCoupons() {
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [plans, setPlans] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm);
  const [selectedCoupon, setSelectedCoupon] = useState<string | null>(null);
  const [redemptions, setRedemptions] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [couponResult, planResult] = await Promise.all([
      supabase.from("subscription_coupons").select("*, subscription_coupon_redemptions(id,status,company_id,code,discount_amount,discounted_amount,created_at)").order("created_at", { ascending: false }),
      supabase.from("subscription_plans").select("id,name").order("name"),
    ]);
    if (couponResult.error) {
      toast({ title: "Não foi possível carregar os cupons", description: couponResult.error.message, variant: "destructive" });
    } else {
      setCoupons((couponResult.data || []) as Coupon[]);
    }
    if (!planResult.error) setPlans(planResult.data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const editCoupon = (coupon: Coupon) => {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      description: coupon.description || "",
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      duration_type: coupon.duration_type,
      duration_cycles: String(coupon.duration_cycles),
      plan_ids: coupon.plan_ids || [],
      billing_periods: coupon.billing_periods || ["monthly", "quarterly", "annual"],
      starts_at: coupon.starts_at ? coupon.starts_at.slice(0, 16) : "",
      expires_at: coupon.expires_at ? coupon.expires_at.slice(0, 16) : "",
      max_redemptions: coupon.max_redemptions == null ? "" : String(coupon.max_redemptions),
      is_active: coupon.is_active,
    });
    setSelectedCoupon(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveCoupon = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const code = form.code.trim().toUpperCase().replace(/\\s+/g, "");
      const value = Number(form.discount_value);
      const cycles = form.duration_type === "first_payment" ? 1 : Math.max(1, Math.floor(Number(form.duration_cycles) || 1));
      if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new Error("Use um código de 3 a 40 caracteres, com letras, números, hífen ou sublinhado.");
      if (!(value > 0) || (form.discount_type === "percentage" && value > 100)) throw new Error("Informe um desconto válido. Percentuais devem ficar entre 1 e 100.");
      if (!form.billing_periods.length) throw new Error("Selecione pelo menos um período de contratação.");
      if (form.starts_at && form.expires_at && new Date(form.expires_at) <= new Date(form.starts_at)) throw new Error("A validade final deve ser posterior à data inicial.");
      const payload = {
        code,
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        discount_value: value,
        duration_type: form.duration_type,
        duration_cycles: cycles,
        plan_ids: form.plan_ids,
        billing_periods: form.billing_periods,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        max_redemptions: form.max_redemptions ? Math.max(1, Math.floor(Number(form.max_redemptions))) : null,
        is_active: form.is_active,
      };
      const result = editingId
        ? await supabase.from("subscription_coupons").update(payload).eq("id", editingId)
        : await supabase.from("subscription_coupons").insert({ ...payload, created_by: (await supabase.auth.getUser()).data.user?.id || null });
      if (result.error) throw result.error;
      toast({ title: editingId ? "Cupom atualizado" : "Cupom criado", description: "As regras serão validadas novamente no servidor durante a contratação." });
      resetForm();
      await load();
    } catch (error) {
      toast({ title: "Erro ao salvar cupom", description: error instanceof Error ? error.message : "Erro inesperado.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (coupon: Coupon) => {
    const { error } = await supabase.from("subscription_coupons").update({ is_active: !coupon.is_active }).eq("id", coupon.id);
    if (error) toast({ title: "Não foi possível alterar o cupom", description: error.message, variant: "destructive" });
    else {
      toast({ title: coupon.is_active ? "Cupom pausado" : "Cupom ativado" });
      await load();
    }
  };

  const showRedemptions = (coupon: Coupon) => {
    setSelectedCoupon(coupon.id);
    setRedemptions(coupon.subscription_coupon_redemptions || []);
  };

  const togglePeriod = (period: Period, checked: boolean) => setForm(prev => ({
    ...prev,
    billing_periods: checked ? [...prev.billing_periods, period] : prev.billing_periods.filter(p => p !== period),
  }));
  const togglePlan = (id: string, checked: boolean) => setForm(prev => ({
    ...prev,
    plan_ids: checked ? [...prev.plan_ids, id] : prev.plan_ids.filter(p => p !== id),
  }));

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-3"><Ticket className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-bold">Cupons de aquisição</h1>
          <p className="text-sm text-muted-foreground">Descontos para novos empresários contratarem o Zailom Booking.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Editar cupom" : "Criar cupom"}</CardTitle>
          <CardDescription>Os descontos não são acumulativos. Deixe os planos vazios para permitir todos.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={saveCoupon}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="coupon-code">Código</Label>
                <Input id="coupon-code" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase().replace(/\\s+/g, "") }))} placeholder="ZAILOM20" required maxLength={40} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-description">Descrição interna (opcional)</Label>
                <Input id="coupon-description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Campanha de lançamento" />
              </div>
              <div className="space-y-2">
                <Label>Tipo de desconto</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.discount_type} onChange={e => setForm(p => ({ ...p, discount_type: e.target.value as CouponForm["discount_type"] }))}>
                  <option value="percentage">Percentual (%)</option>
                  <option value="fixed">Valor fixo (R$)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-value">Desconto {form.discount_type === "percentage" ? "(%)" : "(R$)"}</Label>
                <Input id="coupon-value" type="number" min="0.01" max={form.discount_type === "percentage" ? 100 : undefined} step="0.01" value={form.discount_value} onChange={e => setForm(p => ({ ...p, discount_value: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Duração</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.duration_type} onChange={e => setForm(p => ({ ...p, duration_type: e.target.value as CouponForm["duration_type"], duration_cycles: e.target.value === "first_payment" ? "1" : p.duration_cycles }))}>
                  <option value="first_payment">Somente primeira cobrança</option>
                  <option value="cycles">Número definido de cobranças</option>
                </select>
              </div>
              {form.duration_type === "cycles" && <div className="space-y-2">
                <Label htmlFor="coupon-cycles">Quantidade de cobranças</Label>
                <Input id="coupon-cycles" type="number" min="2" step="1" value={form.duration_cycles} onChange={e => setForm(p => ({ ...p, duration_cycles: e.target.value }))} required />
              </div>}
              <div className="space-y-2">
                <Label htmlFor="coupon-start">Válido a partir de</Label>
                <Input id="coupon-start" type="datetime-local" value={form.starts_at} onChange={e => setForm(p => ({ ...p, starts_at: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-end">Válido até</Label>
                <Input id="coupon-end" type="datetime-local" value={form.expires_at} onChange={e => setForm(p => ({ ...p, expires_at: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-limit">Limite total de utilizações (opcional)</Label>
                <Input id="coupon-limit" type="number" min="1" step="1" value={form.max_redemptions} onChange={e => setForm(p => ({ ...p, max_redemptions: e.target.value }))} placeholder="Ilimitado" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Planos permitidos</Label>
              <p className="text-xs text-muted-foreground">Nenhum selecionado = todos os planos.</p>
              <div className="flex flex-wrap gap-4">
                {plans.map(plan => <label key={plan.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.plan_ids.includes(plan.id)} onCheckedChange={checked => togglePlan(plan.id, checked === true)} />
                  {plan.name}
                </label>)}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Períodos permitidos</Label>
              <div className="flex flex-wrap gap-4">
                {(["monthly", "quarterly", "annual"] as Period[]).map(period => <label key={period} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.billing_periods.includes(period)} onCheckedChange={checked => togglePeriod(period, checked === true)} />
                  {periodLabels[period]}
                </label>)}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_active} onCheckedChange={checked => setForm(p => ({ ...p, is_active: checked === true }))} />
              Cupom ativo
            </label>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>{saving ? "Salvando..." : <><Save className="mr-2 h-4 w-4" />{editingId ? "Salvar alterações" : "Criar cupom"}</>}</Button>
              {editingId && <Button type="button" variant="outline" onClick={resetForm}>Cancelar edição</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cupons cadastrados</CardTitle><CardDescription>Gerencie campanhas e consulte utilizações.</CardDescription></CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Carregando cupons...</p> : coupons.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum cupom criado ainda.</p> : (
            <div className="space-y-3">
              {coupons.map(coupon => {
                const uses = coupon.subscription_coupon_redemptions || [];
                const used = uses.filter(r => ["reserved", "applied", "paid"].includes(r.status)).length;
                return <div key={coupon.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold">{coupon.code}</span>
                      <Badge variant={coupon.is_active ? "default" : "secondary"}>{coupon.is_active ? "Ativo" : "Pausado"}</Badge>
                      <Badge variant="outline">{coupon.discount_type === "percentage" ? `${coupon.discount_value}%` : money(Number(coupon.discount_value))}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{coupon.description || "Sem descrição"} · {coupon.duration_type === "first_payment" ? "Primeira cobrança" : `${coupon.duration_cycles} cobranças`}</p>
                    <p className="text-xs text-muted-foreground">Planos: {coupon.plan_ids.length ? plans.filter(p => coupon.plan_ids.includes(p.id)).map(p => p.name).join(", ") || "Planos selecionados" : "Todos"} · Períodos: {coupon.billing_periods.map(p => periodLabels[p]).join(", ")}</p>
                    <p className="text-xs text-muted-foreground">Utilizações: {used}{coupon.max_redemptions ? ` / ${coupon.max_redemptions}` : " / ilimitadas"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => editCoupon(coupon)}>Editar</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => toggleActive(coupon)}>{coupon.is_active ? <><ToggleLeft className="mr-1 h-4 w-4" />Pausar</> : <><ToggleRight className="mr-1 h-4 w-4" />Ativar</>}</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => showRedemptions(coupon)}>Histórico</Button>
                  </div>
                </div>;
              })}
            </div>
          )}
          {selectedCoupon && <div className="mt-6 rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Histórico de utilizações</h3><Button size="sm" variant="ghost" onClick={() => setSelectedCoupon(null)}>Fechar</Button></div>
            {redemptions.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há utilizações registradas.</p> : <div className="space-y-2">{redemptions.map((r, index) => <div key={r.id || index} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm">
              <span>Empresa: {r.company_id} · {new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
              <span>{money(Number(r.discount_amount || 0))} de desconto · {r.status}</span>
            </div>)}</div>}
          </div>}
        </CardContent>
      </Card>
    </div>
  );
}
