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
  'Starter': Zap,
  'Professional': Crown,
  'Enterprise': Gem
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
        { 
          id: 'starter', 
          name: 'Starter', 
          monthly_price: 79, 
          quarterly_price: 213, // 71 * 3
          annual_price: 708, // 59 * 12
          is_active: true, 
          features: ['Agendamentos ilimitados', '1 profissional', 'Chat básico', 'Suporte por email'] 
        },
        { 
          id: 'professional', 
          name: 'Professional', 
          monthly_price: 149, 
          quarterly_price: 402, // 134 * 3
          annual_price: 1308, // 109 * 12
          is_active: true, 
          features: ['Agendamentos ilimitados', '5 profissionais', 'Chatbot completo', 'Relatórios avançados', 'Suporte prioritário'] 
        },
        { 
          id: 'enterprise', 
          name: 'Enterprise', 
          monthly_price: 249, 
          quarterly_price: 672, // 224 * 3
          annual_price: 2268, // 189 * 12
          is_active: true, 
          features: ['Agendamentos ilimitados', 'Profissionais ilimitados', 'Chatbot IA avançado', 'API completa', 'Gerente de conta dedicado'] 
        },
      ];

      // Use dummy plans by default to avoid issues with empty database tables or RLS
      setPlans(dummyPlans);

      // Attempt to fetch from Supabase if data exists
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('monthly_price');

      if (!error && data && data.length > 0) {
        const parsedPlans = data.map(plan => ({
          ...plan,
          features: Array.isArray(plan.features) ? plan.features : JSON.parse(plan.features as string || '[]')
        }));
        setPlans(parsedPlans);
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDisplayMonthlyPrice = (plan: Plan) => {
    switch (billingPeriod) {
      case 'quarterly': return plan.quarterly_price / 3;
      case 'annual': return plan.annual_price / 12;
      default: return plan.monthly_price;
    }
  };

  const getSavingsLabel = (plan: Plan) => {
    if (billingPeriod === 'quarterly') {
      const savings = (plan.monthly_price * 3) - plan.quarterly_price;
      return `Economia de R$${savings} no trimestre`;
    }
    if (billingPeriod === 'annual') {
      const savings = (plan.monthly_price * 12) - plan.annual_price;
      return `Economia de R$${savings} no ano`;
    }
    return null;
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
          <div className="grid lg:grid-cols-3 gap-8">
            {plans.map((plan, index) => {
              const Icon = iconMap[plan.name] || Zap;
              const isPopular = plan.name === 'Professional';
              const displayPrice = getDisplayMonthlyPrice(plan);
              const savingsLabel = getSavingsLabel(plan);

              return (
                <Card key={plan.id} className={`relative card-glow border-primary/20 bg-card/40 backdrop-blur-md flex flex-col ${isPopular ? 'border-primary ring-2 ring-primary/20 scale-105 z-10' : ''}`}>
                  {isPopular && <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-primary text-white px-6 py-1 rounded-full text-xs font-black uppercase tracking-widest">Mais Vendido</div>}
                  <CardHeader className="text-center">
                    <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-6"><Icon className="w-8 h-8 text-white" /></div>
                    <CardTitle className="text-2xl font-black">{plan.name}</CardTitle>
                    <div className="mt-4">
                      <span className="text-5xl font-black text-white">{formatPrice(displayPrice)}</span>
                      <span className="text-muted-foreground text-sm ml-2">/mês</span>
                    </div>
                    {savingsLabel && (
                      <div className="mt-2 text-primary text-xs font-bold uppercase tracking-tight">
                        {savingsLabel}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="flex-grow flex flex-col">
                    <ul className="space-y-4 mb-10 flex-grow">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                          <span className="text-sm leading-tight text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button variant={isPopular ? "neon" : "outline"} size="lg" className="w-full font-black text-md h-12" onClick={() => navigate(`/signup?plan=${plan.id}`)}>
                      Começar Agora
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