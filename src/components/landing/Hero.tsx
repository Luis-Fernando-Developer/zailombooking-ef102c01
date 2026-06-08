import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar, Users, Zap, CheckCircle2, Play, Star } from "lucide-react";

export function Hero() {
  const handleStartClick = () => {
    window.location.href = "/signup";
  };

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden pt-32 pb-20">
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center space-y-12 animate-in fade-in slide-in-from-bottom-10 duration-1000">
          <div className="space-y-6 max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Plataforma Business Premium</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-slate-900 dark:text-white leading-[1.1] text-balance">
              Gestão inteligente para <br />
              <span className="italic font-serif opacity-80">negócios de elite.</span>
            </h1>
            
            <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed text-balance font-light">
              Agenda Online Multi-usuário Automação. Uma experiência tecnológica refinada para quem busca eficiência sem o ruído do design genérico.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button 
              size="lg" 
              className="h-14 px-10 text-base rounded-full btn-premium"
              onClick={handleStartClick}
            >
              Criar minha conta
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="h-14 px-10 text-base rounded-full border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 font-medium transition-colors"
              onClick={() => window.location.href = "/demo"}
            >
              Agendar uma demo
            </Button>
          </div>

          <div className="relative w-full max-w-5xl mt-8 pt-12">
            <div className="relative z-10 p-1 bg-gradient-to-b from-slate-200 to-transparent dark:from-white/10 dark:to-transparent rounded-3xl overflow-hidden shadow-2xl">
              <div className="rounded-[1.4rem] overflow-hidden bg-white dark:bg-slate-950 border border-slate-200/50 dark:border-white/5">
                <img 
                  src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=2426" 
                  alt="Interface Premium Zylo" 
                  className="w-full h-auto opacity-90 grayscale-[0.2] contrast-[1.1]"
                />
              </div>
            </div>
            
            {/* Subtle decor */}
            <div className="absolute -top-4 -left-4 w-24 h-24 border-l border-t border-slate-200 dark:border-white/10 rounded-tl-3xl -z-10" />
            <div className="absolute -bottom-4 -right-4 w-24 h-24 border-r border-b border-slate-200 dark:border-white/10 rounded-br-3xl -z-10" />
          </div>
        </div>
      </div>
    </section>

  );
}
