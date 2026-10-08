import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookingLogo } from "@/components/BookingLogo";
import { ArrowLeft, Building2, Percent, MessageSquare, Bot } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { syncBuilderPlan } from "@/lib/syncBuilderPlan";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card as UiCard, CardContent as UiCardContent } from "@/components/ui/card";

interface CompanyForm {
  name: string;
  slug: string;
  owner_name: string;
  owner_email: string;
  owner_password: string;
  owner_phone: string;
  owner_cpf: string;
  address: string;
  plan_id: string;
  billing_period: "monthly" | "quarterly" | "annual";
  extra_whatsapp_instances: number;
  provision_flow: boolean;
  discount_enabled: boolean;
  discount_percentage: number;
  discount_cycles: number;
}

export default function CreateCompany() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<CompanyForm>({
    name: "",
    slug: "",
    owner_name: "",
    owner_email: "",
    owner_password: "",
    owner_phone: "",
    owner_cpf: "",
    address: "",
    plan_id: "",
    billing_period: "monthly",
    extra_whatsapp_instances: 0,
    provision_flow: true,
    discount_enabled: false,
    discount_percentage: 0,
    discount_cycles: 1,
  });
  const [plans, setPlans] = useState<any[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  useEffect(() => {
    const loadPlans = async () => {
      const { data } = await supabase.from("subscription_plans").select("id,name,monthly_price,quarterly_price,annual_price").eq("is_active", true);
      const rows = data || [];
      setPlans(rows);
      const starter = rows.find((p: any) => String(p.name).toLowerCase() === "starter");
      if (starter) setFormData(prev => ({ ...prev, plan_id: prev.plan_id || starter.id }));
      setPlansLoading(false);
    };
    loadPlans();
  }, []);

  const selectedPlan = plans.find((p: any) => p.id === formData.plan_id);
  const basePrice = selectedPlan
    ? formData.billing_period === "annual" ? Number(selectedPlan.annual_price) : formData.billing_period === "quarterly" ? Number(selectedPlan.quarterly_price) : Number(selectedPlan.monthly_price)
    : 0;
  const discountValue = formData.discount_enabled ? Math.min(100, Math.max(0, formData.discount_percentage)) : 0;
  const firstChargeValue = Number((basePrice * (1 - discountValue / 100)).toFixed(2));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Auto-generate slug from company name
    if (name === 'name') {
      const slug = value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .replace(/-+/g, "-") // Replace multiple hyphens with single
        .trim();
      
      setFormData(prev => ({
        ...prev,
        slug
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // 1. Verificar se o slug já existe
      const { data: existingCompany } = await supabase
        .from('companies')
        .select('id')
        .eq('slug', formData.slug)
        .maybeSingle();

      if (existingCompany) {
        toast({
          title: "URL já existe",
          description: "Esta URL personalizada já está em uso. Escolha outra.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // 2. A identidade Auth é resolvida no backend.
      // O mesmo proprietário pode ter várias empresas e reutilizamos a identidade global.
      // 3. Primeiro criar a empresa diretamente (only use fields that exist in schema)
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .insert([{
          name: formData.name,
          slug: formData.slug,
          owner_name: formData.owner_name,
          owner_email: formData.owner_email,
          owner_phone: formData.owner_phone,
          owner_cpf: formData.owner_cpf.replace(/\D/g, ""),
          address: formData.address,
          plan_id: formData.plan_id,
          billing_period: formData.billing_period,
          extra_whatsapp_instances: formData.extra_whatsapp_instances,
          status: 'pending_payment'
        }])
        .select()
        .single();

      if (companyError) throw companyError;
      
      // 4. Criar usuário no Supabase Auth via Edge Function (Admin) para evitar limites de email
      console.log("Invocando create-admin-user...");
      const { data: authData, error: authError } = await supabase.functions.invoke('create-admin-user', {
        body: {
          email: formData.owner_email,
          password: formData.owner_password,
          metadata: {
            owner_name: formData.owner_name,
            owner_cpf: formData.owner_cpf.replace(/\D/g, ""),
            owner_phone: formData.owner_phone,
            company_id: companyData.id,
            plan_id: formData.plan_id,
            billing_period: formData.billing_period,
            discount_percentage: discountValue,
            discount_cycles: formData.discount_enabled ? Math.max(1, formData.discount_cycles) : 0,
            extra_whatsapp_instances: formData.extra_whatsapp_instances,
            provision_flow: formData.provision_flow
          }
        }
      });

      if (authError || !authData?.user) {
        // Se falhar o Auth, tentamos remover a empresa para evitar dados órfãos e slug bloqueado
        await supabase.from('companies').delete().eq('id', companyData.id);
        
        console.error("Erro no Auth via Edge Function:", authError);
        
        throw new Error(`Erro ao criar usuário: ${authError?.message || 'Erro desconhecido na Edge Function'}`);
      }


      // Aguardar um momento para garantir que o usuário esteja disponível no banco
      // O trigger no DB deve criar o perfil em public.users, mas precisamos do link em employees
      // Aumentamos o tempo e adicionamos uma verificação simples
      let userExists = false;
      for (let i = 0; i < 5; i++) {
        const { data: userRecord } = await supabase
          .from('users')
          .select('id')
          .eq('id', authData.user.id)
          .maybeSingle();
        
        if (userRecord) {
          userExists = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!userExists) {
        console.error("Usuário não encontrado na tabela public.users após 5 segundos");
        // Se o trigger falhou, tentamos criar manualmente na public.users para não quebrar o fluxo
        const { error: insertUserError } = await supabase
          .from('users')
          .insert([{
            id: authData.user.id,
            email: formData.owner_email,
            full_name: formData.owner_name
          }]);
        
        if (insertUserError) {
          console.error("Erro ao criar usuário manualmente em public.users:", insertUserError);
          // Se falhar tudo, removemos a empresa
          await supabase.from('companies').delete().eq('id', companyData.id);
          throw new Error(`Erro de sincronização de usuário: O perfil não foi criado.`);
        }
      }

      // O create-admin-user agora cria o vínculo owner e a credencial contextual
      // da empresa. Não recriamos o employee aqui para evitar duplicidade.
      const { data: ownerEmployee, error: ownerEmployeeError } = await supabase
        .from('employees')
        .select('id, user_id')
        .eq('company_id', companyData.id)
        .eq('user_id', authData.user.id)
        .eq('role', 'owner')
        .maybeSingle();

      if (ownerEmployeeError || !ownerEmployee) {
        await supabase.from('companies').delete().eq('id', companyData.id);
        throw new Error(ownerEmployeeError?.message || "O vínculo do proprietário não foi criado.");
      }

      // A criação do usuário pelo Super Admin também provisiona a assinatura
      // recorrente do plano Starter mensal no Asaas. O retorno fica em
      // authData.billing; não criamos uma cobrança avulsa aqui.
      if (authData?.billing?.error || !authData?.billing?.subscription_id) {
        await supabase.from('companies').delete().eq('id', companyData.id);
        throw new Error(authData?.billing?.error || "Não foi possível criar a assinatura Asaas. A empresa não foi concluída.");
      }
      console.log("✅ Assinatura Asaas provisionada:", authData.billing);

      // Provisionar Flow somente se o Super Admin tiver ativado o toggle.
      if (formData.provision_flow) try {
        // Verificar se já existe integração para não duplicar
        const { data: existingIntegration } = await supabase
          .from('chatbot_integration')
          .select('id')
          .eq('company_id', companyData.id)
          .maybeSingle();

        if (!existingIntegration) {
          await supabase
            .from('chatbot_integration')
            .insert([{
              company_id: companyData.id,
              builder_base_url: 'https://fwoescubnnagdvwasbjl.supabase.co',
              builder_workspace_slug: formData.slug,
              is_active: false,
              talkmap_provisioned: false,
            }]);
        }

        console.log("Invocando provision-zailom-flow...");
        const { data: provResult, error: provError } = await supabase.functions.invoke('provision-zailom-flow', {
          body: {
            email: formData.owner_email,
            password: formData.owner_password,
            slug: formData.slug,
            display_name: formData.owner_name,
            plan_id: formData.plan_id,
            company_id: companyData.id,
          }
        });

        if (provError) {
          console.error('❌ Erro RPC ao chamar Edge Function:', provError);
          throw provError;
        }

        if (provResult?.success) {
          console.log('✅ Conta ZailomFlow provisionada:', provResult);
        } else {
          console.warn('⚠️ Falha no provisionamento retornado pela função:', provResult?.error);
        }

      } catch (provErr) {
        console.warn('⚠️ Erro ao provisionar ZailomFlow (não bloqueante):', provErr);
      }

      // Sincronizar tier do plano com o builder
      if (formData.provision_flow) {
        syncBuilderPlan(companyData.id, selectedPlan?.name, { chatbots: 1, messages: 700, integrations: 1 });
      }

      toast({
        title: "Empresa criada com sucesso!",
        description: "A empresa foi cadastrada e o proprietário pode fazer login.",
      });

      navigate("/super-admin/painel");
    } catch (error) {
      console.error("Erro ao criar empresa:", error);
      toast({
        title: "Erro ao criar empresa",
        description: error instanceof Error ? error.message : "Ocorreu um erro ao cadastrar a empresa. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Header */}
      <header className="border-b border-primary/20 bg-card/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <BookingLogo />
            <Button variant="outline" onClick={() => navigate("/super-admin/painel")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl text-gradient">Adicionar Nova Empresa</CardTitle>
                <CardDescription>
                  Cadastre uma nova empresa no sistema
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Empresa *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Ex: Barbearia do João"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">URL Personalizada *</Label>
                  <Input
                    id="slug"
                    name="slug"
                    value={formData.slug}
                    onChange={handleInputChange}
                    placeholder="barbearia-do-joao"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner_name">Nome do Proprietário *</Label>
                  <Input
                    id="owner_name"
                    name="owner_name"
                    value={formData.owner_name}
                    onChange={handleInputChange}
                    placeholder="João Silva"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner_email">Email do Proprietário *</Label>
                  <Input
                    id="owner_email"
                    name="owner_email"
                    type="email"
                    value={formData.owner_email}
                    onChange={handleInputChange}
                    placeholder="joao@exemplo.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner_password">Senha do Proprietário *</Label>
                  <PasswordInput
                    id="owner_password"
                    name="owner_password"
                    showLeftIcon={false}
                    value={formData.owner_password}
                    onChange={handleInputChange}
                    placeholder="Digite uma senha segura"
                    minLength={6}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner_phone">Telefone do Proprietário</Label>
                  <Input
                    id="owner_phone"
                    name="owner_phone"
                    value={formData.owner_phone}
                    onChange={handleInputChange}
                    placeholder="(11) 99999-9999"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner_cpf">CPF/CNPJ do Proprietário *</Label>
                  <Input
                    id="owner_cpf"
                    name="owner_cpf"
                    value={formData.owner_cpf}
                    onChange={handleInputChange}
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    required
                  />
                </div>
              </div>

              <UiCard className="md:col-span-2 border-primary/20 bg-primary/5">
                <UiCardContent className="pt-5 space-y-5">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold">Plano e cobrança</h3>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Plano *</Label>
                      <Select value={formData.plan_id} onValueChange={(v) => setFormData(prev => ({ ...prev, plan_id: v }))}>
                        <SelectTrigger><SelectValue placeholder={plansLoading ? "Carregando planos..." : "Selecione o plano"} /></SelectTrigger>
                        <SelectContent>
                          {plans.map((plan: any) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Período de cobrança *</Label>
                      <Select value={formData.billing_period} onValueChange={(v: any) => setFormData(prev => ({ ...prev, billing_period: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Mensal</SelectItem>
                          <SelectItem value="quarterly">Trimestral</SelectItem>
                          <SelectItem value="annual">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Instâncias WhatsApp extras</Label>
                      <Input type="number" min="0" value={formData.extra_whatsapp_instances} onChange={(e) => setFormData(prev => ({ ...prev, extra_whatsapp_instances: Math.max(0, parseInt(e.target.value) || 0) }))} />
                      <p className="text-xs text-muted-foreground">Somadas ao limite normal do plano.</p>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-primary/20 p-3">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-primary" />
                        <div><Label>Provisionar Zailom Flow</Label><p className="text-xs text-muted-foreground">Herdará o nível do plano Booking.</p></div>
                      </div>
                      <Switch checked={formData.provision_flow} onCheckedChange={(v) => setFormData(prev => ({ ...prev, provision_flow: v }))} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-primary/20 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><Percent className="w-4 h-4 text-primary" /><Label>Aplicar Desconto Especial</Label></div>
                      <Switch checked={formData.discount_enabled} onCheckedChange={(v) => setFormData(prev => ({ ...prev, discount_enabled: v, discount_cycles: v ? Math.max(1, prev.discount_cycles) : prev.discount_cycles }))} />
                    </div>
                    {formData.discount_enabled && (
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Percentual de desconto (%)</Label>
                          <Input type="number" min="0" max="100" value={formData.discount_percentage} onChange={(e) => setFormData(prev => ({ ...prev, discount_percentage: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>Número de ciclos</Label>
                          <Input type="number" min="1" value={formData.discount_cycles} onChange={(e) => setFormData(prev => ({ ...prev, discount_cycles: Math.max(1, parseInt(e.target.value) || 1) }))} />
                          <p className="text-xs text-muted-foreground">Quantidade de cobranças com desconto. Mínimo de 1 ciclo.</p>
                        </div>
                      </div>
                    )}
                    {selectedPlan && <div className="text-sm">
                      <span>Plano {selectedPlan.name} · {formData.billing_period === "annual" ? "Anual" : formData.billing_period === "quarterly" ? "Trimestral" : "Mensal"}: </span>
                      <strong>R$ {basePrice.toFixed(2).replace(".", ",")}</strong>
                      {formData.discount_enabled && <span> → cobrança inicial: <strong>R$ {firstChargeValue.toFixed(2).replace(".", ",")}</strong></span>}
                    </div>}
                  </div>
                </UiCardContent>
              </UiCard>

              <div className="space-y-2">
                <Label htmlFor="address">Endereço</Label>
                <Textarea
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="Rua das Flores, 123 - Centro, São Paulo - SP"
                  rows={3}
                />
              </div>

              <div className="flex gap-4 pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/super-admin/painel")}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="neon"
                  disabled={isLoading || plansLoading || !formData.plan_id}
                  className="flex-1"
                >
                  {isLoading ? "Criando..." : "Criar Empresa"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
