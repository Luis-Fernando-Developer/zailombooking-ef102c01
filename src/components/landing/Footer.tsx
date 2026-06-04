import { BookingLogo } from "@/components/BookingLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Instagram, 
  Twitter, 
  Linkedin, 
  Mail, 
  Phone 
} from "lucide-react";

export function Footer() {
  const newYear = new Date().getFullYear();
  return (
    <footer className="bg-gradient-secondary border-t border-primary/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid lg:grid-cols-4 gap-12">
          <div className="lg:col-span-1">
            <BookingLogo className="mb-6" />
            <p className="text-muted-foreground mb-6">
              A plataforma completa para gestão de agendamentos. 
              Simplifique seu negócio e maximize seus resultados.
            </p>
            <div className="flex space-x-4">
              <Button variant="ghost" size="icon">
                <Instagram className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Twitter className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Linkedin className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">Produto</h3>
            <ul className="space-y-3">
              <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Recursos</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Preços</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Demonstração</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">Empresa</h3>
            <ul className="space-y-3">
              <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Sobre nós</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Blog</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Contato</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">Newsletter</h3>
            <p className="text-muted-foreground mb-4">
              Receba dicas e novidades sobre gestão de negócios.
            </p>
            <div className="space-y-3">
              <Input 
                placeholder="Seu email" 
                className="bg-background/50 border-primary/30"
              />
              <Button variant="neon" className="w-full">
                Inscrever-se
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-primary/20 mt-12 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                contato@bookingfy.com.br
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                (11) 99999-9999
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <span>© {newYear} BookingFy. Todos os direitos reservados.</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
