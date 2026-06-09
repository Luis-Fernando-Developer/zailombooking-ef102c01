import { useEffect, useRef } from "react";
import { ClipboardCheck, Link as LinkIcon, Sparkles } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const steps = [
  {
    icon: ClipboardCheck,
    title: "1. Organize sua Casa",
    description: "Em menos de 5 minutos, você adiciona seus serviços, define seus horários e a sua equipe.",
  },
  {
    icon: LinkIcon,
    title: "2. Espalhe seu Link",
    description: "Coloque seu link exclusivo na Bio do Instagram, no botão do WhatsApp e no Google Meu Negócio.",
  },
  {
    icon: Sparkles,
    title: "3. Fature no Automático",
    description: "Relaxe. O Zailom Booking organiza tudo, envia os lembretes e você foca apenas em atender bem.",
  },
];

export function Steps() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 60%",
          end: "bottom 80%",
          scrub: 1,
        },
      });

      stepsRef.current.forEach((step, index) => {
        if (!step) return;

        // Animate the step content
        tl.fromTo(
          step,
          {
            y: 30,
            opacity: 0,
          },
          {
            y: 0,
            opacity: 1,
            duration: 0.8,
            ease: "power2.out",
          }
        );

        // Animate the connecting lines
        const lines = step.querySelectorAll(".step-line, .step-line-prev");
        lines.forEach((line) => {
          tl.to(
            line,
            { scaleX: 1, duration: 0.5, ease: "none" },
            "-=0.4"
          );
        });
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="py-24 bg-primary/5 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-20">
          <h2 className="text-4xl lg:text-6xl font-black mb-6">
            O caminho para a <span className="text-gradient">liberdade</span>
          </h2>
          <p className="text-muted-foreground text-xl max-w-2xl mx-auto leading-relaxed">
            Profissionalize sua gestão em 3 passos simples. Sem complicação, sem planilhas, sem estresse.
          </p>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start gap-12 md:gap-0 relative">
          {steps.map((step, index) => (
            <div
              key={index}
              ref={(el) => {
                stepsRef.current[index] = el;
              }}
              className={`relative flex flex-col group ${index === 1 ? 'flex-1' : ''}`}
            >
              <div className="flex items-center w-full mb-10 relative">
                {/* Linha que vem da esquerda (para o card 2 e 3) */}
                {index > 0 && (
                  <div className="hidden md:block flex-1 h-[2px] bg-primary/30 mr-4 relative overflow-hidden">
                    <div className="step-line-prev absolute inset-0 bg-primary origin-left scale-x-0" />
                  </div>
                )}

                <div className="w-24 h-24 bg-gradient-primary rounded-3xl flex items-center justify-center relative z-10 card-glow group-hover:scale-110 transition-transform duration-300 flex-shrink-0">
                  <step.icon className="w-10 h-10 text-white" />
                </div>
                
                {/* Linha que vai para a direita (para o card 1 e 2) */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block flex-1 h-[2px] bg-primary/30 ml-4 relative overflow-hidden">
                    <div className="step-line absolute inset-0 bg-primary origin-left scale-x-0" />
                  </div>
                )}
              </div>

              <div className={`relative z-10 ${index === 1 ? 'text-center' : index === 2 ? 'text-right' : ''}`}>
                <h3 className="text-2xl font-black mb-4">{step.title}</h3>
                <p className="text-muted-foreground text-lg leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
