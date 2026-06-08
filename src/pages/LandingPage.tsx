import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Footer";
import { BookingLogo } from "@/components/BookingLogo";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Basic Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/50 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <BookingLogo />
          <div className="hidden md:flex items-center gap-10">
            <a href="#features" className="text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-primary transition-colors">Funcionalidades</a>
            <a href="#pricing" className="text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-primary transition-colors">Preços</a>
            <div className="h-4 w-px bg-border" />
            <Button variant="ghost" className="text-sm font-semibold" onClick={() => window.location.href = "/login"}>Entrar</Button>
            <Button className="rounded-full px-6 btn-premium" onClick={() => window.location.href = "/signup"}>Começar agora</Button>
          </div>
        </div>
      </nav>


      <main>
        <Hero />
        <div id="features"><Features /></div>
        <div id="pricing"><Pricing /></div>
      </main>
      <Footer />
    </div>
  );
}
