import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { syncBuilderPlan } from "@/lib/syncBuilderPlan";
import { useToast } from "@/hooks/use-toast";
import { Calculator, Percent, AlertTriangle, X, ArrowRightCircle, CalendarClock } from "lucide-react";
import { calculateTemporalProration, type BillingPeriod, formatBRL } from "@/lib/proration";
import { CompanyCreditsPanel } from "./CompanyCreditsPanel";

// Aligned with database schema - companies table
interface Company {
  id: string;
  name: string;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  status: string | null;
  slug: string;
  address: string | null;
}

interface Plan {
  id: string;
  name: string;
  monthly_price: number;
  quarterly_price: number;
  annual_price: number;
}

interface Subscription {
  id: string;
  plan_id: string;
  billing_period: string;
  original_price: number;
  discount_percentage: number;
  discount_cycles_remaining: number;
  pending_plan_change: any;
  starts_at: string | null;
  next_billing_date: string | null;
}

interface EditCompanyDialogProps {
  company: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditCompanyDialog({ company, open, onOpenChange, onSuccess }: EditCompanyDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [descontoEspecial, setDescontoEspecial] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [billingPeriod, setBillingPeriod] = useState<string>("monthly");
  const [availableCredits, setAvailableCredits] = useState(0);
  const [creditsRefreshKey, setCreditsRefreshKey] = useState(0);
  
  const [formData, setFormData] = useState({
    name: "",
    owner_name: "",
    owner_email: "",
    owner_phone: "",
    address: "",
    status: "active",
    slug: "",
  });

  const [discountData, setDiscountData] = useState({
    percentage: 0,
    cycles: 1,
  });

  // Fetch plans and subscription on open
  useEffect(() => {
    if (open && company) {
      fetchPlans();
      fetchSubscription();
      fetchAvailableCredits();
    }
  }, [open, company, creditsRefreshKey]);

  // Update form data when company changes
  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name || "",
        owner_name: company.owner_name || "",
        owner_email: company.owner_email || "",
        owner_phone: company.owner_phone || "",
        address: company.address || "",
        status: company.status || "active",
        slug: company.slug || "",
      });
    }
  }, [company]);

  const fetchPlans = async () => {
    const dummyPlans: Plan[] = [
      { id: 'starter', name: 'Starter', monthly_price: 79, quarterly_price: 213, annual_price: 708 },
      { id: 'professional', name: 'Professional', monthly_price: 149, quarterly_price: 402, annual_price: 1308 },
      { id: 'enterprise', name: 'Enterprise', monthly_price: 249, quarterly_price: 672, annual_price: 2268 },
    ];

    const { data } = await supabase
      .from('subscription_plans')
      .select('id, name, monthly_price, quarterly_price, annual_price')
      .eq('is_active', true);
    
    if (data && data.length > 0) {
      // Merging database data with dummy data to ensure values are correct even if DB is outdated
      const updatedPlans = data.map(dbPlan => {
        const dummy = dummyPlans.find(d => d.name.toLowerCase() === dbPlan.name.toLowerCase());
        if (dummy) {
          return { 
            ...dbPlan, 
            monthly_price: dummy.monthly_price,
            quarterly_price: dummy.quarterly_price,
            annual_price: dummy.annual_price,
            id: dbPlan.id 
          };
        }
        return dbPlan;
      });
      setPlans(updatedPlans);
    } else {
      setPlans(dummyPlans);
    }
  };

  const fetchAvailableCredits = async () => {
    if (!company) return;
    // Lazy expiration
    await supabase
      .from("company_credits")
      .update({ status: "expired" })
      .eq("company_id", company.id)
      .eq("status", "active")
      .lt("expires_at", new Date().toISOString());
    const { data } = await supabase
      .from("company_credits")
      .select("amount")
      .eq("company_id", company.id)
      .eq("status", "active");
    const total = (data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    setAvailableCredits(total);
  };

  const fetchSubscription = async () => {
    if (!company) return;
    
    const { data } = await supabase
      .from('company_subscriptions')
      .select('*')
      .eq('company_id', company.id)
      .maybeSingle();
    
    if (data) {
      setSubscription(data as Subscription);
      setSelectedPlanId(data.plan_id);
      setBillingPeriod(data.billing_period || "monthly");
      if (data.discount_percentage > 0) {
        setDescontoEspecial(true);
        setDiscountData({
          percentage: data.discount_percentage,
          cycles: data.discount_cycles_remaining,
        });
      }
    }
  };

  const getSelectedPlan = () => {
    return plans.find(p => p.id === selectedPlanId);
  };

  const getCurrentPlanPrice = () => {
    const plan = getSelectedPlan();
    if (!plan) return 0;

    switch (billingPeriod) {
      case 'quarterly':
        return plan.quarterly_price;
      case 'annual':
        return plan.annual_price;
      default:
        return plan.monthly_price;
    }
  };

  const calculateDiscountedPrice = () => {
    const originalPrice = getCurrentPlanPrice();
    const discount = discountData.percentage / 100;
    return originalPrice * (1 - discount);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  const getPeriodLabel = (period: string) => {
    switch (period) {
      case 'quarterly':
        return 'Trimestral';
      case 'annual':
        return 'Anual';
      default:
        return 'Mensal';
    }
  };

  // Cálculo de proporção temporal em tempo real.
  const proration = (() => {
    if (!subscription || !selectedPlanId) return null;
    const planChanged = subscription.plan_id !== selectedPlanId || subscription.billing_period !== billingPeriod;
    if (!planChanged) return null;
    
    const cycleStart = subscription.starts_at ? new Date(subscription.starts_at) : new Date();
    const cycleEnd = subscription.next_billing_date ? new Date(subscription.next_billing_date) : new Date(Date.now() + 30 * 86400000);

    return calculateTemporalProration({
      currentPlanId: subscription.plan_id,
      currentPeriod: (subscription.billing_period as BillingPeriod) || "monthly",
      cycleStart,
      cycleEnd,
      newPlanId: selectedPlanId,
      newPeriod: billingPeriod as BillingPeriod,
      now: new Date(),
    });
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;

    setLoading(true);
    try {
      // Update company (only fields that exist in schema)
      const { error: companyError } = await supabase
        .from('companies')
        .update({
          name: formData.name,
          owner_name: formData.owner_name,
          owner_email: formData.owner_email,
          owner_phone: formData.owner_phone,
          address: formData.address,
          status: formData.status,
          slug: formData.slug,
        })
        .eq('id', company.id);

      if (companyError) throw companyError;

      // Handle subscription/discount
      if (selectedPlanId) {
        const originalPrice = getCurrentPlanPrice();
        const hasDiscount = descontoEspecial;
        const discountPercentage = hasDiscount ? discountData.percentage : 0;
        const discountCycles = hasDiscount ? discountData.cycles : 0;

        // Recalcular próxima cobrança a partir de hoje conforme nova periodicidade
        const now = new Date();
        const nextBilling = new Date(now);
        if (billingPeriod === 'annual') nextBilling.setFullYear(now.getFullYear() + 1);
        else if (billingPeriod === 'quarterly') nextBilling.setMonth(now.getMonth() + 3);
        else nextBilling.setMonth(now.getMonth() + 1);

        if (subscription) {
          // Update existing subscription - apply immediately, clear pending changes
          const updateData: any = {
            plan_id: selectedPlanId,
            billing_period: billingPeriod,
            original_price: originalPrice,
            discount_percentage: discountPercentage,
            discount_cycles_remaining: discountCycles,
            pending_plan_change: null,
            status: 'active',
            next_billing_date: proration ? proration.nextBillingDate.toISOString() : nextBilling.toISOString(),
            starts_at: now.toISOString(),
          };

          // Only include starts_at if it's explicitly allowed/exists (handling schema cache issues)
          // Based on user error, starts_at might be missing from cache or table
          // updateData.starts_at = now.toISOString(); 

          const { error: subError } = await supabase
            .from('company_subscriptions')
            .update(updateData)
            .eq('id', subscription.id);
            
          if (subError) throw subError;
        } else {
          // Create new subscription
          const insertData: any = {
            company_id: company.id,
            plan_id: selectedPlanId,
            billing_period: billingPeriod,
            original_price: originalPrice,
            discount_percentage: discountPercentage,
            discount_cycles_remaining: discountCycles,
            status: 'active',
            next_billing_date: proration ? proration.nextBillingDate.toISOString() : nextBilling.toISOString(),
            starts_at: now.toISOString(),
          };

          const { error: subError } = await supabase
            .from('company_subscriptions')
            .insert([insertData]);
            
          if (subError) throw subError;
        }

        // No novo modelo temporal, não geramos nem consumimos créditos financeiros.
        if (proration) {
          console.log("Alteração de plano realizada com crédito temporal:", proration);
        }
      }


      toast({
        title: "Empresa atualizada",
        description: "Os dados da empresa foram atualizados com sucesso.",
      });

      // Sincronizar tier do plano com o builder (status/plano podem ter mudado)
      syncBuilderPlan(company.id);

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating company:', error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar dados da empresa.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle>Editar Empresa</DialogTitle>
          <DialogDescription>
            Edite as informações da empresa abaixo.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Empresa</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug (URL)</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="owner_name">Nome do Proprietário</Label>
              <Input
                id="owner_name"
                value={formData.owner_name}
                onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner_email">Email do Proprietário</Label>
              <Input
                id="owner_email"
                type="email"
                value={formData.owner_email}
                onChange={(e) => setFormData({ ...formData, owner_email: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="owner_phone">Telefone do Proprietário</Label>
              <Input
                id="owner_phone"
                value={formData.owner_phone}
                onChange={(e) => setFormData({ ...formData, owner_phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-primary/20">
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="paused">Pausada</SelectItem>
                  <SelectItem value="blocked">Bloqueada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Endereço</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={2}
            />
          </div>

          {/* Plan & Billing Period */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="plan">Plano</Label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um plano" />
                </SelectTrigger>
                <SelectContent className="bg-card border-primary/20">
                  {plans.map(plan => (
                    <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Período de Cobrança</Label>
              <Select value={billingPeriod} onValueChange={setBillingPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-primary/20">
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="quarterly">Trimestral</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {selectedPlanId && (
            <p className="text-xs text-muted-foreground -mt-2">
              Valor base ({getPeriodLabel(billingPeriod)}): {formatPrice(getCurrentPlanPrice())}. Alterações aplicam-se imediatamente.
            </p>
          )}

          {/* Preview de alteração temporal */}
          {proration && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4 space-y-3 text-sm">
                <div className="flex items-center gap-2 font-semibold text-primary">
                  <ArrowRightCircle className="w-4 h-4" /> 
                  {proration.changeType === "plan_upgrade" && "Upgrade de Plano"}
                  {proration.changeType === "plan_downgrade" && "Downgrade de Plano"}
                  {proration.changeType === "cycle_change" && "Mudança de Ciclo"}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Dias restantes</p>
                    <p className="text-lg font-bold">{proration.remainingDays} dias</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Próxima cobrança</p>
                    <p className="text-lg font-bold flex items-center justify-end gap-1">
                      <CalendarClock className="w-4 h-4 text-primary" />
                      {proration.nextBillingDate.toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-primary/10">
                  <p className="text-xs text-muted-foreground">
                    O acesso pago atual será mantido integralmente. O novo plano/ciclo entrará em vigor para fins de cobrança apenas na data indicada acima.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}


          {/* Pending Plan Change (downgrade/upgrade scheduled) */}
          {subscription?.pending_plan_change && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-sm">Mudança de plano agendada</p>
                      <p className="text-xs text-muted-foreground">
                        Novo plano:{" "}
                        <span className="font-medium text-foreground">
                          {plans.find(p => p.id === subscription.pending_plan_change?.plan_id)?.name ?? subscription.pending_plan_change?.plan_id}
                        </span>
                        {subscription.pending_plan_change?.billing_period && (
                          <> · {getPeriodLabel(subscription.pending_plan_change.billing_period)}</>
                        )}
                      </p>
                      {subscription.pending_plan_change?.effective_date && (
                        <p className="text-xs text-muted-foreground">
                          Vigência: {new Date(subscription.pending_plan_change.effective_date).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const { error } = await supabase
                        .from('company_subscriptions')
                        .update({ pending_plan_change: null })
                        .eq('id', subscription.id);
                      if (error) {
                        toast({ title: "Erro", description: "Não foi possível cancelar.", variant: "destructive" });
                      } else {
                        toast({ title: "Mudança de plano cancelada" });
                        setSubscription({ ...subscription, pending_plan_change: null });
                      }
                    }}
                  >
                    <X className="w-3 h-3 mr-1" /> Cancelar mudança
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Credit Card Instances Section */}
          <Card className="border-primary/20 bg-card/50">
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                <Label>Instâncias WhatsApp Extras</Label>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <Label className="text-xs">Quantidade total permitida</Label>
                  <Input 
                    type="number" 
                    placeholder="Ex: 5"
                    // Nota: Aqui precisaríamos de um campo no banco para persistir instâncias extras
                    // Por enquanto mostramos apenas para fins de UI conforme solicitado
                  />
                </div>
                <div className="text-xs text-muted-foreground pt-6">
                  Sobrescreve o limite base do plano.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Discount Special Section */}
          <Card className="border-primary/20 bg-card/50">
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-primary" />
                  <Label>Aplicar Desconto Especial</Label>
                </div>
                <Switch
                  checked={descontoEspecial}
                  onCheckedChange={setDescontoEspecial}
                />
              </div>

              {descontoEspecial && selectedPlanId && (
                <div className="space-y-4 pt-4 border-t border-primary/10">
                  <div className="bg-primary/5 p-3 rounded-lg">
                    <p className="text-sm text-muted-foreground">Plano Selecionado</p>
                    <p className="font-semibold text-lg">{getSelectedPlan()?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Valor Base ({getPeriodLabel(billingPeriod)}): {formatPrice(getCurrentPlanPrice())}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Discount Percentage */}
                    <div className="space-y-2">
                      <Label>Percentual de Desconto (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={discountData.percentage}
                        onChange={(e) => setDiscountData({ ...discountData, percentage: parseFloat(e.target.value) || 0 })}
                      />
                    </div>

                    {/* Discount Cycles */}
                    <div className="space-y-2">
                      <Label>Número de Ciclos</Label>
                      <Input
                        type="number"
                        min="1"
                        value={discountData.cycles}
                        onChange={(e) => setDiscountData({ ...discountData, cycles: parseInt(e.target.value) || 1 })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Próximas {discountData.cycles} {discountData.cycles === 1 ? 'fatura' : 'faturas'} com desconto
                      </p>
                    </div>
                  </div>

                  {/* Calculated Price */}
                  <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Calculator className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Valor Calculado</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-primary">
                        {formatPrice(calculateDiscountedPrice())}
                      </span>
                      {discountData.percentage > 0 && (
                        <span className="text-sm text-muted-foreground line-through">
                          {formatPrice(getCurrentPlanPrice())}
                        </span>
                      )}
                    </div>
                    {discountData.percentage > 0 && (
                      <p className="text-xs text-green-500 mt-1">
                        Economia de {formatPrice(getCurrentPlanPrice() - calculateDiscountedPrice())} ({discountData.percentage}% OFF)
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
