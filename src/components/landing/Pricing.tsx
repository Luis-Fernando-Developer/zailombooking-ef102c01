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
      // Dummy data as fallback
      const dummyPlans = [
        { id: '1', name: 'Prata', monthly_price: 49, quarterly_price: 132, annual_price: 470, is_active: true, features: ['100 agendamentos', 'Suporte básico', 'Relatórios simples'] },
        { id: '2', name: 'Ouro', monthly_price: 99, quarterly_price: 267, annual_price: 950, is_active: true, features: ['Agendamentos ilimitados', 'Suporte prioratário', 'Relatórios avançados', 'Multiusuário'] },
        { id: '3', name: 'Diamante', monthly_price: 199, quarterly_price: 537, annual_price: 1910, is_active: true, features: ['Tudo do Ouro', 'Customização total', 'API de integração', 'Account manager'] },
        { id: '4', name: 'Ruby', monthly_price: 0, quarterly_price: 0, annual_price: 0, is_active: true, features: ['Sob medida', 'SLA garantido', 'Instalação on-premise'] },
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
      case 'quarterly':
        return plan.quarterly_price;
      case 'annual':
        return plan.annual_price;
      default:
        return plan.monthly_price;
    }
  };

  const getPeriodLabel = () => {
    switch (billingPeriod) {
      case 'quarterly':
        return '/trimestre';
      case 'annual':
        return '/ano';
      default:
        return '/mês';
    }
  };

  const getDiscount = () => {
    switch (billingPeriod) {
      case 'quarterly':
        return '10% OFF';
      case 'annual':
        return '20% OFF';
      default:
        return null;
    }
  };

  const handleSelectPlan = (plan: Plan) => {
    navigate(`/signup?plan=${plan.id}&period=${billingPeriod}`);
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
    <section id="pricing" className="py-24 relative">
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-72 h-72 bg-neon-violet/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-neon-pink/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            <span className="text-gradient">Planos Flexíveis</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Escolha o plano ideal para o seu negócio. Sem taxa de setup, sem fidelidade, cancele quando quiser.
          </p>

          <div className="flex items-center justify-center gap-4 mb-8">
            <span className="text-sm text-muted-foreground">Período de cobrança:</span>
            <Select value={billingPeriod} onValueChange={(value: 'monthly' | 'quarterly' | 'annual') => setBillingPeriod(value)}>
              <SelectTrigger className="w-48 bg-card/50 border-primary/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-primary/20">
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="quarterly">Trimestral (10% OFF)</SelectItem>
                <SelectItem value="annual">Anual (20% OFF)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {getDiscount() && (
            <div className="inline-block bg-gradient-primary text-white px-4 py-2 rounded-full text-sm font-medium animate-pulse-glow mb-4">
              🎉 Economize {getDiscount()} pagando {billingPeriod === 'quarterly' ? 'trimestralmente' : 'anualmente'}!
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {plans.map((plan, index) => {
              const Icon = iconMap[plan.name] || Zap;
              const isPopular = index === 1;
              return (
                <Card 
                  key={plan.id} 
                  className={`relative card-glow transition-all duration-300 ${
                    isPopular 
                      ? 'border-primary bg-gradient-to-b from-primary/10 to-transparent scale-105' 
                      : 'bg-card/50 backdrop-blur-sm border-primary/20'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <div className="bg-gradient-primary text-white px-4 py-1 rounded-full text-sm font-medium animate-pulse-glow">
                        Mais Popular
                      </div>
                    </div>
                  )}

                  <CardHeader className="text-center pb-2">
                    <div className="w-16 h-16 bg-gradient-primary rounded-xl flex items-center justify-center mx-auto mb-4">
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <CardDescription>Plano {plan.name}</CardDescription>
                    <div className="pt-4">
                      {plan.name === 'Ruby' || getPrice(plan) === 0 ? (
                        <span className="text-2xl font-bold text-gradient">Sob consulta</span>
                      ) : (
                        <>
                          <span className="text-4xl font-bold text-gradient">{formatPrice(getPrice(plan))}</span>
                          <span className="text-muted-foreground">{getPeriodLabel()}</span>
                        </>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent>
                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-3">
                          <Check className="w-5 h-5 text-primary flex-shrink-0" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button 
                      variant={isPopular ? "neon" : "outline"} 
                      className="w-full"
                      size="lg"
                      onClick={() => handleSelectPlan(plan)}
                    >
                      {plan.name === 'Ruby' ? "Fale Conosco" : isPopular ? "Começar Agora" : "Escolher Plano"}
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
