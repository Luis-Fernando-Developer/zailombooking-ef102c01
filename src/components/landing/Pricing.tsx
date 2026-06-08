import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Zap, Crown, Rocket, Gem, Star } from "lucide-react";
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
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const dummyPlans = [
        { id: '1', name: 'Prata', monthly_price: 49, quarterly_price: 132, annual_price: 470, is_active: true, features: ['100 agendamentos', 'Suporte via Chat', 'Dashboard básico'] },
        { id: '2', name: 'Ouro', monthly_price: 99, quarterly_price: 267, annual_price: 950, is_active: true, features: ['Agendamentos ilimitados', 'Até 5 usuários', 'Relatórios Pro', 'WhatsApp integrado'] },
        { id: '3', name: 'Diamante', monthly_price: 199, quarterly_price: 537, annual_price: 1910, is_active: true, features: ['Usuários ilimitados', 'Multifiliais', 'Prioridade total', 'Gestor de conta'] }
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
    return billingPeriod === 'annual' ? plan.annual_price / 12 : plan.monthly_price;
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  return (
    <section id="pricing" className="py-32 bg-slate-50 dark:bg-slate-900/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-sm font-black uppercase tracking-widest text-primary">Preços Justos</h2>
          <h3 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white">Invista no seu <span className="italic underline decoration-primary">crescimento.</span></h3>
          
          <div className="flex items-center justify-center pt-8">
            <div className="flex p-1 bg-slate-200 dark:bg-slate-800 rounded-2xl gap-1">
              <button 
                onClick={() => setBillingPeriod('monthly')}
                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${billingPeriod === 'monthly' ? 'bg-white dark:bg-slate-700 shadow-md text-slate-900 dark:text-white' : 'text-slate-500'}`}
              >
                Mensal
              </button>
              <button 
                onClick={() => setBillingPeriod('annual')}
                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${billingPeriod === 'annual' ? 'bg-white dark:bg-slate-700 shadow-md text-slate-900 dark:text-white' : 'text-slate-500'}`}
              >
                Anual
                <span className="text-[10px] bg-green-500 text-white px-2 py-0.5 rounded-full uppercase tracking-tighter">-20%</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-10 max-w-6xl mx-auto">
          {plans.map((plan, index) => {
            const isPopular = index === 1;
            return (
              <div 
                key={plan.id} 
                className={`relative p-10 rounded-[2.5rem] flex flex-col transition-all duration-500 ${
                  isPopular 
                    ? 'bg-slate-900 text-white scale-105 shadow-2xl z-10' 
                    : 'glass-effect text-slate-900 dark:text-white hover:scale-105'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-primary px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <Star className="w-3 h-3 fill-white" />
                    Mais Escolhido
                  </div>
                )}

                <div className="mb-8">
                  <h4 className="text-xl font-bold mb-4 opacity-70 uppercase tracking-tighter">{plan.name}</h4>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-black">{formatPrice(getPrice(plan))}</span>
                    <span className="opacity-60 text-sm">/mês</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-10 flex-grow">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isPopular ? 'bg-primary' : 'bg-primary/20'}`}>
                        <Check className={`w-3 h-3 ${isPopular ? 'text-white' : 'text-primary'}`} />
                      </div>
                      <span className="text-sm font-medium opacity-90">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button 
                  size="lg"
                  className={`h-14 rounded-2xl font-black text-md transition-all ${
                    isPopular 
                      ? 'btn-primary-gradient border-none' 
                      : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                  }`}
                  onClick={() => navigate(`/signup?plan=${plan.id}`)}
                >
                  Começar Agora
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
