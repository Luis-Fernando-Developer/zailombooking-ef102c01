import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Footer";
import { TrustSection } from "@/components/landing/TrustSection";
import { CTASection } from "@/components/landing/CTASection";
import { BookingLogo } from "@/components/BookingLogo";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0B0D12] text-white">
      {/* Cinematic Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0B0D12]/60 backdrop-blur-2xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <BookingLogo />
          <div className="hidden md:flex items-center gap-10">
            <a href="#features" className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 hover:text-primary transition-all">Funcionalidades</a>
            <a href="#trust" className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 hover:text-primary transition-all">Confiança</a>
            <a href="#pricing" className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 hover:text-primary transition-all">Preços</a>
            <div className="h-4 w-px bg-white/10" />
            <Button variant="ghost" className="text-sm font-bold text-slate-300 hover:text-white" onClick={() => window.location.href = "/login"}>Login</Button>
            <button className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-black tracking-tight hover:scale-105 transition-all duration-300" onClick={() => window.location.href = "/signup"}>JOIN THE ELITE</button>
          </div>
        </div>
      </nav>

      <main>
        <Hero />
        <div id="features"><Features /></div>
        <div id="trust"><TrustSection /></div>
        <div id="pricing"><Pricing /></div>
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
