import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "Preciso baixar algum aplicativo?",
    answer: "Não! O Zailom Booking é 100% online. Você acessa pelo navegador (celular ou PC) e seus clientes também. Sem ocupar memória no celular de ninguém."
  },
  {
    question: "É difícil de configurar?",
    answer: "De forma alguma. O sistema foi desenhado para quem não tem tempo a perder. Em menos de 10 minutos sua página está no ar e pronta para receber agendamentos."
  },
  {
    question: "Como os clientes encontram minha página?",
    answer: "Você recebe um link exclusivo (ex: zailom.com/sua-marca). Basta colocar na Bio do seu Instagram e WhatsApp. É o fim do 'me manda os horários'."
  },
  {
    question: "Posso cancelar quando eu quiser?",
    answer: "Sim! Não acreditamos em fidelidade forçada. Se você não estiver satisfeito (o que duvidamos), pode cancelar sua assinatura com um clique no painel."
  },
  {
    question: "O lembrete de WhatsApp é pago à parte?",
    answer: "Não, os lembretes automáticos já estão inclusos nos planos Prata, Ouro e Diamante. Nosso foco é garantir que seu cliente não falte."
  }
];

export function FAQ() {
  return (
    <section className="py-24 bg-background relative overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl lg:text-6xl font-black mb-6">
            Objeções? <span className="text-gradient">Nós resolvemos.</span>
          </h2>
          <p className="text-muted-foreground text-xl">
            Tudo o que você precisa saber para começar a automatizar hoje.
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full space-y-4">
          {faqs.map((faq, index) => (
            <AccordionItem key={index} value={`item-${index}`} className="border border-primary/10 rounded-2xl px-8 bg-card/30 backdrop-blur-sm">
              <AccordionTrigger className="text-left font-black text-xl hover:text-primary transition-colors py-8">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed pb-8 text-lg">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}