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

        tl.fromTo(
          step,
          {
            x: -150,
            opacity: 0,
            scale: 0.8,
          },
          {
            x: 0,
            opacity: 1,
            scale: 1,
            duration: 1,
            ease: "power2.out",
          },
        );
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

        <div className="grid md:grid-cols-3 gap-16">
          {steps.map((step, index) => (
            <div
              key={index}
              ref={(el) => {
                stepsRef.current[index] = el;
              }}
              className="relative text-left group"
            >
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 w-full left-1/2 h-[2px] bg-gradient-to-r from-primary/50 to-transparent z-0 ml-12" />
              )}
              <div className="w-24 h-24 bg-gradient-primary rounded-3xl flex items-center justify-center mx-auto mb-10 relative z-10 card-glow group-hover:scale-110 transition-transform duration-300">
                <step.icon className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-black mb-4 text-left">{step.title}</h3>
              <p className="text-muted-foreground text-lg leading-relaxed text-left">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
