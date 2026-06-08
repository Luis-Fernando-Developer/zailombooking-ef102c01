import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "Preciso de conhecimento técnico para usar?",
    answer: "Não! O Zylo Booking foi desenhado para ser intuitivo. Em menos de 10 minutos você configura sua página e já pode começar a receber agendamentos."
  },
  {
    question: "Como os clientes acessam minha agenda?",
    answer: "Você recebe um link personalizado (ex: zylo.com.br/sua-empresa) que pode ser colocado na bio do Instagram, WhatsApp ou enviado diretamente para seus clientes."
  },
  {
    question: "O sistema funciona para qualquer tipo de negócio?",
    answer: "Sim! Ele é perfeito para qualquer profissional que trabalha com hora marcada: barbearias, salões, clínicas, estúdios de tattoo, consultórios, personal trainers e muito mais."
  },
  {
    question: "Posso cancelar a qualquer momento?",
    answer: "Com certeza. Não temos fidelidade oculta. Se sentir que o sistema não é para você, pode cancelar sua assinatura a qualquer momento com um clique."
  },
  {
    question: "Como funcionam os lembretes por WhatsApp?",
    answer: "O sistema detecta automaticamente os agendamentos e envia uma mensagem profissional para o cliente horas antes, confirmando a presença e reduzindo as chances de ele faltar."
  }
];

export function FAQ() {
  return (
    <section className="py-24 relative overflow-hidden bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-5xl font-bold mb-4">
            Dúvidas <span className="text-gradient">Frequentes</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Respondemos as principais perguntas para você começar com segurança.
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full space-y-4">
          {faqs.map((faq, index) => (
            <AccordionItem 
              key={index} 
              value={`item-${index}`}
              className="border border-primary/10 rounded-2xl px-6 bg-card/30 backdrop-blur-sm"
            >
              <AccordionTrigger className="text-left font-bold text-lg hover:text-primary transition-colors py-6">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed pb-6 text-base">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
