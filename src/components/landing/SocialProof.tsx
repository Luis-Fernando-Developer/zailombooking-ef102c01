import { CheckCircle2 } from "lucide-react";

const socialProof = [
  {
    name: "Dra. Ana Silva",
    role: "Proprietária de Clínica de Estética",
    content: "O Zylo Booking mudou o jogo. Meus clientes adoram a facilidade de agendar pelo celular e eu parei de perder tempo no WhatsApp.",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150"
  },
  {
    name: "Ricardo Santos",
    role: "CEO da Barbearia Vintage",
    content: "A redução de faltas foi imediata com os lembretes automáticos. O faturamento subiu 25% no primeiro mês.",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150"
  },
  {
    name: "Clara Mendes",
    role: "Personal Trainer",
    content: "Simples, rápido e eficiente. Agora consigo focar no treino dos meus alunos enquanto a agenda trabalha para mim.",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=150"
  }
];

export function SocialProof() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold mb-4">
            Quem <span className="text-gradient">já acelerou</span> com o Zylo Booking
          </h2>
          <p className="text-muted-foreground text-lg">
            Junte-se a centenas de profissionais que transformaram a gestão de seus negócios.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {socialProof.map((testimonial, index) => (
            <div key={index} className="card-glow bg-card/40 backdrop-blur-md p-8 rounded-2xl border border-primary/10 relative">
              <div className="flex items-center gap-4 mb-6">
                <img src={testimonial.image} alt={testimonial.name} className="w-12 h-12 rounded-full object-cover" />
                <div>
                  <h4 className="font-bold text-foreground">{testimonial.name}</h4>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
              <p className="text-muted-foreground italic">"{testimonial.content}"</p>
              <div className="absolute top-4 right-4">
                <CheckCircle2 className="text-primary w-5 h-5 opacity-50" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
