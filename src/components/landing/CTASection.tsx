import { motion } from "framer-motion";
import { ArrowRight, Zap, Globe, Shield, Star, Award, Compass, ChevronRight } from "lucide-react";


export function CTASection() {
  return (
    <section className="section-padding relative overflow-hidden bg-[#0B0D12]">
      {/* Atmospheric Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] bg-primary/5 blur-[180px] rounded-full" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(91,140,255,0.15),transparent_50%)]" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="relative premium-glass p-16 md:p-32 rounded-[4rem] text-center border-white/5 overflow-hidden group"
        >
          {/* Animated Gradient Border Overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
          
          <div className="relative z-10 max-w-4xl mx-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-[0.4em] mb-12"
            >
              <Compass className="w-4 h-4 text-primary animate-spin-slow" />
              Chart Your New Course
            </motion.div>
            
            <h2 className="text-5xl md:text-8xl font-black text-white tracking-tighter leading-[0.85] mb-12">
              THE FUTURE IS <br />
              <span className="text-highlight">OBSOLETE WITHOUT YOU.</span>
            </h2>
            
            <p className="text-xl md:text-2xl text-slate-400 font-medium leading-relaxed mb-16 max-w-2xl mx-auto">
              The window for digital dominance is narrowing. Secure your position among the elite today.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-8 justify-center items-center">
              <button className="btn-premium w-full sm:w-auto">
                Begin Transformation
                <ArrowRight className="inline-block ml-3 w-5 h-5" />
              </button>
              <button className="text-white text-xs font-black uppercase tracking-[0.3em] hover:text-primary transition-colors flex items-center gap-3">
                Request Private Demo
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Decorative Corner Icons */}
          <div className="absolute top-12 left-12 opacity-10 group-hover:opacity-30 transition-opacity">
            <Award className="w-12 h-12 text-white" />
          </div>
          <div className="absolute bottom-12 right-12 opacity-10 group-hover:opacity-30 transition-opacity">
            <Star className="w-12 h-12 text-white" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
