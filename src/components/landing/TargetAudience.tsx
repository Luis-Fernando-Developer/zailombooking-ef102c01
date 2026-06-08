import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scissors, Sparkles, Stethoscope, Briefcase } from "lucide-react";

const audiences = [
  { icon: Scissors, title: "Barbearias & Salões", desc: "Reduza filas e faltas com gestão simples." },
  { icon: Stethoscope, title: "Clínicas & Consultórios", desc: "Organização total da agenda médica." },
  { icon: Sparkles, title: "Estúdios de Estética", desc: "Páginas que vendem sua autoridade." },
  { icon: Briefcase, title: "Autônomos", desc: "Seu link na bio, seu negócio crescendo." },
];

export function TargetAudience() {
  return (
    <section className="py-24 bg-background relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl lg:text-5xl font-black text-center mb-16">
          Feito para quem <span className="text-gradient">não quer perder vendas</span>
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {audiences.map((a, i) => (
            <Card key={i} className="card-glow border-primary/20 bg-card/50">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mb-4">
                  <a.icon className="w-6 h-6 text-white" />
                </div>
                <CardTitle className="text-lg">{a.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">{a.desc}</CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}