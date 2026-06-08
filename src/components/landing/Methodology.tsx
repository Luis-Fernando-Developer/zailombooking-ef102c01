import { Play, CheckCircle2, Star, ShieldCheck, Zap, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

export function Methodology() {
  const steps = [
    {
      number: "01",
      title: "Análise Preditiva",
      description: "Identificamos padrões de comportamento para antecipar a necessidade do seu cliente."
    },
    {
      number: "02",
      title: "Otimização Visual",
      description: "Interface dinâmica que se adapta para reduzir fricção e aumentar o desejo de compra."
    },
    {
      number: "03",
      title: "Escala Exponencial",
      description: "Automação total que libera seu tempo para focar no que realmente importa: crescer."
    }
  ];

  return (
    <section className="py-40 bg-[#0B0D12] relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-primary/10 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-24">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Nossa Metodologia</span>
          <h2 className="text-5xl md:text-7xl font-black text-white tracking-tighter mt-4">
            O CAMINHO PARA O <br />
            <span className="italic text-glow">DOMÍNIO DO MERCADO.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-12">
          {steps.map((step, i) => (
            <div key={i} className="relative group parallax-step">
              <div className="text-[8rem] font-black text-white/5 absolute -top-20 -left-4 pointer-events-none group-hover:text-primary/10 transition-colors duration-500">
                {step.number}
              </div>
              <div className="relative z-10 space-y-4 pt-12">
                <h3 className="text-2xl font-black text-white tracking-tight">{step.title}</h3>
                <p className="text-slate-400 text-lg leading-relaxed">
                  {step.description}
                </p>
                <div className="w-12 h-1 bg-primary/30 group-hover:w-full transition-all duration-700" />
              </div>
            </div>
          ))}
        </div>

        {/* Video Placeholder Section */}
        <div className="mt-32 relative group cursor-pointer">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
          <div className="relative aspect-video rounded-[3rem] overflow-hidden border border-white/10 glass-morphism">
            <img 
              src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=2072" 
              alt="Metodologia em ação" 
              className="w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-1000"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center shadow-[0_0_50px_rgba(91,140,255,0.5)] group-hover:scale-110 transition-transform duration-500">
                <Play className="w-8 h-8 text-white fill-white ml-1" />
              </div>
            </div>
            <div className="absolute bottom-10 left-10 flex items-center gap-4">
              <div className="flex -space-x-2">
                {[1, 2, 3].map((i) => (
                  <img key={i} src={`https://i.pravatar.cc/100?img=${i+20}`} className="w-10 h-10 rounded-full border-2 border-[#0B0D12]" />
                ))}
              </div>
              <div className="text-white text-xs font-bold uppercase tracking-widest">
                Assista como <span className="text-primary">lideramos</span> a revolução
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
