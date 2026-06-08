import { Zap, Cpu, Sparkles, Layout, BarChart3, Users, Rocket, Target, Heart } from "lucide-react";
import { useEffect, useRef } from "react";

export function Features() {
  const features = [
    {
      title: "Agendamento Inteligente",
      description: "Nossa IA analisa o comportamento do cliente em tempo real, prevê horários de pico e fecha a agenda antes mesmo de você abrir o aplicativo.",
      icon: Cpu,
      color: "from-blue-600/30 to-cyan-400/30",
      iconColor: "text-blue-400"
    },
    {
      title: "Design de Próxima Geração",
      description: "Esqueça interfaces travadas. Criamos uma experiência sensorial onde cada clique é satisfatório e cada transição é cinematográfica.",
      icon: Layout,
      color: "from-purple-600/30 to-pink-400/30",
      iconColor: "text-purple-400"
    },
    {
      title: "Analytics Cinematográfico",
      description: "Dados não mentem. Tenha uma visão de raio-x do seu faturamento, retenção e taxas de conversão com gráficos dignos de Wall Street.",
      icon: BarChart3,
      color: "from-emerald-600/30 to-teal-400/30",
      iconColor: "text-emerald-400"
    },
    {
      title: "Gestão de Elite",
      description: "Ferramentas robustas para times que não abrem mão da performance.",
      icon: Users,
      color: "from-orange-500/20 to-red-500/20",
      iconColor: "text-orange-400"
    },
    {
      title: "Performance Extrema",
      description: "Carregamento instantâneo e resposta em milissegundos para não perder nenhuma venda.",
      icon: Zap,
      color: "from-indigo-500/20 to-blue-500/20",
      iconColor: "text-indigo-400"
    },
    {
      title: "Automações Mágicas",
      description: "Elimine o trabalho manual com fluxos que funcionam sozinhos 24/7, permitindo que você foque na estratégia do seu negócio.",
      icon: Sparkles,
      color: "from-amber-500/20 to-yellow-500/20",
      iconColor: "text-amber-400"
    },
    {
      title: "Crescimento Acelerado",
      description: "Ferramentas desenhadas para escalar sua receita de forma previsível e constante.",
      icon: Rocket,
      color: "from-red-500/20 to-orange-500/20",
      iconColor: "text-red-400"
    },
    {
      title: "Fidelização Extrema",
      description: "Encante seus clientes com uma experiência de agendamento tão fluida que eles se tornarão fãs da sua marca.",
      icon: Heart,
      color: "from-rose-500/20 to-pink-500/20",
      iconColor: "text-rose-400"
    }
  ];

  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) return;
      const scrolled = window.scrollY;
      const offset = sectionRef.current.offsetTop;
      const distance = scrolled - offset;
      
      const elements = sectionRef.current.querySelectorAll('.parallax-feature');
      elements.forEach((el: any, i) => {
        const speed = 0.05 + (i * 0.02);
        el.style.transform = `translateY(${distance * speed}px)`;
      });
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section ref={sectionRef} className="py-40 bg-[#0B0D12] relative overflow-visible z-20">
      {/* Background Decor */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none opacity-20">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/5 blur-[150px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-32 space-y-6">
          <h2 className="text-sm font-black uppercase tracking-[0.5em] text-primary drop-shadow-[0_0_10px_rgba(91,140,255,0.5)]">Funcionalidades de Elite</h2>
          <h3 className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-[0.9]">Tudo o que você precisa <br /><span className="italic text-glow bg-gradient-to-r from-primary via-accent to-white bg-clip-text text-transparent">para crescer.</span></h3>
          <p className="text-slate-400 max-w-3xl mx-auto text-xl font-medium leading-tight">
            Nossa plataforma foi construída ouvindo as necessidades reais de quem gerencia agendamentos todos os dias.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="premium-card p-10 group hover:-translate-y-2 transition-all duration-500 parallax-feature"
            >
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.color} border border-white/5 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500`}>
                <feature.icon className={`w-8 h-8 ${feature.iconColor}`} />
              </div>
              <h4 className="text-2xl font-bold text-white mb-4 tracking-tight">{feature.title}</h4>
              <p className="text-slate-400 leading-relaxed text-lg">
                {feature.description}
              </p>
              
              {/* Card Footer Detail */}
              <div className="mt-8 pt-8 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <span className="text-primary font-bold text-sm uppercase tracking-widest cursor-pointer hover:underline flex items-center gap-2">
                  Explorar mais <Zap className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
