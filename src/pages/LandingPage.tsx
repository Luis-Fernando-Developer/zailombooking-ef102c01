import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Footer";
import { TrustSection } from "@/components/landing/TrustSection";
import { CTASection } from "@/components/landing/CTASection";
import { BookingLogo } from "@/components/BookingLogo";
import { Button } from "@/components/ui/button";
import { motion, useScroll, useSpring } from "framer-motion";

export default function LandingPage() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <div className="min-h-screen bg-[#0B0D12] text-white selection:bg-primary selection:text-white">
      {/* Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-primary z-[100] origin-left"
        style={{ scaleX }}
      />

      {/* Cinematic Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0B0D12]/40 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
          <BookingLogo className="scale-110" />
          <div className="hidden md:flex items-center gap-12">
            <a href="#features" className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 hover:text-white transition-all">Architecture</a>
            <a href="#trust" className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 hover:text-white transition-all">Trust</a>
            <a href="#pricing" className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 hover:text-white transition-all">Investment</a>
            <div className="h-4 w-px bg-white/10" />
            <Button variant="ghost" className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 hover:text-white" onClick={() => window.location.href = "/login"}>Login</Button>
            <button className="bg-white text-black px-8 py-3 rounded-full text-xs font-black uppercase tracking-[0.2em] hover:scale-105 transition-all duration-300" onClick={() => window.location.href = "/signup"}>Start Now</button>
          </div>
        </div>
      </nav>

      <main>
        <Hero />
        <div id="features" className="relative z-10"><Features /></div>
        <div id="trust" className="relative z-10"><TrustSection /></div>
        <div id="pricing" className="relative z-10"><Pricing /></div>
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}

