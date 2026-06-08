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
        <div className="flex flex-col space-y-4 mb-24 max-w-3xl">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Excelência Operacional</span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium text-slate-900 dark:text-white leading-tight tracking-tight">
            Arquitetura pensada para <br />
            <span className="italic font-serif opacity-80">alta performance.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-200 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
          {features.map((feature, index) => (
            <div key={index} className="group p-10 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors duration-500">
              <div className="w-10 h-10 mb-8 flex items-center justify-center rounded-full border border-slate-200 dark:border-white/10 text-slate-400 group-hover:text-primary dark:group-hover:text-white transition-colors">
                <feature.icon className="w-5 h-5" />
              </div>
              <h4 className="text-xl font-medium mb-3 text-slate-900 dark:text-white tracking-tight">{feature.title}</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-light">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
