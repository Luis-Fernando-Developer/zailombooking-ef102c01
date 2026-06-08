import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Calendar, 
  Users, 
  BarChart3, 
  Settings, 
  Shield, 
  Smartphone,
  Clock,
  CreditCard,
  Bell
} from "lucide-react";

const features = [
  {
    icon: Calendar,
    title: "Agenda Online 24/7",
    description: "Seu cliente agenda o horário pelo seu link personalizado, a qualquer hora. Sem intermediários, sem mensagens esquecidas."
  },
  {
    icon: Bell,
    title: "Lembretes Automáticos",
    description: "Reduza no-shows em até 80%. O sistema envia lembretes inteligentes via WhatsApp e e-mail antes do horário marcado."
  },
  {
    icon: Users,
    title: "Página Profissional Única",
    description: "Nada de perfis genéricos. Você ganha uma página com a sua marca para transmitir autoridade e confiança desde o primeiro acesso."
  },
  {
    icon: BarChart3,
    title: "Gestão Descomplicada",
    description: "Veja seu faturamento, histórico de clientes e performance de colaboradores em um painel simples e sem curva de aprendizado."
  },
  {
    icon: CreditCard,
    title: "Agendamento Inteligente",
    description: "Configure horários de intervalo, bloqueios automáticos e regras de atendimento. O sistema organiza tudo para você."
  },
  {
    icon: Shield,
    title: "Segurança de Elite",
    description: "Seus dados estão protegidos com criptografia de ponta e backups automáticos. Foco total em crescer seu negócio."
  }
];

export function Features() {
  return (
    <section className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-secondary"></div>
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-20">
          <h2 className="text-4xl lg:text-6xl font-black mb-6">
            Recursos que <span className="text-gradient">dominam o mercado</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Eliminamos cada fricção no caminho do seu cliente. Do primeiro clique ao pagamento confirmado, 
            tudo é desenhado para converter.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="card-glow bg-card/50 backdrop-blur-sm border-primary/20 hover:border-primary/40 transition-all duration-300">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-muted-foreground">
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
