import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, Star, Zap, Crown, Rocket } from "lucide-react";
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
        { id: '1', name: 'Prata', monthly_price: 49, quarterly_price: 132, annual_price: 470, is_active: true, features: ['100 agendamentos mensais', 'Suporte prioritário via Chat', 'Dashboard analítico básico', 'Lembretes automáticos'] },
        { id: '2', name: 'Ouro', monthly_price: 99, quarterly_price: 267, annual_price: 950, is_active: true, features: ['Agendamentos ilimitados', 'Até 5 usuários simultâneos', 'Relatórios Pro avançados', 'Integração direta com WhatsApp', 'Personalização premium'] },
        { id: '3', name: 'Diamante', monthly_price: 199, quarterly_price: 537, annual_price: 1910, is_active: true, features: ['Usuários e filiais ilimitadas', 'Prioridade total no suporte', 'Gestor de conta exclusivo', 'API de integração total', 'Segurança nível Enterprise'] }
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
    <section id="pricing" className="py-32 bg-[#0B0D12] relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none opacity-10">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-accent/20 blur-[150px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center space-y-6 mb-24">
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Estrutura de Investimento</h2>
          <h3 className="text-4xl md:text-6xl font-black text-white tracking-tight">O preço da <span className="italic text-glow">excelência.</span></h3>
          
          <div className="flex items-center justify-center pt-8">
            <div className="flex p-1 bg-white/5 backdrop-blur-md rounded-full border border-white/10">
              <button 
                onClick={() => setBillingPeriod('monthly')}
                className={`px-8 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all ${billingPeriod === 'monthly' ? 'bg-primary text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                Mensal
              </button>
              <button 
                onClick={() => setBillingPeriod('annual')}
                className={`px-8 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${billingPeriod === 'annual' ? 'bg-primary text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                Anual
                <span className="text-[9px] bg-accent text-[#0B0D12] px-2 py-0.5 rounded-full">-20%</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => {
            const isPopular = index === 1;
            return (
              <div 
                key={plan.id} 
                className={`premium-card p-12 flex flex-col group transition-all duration-500 ${
                  isPopular 
                    ? 'border-primary/40 bg-primary/5 scale-105 shadow-[0_0_50px_rgba(91,140,255,0.1)] z-10' 
                    : 'hover:bg-white/5'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-white flex items-center gap-2 shadow-xl">
                    <Crown className="w-3 h-3 fill-white" />
                    MAIS ESCOLHIDO
                  </div>
                )}

                <div className="mb-10">
                  <h4 className="text-sm font-black mb-6 text-slate-400 uppercase tracking-[0.3em]">{plan.name}</h4>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-black text-white tracking-tighter">{formatPrice(getPrice(plan))}</span>
                    <span className="text-slate-500 text-sm font-bold uppercase tracking-widest">/mês</span>
                  </div>
                </div>

                <ul className="space-y-5 mb-12 flex-grow">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-4 group/item">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${isPopular ? 'bg-primary/20 border-primary/40' : 'bg-white/5 border-white/10'}`}>
                        <Check className={`w-3 h-3 ${isPopular ? 'text-primary' : 'text-slate-400'}`} />
                      </div>
                      <span className="text-sm font-bold text-slate-300 group-hover/item:text-white transition-colors tracking-tight">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button 
                  className={`h-16 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all duration-500 ${
                    isPopular 
                      ? 'bg-primary text-white hover:shadow-[0_0_30px_rgba(91,140,255,0.4)]' 
                      : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
                  }`}
                  onClick={() => navigate(`/signup?plan=${plan.id}`)}
                >
                  Selecionar Plano
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
