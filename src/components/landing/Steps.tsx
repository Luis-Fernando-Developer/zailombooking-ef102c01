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
            x: -50,
            opacity: 0,
            scale: 0.9,
          },
          {
            x: 0,
            opacity: 1,
            scale: 1,
            duration: 1,
            ease: "power2.out",
          },
        );

        // Animate the connecting line if it exists
        const line = step.querySelector(".step-line");
        if (line) {
          tl.fromTo(
            line,
            { scaleX: 0, transformOrigin: "left center" },
            { scaleX: 1, duration: 0.5, ease: "none" },
            ">-=0.2", // Start slightly before step finishes
          );
        }
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

        <div className="flex flex-col md:flex-row justify-between items-start md:items-stretch gap-16 relative">
          {steps.map((step, index) => (
            <div
              key={index}
              ref={(el) => {
                stepsRef.current[index] = el;
              }}
              className={`relative flex flex-col flex-1 group  ${
                index === 0 ? "items-start" : index === 1 ? "items-center text-center" : "items-end text-right"
              }`}
            >
              {index < steps.length - 1 && (
                <div
                  className="hidden md:block absolute top-12 h-[10px] w-full bg-primary/30 z-0 step-line border p-2"
                  style={{
                    left: index === 1 ? "6rem border-white" : "w-100% border-white",
                    right: index === 1 ? "calc(-120%)" : " ",
                  }}
                />
              )}
              <div className="w-24 h-24 bg-gradient-primary rounded-3xl flex items-center justify-center mb-10 relative z-10 card-glow group-hover:scale-110 transition-transform duration-300">
                <step.icon className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-black mb-4 w-full">{step.title}</h3>
              <p className="text-muted-foreground text-lg leading-relaxed w-full">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
