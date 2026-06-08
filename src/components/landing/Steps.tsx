import { ClipboardCheck, Link, Sparkles } from "lucide-react";

const steps = [
  {
    icon: ClipboardCheck,
    title: "1. Configure seu Perfil",
    description: "Adicione seus serviços, horários e equipe em poucos cliques. É simples e rápido."
  },
  {
    icon: Link,
    title: "2. Divulgue seu Link",
    description: "Coloque seu link personalizado na bio do Instagram e WhatsApp. Seus clientes vão te encontrar."
  },
  {
    icon: Sparkles,
    title: "3. Receba Agendamentos",
    description: "Relaxe enquanto o sistema organiza sua agenda e envia lembretes automáticos para você."
  }
];

export function Steps() {
  return (
    <section className="py-24 bg-primary/5 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-5xl font-bold mb-4">
            Como funciona o <span className="text-gradient">seu sucesso</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Três passos simples para transformar a gestão do seu negócio.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-12">
          {steps.map((step, index) => (
            <div key={index} className="relative text-center group">
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-1/2 w-full h-[2px] bg-gradient-to-r from-primary/50 to-transparent z-0 ml-10" />
              )}
              <div className="w-24 h-24 bg-gradient-primary rounded-3xl flex items-center justify-center mx-auto mb-8 relative z-10 card-glow group-hover:scale-110 transition-transform duration-300">
                <step.icon className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-4">{step.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
