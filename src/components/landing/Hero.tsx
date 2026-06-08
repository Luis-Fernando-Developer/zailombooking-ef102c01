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
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-24 pb-12">
      {/* Background with Brand Gradient */}
      <div className="absolute inset-0 bg-[#1E0828]"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-[#1E0828] via-[#460863]/20 to-[#000000]"></div>
      
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -right-[10%] w-[50%] h-[50%] bg-[#920027]/10 rounded-full blur-[120px] animate-pulse-glow"></div>
        <div className="absolute -bottom-[10%] -left-[10%] w-[50%] h-[50%] bg-[#460863]/20 rounded-full blur-[120px] animate-float"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="text-center lg:text-left space-y-8">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm mb-4">
              <span className="flex h-2 w-2 rounded-full bg-[#920027] animate-pulse"></span>
              <span className="text-xs font-medium text-white/80 uppercase tracking-wider">Nova era de agendamentos</span>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-center lg:justify-start">
                <BookingLogo className="scale-125 mb-6" />
              </div>
              
              <h1 className="text-5xl lg:text-8xl font-black mb-6 tracking-tight leading-[1.1]">
                <span className="text-white block drop-shadow-md">Agenda Online</span>
                <span className="text-gradient drop-shadow-2xl">Inteligente</span>
              </h1>
              
              <p className="text-xl text-white/70 mb-8 max-w-xl leading-relaxed">
                A solução definitiva para automação de agendamentos multi-usuário. 
                Experiência premium, gestão simplificada e crescimento escalável para sua marca.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-5 justify-center lg:justify-start">
              <button 
                className="group inline-flex items-center justify-center h-14 px-8 text-lg font-bold rounded-xl bg-white text-[#1E0828] hover:bg-white/90 transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.3)]" 
                onClick={handleStartClick}
              >
                Começar Agora
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button 
                className="h-14 px-8 text-lg font-bold rounded-xl border-white/20 bg-white/5 text-white hover:bg-white/10 backdrop-blur-md transition-all duration-300"
                onClick={() => window.location.href = "/demo"}
              >
                Ver Demonstração
              </button>
            </div>

            <div className="grid grid-cols-3 gap-8 pt-10 border-t border-white/10">
              <div className="space-y-2">
                <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center border border-white/10">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <p className="text-sm font-medium text-white/90">Agenda Online</p>
              </div>
              <div className="space-y-2">
                <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center border border-white/10">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <p className="text-sm font-medium text-white/90">Multi-usuário</p>
              </div>
              <div className="space-y-2">
                <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center border border-white/10">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <p className="text-sm font-medium text-white/90">Automação</p>
              </div>
            </div>
          </div>

          <div className="relative lg:block">
            <div className="relative z-10 p-2 bg-gradient-to-br from-white/20 to-transparent rounded-[2rem] backdrop-blur-2xl border border-white/20 shadow-2xl">
              <div className="overflow-hidden rounded-[1.5rem] bg-[#1E0828]/50">
                <img 
                  src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200" 
                  alt="Zylo Booking Interface" 
                  className="w-full h-auto object-cover aspect-[4/3] mix-blend-luminosity hover:mix-blend-normal transition-all duration-700 hover:scale-105"
                />
              </div>
              
              {/* Floating UI Elements simulations */}
              <div className="absolute -top-6 -right-6 bg-white p-4 rounded-2xl shadow-xl animate-float hidden sm:block">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">Novo Agendamento</p>
                    <p className="text-[10px] text-slate-500">Agora mesmo</p>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-10 -left-10 bg-[#460863] p-5 rounded-2xl shadow-2xl border border-white/10 animate-pulse-glow hidden sm:block">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-white/60">Crescimento Mensal</p>
                  <p className="text-2xl font-bold text-white">+124%</p>
                </div>
              </div>
            </div>
            
            {/* Background glows for the image */}
            <div className="absolute -top-20 -left-20 w-64 h-64 bg-[#920027]/30 rounded-full blur-[80px] opacity-50"></div>
            <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-[#460863]/40 rounded-full blur-[80px] opacity-50"></div>
          </div>
        </div>
      </div>
    </section>

  );
}
