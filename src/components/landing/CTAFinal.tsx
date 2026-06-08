import { Button } from "@/components/ui/button";
import { ArrowRight, Rocket, ShieldCheck } from "lucide-react";

export function CTAFinal() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-primary opacity-10"></div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="bg-card/40 backdrop-blur-2xl border border-primary/20 rounded-[3rem] p-12 lg:p-20 text-center card-glow">
          <div className="inline-flex p-4 rounded-3xl bg-primary/10 mb-8">
            <Rocket className="w-10 h-10 text-primary animate-pulse-glow" />
          </div>
          <h2 className="text-4xl lg:text-7xl font-black mb-8 leading-[1.1] tracking-tighter">
            Pronto para sair do caos <br/><span className="text-gradient">e começar a lucrar?</span>
          </h2>
          <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
            Não deixe sua concorrência automatizar primeiro. O Zailom Booking é o parceiro que seu negócio precisa para crescer de verdade.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button size="xl" variant="neon" className="h-16 px-10 text-xl font-black" onClick={() => window.location.href = "/signup"}>
              Criar minha Agenda Agora
              <ArrowRight className="ml-3 w-7 h-7" />
            </Button>
            <Button size="xl" variant="glass" className="h-16 px-10 text-xl" onClick={() => window.location.href = "/demo"}>
              Ver Demo ao Vivo
            </Button>
          </div>
          <div className="mt-12 flex flex-wrap justify-center gap-8 text-sm text-muted-foreground font-medium">
            <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Sem cartão de crédito</div>
            <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Configuração em 2 min</div>
            <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Suporte humano 24/7</div>
          </div>
        </div>
      </div>
    </section>
  );
}