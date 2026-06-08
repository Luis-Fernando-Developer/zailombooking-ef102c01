import { Button } from "@/components/ui/button";
import { ArrowRight, Rocket } from "lucide-react";

export function CTAFinal() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-primary opacity-10"></div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="bg-card/50 backdrop-blur-xl border border-primary/20 rounded-3xl p-12 text-center card-glow">
          <div className="inline-flex p-3 rounded-full bg-primary/10 mb-6">
            <Rocket className="w-8 h-8 text-primary animate-pulse-glow" />
          </div>
          <h2 className="text-4xl lg:text-6xl font-black mb-8 leading-tight">
            Pronto para levar seu negócio ao <span className="text-gradient">próximo nível?</span>
          </h2>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Não deixe para amanhã a organização que pode dobrar seu faturamento hoje. 
            Crie sua conta em menos de 2 minutos.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="xl" variant="hero" onClick={() => window.location.href = "/signup"}>
              Começar Grátis Agora
              <ArrowRight className="ml-2 w-6 h-6" />
            </Button>
            <Button size="xl" variant="glass" onClick={() => window.location.href = "/demo"}>
              Ver Demo ao Vivo
            </Button>
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            Sem cartão de crédito • Teste grátis por 7 dias • Suporte humano
          </p>
        </div>
      </div>
    </section>
  );
}
