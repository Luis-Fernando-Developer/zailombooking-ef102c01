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
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <BookingLogo />
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium hover:text-primary">Funcionalidades</a>
            <a href="#pricing" className="text-sm font-medium hover:text-primary">Preços</a>
            <Button variant="ghost" size="sm" onClick={() => window.location.href = "/login"}>Entrar</Button>
            <Button size="sm" onClick={() => window.location.href = "/signup"}>Criar Conta</Button>
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
