import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar, Users, Zap } from "lucide-react";
import { BookingLogo } from "@/components/BookingLogo";

interface HeroProps {
  customization?: any;
}

export function Hero({ customization }: HeroProps) {
  const handleStartClick = () => {
    window.location.href = "/signup";
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-hero"></div>
      
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-72 h-72 bg-neon-violet/10 rounded-full blur-3xl animate-pulse-glow"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-neon-pink/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-neon-cyan/10 rounded-full blur-3xl animate-pulse-glow" style={{animationDelay: '1s'}}></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-center lg:text-left">
            <div className="mb-8 flex justify-center lg:justify-start">
              <BookingLogo />
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-bold mb-6">
              <span className="text-neon block mb-2">Agendamentos</span>
              <span className="text-foreground">Inteligentes</span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl">
              Transforme seu negócio com nossa plataforma SaaS de agendamentos. 
              Gestão completa, automação inteligente e experiência premium para seus clientes.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-12">
              <Button variant="hero" className="group" onClick={handleStartClick}>
                Começar Agora
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button variant="glass" size="lg" onClick={() => window.location.href = "/demo"}>
                Ver Demonstração
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-6 max-w-md mx-auto lg:mx-0">
              <div className="text-center">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mx-auto mb-2 card-glow">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <p className="text-sm text-muted-foreground">Agenda Online</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mx-auto mb-2 card-glow">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <p className="text-sm text-muted-foreground">Multi-usuário</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mx-auto mb-2 card-glow">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <p className="text-sm text-muted-foreground">Automação</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="relative z-10 overflow-hidden rounded-2xl shadow-2xl card-glow border border-primary/20">
              <img 
                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1200" 
                alt="Zylo Booking Dashboard" 
                className="w-full h-full object-cover aspect-video opacity-90"
              />
            </div>
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-gradient-primary rounded-full blur-xl opacity-60 animate-float"></div>
            <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-neon-pink/30 rounded-full blur-xl opacity-60 animate-pulse-glow"></div>
          </div>
        </div>
      </div>
    </section>
  );
}
