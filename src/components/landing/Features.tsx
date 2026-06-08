import { Zap, Cpu, Sparkles, Layout, BarChart3, Users } from "lucide-react";

export function Features() {
  const features = [
    {
      title: "Agendamento Inteligente",
      description: "Nossa IA aprende o ritmo do seu negócio e otimiza sua agenda automaticamente, garantindo que você nunca perca uma oportunidade.",
      icon: Cpu,
      color: "from-blue-500/20 to-cyan-500/20",
      iconColor: "text-blue-400"
    },
    {
      title: "Design de Próxima Geração",
      description: "Uma interface tão fluida que seus clientes vão adorar agendar com você.",
      icon: Layout,
      color: "from-purple-500/20 to-pink-500/20",
      iconColor: "text-purple-400"
    },
    {
      title: "Analytics Cinematográfico",
      description: "Visualize o crescimento da sua marca com dashboards que parecem de outro mundo.",
      icon: BarChart3,
      color: "from-emerald-500/20 to-teal-500/20",
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
      description: "Elimine o trabalho manual com fluxos que funcionam sozinhos 24/7.",
      icon: Sparkles,
      color: "from-amber-500/20 to-yellow-500/20",
      iconColor: "text-amber-400"
    }
  ];

  return (
    <section className="py-32 bg-[#0B0D12] relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none opacity-20">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/10 blur-[150px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-24 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-primary">Arquitetura de Valor</h2>
          <h3 className="text-4xl md:text-6xl font-black text-white tracking-tight">O que nos torna <span className="italic">inevitáveis.</span></h3>
          <p className="text-slate-400 max-w-2xl mx-auto text-lg">
            Combinamos o poder da tecnologia moderna com a sofisticação do design de luxo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="premium-card p-10 group hover:-translate-y-2 transition-all duration-500"
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
