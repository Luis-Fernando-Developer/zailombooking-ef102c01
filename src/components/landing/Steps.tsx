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

      const lines = containerRef.current?.querySelectorAll(".step-line");
      const stepsElements = stepsRef.current;

      // Animate Step 1
      tl.fromTo(stepsElements[0], { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 });
      
      // Animate Line 1
      if (lines?.[0]) {
        tl.to(lines[0], { scaleX: 1, duration: 0.8, ease: "none" });
      }

      // Animate Step 2
      tl.fromTo(stepsElements[1], { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 });

      // Animate Line 2
      if (lines?.[1]) {
        tl.to(lines[1], { scaleX: 1, duration: 0.8, ease: "none" });
      }

      // Animate Step 3
      tl.fromTo(stepsElements[2], { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 });
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

        <div className="relative">
          {/* Linhas de conexão dinâmicas baseadas nos ícones */}
          <div className="hidden md:block absolute top-12 left-0 w-full h-[2px] z-0">
            <div className="max-w-7xl mx-auto flex justify-between items-center h-full">
              {/* Linha 1: Entre ícone 1 e 2 */}
              <div className="flex-1 px-0 relative overflow-hidden h-full">
                <div className="bg-primary/30 w-full h-full relative overflow-hidden">
                  <div className="step-line absolute inset-0 bg-primary origin-left scale-x-0" />
                </div>
              </div>
              {/* Espaço para o ícone central diminuído para a linha avançar mais */}
              <div className="w-12 flex-shrink-0" />
              {/* Linha 2: Entre ícone 2 e 3 */}
              <div className="flex-1 px-0 relative overflow-hidden h-full">
                <div className="bg-primary/30 w-full h-full relative overflow-hidden">
                  <div className="step-line absolute inset-0 bg-primary origin-left scale-x-0" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start gap-12 md:gap-0 relative">
            {steps.map((step, index) => (
              <div
                key={index}
                ref={(el) => {
                  stepsRef.current[index] = el;
                }}
                className={`flex flex-col md:w-1/3 group relative z-10 ${
                  index === 0
                    ? "items-start text-left"
                    : index === 1
                      ? "items-center text-center"
                      : "items-end text-right"
                }`}
              >
                <div className="w-24 h-24 bg-gradient-primary rounded-3xl flex items-center justify-center mb-10 card-glow group-hover:scale-110 transition-transform duration-300 flex-shrink-0 relative z-20">
                  <step.icon className="w-10 h-10 text-white" />
                </div>

                <div className="max-w-[290px]">
                  <h3 className="text-2xl font-black mb-4">{step.title}</h3>
                  <p className="text-muted-foreground text-lg leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
