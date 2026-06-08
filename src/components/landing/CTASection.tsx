import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CTASection() {
  return (
    <section className="py-32 relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <div className="bg-slate-900 dark:bg-white rounded-[3rem] p-12 md:p-24 space-y-10 shadow-2xl relative overflow-hidden">
          {/* Subtle pattern overlay */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
          
          <div className="space-y-6 relative z-10">
            <h2 className="text-4xl md:text-6xl font-medium text-white dark:text-slate-900 tracking-tight leading-[1.1]">
              Sua operação merece o <br />
              <span className="italic font-serif opacity-80">próximo nível.</span>
            </h2>
            <p className="text-lg md:text-xl text-slate-400 dark:text-slate-600 max-w-2xl mx-auto font-light leading-relaxed">
              Junte-se às empresas que já transformaram seus agendamentos em uma vantagem competitiva de alto luxo.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center relative z-10">
            <Button size="lg" className="h-16 px-12 text-lg rounded-full bg-white text-slate-900 hover:bg-slate-100 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800 transition-all duration-300">
              Começar agora gratuitamente
            </Button>
            <Button size="lg" variant="outline" className="h-16 px-12 text-lg rounded-full border-white/20 text-white hover:bg-white/10 dark:border-slate-200 dark:text-slate-900 dark:hover:bg-slate-50">
              Falar com consultor
            </Button>
          </div>
        </div>
      </div>
      
      {/* Background decoration */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-4xl max-h-96 bg-primary/10 blur-[120px] -z-10 rounded-full" />
    </section>
  );
}
