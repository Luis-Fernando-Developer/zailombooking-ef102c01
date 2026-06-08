import { Button } from "@/components/ui/button";
import { ArrowRight, Zap } from "lucide-react";

export function CTASection() {
  return (
    <section className="py-40 relative overflow-visible bg-[#0B0D12] z-50">
      {/* Cinematic Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 blur-[150px] rounded-full opacity-50" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="glass-morphism rounded-[4rem] p-16 md:p-28 text-center border-white/5 relative overflow-hidden">
          {/* Decorative Elements */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
          
          <div className="space-y-8 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.3em] mb-4">
              <Zap className="w-3 h-3 fill-primary" /> PRONTO PARA ESCALAR?
            </div>
            
            <h2 className="text-7xl md:text-9xl font-black text-white tracking-tighter leading-[0.75] mb-10">
              DOMINE <br />
              <span className="italic text-glow bg-gradient-to-r from-primary via-accent to-white bg-clip-text text-transparent">O AGORA.</span>
            </h2>
            
            <p className="text-2xl md:text-4xl text-slate-300 font-medium leading-tight mb-16 tracking-tight">
              A janela de oportunidade está fechando. Escolha entre ser o <span className="text-white font-black underline decoration-primary underline-offset-8">líder</span> ou apenas mais um na multidão.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <button 
                className="btn-cinematic"
                onClick={() => window.location.href = "/signup"}
              >
                COMEÇAR AGORA
                <ArrowRight className="inline-block ml-2 h-5 w-5" />
              </button>
              <Button 
                variant="outline" 
                className="h-16 px-12 rounded-full border-white/10 bg-white/5 text-white font-black uppercase tracking-widest text-xs hover:bg-white/10 transition-all duration-300"
              >
                Falar com consultor
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
