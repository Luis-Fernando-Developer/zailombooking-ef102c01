import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, ChevronRight, Star, Globe, Shield, Zap } from "lucide-react";

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || !imageRef.current) return;
      
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;
      
      const moveX = (clientX - innerWidth / 2) / 50;
      const moveY = (clientY - innerHeight / 2) / 50;
      
      imageRef.current.style.transform = `perspective(1000px) rotateY(${moveX}deg) rotateX(${-moveY}deg) translateY(${moveY * 0.5}px)`;
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <section ref={containerRef} className="relative min-h-[110vh] flex items-center justify-center overflow-hidden pt-32 pb-20 cinematic-bg">
      {/* Dynamic Background Particles/Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none">
        <div className="absolute top-[10%] left-[10%] w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] bg-accent/10 blur-[100px] rounded-full" />
      </div>

      {/* Grid Pattern with Fade */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-morphism mb-10 animate-in fade-in slide-in-from-top-4 duration-1000">
            <div className="flex -space-x-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-6 h-6 rounded-full border-2 border-[#131722] bg-slate-800 flex items-center justify-center overflow-hidden">
                  <img src={`https://i.pravatar.cc/100?img=${i + 10}`} alt="User" />
                </div>
              ))}
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-primary">+2.4k empresas escalando hoje</span>
          </div>

          <div className="space-y-6 max-w-5xl mb-12">
            <h1 className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-[0.85] animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-100">
              <span className="text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">TRANSFORME</span> <br />
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_auto] animate-gradient bg-clip-text text-transparent italic px-2">AGENDAMENTOS</span> <br />
              <span className="text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">EM ELITE.</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 font-medium">
              A única plataforma que funde Inteligência Artificial de última geração com uma arquitetura visual cinematográfica. Projetada meticulosamente para marcas que exigem nada menos que o absoluto.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
            <button 
              className="btn-cinematic"
              onClick={() => window.location.href = "/signup"}
            >
              Começar minha jornada
              <ArrowRight className="inline-block ml-2 h-5 w-5" />
            </button>
            <Button 
              variant="outline"
              className="h-16 px-10 rounded-full border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 text-white font-bold transition-all duration-300"
            >
              <Play className="mr-2 h-4 w-4 fill-white" />
              Ver o futuro
            </Button>
          </div>

          {/* Hero Dashboard Preview with Parallax */}
          <div 
            ref={imageRef}
            className="relative w-full max-w-5xl mx-auto transition-transform duration-200 ease-out will-change-transform"
          >
            {/* Floatings Elements */}
            <div className="absolute -top-12 -left-12 z-30 glass-morphism p-4 rounded-2xl floating hidden md:block">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                  <Zap className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Conversão</p>
                  <p className="text-lg font-bold text-white">+84%</p>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-10 -right-10 z-30 glass-morphism p-4 rounded-2xl floating [animation-delay:1s] hidden md:block">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                  <Shield className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Segurança</p>
                  <p className="text-lg font-bold text-white">Enterprise</p>
                </div>
              </div>
            </div>

            {/* Main Preview */}
            <div className="relative z-10 p-1.5 bg-gradient-to-b from-white/10 to-transparent rounded-[2.5rem] border border-white/10 shadow-[0_0_100px_rgba(91,140,255,0.1)]">
              <div className="rounded-[2.2rem] overflow-hidden border border-white/5 bg-[#0B0D12]">
                <img 
                  src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=2426" 
                  alt="Interface Revolucionária" 
                  className="w-full h-auto opacity-90 hover:opacity-100 transition-opacity duration-1000 grayscale-[50%] hover:grayscale-0"
                />
              </div>
            </div>

            {/* Light Beam Effect */}
            <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-3/4 h-40 bg-primary/20 blur-[100px] -z-10 rounded-full" />
          </div>
        </div>
      </div>
    </section>
  );
}
