import { Card } from "@/components/ui/card";
import { Check, Star, Quote } from "lucide-react";

const stats = [
  { label: "Usuários Ativos", value: "2.5k+" },
  { label: "Agendamentos/mês", value: "150k+" },
  { label: "Retenção", value: "98.2%" },
  { label: "Redução de Faltas", value: "85%" },
];

const testimonials = [
  {
    name: "Ricardo Mendes",
    role: "Proprietário de Clínica",
    content: "A plataforma elevou o patamar da minha empresa. O design sóbrio transmite a seriedade que nossos clientes esperam.",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
  },
  {
    name: "Juliana Costa",
    role: "Gestora de Spa",
    content: "Finalmente um software que não parece um brinquedo colorido. Funcional, rápido e extremamente elegante.",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
  }
];

export function TrustSection() {
  return (
    <section className="py-32 bg-slate-50 dark:bg-slate-900/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-24 items-center">
          <div className="space-y-12">
            <div className="space-y-6">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Escalabilidade & Confiança</span>
              <h2 className="text-4xl md:text-5xl font-medium text-slate-900 dark:text-white leading-tight tracking-tight">
                Construído para quem <br />
                <span className="italic font-serif opacity-80">não aceita menos.</span>
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-400 font-light leading-relaxed max-w-lg">
                Nossa infraestrutura foi desenhada para suportar operações complexas com zero latência, mantendo a sofisticação em cada detalhe da interface.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8">
              {stats.map((stat, i) => (
                <div key={i} className="space-y-1">
                  <div className="text-3xl font-medium text-slate-900 dark:text-white tracking-tighter">{stat.value}</div>
                  <div className="text-xs uppercase tracking-widest text-slate-500 font-bold">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="space-y-6">
              {testimonials.map((t, i) => (
                <Card key={i} className="p-8 border-none shadow-sm bg-white dark:bg-slate-950/50 backdrop-blur-sm rounded-3xl relative overflow-hidden">
                  <Quote className="absolute -right-4 -top-4 w-24 h-24 text-slate-100 dark:text-white/5 -z-0" />
                  <div className="relative z-10 space-y-4">
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, i) => <Star key={i} className="w-3 h-3 fill-primary text-primary" />)}
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 italic font-light leading-relaxed">"{t.content}"</p>
                    <div className="flex items-center gap-4 pt-4">
                      <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full grayscale" />
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">{t.name}</div>
                        <div className="text-xs text-slate-500">{t.role}</div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            {/* Subtle decor line */}
            <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-px h-1/2 bg-gradient-to-b from-transparent via-slate-200 dark:via-white/10 to-transparent hidden lg:block" />
          </div>
        </div>
      </div>
    </section>
  );
}
