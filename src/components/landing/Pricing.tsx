import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, Star, Zap, Crown, Rocket } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { motion } from "framer-motion";


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
    <section id="pricing" className="section-padding bg-[#0B0D12] relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 z-0 opacity-10">
        <div className="absolute top-[20%] left-[-10%] w-[600px] h-[600px] bg-primary/20 blur-[180px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center space-y-8 mb-32">
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-[10px] font-black uppercase tracking-[0.5em] text-primary"
          >
            Investment Architecture
          </motion.div>
          <motion.h3 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-8xl font-black text-white tracking-tighter leading-[0.85]"
          >
            THE PRICE OF <br />
            <span className="text-highlight">ABSOLUTE POWER.</span>
          </motion.h3>
          
          <div className="flex items-center justify-center pt-12">
            <div className="flex p-2 bg-white/5 backdrop-blur-xl rounded-full border border-white/10">
              <button 
                onClick={() => setBillingPeriod('monthly')}
                className={`px-10 py-3 rounded-full text-xs font-black uppercase tracking-widest transition-all ${billingPeriod === 'monthly' ? 'bg-primary text-white shadow-xl' : 'text-slate-500 hover:text-white'}`}
              >
                Monthly
              </button>
              <button 
                onClick={() => setBillingPeriod('annual')}
                className={`px-10 py-3 rounded-full text-xs font-black uppercase tracking-widest transition-all flex items-center gap-3 ${billingPeriod === 'annual' ? 'bg-primary text-white shadow-xl' : 'text-slate-500 hover:text-white'}`}
              >
                Annual
                <span className="text-[9px] bg-accent text-black px-2 py-0.5 rounded-full">-20%</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-10 max-w-6xl mx-auto">
          {plans.map((plan, index) => {
            const isPopular = index === 1;
            return (
              <motion.div 
                key={plan.id} 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`premium-glass p-16 flex flex-col group transition-all duration-700 relative ${
                  isPopular 
                    ? 'border-primary/40 bg-primary/5 scale-105 z-10 shadow-[0_40px_100px_rgba(0,0,0,0.5)]' 
                    : 'hover:bg-white/5'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-primary px-8 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-white flex items-center gap-2 shadow-2xl">
                    <Crown className="w-3 h-3 fill-white" />
                    Market Choice
                  </div>
                )}

                <div className="mb-12">
                  <h4 className="text-xs font-black mb-8 text-slate-500 uppercase tracking-[0.4em]">{plan.name}</h4>
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-black text-white tracking-tighter">{formatPrice(getPrice(plan))}</span>
                    <span className="text-slate-500 text-sm font-black uppercase tracking-widest">/mo</span>
                  </div>
                </div>

                <ul className="space-y-6 mb-16 flex-grow">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${isPopular ? 'bg-primary/20 border-primary/40' : 'bg-white/5 border-white/10'}`}>
                        <Check className={`w-3.5 h-3.5 ${isPopular ? 'text-primary' : 'text-slate-500'}`} />
                      </div>
                      <span className="text-sm font-bold text-slate-400 group-hover:text-white transition-colors">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button 
                  className={`h-16 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all duration-500 ${
                    isPopular 
                      ? 'bg-primary text-white hover:shadow-[0_0_40px_rgba(91,140,255,0.4)]' 
                      : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
                  }`}
                  onClick={() => navigate(`/signup?plan=${plan.id}`)}
                >
                  Select Plan
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>

  );
}
