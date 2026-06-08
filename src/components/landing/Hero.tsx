import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar, Users, Zap, CheckCircle2, Play, Star } from "lucide-react";

export function Hero() {
  const handleStartClick = () => {
    window.location.href = "/signup";
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-32 pb-20 hero-mesh">
      {/* Dynamic Background Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-10 animate-in fade-in slide-in-from-left-10 duration-1000">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-effect">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-slate-200" />
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  <span className="text-xs font-bold">+500 empresas confiam</span>
                </div>
              </div>
              
              <h1 className="text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-slate-900 dark:text-white leading-[0.95] text-balance">
                O futuro da <br />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-purple-500 to-indigo-600">
                  Agenda Online
                </span>
              </h1>
              
              <p className="text-xl text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed text-balance">
                Uma plataforma premium projetada para crescer com você. Automatize horários, gerencie equipes e encante seus clientes com uma experiência de agendamento em segundos.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-5">
              <Button 
                size="lg" 
                className="h-16 px-10 text-lg rounded-2xl btn-primary-gradient group"
                onClick={handleStartClick}
              >
                Começar Grátis
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="h-16 px-10 text-lg rounded-2xl font-bold glass-effect hover:bg-white dark:hover:bg-slate-800 group"
                onClick={() => window.location.href = "/demo"}
              >
                <Play className="mr-2 h-5 w-5 fill-current" />
                Ver Vídeo
              </Button>
            </div>

            <div className="flex flex-wrap gap-x-8 gap-y-4 pt-4">
              {["Sem taxas ocultas", "Cancele quando quiser", "Suporte 24/7"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative animate-in fade-in slide-in-from-right-10 duration-1000 delay-200">
            {/* Main Visual Component */}
            <div className="relative z-10 p-3 glass-effect rounded-[2.5rem] shadow-2xl rotate-3 hover:rotate-0 transition-all duration-700">
              <div className="rounded-[2rem] overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-inner">
                <img 
                  src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1200" 
                  alt="Plataforma Zylo" 
                  className="w-full h-auto"
                />
              </div>
              
              {/* Floating Dashboard elements */}
              <div className="absolute -top-10 -right-10 glass-effect p-6 rounded-3xl shadow-2xl animate-bounce hidden sm:block" style={{ animationDuration: '4s' }}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-500 rounded-2xl flex items-center justify-center text-white">
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-black">+R$ 12.450,00</p>
                    <p className="text-[10px] uppercase tracking-wider font-bold opacity-60">Hoje em vendas</p>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-10 -left-10 glass-effect p-6 rounded-3xl shadow-2xl animate-pulse hidden sm:block">
                <div className="space-y-4">
                  <p className="text-xs font-bold uppercase tracking-widest opacity-60">Próximo Agendamento</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200" />
                    <div>
                      <p className="text-sm font-bold">Ana Silva</p>
                      <p className="text-xs text-primary font-bold">14:30 - Corte & Barba</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Background Glows */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-primary/10 rounded-full blur-[100px] -z-10" />
          </div>
        </div>
      </div>
    </section>
  );
}
