import { CheckCircle2, Star, ShieldCheck, Trophy } from "lucide-react";

export function TrustSection() {
  const stats = [
    { label: "Agendamentos Realizados", value: "500k+" },
    { label: "Empresas Ativas", value: "2.500+" },
    { label: "Satisfação dos Clientes", value: "4.9/5" },
    { label: "Tempo de Resposta", value: "< 2min" },
  ];

  return (
    <section className="py-24 relative overflow-hidden bg-card/30 border-y border-primary/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid md:grid-cols-4 gap-8 mb-20 text-center">
          {stats.map((stat, i) => (
            <div key={i} className="space-y-2">
              <div className="text-4xl font-extrabold text-gradient">{stat.value}</div>
              <div className="text-muted-foreground text-sm uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-3xl lg:text-4xl font-bold mb-6 leading-tight">
              Por que os maiores players do mercado escolheram o <span className="text-primary">Zylo Booking</span>?
            </h2>
            <div className="space-y-6">
              {[
                { title: "Segurança de Nível Bancário", desc: "Seus dados e de seus clientes protegidos com criptografia de ponta a ponta.", icon: ShieldCheck },
                { title: "Escalabilidade Sem Limites", desc: "Cresça sua equipe e suas unidades sem se preocupar com gargalos técnicos.", icon: Trophy },
                { title: "Suporte VIP Real", desc: "Humanos que entendem do seu negócio prontos para te ajudar em segundos.", icon: CheckCircle2 },
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="mt-1 flex-shrink-0">
                    <item.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg">{item.title}</h4>
                    <p className="text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-primary p-1 rounded-2xl rotate-1">
            <div className="bg-background rounded-2xl p-8 space-y-6">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="w-5 h-5 fill-primary text-primary" />
                ))}
              </div>
              <p className="text-xl italic font-medium">
                "Desde que migramos para o Zylo, nosso faturamento subiu 35% apenas pela facilidade que o cliente tem de agendar. O sistema de lembretes pelo WhatsApp eliminou quase todos os no-shows."
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center font-bold text-primary">RC</div>
                <div>
                  <div className="font-bold">Ricardo Camargo</div>
                  <div className="text-sm text-muted-foreground">CEO da BarberPremium</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
