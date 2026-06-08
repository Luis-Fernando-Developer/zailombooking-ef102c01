import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Calendar, 
  Users, 
  BarChart3, 
  Settings, 
  Shield, 
  Smartphone,
  Clock,
  CreditCard,
  Bell,
  ArrowRight
} from "lucide-react";

const features = [
  {
    icon: Calendar,
    title: "Agenda Inteligente",
    description: "Sincronização em tempo real que evita conflitos e maximiza sua produtividade diária.",
    color: "bg-blue-500"
  },
  {
    icon: Users,
    title: "Gestão de Equipe",
    description: "Controle permissões, comissões e escalas de forma intuitiva para todo seu time.",
    color: "bg-purple-500"
  },
  {
    icon: Clock,
    title: "Automação",
    description: "Lembretes via WhatsApp reduzem faltas em até 80%. O sistema trabalha por você.",
    color: "bg-indigo-500"
  },
  {
    icon: CreditCard,
    title: "Pagamentos",
    description: "Receba pagamentos online no ato do agendamento. Fluxo de caixa garantido.",
    color: "bg-emerald-500"
  },
  {
    icon: BarChart3,
    title: "Relatórios",
    description: "Dados estratégicos sobre seu faturamento e comportamento dos clientes em um clique.",
    color: "bg-orange-500"
  },
  {
    icon: Shield,
    title: "Segurança",
    description: "Seus dados e de seus clientes protegidos com tecnologia de nível bancário.",
    color: "bg-slate-800"
  }
];

export function Features() {
  return (
    <section className="py-32 relative bg-white dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-8">
          <div className="max-w-2xl space-y-6">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-primary">Funcionalidades Premium</h2>
            <h3 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white leading-tight">
              Tudo o que você precisa em uma <span className="text-primary italic">única plataforma.</span>
            </h3>
          </div>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-sm">
            Focamos na simplicidade e na potência. Ferramentas profissionais que qualquer um consegue usar.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="group p-8 rounded-[2rem] glass-effect card-hover">
              <div className={`w-14 h-14 ${feature.color} rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-black/10 transition-transform group-hover:scale-110 duration-500`}>
                <feature.icon className="w-7 h-7 text-white" />
              </div>
              <h4 className="text-2xl font-black mb-4 text-slate-900 dark:text-white">{feature.title}</h4>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
                {feature.description}
              </p>
              <div className="flex items-center text-primary font-bold gap-2 cursor-pointer group-hover:gap-4 transition-all">
                Saiba mais <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
