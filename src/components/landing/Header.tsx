import { Button } from "@/components/ui/button";
import { BookingLogo } from "@/components/BookingLogo";
import { useState, useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fecha menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  // Fecha menu ao redimensionar para desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleNavClick = () => {
    setMenuOpen(false);
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-primary/10 py-3"
          : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Logo */}
        <BookingLogo />

        {/* Hamburger Button - visível em todas as telas */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-2 rounded-lg hover:bg-accent transition-colors md:hidden"
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
        >
          {menuOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </button>

        {/* Desktop: Menu expandido sempre visível */}
        <nav className="hidden md:flex items-center gap-8">
          <a
            href="#features"
            className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            Recursos
          </a>
          <a
            href="#pricing"
            className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            Preços
          </a>
          <a
            href="#faq"
            className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            Dúvidas
          </a>
        </nav>

        {/* Desktop: Botões sempre visíveis */}
        <div className="hidden md:flex items-center gap-4">
          <Button
            variant="ghost"
            className="text-sm font-bold"
            onClick={() => (window.location.href = "/login")}
          >
            Entrar
          </Button>
          <Button
            variant="neon"
            size="sm"
            className="font-bold shadow-neon"
            onClick={() => (window.location.href = "/signup")}
          >
            Assinar Agora
          </Button>
        </div>
      </div>

      {/* Menu Mobile Expandido */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute top-full left-0 right-0 bg-background/95 backdrop-blur-xl border-b border-primary/10 shadow-lg md:hidden"
        >
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-4">
            {/* Links de navegação */}
            <div className="flex flex-col gap-2">
              <a
                href="#features"
                onClick={handleNavClick}
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors py-2"
              >
                Recursos
              </a>
              <a
                href="#pricing"
                onClick={handleNavClick}
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors py-2"
              >
                Preços
              </a>
              <a
                href="#faq"
                onClick={handleNavClick}
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors py-2"
              >
                Dúvidas
              </a>
            </div>

            {/* Separador */}
            <div className="border-t border-primary/10" />

            {/* Botões */}
            <div className="flex flex-col gap-2 pb-2">
              <Button
                variant="ghost"
                className="text-sm font-bold justify-start w-full"
                onClick={() => {
                  window.location.href = "/login";
                  handleNavClick();
                }}
              >
                Entrar
              </Button>
              <Button
                variant="neon"
                size="sm"
                className="font-bold w-full"
                onClick={() => {
                  window.location.href = "/signup";
                  handleNavClick();
                }}
              >
                Assinar Agora
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
