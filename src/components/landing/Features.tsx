import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Calendar, 
  Users, 
  BarChart3, 
  Zap,
  Smartphone,
  Bell,
  Fingerprint,
  MessagesSquare
} from "lucide-react";

const features = [
  {
    icon: Calendar,
    title: "Agenda 24/7",
    description: "Seu link personalizado funciona mesmo quando você está dormindo. Zero fricção para o agendamento."
  },
  {
    icon: Bell,
    title: "Zero Faltas",
    description: "Lembretes inteligentes via WhatsApp e E-mail. Reduza o prejuízo de clientes que não aparecem."
  },
  {
    icon: Fingerprint,
    title: "Sua Marca em Foco",
    description: "Personalize sua página com sua logo e cores. Não é apenas um sistema, é o seu espaço profissional."
  },
  {
    icon: Users,
    title: "Gestão de Equipe",
    description: "Controle agendas individuais, comissões e permissões de acesso para todos os seus colaboradores."
  },
  {
    icon: BarChart3,
    title: "Relatórios de Elite",
    description: "Saiba exatamente quanto está faturando e quem são seus melhores clientes em tempo real."
  },
  {
    icon: MessagesSquare,
    title: "Chatbot Opcional",
    description: "Integração para agendamento via conversa fluida para quem prefere falar do que clicar."
  }
];

export function Features() {
  return (
    <section id="features" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-secondary opacity-50"></div>
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-24">
          <h2 className="text-4xl lg:text-7xl font-black mb-8">
            Tudo o que você precisa <br/><span className="text-gradient">para dominar seu mercado</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Eliminamos cada barreira no caminho do seu cliente. Do primeiro clique ao checkout, tudo é desenhado para converter.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="card-glow bg-card/40 backdrop-blur-md border-primary/20 hover:border-primary/40 transition-all duration-300">
              <CardHeader>
                <div className="w-14 h-14 bg-gradient-primary rounded-xl flex items-center justify-center mb-6">
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-muted-foreground text-lg">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}