import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { BookingLogo } from "@/components/BookingLogo";
import { LaptopMockup } from "@/components/landing/LaptopMockup";
import heroDashboard from "@/assets/hero-dashboard-v2.png.asset.json";

export function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden py-20">
      <div className="absolute inset-0 bg-gradient-hero"></div>

      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse-glow"></div>
        <div className="absolute bottom-20 right-10 w-[500px] h-[500px] bg-neon-pink/10 rounded-full blur-3xl animate-float"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <div className="mb-8 flex justify-center lg:justify-start">
            <BookingLogo showText={false} />
          </div>
          <h1 className="text-5xl lg:text-7xl font-black mb-0 tracking-tighter leading-[1.05] text-center lg:text-left">
            <span className="text-white block">Recupere seu tempo e coloque sua</span>
          </h1>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div className="text-center lg:text-left">
            <h2 className="text-5xl lg:text-7xl font-black mb-6 tracking-tighter leading-[1.05]">
              <span className="text-gradient">agenda no piloto automático 24/7.</span>
            </h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-xl leading-relaxed">
              O Zailom Booking automatiza sua agenda 24h por dia. Seus clientes marcam horários em segundos através de um link exclusivo da sua marca, enquanto você foca no que realmente importa.
            </p>

            <div className="flex flex-col sm:flex-row gap-5 justify-center lg:justify-start mb-10">
              <Button size="xl" variant="neon" className="group shadow-2xl" onClick={() => window.location.href = "/signup"}>
                Criar minha página agora
                <ArrowRight className="ml-2 h-6 w-6 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button size="xl" variant="glass" onClick={() => window.location.href = "/demo"}>
                Ver demonstração
              </Button>
            </div>

            <div className="flex items-center justify-center lg:justify-start gap-4 text-sm text-muted-foreground">
              <div className="flex -space-x-3">
                {[1, 2, 3, 4].map((i) => (
                  <img key={i} src={`https://i.pravatar.cc/100?img=${i + 15}`} alt="Cliente" className="w-8 h-8 rounded-full border-2 border-background object-cover" />
                ))}
              </div>
              <p>+1.200 negócios já automatizaram a agenda hoje</p>
            </div>
          </div>

          <div className="relative lg:mt-2 group">
            {/* Ambient glow */}
            <div className="absolute -inset-10 bg-gradient-primary opacity-30 blur-3xl rounded-[3rem] pointer-events-none animate-pulse-glow" />
            <div className="absolute -inset-4 bg-neon-pink/10 blur-2xl rounded-[2.5rem] pointer-events-none" />

            {/* Realistic browser mockup */}
            <div className="relative z-10 rounded-2xl overflow-hidden bg-[#0a0f1a] border border-white/10 shadow-[0_30px_80px_-15px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur-sm transform transition-transform duration-700 group-hover:-translate-y-1">
              {/* Title bar */}
              <div className="relative flex items-center gap-2 px-4 py-3 bg-gradient-to-b from-[#1c2333] to-[#141a26] border-b border-white/5">
                <div className="flex gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#ff5f57] shadow-inner" />
                  <span className="w-3 h-3 rounded-full bg-[#febc2e] shadow-inner" />
                  <span className="w-3 h-3 rounded-full bg-[#28c840] shadow-inner" />
                </div>
                <div className="flex-1 flex justify-center px-8">
                  <div className="px-4 py-1.5 rounded-md bg-black/40 border border-white/5 text-[11px] text-muted-foreground truncate max-w-sm w-full text-center flex items-center justify-center gap-1.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-400">
                      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-1 17v-2a5 5 0 0 1 0-10V5" />
                    </svg>
                    booking.zailom.com/testando-01/admin
                  </div>
                </div>
              </div>
              {/* Screenshot */}
              <img
                src={heroDashboard.url}
                alt="Painel Zailom Booking em uso"
                className="w-full h-auto block"
                loading="eager"
              />
              {/* Subtle scanline / gloss */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-white/[0.06]" />
            </div>

            {/* Reflection */}
            <div className="relative -mt-2 h-16 mx-8 opacity-30 blur-md">
              <img
                src={heroDashboard.url}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover object-top scale-y-[-1]"
                style={{ maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)", WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)" }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
