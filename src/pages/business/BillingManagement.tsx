import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, CreditCard, FileText, Package, Loader2, Download, ExternalLink, Check, MessageSquare, CalendarClock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

import { calculateSubscriptionChange, formatBRL, periodLabel, PLAN_LEVELS, PLAN_PRICES } from "@/lib/proration";

type Plan = {
  id: string; 
  name: string; 
  monthly_price: number; 
  quarterly_price: number; 
  annual_price: number;
  builder_tier: string; 
  features: any;
};

type Subscription = {
  id: string; 
  company_id: string; 
  plan_id: string; 
  billing_period: string;
  status: string; 
  original_price: number; 
  next_billing_date: string | null;
  pending_plan_change: any; 
  current_payment_method_id: string | null;
  asaas_subscription_id: string | null;
  subscription_plans: Plan;
};

type PaymentMethod = {
  id: string; 
  type: string; 
  brand: string | null; 
  last_digits: string | null;
  display_label: string | null; 
  is_default: boolean; 
  is_active: boolean;
};

type Invoice = {
  id: string; 
  amount: number; 
  status: string; 
  billing_type: string | null;
  due_date: string; 
  paid_at: string | null; 
  invoice_url: string | null;
  bank_slip_url: string | null; 
  description: string | null;
};

type Limits = {
  max_employees: number | null; 
  max_services: number | null;
  max_bookings_month: number | null; 
  max_chatbots: number | null;
  max_chatbot_messages: number | null; 
  max_integrations: number | null;
  max_whatsapp_instances: number | null;
  features: any;
};


export default function BillingManagement() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [limits, setLimits] = useState<Limits | null>(null);

  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("monthly");
  const [busy, setBusy] = useState(false);

  const [addCardOpen, setAddCardOpen] = useState(false);
  const [card, setCard] = useState({
    holderName: "", number: "", expiryMonth: "", expiryYear: "", ccv: "",
    cpfCnpj: "", postalCode: "", addressNumber: "", phone: "", email: "",
  });

  useEffect(() => { fetchAll(); }, [slug]);

  async function fetchAll() {
    setLoading(true);
    try {
      const { data: comp } = await supabase
        .from("companies").select("*").eq("slug", slug).single();
      if (!comp) return;
      setCompany(comp);

      const [{ data: sub }, { data: plans }, { data: pm }, { data: inv }] = await Promise.all([
        supabase.from("company_subscriptions")
          .select("*, subscription_plans(*)")
          .eq("company_id", comp.id).maybeSingle(),
        supabase.from("subscription_plans").select("*").eq("is_active", true).order("monthly_price"),
        supabase.from("company_payment_methods").select("*").eq("company_id", comp.id).eq("is_active", true),
        supabase.from("company_invoices").select("*").eq("company_id", comp.id)
          .order("due_date", { ascending: false }).limit(50),
      ]);
      setSubscription(sub as any);
      setAllPlans(plans as any || []);
      setMethods(pm as any || []);
      setInvoices(inv as any || []);

      const currentPlanName = sub?.subscription_plans?.name?.toLowerCase() || "starter";
      
      const planResourceLimits: Record<string, Limits> = {
        starter: {
          max_bookings_month: 200,
          max_employees: 1,
          max_services: 5,
          max_chatbots: 1,
          max_whatsapp_instances: 1,
          max_chatbot_messages: 700,
          max_integrations: 1,
          features: { support: "Email" }
        },
        professional: {
          max_bookings_month: 700,
          max_employees: 5,
          max_services: 12,
          max_chatbots: 3,
          max_whatsapp_instances: 3,
          max_chatbot_messages: 5000,
          max_integrations: 1,
          features: { support: "Prioritário", reports: "Avançados" }
        },
        enterprise: {
          max_bookings_month: -1,
          max_employees: -1,
          max_services: -1,
          max_chatbots: -1,
          max_whatsapp_instances: -1,
          max_chatbot_messages: -1,
          max_integrations: -1,
          features: { support: "Gerente de conta dedicado", api: "Completa" }
        }
      };

      setLimits(planResourceLimits[currentPlanName] || planResourceLimits.starter);
      
      if (sub) {
        setSelectedPlan(sub.plan_id);
        setSelectedPeriod(sub.billing_period || "monthly");
      }
    } catch (e: any) {
      console.error(e);
      toast({ title: "Erro ao carregar dados", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function callFn(name: string, body: any) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  }

  async function handleChangePlan() {
    if (!subscription || !selectedPlan) return;
    setBusy(true);
    try {
      const result: any = await callFn("asaas-change-plan", {
        company_id: subscription.company_id,
        new_plan_id: selectedPlan,
        billing_period: selectedPeriod,
      });
      
      const nextDate = formatDate(result.next_billing_date);
      
      toast({
        title: "Alteração solicitada",
        description: `O novo plano será aplicado após o término do período atual. Próxima cobrança: ${nextDate}`,
      });
      setChangePlanOpen(false);
      fetchAll();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function handleSetMethodPix() {
    if (!company) return;
    setBusy(true);
    try {
      await callFn("asaas-set-payment-method", { company_id: company.id, type: "pix" });
      toast({ title: "PIX definido como método padrão" });
      fetchAll();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function handleAddCard() {
    if (!company) return;
    setBusy(true);
    try {
      await callFn("asaas-set-payment-method", {
        company_id: company.id,
        type: "credit_card",
        credit_card: {
          holderName: card.holderName,
          number: card.number.replace(/\s/g, ""),
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          ccv: card.ccv,
        },
        credit_card_holder_info: {
          name: card.holderName,
          email: card.email || company.owner_email,
          cpfCnpj: card.cpfCnpj,
          postalCode: card.postalCode,
          addressNumber: card.addressNumber,
          phone: card.phone || company.owner_phone,
        },
      });
      toast({ title: "Cartão adicionado" });
      setAddCardOpen(false);
      fetchAll();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  if (loading) {
    return (
      <BusinessLayout companySlug={slug || ""} companyName="Carregando..." companyId="" userRole="loading">
        <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>
      </BusinessLayout>
    );
  }

  const plan = subscription?.subscription_plans;
  const pending = subscription?.pending_plan_change as any;

  return (
    <BusinessLayout companySlug={company?.slug || ""} companyName={company?.name || ""} companyId={company?.id || ""} userRole="owner">
      <div className="p-6 space-y-6 px-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/${slug}/admin/configuracoes`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gradient">Gerenciar Plano</h1>
            <p className="text-muted-foreground">Plano, métodos de pagamento e faturas</p>
          </div>
        </div>

        <Tabs defaultValue="plan">
          <TabsList>
            <TabsTrigger value="plan"><Package className="w-4 h-4 mr-1" /> Plano Atual</TabsTrigger>
            <TabsTrigger value="methods"><CreditCard className="w-4 h-4 mr-1" /> Métodos</TabsTrigger>
            <TabsTrigger value="invoices"><FileText className="w-4 h-4 mr-1" /> Faturas</TabsTrigger>
          </TabsList>

          {/* PLANO */}
          <TabsContent value="plan" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{plan?.name || "Sem plano ativo"}</CardTitle>
                    <CardDescription>
                      {subscription ? (
                        <div className="flex flex-col">
                          <span>
                            {formatBRL(subscription.original_price)} / {periodLabel(subscription.billing_period)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Modelo Profissional de Gerenciamento
                          </span>
                        </div>
                      ) : "Nenhuma assinatura encontrada"}
                    </CardDescription>

                  </div>
                  <Badge variant={subscription?.status === "active" ? "default" : "destructive"}>
                    {subscription?.status || "inativo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Próxima cobrança:</span>
                    <div className="font-medium">{formatDate(subscription?.next_billing_date)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tier no builder:</span>
                    <div className="font-medium capitalize">{plan?.name || "—"}</div>
                  </div>
                </div>

                {pending && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-amber-600 font-semibold">
                      <CalendarClock className="w-4 h-4" />
                      Alteração Agendada
                    </div>
                    <p className="text-sm">
                      Seu plano mudará para <strong>{allPlans.find(p => p.id === pending.plan_id)?.name || pending.plan_id} ({periodLabel(pending.billing_period)})</strong> em <strong>{formatDate(pending.effective_at || subscription?.next_billing_date)}</strong>.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Até lá, você continua com acesso total aos recursos do plano {plan?.name}.
                    </p>
                  </div>
                )}


                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Limites do Plano</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <LimitCard label="Mensagens" value={limits?.max_chatbot_messages ?? null} icon={<MessageSquare className="w-4 h-4 text-green-500" />} companyId={company?.id} />
                    <LimitCard label="Funcionários" value={limits?.max_employees ?? null} icon={<Check className="w-4 h-4 text-green-500" />} companyId={company?.id} />
                    <LimitCard label="Serviços" value={limits?.max_services ?? null} icon={<Check className="w-4 h-4 text-green-500" />} companyId={company?.id} />
                    <LimitCard label="Chatbots" value={limits?.max_chatbots ?? null} icon={<Check className="w-4 h-4 text-green-500" />} companyId={company?.id} />
                    <LimitCard label="Instâncias" value={limits?.max_whatsapp_instances ?? null} icon={<Check className="w-4 h-4 text-green-500" />} companyId={company?.id} />
                    <LimitCard label="Agendamentos" value={limits?.max_bookings_month ?? null} icon={<Check className="w-4 h-4 text-green-500" />} companyId={company?.id} />
                    <LimitCard label="Integrações" value={limits?.max_integrations ?? null} icon={<Check className="w-4 h-4 text-green-500" />} companyId={company?.id} />
                  </div>
                </div>


                <div className="flex gap-2 pt-2">
                  <Button onClick={() => setChangePlanOpen(true)}>Mudar de plano</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MÉTODOS */}
          <TabsContent value="methods" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Métodos de pagamento</CardTitle>
                <CardDescription>O último método utilizado vira padrão automaticamente.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {methods.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum método cadastrado. Adicione um cartão ou use PIX.</p>
                )}
                {methods.map(m => (
                  <div key={m.id} className="flex items-center justify-between border rounded-md p-3">
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-5 h-5" />
                      <div>
                        <div className="font-medium">{m.display_label || m.type}</div>
                        <div className="text-xs text-muted-foreground capitalize">{m.type.replace("_", " ")}</div>
                      </div>
                    </div>
                    {m.is_default && <Badge><Check className="w-3 h-3 mr-1" /> Padrão</Badge>}
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => setAddCardOpen(true)}>Adicionar cartão</Button>
                  <Button variant="outline" onClick={handleSetMethodPix} disabled={busy}>Usar PIX</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* FATURAS */}
          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de faturas</CardTitle>
                <CardDescription>Faturas pagas, pendentes e vencidas.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma fatura</TableCell></TableRow>
                    )}
                    {invoices.map(i => (
                      <TableRow key={i.id}>
                        <TableCell>{formatDate(i.due_date)}</TableCell>
                        <TableCell>{i.description || "—"}</TableCell>
                        <TableCell>R$ {Number(i.amount).toFixed(2)}</TableCell>
                        <TableCell><Badge variant={statusVariant(i.status)}>{labelStatus(i.status)}</Badge></TableCell>
                        <TableCell className="text-right space-x-2">
                          {i.invoice_url && (
                            <Button size="sm" variant="outline" asChild>
                              <a href={i.invoice_url} target="_blank" rel="noreferrer">
                                {i.status === "paid" ? <Download className="w-3 h-3 mr-1" /> : <ExternalLink className="w-3 h-3 mr-1" />}
                                {i.status === "paid" ? "Recibo" : "Pagar"}
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* DIALOGO MUDAR PLANO */}
      <Dialog open={changePlanOpen} onOpenChange={setChangePlanOpen}>
        <DialogContent className="sm:max-w-[450px] max-h-[85vh] overflow-y-auto">
          <DialogHeader className="pb-2">
            <DialogTitle>Mudar de plano</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Novo Plano</Label>
              <Select value={selectedPlan} onValueChange={(val) => {
                setSelectedPlan(val);
                // Reset period when changing plan to avoid confusion if needed, 
                // but usually better to keep what user selected
              }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um plano" />
                </SelectTrigger>
                <SelectContent>
                  {allPlans.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {
                        formatBRL(
                          selectedPeriod === 'annual' 
                            ? (PLAN_PRICES[p.name.toLowerCase()]?.annual || 0)
                            : selectedPeriod === 'quarterly' 
                            ? (PLAN_PRICES[p.name.toLowerCase()]?.quarterly || 0)
                            : (PLAN_PRICES[p.name.toLowerCase()]?.monthly || 0)
                        )
                      }/{periodLabel(selectedPeriod)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Periodicidade</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="quarterly">Trimestral (10% OFF)</SelectItem>
                  <SelectItem value="annual">Anual (20% OFF)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {subscription && selectedPlan && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                {(() => {
                  const change = calculateSubscriptionChange(
                    subscription.subscription_plans.name.toLowerCase(),
                    subscription.billing_period as any,
                    new Date(subscription.next_billing_date || new Date()),
                    allPlans.find(p => p.id === selectedPlan)?.name.toLowerCase() || "",
                    selectedPeriod as any
                  );

                  return (
                    <>
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        {change.isImmediate ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Package className="w-4 h-4 text-amber-500" />
                        )}
                        Informações da alteração
                      </h4>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tipo da alteração:</span>
                          <span className="font-medium">
                            {change.changeType === 'plan_upgrade' && "Upgrade de Plano"}
                            {change.changeType === 'plan_downgrade' && "Downgrade Agendado"}
                            {change.changeType === 'cycle_change' && "Mudança de Ciclo Agendada"}
                            {change.changeType === 'upgrade_with_cycle_change' && "Upgrade Imediato + Ciclo Agendado"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Dias restantes:</span>
                          <span className="font-medium">{change.remainingDays} dias</span>
                        </div>
                        {change.upgradeAmount > 0 && (
                          <div className="flex justify-between border-t border-border/50 pt-2">
                            <span className="text-muted-foreground font-semibold">Valor proporcional a pagar:</span>
                            <span className="font-bold text-green-600">{formatBRL(change.upgradeAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Data da alteração:</span>
                          <span className="font-medium">{formatDate(change.effectiveDate.toISOString())}</span>
                        </div>
                      </div>
                      
                      {((subscription.plan_id !== selectedPlan) || (subscription.billing_period !== selectedPeriod)) && (
                        <div className="mt-3 p-2 rounded border border-blue-500/20 bg-blue-500/5 text-[11px] text-blue-700 leading-tight">
                          <p className="font-semibold mb-1">Resumo do Ciclo:</p>
                          <p>
                            Atualmente em <strong>{periodLabel(subscription.billing_period)}</strong>. 
                            {change.upgradeAmount > 0 && `A diferença cobrada agora (${formatBRL(change.upgradeAmount)}) refere-se ao upgrade proporcional.`}
                          </p>
                          <p className="mt-1">
                            No próximo ciclo ({formatDate(change.effectiveDate.toISOString())}), você passará a ser cobrado o valor total de {
                              formatBRL(
                                selectedPeriod === 'annual' 
                                  ? (PLAN_PRICES[allPlans.find(p => p.id === selectedPlan)?.name.toLowerCase() || ""]?.annual || 0)
                                  : selectedPeriod === 'quarterly' 
                                  ? (PLAN_PRICES[allPlans.find(p => p.id === selectedPlan)?.name.toLowerCase() || ""]?.quarterly || 0)
                                  : (PLAN_PRICES[allPlans.find(p => p.id === selectedPlan)?.name.toLowerCase() || ""]?.monthly || 0)
                              )
                            } referente ao plano <strong>{allPlans.find(p => p.id === selectedPlan)?.name} ({periodLabel(selectedPeriod)})</strong>.
                          </p>
                        </div>
                      )}

                      <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
                        {change.isImmediate 
                          ? "O upgrade será aplicado imediatamente após a confirmação do pagamento proporcional." 
                          : "A alteração será aplicada automaticamente na próxima data de renovação."}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setChangePlanOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleChangePlan} disabled={busy} className="bg-green-600 hover:bg-green-700 text-white">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* DIALOGO ADICIONAR CARTÃO */}
      <Dialog open={addCardOpen} onOpenChange={setAddCardOpen}>
        <DialogContent className="max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Adicionar cartão</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Nome impresso</Label><Input value={card.holderName} onChange={e=>setCard({...card,holderName:e.target.value})} /></div>
            <div className="col-span-2"><Label>Número</Label><Input value={card.number} onChange={e=>setCard({...card,number:e.target.value})} /></div>
            <div><Label>Mês</Label><Input maxLength={2} value={card.expiryMonth} onChange={e=>setCard({...card,expiryMonth:e.target.value})} /></div>
            <div><Label>Ano</Label><Input maxLength={4} value={card.expiryYear} onChange={e=>setCard({...card,expiryYear:e.target.value})} /></div>
            <div><Label>CCV</Label><Input maxLength={4} value={card.ccv} onChange={e=>setCard({...card,ccv:e.target.value})} /></div>
            <div><Label>CPF/CNPJ</Label><Input value={card.cpfCnpj} onChange={e=>setCard({...card,cpfCnpj:e.target.value})} /></div>
            <div><Label>CEP</Label><Input value={card.postalCode} onChange={e=>setCard({...card,postalCode:e.target.value})} /></div>
            <div><Label>Número endereço</Label><Input value={card.addressNumber} onChange={e=>setCard({...card,addressNumber:e.target.value})} /></div>
            <div><Label>Telefone</Label><Input value={card.phone} onChange={e=>setCard({...card,phone:e.target.value})} /></div>
            <div className="col-span-2"><Label>Email</Label><Input value={card.email} onChange={e=>setCard({...card,email:e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCardOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddCard} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar cartão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BusinessLayout>
  );
}

function LimitCard({ label, value, icon, companyId }: { label: string; value: number | null; icon?: React.ReactNode; companyId?: string }) {
  const [usage, setUsage] = useState<number | null>(null);

  useEffect(() => {
    if (!companyId) return;

    const fetchUsage = async () => {
      // Map labels to resources for usePlanLimits/RPC
      const labelMap: Record<string, string> = {
        "Mensagens": "chatbot_messages",
        "Funcionários": "employees",
        "Serviços": "services",
        "Chatbots": "chatbots",
        "Instâncias": "whatsapp_instances",
        "Agendamentos": "bookings_month",
        "Integrações": "integrations"
      };

      const resource = labelMap[label];
      if (!resource) return;

      try {
        const { data, error } = await supabase.rpc("check_plan_limit", {
          _company_id: companyId,
          _resource: resource,
        });
        if (!error && data) {
          setUsage((data as any).current);
        }
      } catch (e) {
        console.error(`Error fetching usage for ${label}:`, e);
      }
    };

    fetchUsage();
  }, [label, companyId]);

  const displayValue = value === null || value === -1 || value >= 999999 ? "Ilimitado" : value;
  
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm transition-all hover:border-green-500/50">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {usage !== null && (
            <span className="text-[10px] font-bold bg-muted px-1.5 py-0.5 rounded uppercase">
              Em uso: {usage}
            </span>
          )}
        </div>
        <p className="text-xl font-bold">{displayValue}</p>
      </div>
    </div>
  );
}
function formatDate(d?: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR");
}
function labelPeriod(p: string) {
  return p === "annual" ? "ano" : p === "quarterly" ? "trimestre" : "mês";
}
function labelStatus(s: string) {
  return ({ paid: "Paga", pending: "Pendente", overdue: "Vencida", refunded: "Estornada", cancelled: "Cancelada", processing: "Processando" } as any)[s] || s;
}
function statusVariant(s: string): any {
  if (s === "paid") return "default";
  if (s === "overdue") return "destructive";
  return "secondary";
}
