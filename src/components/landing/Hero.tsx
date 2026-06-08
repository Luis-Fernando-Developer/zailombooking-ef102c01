import { useEffect, useRef } from "react";
import { ArrowRight, Play, Zap, Shield, Globe, Layers, Command } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";


export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  const y1 = useTransform(scrollYProgress, [0, 1], [0, -200]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, -100]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.8]);

  return (
    <section ref={containerRef} className="relative min-h-[140vh] flex flex-col items-center justify-start pt-48 pb-20 overflow-hidden bg-[#0B0D12]">
      {/* Cinematic Depth Layers */}
      <motion.div style={{ y: y1, opacity }} className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-primary/10 blur-[160px] rounded-full" />
        <div className="absolute bottom-[20%] right-[-5%] w-[50%] h-[50%] bg-accent/5 blur-[140px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] mix-blend-overlay" />
      </motion.div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="inline-flex items-center gap-2 px-6 py-2 rounded-full premium-glass mb-12"
        >
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/60">The New Standard of Intelligence</span>
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-[0.85] text-white mb-10"
        >
          ENGINEERING <br />
          <span className="text-highlight">PERFECTION.</span>
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.4 }}
          className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto font-medium leading-relaxed mb-16"
        >
          Zylo is the world's most sophisticated scheduling ecosystem, designed for brands that demand absolute performance and cinematic elegance.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-8 justify-center items-center"
        >
          <button className="btn-premium group">
            Get Exclusive Access
            <ArrowRight className="inline-block ml-3 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <button className="flex items-center gap-4 text-white font-black uppercase tracking-[0.2em] text-xs hover:text-primary transition-colors">
            <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/5 backdrop-blur-md">
              <Play className="w-4 h-4 fill-white" />
            </div>
            Watch the Film
          </button>
        </motion.div>
      </div>

      {/* Floating Dashboard - Cinematic Parallax */}
      <motion.div 
        style={{ y: y2, scale }}
        className="relative mt-32 w-full max-w-6xl mx-auto px-6 z-20"
      >
        <div className="relative premium-glass p-2 rounded-[3rem] shadow-[0_40px_100px_rgba(0,0,0,0.6)] group">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000 rounded-[3rem]" />
          <div className="overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#0B0D12]">
            <img 
              src="https://images.unsplash.com/photo-1551288049-bbbda5366392?auto=format&fit=crop&q=80&w=2400" 
              alt="Luxury Interface" 
              className="w-full h-auto opacity-60 group-hover:opacity-100 transition-all duration-1000 scale-[1.02] group-hover:scale-100"
            />
          </div>

          {/* Draggable/Interactive HUD Elements */}
          <motion.div 
            drag
            dragConstraints={{ left: -50, right: 50, top: -50, bottom: 50 }}
            className="absolute -top-12 -left-12 premium-glass p-6 rounded-3xl cursor-grab active:cursor-grabbing hidden lg:block"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Live Efficiency</p>
                <p className="text-2xl font-black text-white">99.8%</p>
              </div>
            </div>
          </motion.div>

          <motion.div 
            drag
            dragConstraints={{ left: -50, right: 50, top: -50, bottom: 50 }}
            className="absolute -bottom-16 -right-12 premium-glass p-6 rounded-3xl cursor-grab active:cursor-grabbing hidden lg:block"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center text-accent">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Encryption</p>
                <p className="text-2xl font-black text-white">Military</p>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Ground Glow */}
      <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[#0B0D12] to-transparent z-30" />
    </section>
  );
}
