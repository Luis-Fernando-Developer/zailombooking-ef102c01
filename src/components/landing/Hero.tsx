import { Button } from "@/components/ui/button";
import { ArrowRight, Play, ChevronRight } from "lucide-react";

export function Hero() {
  const handleStartClick = () => {
    window.location.href = "/signup";
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-32 pb-20 bg-background">
      {/* Background Decor */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-slate-400/10 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center space-y-12 animate-in fade-in slide-in-from-bottom-10 duration-1000">
          <div className="space-y-8 max-w-5xl">
            <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600 dark:text-slate-400">Versão 2.0 liberada para empresas de elite</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
            </div>
            
            <h1 className="text-6xl md:text-8xl lg:text-9xl font-medium tracking-tight text-slate-950 dark:text-white leading-[0.95] text-balance">
              Agende com <br />
              <span className="italic font-serif opacity-90 text-primary">autoridade.</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto leading-relaxed text-balance font-light">
              A plataforma definitiva de <span className="font-medium text-slate-900 dark:text-white">agendamento e automação</span> para quem busca excelência operacional e um posicionamento de mercado inquestionável.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-5">
            <Button 
              size="lg" 
              className="h-16 px-12 text-lg rounded-full btn-premium shadow-lg shadow-primary/20"
              onClick={handleStartClick}
            >
              Começar agora
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="h-16 px-12 text-lg rounded-full border-slate-300 dark:border-white/10 bg-white/50 backdrop-blur-sm hover:bg-white dark:hover:bg-white/5 font-medium transition-all duration-300"
            >
              <Play className="mr-2 h-4 w-4 fill-current" />
              Ver demonstração
            </Button>
          </div>

          <div className="relative w-full max-w-6xl mt-12 pt-16 group">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-20 pointer-events-none" />
            <div className="relative z-10 p-2 bg-white/50 dark:bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-slate-200 dark:border-white/10 shadow-2xl transition-transform duration-700 group-hover:scale-[1.01]">
              <div className="rounded-[2rem] overflow-hidden border border-slate-200 dark:border-white/5">
                <img 
                  src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=2400" 
                  alt="Interface Premium" 
                  className="w-full h-auto grayscale-[0.5] hover:grayscale-0 transition-all duration-1000 contrast-[1.05]"
                />
              </div>
            </div>
            
            {/* Decor Elements */}
            <div className="absolute -top-10 -right-20 w-64 h-64 bg-primary/5 blur-3xl -z-10 rounded-full" />
            <div className="absolute -bottom-10 -left-20 w-64 h-64 bg-slate-400/5 blur-3xl -z-10 rounded-full" />
          </div>
        </div>
      </div>
    </section>
  );
}

