import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Zap, Crown, Rocket, Gem } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface Plan {
  id: string;
  name: string;
  features: string[];
  monthly_price: number;
  quarterly_price: number;
  annual_price: number;
  is_active: boolean;
}

const iconMap: Record<string, any> = {
  'Prata': Zap,
  'Ouro': Crown,
  'Diamante': Rocket,
  'Ruby': Gem
};

export function Pricing() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const dummyPlans = [
        { id: '1', name: 'Prata', monthly_price: 49, quarterly_price: 132, annual_price: 470, is_active: true, features: ['Até 100 agendamentos/mês', 'Página Personalizada', 'Lembretes via WhatsApp', 'Relatórios Básicos'] },
        { id: '2', name: 'Ouro', monthly_price: 99, quarterly_price: 267, annual_price: 950, is_active: true, features: ['Agendamentos Ilimitados', 'Multi-usuário (Equipe)', 'Gestão de Comissões', 'Suporte Prioritário', 'Chatbot TalkMap'] },
        { id: '3', name: 'Diamante', monthly_price: 199, quarterly_price: 537, annual_price: 1910, is_active: true, features: ['Tudo do Plano Ouro', 'Domínio Personalizado', 'Customização Total de Design', 'Gerente de Contas Dedicado'] },
        { id: '4', name: 'Ruby', monthly_price: 0, quarterly_price: 0, annual_price: 0, is_active: true, features: ['Solução On-Premise', 'API de Integração Total', 'SLA de 99.9%', 'Segurança de nível Bancário'] },
      ];

      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('monthly_price');

      if (error) {
        setPlans(dummyPlans);
        return;
      }
      
      const parsedPlans = (data || []).map(plan => ({
        ...plan,
        features: Array.isArray(plan.features) ? plan.features : JSON.parse(plan.features as string || '[]')
      }));
      
      setPlans(parsedPlans.length > 0 ? parsedPlans : dummyPlans);
    } catch (error) {
      console.error('Error fetching plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPrice = (plan: Plan) => {
    switch (billingPeriod) {
      case 'quarterly': return plan.quarterly_price;
      case 'annual': return plan.annual_price;
      default: return plan.monthly_price;
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  };

  return (
    <section id="pricing" className="py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl lg:text-6xl font-black mb-8">
            Invista no seu <span className="text-gradient">Crescimento</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Menos do que o valor de um café por dia para ter sua agenda rodando no automático. Escolha o plano ideal.
          </p>

          <div className="flex items-center justify-center gap-4 mb-8">
            <Select value={billingPeriod} onValueChange={(value: any) => setBillingPeriod(value)}>
              <SelectTrigger className="w-56 bg-card/50 border-primary/30 h-12 text-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-primary/20">
                <SelectItem value="monthly">Cobrança Mensal</SelectItem>
                <SelectItem value="quarterly">Trimestral (10% OFF)</SelectItem>
                <SelectItem value="annual">Anual (20% OFF)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center h-64 items-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>
        ) : (
          <div className="grid lg:grid-cols-4 gap-6">
            {plans.map((plan, index) => {
              const Icon = iconMap[plan.name] || Zap;
              const isPopular = index === 1;
              return (
                <Card key={plan.id} className={`relative card-glow border-primary/20 bg-card/40 backdrop-blur-md ${isPopular ? 'border-primary ring-2 ring-primary/20 scale-105 z-10' : ''}`}>
                  {isPopular && <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-primary text-white px-6 py-1 rounded-full text-xs font-black uppercase tracking-widest">Mais Vendido</div>}
                  <CardHeader className="text-center">
                    <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-6"><Icon className="w-8 h-8 text-white" /></div>
                    <CardTitle className="text-2xl font-black">{plan.name}</CardTitle>
                    <div className="mt-4">
                      {plan.monthly_price === 0 ? <span className="text-3xl font-black text-gradient">Sob Consulta</span> : (
                        <><span className="text-5xl font-black text-white">{formatPrice(getPrice(plan))}</span><span className="text-muted-foreground text-sm ml-2">/{billingPeriod === 'monthly' ? 'mês' : billingPeriod === 'quarterly' ? 'tri' : 'ano'}</span></>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-4 mb-10">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                          <span className="text-sm leading-tight text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button variant={isPopular ? "neon" : "outline"} size="lg" className="w-full font-black text-md h-12" onClick={() => navigate(`/signup?plan=${plan.id}`)}>
                      {plan.monthly_price === 0 ? "Falar com Consultor" : "Começar Agora"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}