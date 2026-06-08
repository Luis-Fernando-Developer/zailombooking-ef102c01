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
    title: "Venda enquanto dorme",
    description: "Seu cliente agenda o horário sozinho, 24h por dia, sem precisar que você responda um único WhatsApp."
  },
  {
    icon: Clock,
    title: "Adeus, esquecimentos",
    description: "Lembretes automáticos via WhatsApp e e-mail que reduzem faltas em até 80%. Mais faturamento real no seu bolso."
  },
  {
    icon: CreditCard,
    title: "Garantia de Recebimento",
    description: "Cobre antecipado ou taxas de reserva. Acabe com o prejuízo dos horários vazios e desistências de última hora."
  },
  {
    icon: BarChart3,
    title: "Clareza no seu Negócio",
    description: "Saiba exatamente quem são seus melhores clientes e quanto você vai faturar no final do mês com dados reais."
  },
  {
    icon: Users,
    title: "Equipe em Sincronia",
    description: "Gerencie múltiplos profissionais, comissões e agendas sem confusão ou conflitos de horário."
  },
  {
    icon: Smartphone,
    title: "Experiência de App Nativo",
    description: "Seus clientes não precisam baixar nada. Uma interface rápida e fluida direto no navegador de qualquer celular."
  }
];

export function Features() {
  return (
    <section className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-secondary"></div>
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            <span className="text-gradient">Construído para Profissionais de Elite</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Não somos um template genérico. Somos a solução definitiva para quem cansou de gerenciar agendas manualmente.
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
