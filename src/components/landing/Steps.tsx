import { ClipboardCheck, Link as LinkIcon, Sparkles } from "lucide-react";

const steps = [
  {
    icon: ClipboardCheck,
    title: "1. Organize sua Casa",
    description: "Em menos de 5 minutos, você adiciona seus serviços, define seus horários e a sua equipe."
  },
  {
    icon: LinkIcon,
    title: "2. Espalhe seu Link",
    description: "Coloque seu link exclusivo na Bio do Instagram, no botão do WhatsApp e no Google Meu Negócio."
  },
  {
    icon: Sparkles,
    title: "3. Fature no Automático",
    description: "Relaxe. O Zailom Booking organiza tudo, envia os lembretes e você foca apenas em atender bem."
  }
];

export function Steps() {
  return (
    <section className="py-24 bg-primary/5 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-20">
          <h2 className="text-4xl lg:text-6xl font-black mb-6">
            O caminho para a <span className="text-gradient">liberdade</span>
          </h2>
          <p className="text-muted-foreground text-xl max-w-2xl mx-auto leading-relaxed">
            Profissionalize sua gestão em 3 passos simples. Sem complicação, sem planilhas, sem estresse.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-16">
          {steps.map((step, index) => (
            <div key={index} className="relative text-center group">
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-1/2 w-full h-[2px] bg-gradient-to-r from-primary/50 to-transparent z-0 ml-12" />
              )}
              <div className="w-24 h-24 bg-gradient-primary rounded-3xl flex items-center justify-center mx-auto mb-10 relative z-10 card-glow group-hover:scale-110 transition-transform duration-300">
                <step.icon className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-black mb-4">{step.title}</h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}