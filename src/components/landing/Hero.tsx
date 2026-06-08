import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar, Users, Zap, CheckCircle2 } from "lucide-react";

export function Hero() {
  const handleStartClick = () => {
    window.location.href = "/signup";
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-32 pb-20 bg-slate-50 dark:bg-slate-950">
      <div className="hero-gradient" />
      
      {/* Abstract Background Shapes */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500/10 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-8 max-w-4xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm mb-4">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-ping"></span>
            <span className="text-sm font-semibold text-primary">Plataforma de Agendamento Inteligente</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.1]">
            Agendas Online <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-purple-500 to-blue-600">
              Multi-usuário & Automação
            </span>
          </h1>
          
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Escalone seu negócio com a solução mais completa para gestão de horários. 
            Simples para seus clientes, poderoso para sua equipe.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <Button 
              size="lg" 
              className="h-14 px-8 text-lg rounded-full font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:-translate-y-1"
              onClick={handleStartClick}
            >
              Começar Gratuitamente
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="h-14 px-8 text-lg rounded-full font-bold border-2 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all"
              onClick={() => window.location.href = "/demo"}
            >
              Ver Demonstração
            </Button>
          </div>

          <div className="flex flex-wrap justify-center gap-6 pt-12">
            {[
              "Configuração em 2 min",
              "Sem cartão de crédito",
              "Multi-dispositivo"
            ].map((text) => (
              <div key={text} className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* Dashboard Preview Mockup */}
        <div className="mt-20 relative max-w-5xl mx-auto">
          <div className="relative glass-card rounded-2xl p-2 md:p-4 animate-in fade-in slide-in-from-bottom-10 duration-1000">
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-inner">
              <img 
                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=2070" 
                alt="Plataforma de agendamento" 
                className="w-full h-auto"
              />
            </div>
            
            {/* Floating UI Elements */}
            <div className="absolute -top-6 -right-6 md:right-10 glass-card p-4 rounded-xl shadow-2xl animate-bounce hidden sm:flex items-center gap-3" style={{ animationDuration: '3s' }}>
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <Calendar className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs font-bold">Novo Cliente</p>
                <p className="text-[10px] opacity-60">Confirmado agora</p>
              </div>
            </div>

            <div className="absolute -bottom-10 -left-6 md:left-10 glass-card p-4 rounded-xl shadow-2xl animate-pulse hidden sm:flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-bold">128 Agendamentos</p>
                <p className="text-[10px] opacity-60">Esta semana</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
