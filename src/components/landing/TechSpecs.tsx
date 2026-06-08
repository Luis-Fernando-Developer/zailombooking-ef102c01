import { Cpu, Zap, Shield, Globe, Layers, MousePointerClick, Database, Lock, Terminal } from "lucide-react";
import { useEffect, useRef } from "react";

export function TechSpecs() {
  const specs = [
    {
      title: "Latência Zero",
      value: "< 50ms",
      description: "Infraestrutura global distribuída para resposta instantânea em qualquer lugar do mundo.",
      icon: Zap
    },
    {
      title: "Segurança Quântica",
      value: "AES-256",
      description: "Proteção de dados nível militar com criptografia de ponta a ponta e auditorias constantes.",
      icon: Shield
    },
    {
      title: "Escalabilidade Infinita",
      value: "Auto-Scale",
      description: "Nossa arquitetura se adapta ao seu crescimento sem nunca comprometer a performance.",
      icon: Layers
    },
    {
      title: "Conectividade Total",
      value: "API-First",
      description: "Integração nativa com suas ferramentas favoritas via Webhooks e API REST robusta.",
      icon: Globe
    }
  ];

  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) return;
      const scrolled = window.scrollY;
      const offset = sectionRef.current.offsetTop;
      const distance = scrolled - offset;
      
      const element = sectionRef.current.querySelector('.parallax-specs');
      if (element) {
        (element as any).style.transform = `translateY(${distance * 0.05}px)`;
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section ref={sectionRef} className="py-48 bg-[#0B0D12] relative overflow-visible z-40">
      {/* Decorative Lines */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-primary to-transparent" />
        <div className="absolute top-0 left-3/4 w-px h-full bg-gradient-to-b from-transparent via-accent to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.4em] mb-8">
              <Cpu className="w-3 h-3" /> Especificações Técnicas
            </div>
            <h2 className="text-5xl md:text-7xl font-black text-white leading-[0.9] tracking-tighter mb-8">
              A CIÊNCIA POR TRÁS DA <br />
              <span className="italic text-glow bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">ALTA PERFORMANCE.</span>
            </h2>
            <p className="text-xl text-slate-400 font-bold leading-relaxed max-w-xl mb-12">
              Não é apenas software. É uma obra-prima de engenharia focada em converter cada segundo em oportunidade de negócio.
            </p>
            
            <div className="space-y-6">
              <div className="premium-card p-6 flex items-start gap-4 border-primary/20 bg-primary/5">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                  <MousePointerClick className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-white font-black uppercase tracking-widest text-sm mb-1">Taxa de Conversão Absoluta</h4>
                  <p className="text-slate-400 text-sm leading-relaxed">Nossos algoritmos são treinados para identificar o momento exato da decisão de compra.</p>
                </div>
              </div>
              <div className="premium-card p-6 flex items-start gap-4 border-white/5 hover:border-primary/30 transition-all">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white flex-shrink-0">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-white font-black uppercase tracking-widest text-sm mb-1">Backup em Tempo Real</h4>
                  <p className="text-slate-400 text-sm leading-relaxed">Seus dados são replicados em 3 continentes instantaneamente para segurança total.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 parallax-specs">
            {specs.map((spec, i) => (
              <div key={i} className="premium-card p-8 group hover:-translate-y-2 transition-all duration-500">
                <spec.icon className="w-8 h-8 text-primary mb-6 opacity-50 group-hover:opacity-100 transition-opacity" />
                <div className="text-3xl font-black text-white tracking-tighter mb-2">{spec.value}</div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-primary mb-4">{spec.title}</div>
                <p className="text-slate-500 text-sm leading-relaxed group-hover:text-slate-300 transition-colors">
                  {spec.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
