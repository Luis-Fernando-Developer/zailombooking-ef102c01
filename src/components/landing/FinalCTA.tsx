import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-hero opacity-50"></div>
      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
        <div className="inline-block px-4 py-1.5 mb-6 border border-primary/20 bg-primary/10 rounded-full text-sm font-semibold tracking-wider uppercase text-primary animate-pulse-glow">
          A oportunidade é agora
        </div>
        <h2 className="text-4xl lg:text-6xl font-bold mb-8 leading-tight">
          Pare de lutar com a sua agenda e comece a <span className="text-gradient">escalar seu lucro</span>.
        </h2>
        <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
          Junte-se a mais de 2.500 empresários que transformaram o caos em previsibilidade e lucro real. Teste grátis por 7 dias.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button variant="hero" size="lg" className="h-16 px-10 text-xl font-bold shadow-neon-strong group" onClick={() => window.location.href = "/signup"}>
            QUERO COMEÇAR AGORA
            <ArrowRight className="ml-3 w-6 h-6 group-hover:translate-x-1 transition-transform" />
          </Button>
          <Button variant="glass" size="lg" className="h-16 px-10 text-xl" onClick={() => window.location.href = "/demo"}>
            Falar com especialista
          </Button>
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          Sem cartão de crédito necessário. Instalação em menos de 5 minutos.
        </p>
      </div>
    </section>
  );
}
