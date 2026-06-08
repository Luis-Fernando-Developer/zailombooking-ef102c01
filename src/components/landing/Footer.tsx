import { BookingLogo } from "@/components/BookingLogo";
import { Button } from "@/components/ui/button";
import { Instagram, Linkedin, Mail, Phone, MapPin } from "lucide-react";

export function Footer() {
  const newYear = new Date().getFullYear();
  return (
    <footer className="bg-gradient-secondary border-t border-primary/20 pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-4 gap-16 mb-20">
          <div className="lg:col-span-1">
            <BookingLogo className="mb-8" />
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              A plataforma definitiva para quem cansou de perder tempo e quer escalar seu negócio com tecnologia de elite.
            </p>
            <div className="flex gap-4">
              {[Instagram, Linkedin, Mail].map((Icon, i) => (
                <Button key={i} variant="glass" size="icon" className="w-12 h-12 rounded-xl border-primary/10 hover:border-primary/40 transition-all">
                  <Icon className="w-5 h-5" />
                </Button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-white font-black text-xl mb-8 uppercase tracking-widest text-sm">Plataforma</h3>
            <ul className="space-y-4">
              <li><a href="#features" className="text-muted-foreground hover:text-primary transition-colors text-lg">Recursos</a></li>
              <li><a href="#pricing" className="text-muted-foreground hover:text-primary transition-colors text-lg">Planos</a></li>
              <li><a href="/demo" className="text-muted-foreground hover:text-primary transition-colors text-lg">Demonstração</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-black text-xl mb-8 uppercase tracking-widest text-sm">Empresa</h3>
            <ul className="space-y-4">
              <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors text-lg">Sobre o Zailom</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors text-lg">Termos de Uso</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors text-lg">Privacidade</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-black text-xl mb-8 uppercase tracking-widest text-sm">Contato</h3>
            <ul className="space-y-4 text-muted-foreground text-lg">
              <li className="flex items-center gap-3"><Phone className="w-5 h-5 text-primary" /> (11) 99999-9999</li>
              <li className="flex items-center gap-3"><Mail className="w-5 h-5 text-primary" /> contato@zailom.com</li>
              <li className="flex items-center gap-3"><MapPin className="w-5 h-5 text-primary" /> São Paulo, Brasil</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-primary/10 pt-12 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-muted-foreground text-sm font-medium">
            © {newYear} Zailom Booking. Transformando negócios através da automação.
          </p>
          <div className="flex gap-8">
             <span className="text-xs text-muted-foreground/50">Feito com foco em performance</span>
          </div>
        </div>
      </div>
    </footer>
  );
}