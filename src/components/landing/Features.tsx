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
    title: "Agenda Inteligente",
    description: "Sistema completo de agendamentos com disponibilidade em tempo real e sincronização automática."
  },
  {
    icon: Users,
    title: "Gestão de Equipe",
    description: "Controle de funcionários, permissões por nível e distribuição automática de agendamentos."
  },
  {
    icon: BarChart3,
    title: "Relatórios Avançados",
    description: "Dashboards completos com métricas de desempenho, faturamento e análise de clientes."
  },
  {
    icon: Settings,
    title: "Personalização Total",
    description: "Customize sua landing page, cores, logo e configure seu estabelecimento do seu jeito."
  },
  {
    icon: Shield,
    title: "Segurança Garantida",
    description: "Proteção de dados com criptografia e backup automático. Seus dados sempre seguros."
  },
  {
    icon: Smartphone,
    title: "100% Responsivo",
    description: "Acesse de qualquer dispositivo. Interface otimizada para mobile, tablet e desktop."
  },
  {
    icon: Clock,
    title: "Automação Completa",
    description: "Lembretes automáticos, confirmações por WhatsApp e gestão de no-shows."
  },
  {
    icon: CreditCard,
    title: "Pagamentos Online",
    description: "Integração com principais gateways de pagamento. Receba antecipado pelos serviços."
  },
  {
    icon: Bell,
    title: "Notificações Smart",
    description: "Sistema inteligente de notificações para clientes e estabelecimento."
  }
];

export function Features() {
  return (
    <section className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-secondary"></div>
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            <span className="text-gradient">Recursos Poderosos</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Tudo que você precisa para revolucionar a gestão do seu estabelecimento em uma única plataforma.
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
