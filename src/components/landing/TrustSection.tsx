import { Star, Quote, Zap, Shield, Globe, Users } from "lucide-react";

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
    <section className="py-40 bg-[#0B0D12] relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-primary/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-24 items-center">
          <div className="space-y-16">
            <div className="space-y-8">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Engenharia de Confiança</span>
              <h2 className="text-5xl md:text-7xl font-black text-white leading-[0.9] tracking-tighter">
                CONSTRUÍDO PARA <br />
                <span className="italic text-glow">LÍDERES DE MERCADO.</span>
              </h2>
              <p className="text-xl text-slate-400 font-bold leading-relaxed max-w-lg">
                Nossa infraestrutura foi desenhada para suportar operações de alta escala com zero latência, mantendo a sofisticação visual em cada pixel.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-12">
              {stats.map((stat, i) => (
                <div key={i} className="group cursor-default">
                  <div className="flex items-center gap-3 mb-2">
                    <stat.icon className="w-5 h-5 text-primary opacity-50 group-hover:opacity-100 transition-opacity" />
                    <span className="text-4xl font-black text-white tracking-tighter group-hover:text-glow transition-all">{stat.value}</span>
                  </div>
                  <div className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-500">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative space-y-8">
            {testimonials.map((t, i) => (
              <div 
                key={i} 
                className="premium-card p-10 bg-white/[0.02] border-white/5 backdrop-blur-md group hover:bg-white/[0.04] transition-all duration-700"
              >
                <div className="flex gap-1 mb-6">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-primary text-primary" />)}
                </div>
                
                <p className="text-xl text-slate-300 italic font-bold leading-relaxed mb-10 group-hover:text-white transition-colors">
                  "{t.content}"
                </p>
                
                <div className="flex items-center gap-5">
                  <div className="relative">
                    <img src={t.avatar} alt={t.name} className="w-14 h-14 rounded-full grayscale group-hover:grayscale-0 transition-all duration-500 border-2 border-white/10" />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full border-2 border-[#0B0D12] flex items-center justify-center">
                      <Shield className="w-2.5 h-2.5 text-white" />
                    </div>
                  </div>
                  <div>
                    <div className="text-lg font-black text-white tracking-tight">{t.name}</div>
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}

            {/* Floating Visual Decor */}
            <div className="absolute -right-20 top-1/2 -translate-y-1/2 w-1 bg-gradient-to-b from-transparent via-primary/20 to-transparent h-2/3 hidden xl:block" />
          </div>
        </div>
      </div>
    </section>
  );
}
