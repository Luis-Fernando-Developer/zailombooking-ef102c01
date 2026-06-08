import { Button } from "@/components/ui/button";
import { BookingLogo } from "@/components/BookingLogo";
import { useState, useEffect } from "react";

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-background/80 backdrop-blur-xl border-b border-primary/10 py-3' : 'bg-transparent py-5'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <BookingLogo />
        
        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Recursos</a>
          <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Preços</a>
          <a href="#faq" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Dúvidas</a>
        </nav>

        <div className="flex items-center gap-4">
          <Button variant="ghost" className="text-sm font-bold" onClick={() => window.location.href = "/login"}>
            Entrar
          </Button>
          <Button variant="neon" size="sm" className="font-bold shadow-neon" onClick={() => window.location.href = "/signup"}>
            Começar Grátis
          </Button>
        </div>
      </div>
    </header>
  );
}