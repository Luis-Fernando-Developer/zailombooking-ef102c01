import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { BookingLogo } from "@/components/BookingLogo";
import heroDashboard from "@/assets/hero-dashboard.png.asset.json";

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

          <div className="relative lg:mt-2">
            {/* Browser-style mockup wrapping the real dashboard screenshot */}
            <div className="absolute -inset-6 bg-gradient-primary opacity-20 blur-3xl rounded-[2rem] pointer-events-none" />
            <div className="relative z-10 rounded-2xl shadow-2xl border border-primary/20 overflow-hidden bg-card/70 backdrop-blur-sm">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-primary/10 bg-card/80">
                <span className="w-3 h-3 rounded-full bg-red-500/80" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <span className="w-3 h-3 rounded-full bg-green-500/80" />
                <div className="ml-3 flex-1 max-w-md">
                  <div className="px-3 py-1 rounded-md bg-background/60 border border-primary/10 text-[11px] text-muted-foreground truncate">
                    booking.zailom.com/painel-admin
                  </div>
                </div>
              </div>
              <img
                src={heroDashboard.url}
                alt="Painel Zailom Booking em uso"
                className="w-full h-auto block"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
