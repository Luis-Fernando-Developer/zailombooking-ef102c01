import { CheckCircle2, Star } from "lucide-react";

const socialProof = [
  {
    name: "Dra. Ana Silva",
    role: "Clínica Renova Estética",
    content: "O Zailom Booking mudou o jogo. Meus clientes adoram a facilidade de agendar pelo celular e eu parei de perder 2 horas por dia no WhatsApp respondendo dúvidas básicas.",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150"
  },
  {
    name: "Ricardo Santos",
    role: "Barbearia Vintage Club",
    content: "A redução de faltas foi imediata com os lembretes automáticos. O faturamento subiu 25% no primeiro mês apenas porque as cadeiras não ficam mais vazias por esquecimento.",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150"
  },
  {
    name: "Clara Mendes",
    role: "Studio Pilates Clara",
    content: "Simples, rápido e eficiente. Agora consigo focar no atendimento enquanto a agenda trabalha para mim. Meus alunos acharam super profissional a nova página.",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=150"
  }
];

export function SocialProof() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl lg:text-5xl font-black mb-6">
            Quem <span className="text-gradient">já domina a agenda</span>
          </h2>
          <p className="text-muted-foreground text-xl max-w-2xl mx-auto leading-relaxed">
            Junte-se a centenas de empresários que decidiram parar de perder tempo e começaram a lucrar de verdade com automação.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {socialProof.map((testimonial, index) => (
            <div key={index} className="card-glow bg-card/40 backdrop-blur-md p-10 rounded-2xl border border-primary/10 relative group">
              <div className="flex gap-1 mb-6">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                ))}
              </div>
              <p className="text-muted-foreground italic text-lg mb-8 leading-relaxed">"{testimonial.content}"</p>
              <div className="flex items-center gap-4 mt-auto">
                <img src={testimonial.image} alt={testimonial.name} className="w-14 h-14 rounded-full object-cover border-2 border-primary/20" />
                <div>
                  <h4 className="font-black text-white">{testimonial.name}</h4>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
              <div className="absolute top-6 right-6">
                <CheckCircle2 className="text-primary w-6 h-6 opacity-40 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}