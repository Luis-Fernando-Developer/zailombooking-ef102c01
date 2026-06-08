import { Button } from "@/components/ui/button";
import { MessageSquare, CalendarCheck, TrendingUp, ShieldCheck } from "lucide-react";

export function WhyUs() {
  const points = [
    {
      icon: MessageSquare,
      title: "Chatbot Inteligente",
      description: "Integração nativa com TalkMap para agendamentos via conversa fluida. Atendimento 24/7 sem intervenção humana.",
      gradient: "from-blue-500 to-cyan-500"
    },
    {
      icon: CalendarCheck,
      title: "Regras Flexíveis",
      description: "Bloqueios, ausências, tempo de intervalo e limites de agendamento. Você manda no seu tempo, o sistema obedece.",
      gradient: "from-purple-500 to-pink-500"
    },
    {
      icon: TrendingUp,
      title: "Escalabilidade Real",
      description: "De 1 a 100 profissionais. Gerencie equipes, comissões e múltiplos estabelecimentos em um único painel.",
      gradient: "from-orange-500 to-red-500"
    },
    {
      icon: ShieldCheck,
      title: "Segurança de Dados",
      description: "Infraestrutura robusta com backup diário. Suas informações e as de seus clientes estão sempre protegidas.",
      gradient: "from-green-500 to-emerald-500"
    }
  ];

  return (
    <section className="py-24 bg-gradient-to-b from-transparent to-primary/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl lg:text-5xl font-bold mb-8 leading-tight">
              Por que o <span className="text-gradient">Zylo Booking</span> é a sua melhor escolha?
            </h2>
            <p className="text-xl text-muted-foreground mb-10 leading-relaxed">
              Diferente de sistemas genéricos que apenas listam horários, nós focamos na sua <strong>conversão</strong> e <strong>retenção de clientes</strong>.
            </p>
            <div className="space-y-6">
              {points.map((point, index) => (
                <div key={index} className="flex gap-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${point.gradient} flex items-center justify-center shrink-0 shadow-lg`}>
                    <point.icon className="text-white w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-1">{point.title}</h4>
                    <p className="text-muted-foreground">{point.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="card-glow rounded-3xl overflow-hidden border border-primary/20 shadow-2xl rotate-2 hover:rotate-0 transition-transform duration-500">
              <img 
                src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800" 
                alt="Analytics Dashboard" 
                className="w-full h-full object-cover grayscale-[0.2]"
              />
            </div>
            <div className="absolute -bottom-8 -left-8 bg-card p-6 rounded-2xl shadow-2xl border border-primary/20 animate-float">
              <p className="text-sm font-bold text-primary mb-1">Crescimento Mensal</p>
              <p className="text-3xl font-black">+142%</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
