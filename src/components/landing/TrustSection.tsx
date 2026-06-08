import { Star, Quote, Zap, Shield, Globe, Users, Award } from "lucide-react";
import { motion } from "framer-motion";


const stats = [
  { label: "Membros da Elite", value: "2.4k+", icon: Users },
  { label: "Agendamentos/mês", value: "150k+", icon: Zap },
  { label: "Uptime Garantido", value: "99.9%", icon: Shield },
  { label: "Países Alcançados", value: "42+", icon: Globe },
];

const testimonials = [
  {
    name: "Ricardo Mendes",
    role: "Proprietário de Clínica",
    content: "A plataforma elevou o patamar da minha marca. O design e a fluidez transmitem a autoridade que nossos clientes esperam hoje.",
    avatar: "https://i.pravatar.cc/150?u=ricardo"
  },
  {
    name: "Juliana Costa",
    role: "Gestora de Spa de Luxo",
    content: "Finalmente um software que não parece genérico. É rápido, tecnológico e extremamente elegante.",
    avatar: "https://i.pravatar.cc/150?u=juliana"
  }
];

export function TrustSection() {
  return (
    <section className="section-padding bg-[#0B0D12] relative overflow-hidden">
      {/* Structural Atmospheric Glow */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-primary/5 blur-[160px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-32 items-center">
          <div className="space-y-20">
            <div className="space-y-10">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="text-[10px] font-black uppercase tracking-[0.5em] text-primary"
              >
                Trust Engineering
              </motion.div>
              <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-5xl md:text-8xl font-black text-white leading-[0.85] tracking-tighter"
              >
                BUILT FOR <br />
                <span className="text-highlight">MARKET LEADERS.</span>
              </motion.h2>
              <p className="text-xl text-slate-400 font-medium leading-relaxed max-w-lg">
                Our architecture was engineered to support high-velocity operations with zero latency, maintaining cinematic precision in every interaction.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-16">
              {stats.map((stat, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="group cursor-default"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <stat.icon className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
                    <span className="text-5xl font-black text-white tracking-tighter">{stat.value}</span>
                  </div>
                  <div className="text-[10px] uppercase font-black tracking-[0.4em] text-slate-500">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="relative space-y-10">
            {testimonials.map((t, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                className="premium-glass p-12 group hover:border-primary/30 transition-all duration-700 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Award className="w-24 h-24 text-white" />
                </div>
                
                <div className="flex gap-1 mb-8">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-primary text-primary" />)}
                </div>
                
                <p className="text-2xl text-slate-300 italic font-bold leading-relaxed mb-12 group-hover:text-white transition-colors">
                  "{t.content}"
                </p>
                
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <img src={t.avatar} alt={t.name} className="w-16 h-16 rounded-2xl grayscale group-hover:grayscale-0 transition-all duration-700 border-2 border-white/10" />
                    <div className="absolute -bottom-2 -right-2 w-7 h-7 bg-primary rounded-xl border-4 border-[#0B0D12] flex items-center justify-center">
                      <Shield className="w-3 h-3 text-white" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xl font-black text-white tracking-tight">{t.name}</div>
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

