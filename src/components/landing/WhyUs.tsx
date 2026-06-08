import { MessageSquareOff, Clock, TrendingUp, UserCheck } from "lucide-react";

export function WhyUs() {
  const points = [
    {
      icon: MessageSquareOff,
      title: "Chega de 'Oi, tem horário?'",
      description: "Economize até 10 horas semanais eliminando o atendimento manual e as interrupções constantes no seu celular.",
      gradient: "from-red-600 to-red-400"
    },
    {
      icon: Clock,
      title: "Sua Agenda não dorme",
      description: "Dê a liberdade para seu cliente agendar às 2 da manhã enquanto você dorme ou atende outro cliente.",
      gradient: "from-purple-600 to-pink-500"
    },
    {
      icon: UserCheck,
      title: "Elimine os 'Esquecidinhos'",
      description: "Nossos lembretes automáticos no WhatsApp reduzem em até 80% o índice de faltas (no-shows) no seu negócio.",
      gradient: "from-emerald-600 to-green-500"
    },
    {
      icon: TrendingUp,
      title: "Mais Profissionalismo",
      description: "Passe a imagem de uma empresa de elite com uma página de agendamentos que carrega a sua própria marca.",
      gradient: "from-blue-600 to-cyan-500"
    }
  ];

  return (
    <section className="py-24 bg-gradient-to-b from-transparent to-primary/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="text-primary font-bold tracking-widest uppercase text-sm mb-4 block">O problema é real</span>
            <h2 className="text-4xl lg:text-6xl font-black mb-8 leading-tight">
              Você trabalha para crescer ou para ser <span className="text-gradient">secretária</span> do celular?
            </h2>
            <p className="text-xl text-muted-foreground mb-10 leading-relaxed">
              Cada minuto que você passa respondendo WhatsApp é um minuto a menos que você passa atendendo ou buscando novos clientes. O caos da agenda manual está travando o seu lucro.
            </p>
            <div className="space-y-8">
              {points.map((point, index) => (
                <div key={index} className="flex gap-5 group">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${point.gradient} flex items-center justify-center shrink-0 shadow-lg group-hover:scale-110 transition-transform`}>
                    <point.icon className="text-white w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black mb-1">{point.title}</h4>
                    <p className="text-muted-foreground leading-relaxed">{point.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="card-glow rounded-3xl overflow-hidden border border-primary/20 shadow-2xl">
              <img 
                src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800" 
                alt="Impacto no Negócio" 
                className="w-full h-full object-cover grayscale-[0.3] hover:grayscale-0 transition-all duration-500"
              />
            </div>
            <div className="absolute -bottom-8 -right-8 bg-card p-8 rounded-2xl shadow-2xl border border-primary/20 animate-float backdrop-blur-xl">
              <p className="text-sm font-bold text-primary mb-1">Aumento de Faturamento</p>
              <p className="text-4xl font-black text-white">+35%</p>
              <p className="text-xs text-muted-foreground mt-2">Média após 3 meses de uso</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}