import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "@/components/admin/SuperAdminSidebar";
import { BookingLogo } from "@/components/BookingLogo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard } from "lucide-react";

export default function SuperAdminPlans() {
  const plans = [
    {
      name: 'Starter',
      monthly: 79,
      quarterly: 213,
      quarterlyMonthly: 71,
      annual: 708,
      annualMonthly: 59,
      savingsQuarterly: 'R$ 24',
      savingsAnnual: 'R$ 240'
    },
    {
      name: 'Professional',
      monthly: 149,
      quarterly: 402,
      quarterlyMonthly: 134,
      annual: 1308,
      annualMonthly: 109,
      savingsQuarterly: 'R$ 45',
      savingsAnnual: 'R$ 480'
    },
    {
      name: 'Enterprise',
      monthly: 249,
      quarterly: 672,
      quarterlyMonthly: 224,
      annual: 2268,
      annualMonthly: 189,
      savingsQuarterly: 'R$ 75',
      savingsAnnual: 'R$ 720'
    }
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-hero">
        <SuperAdminSidebar />
        <SidebarInset className="flex-1 bg-transparent">
          <header className="border-b border-primary/20 bg-card/30 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center justify-between px-4 h-16">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div className="flex items-center gap-2 lg:hidden">
                  <BookingLogo showText={false} className="h-8 w-8" />
                  <span className="font-bold text-gradient">Super Admin</span>
                </div>
              </div>
            </div>
          </header>

          <main className="p-4 lg:p-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gradient mb-2">Planos</h1>
              <p className="text-muted-foreground">Configuração de planos de assinatura</p>
            </div>

            <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <CardTitle>Planos Disponíveis</CardTitle>
                </div>
                <CardDescription>Gerencie os planos e valores oferecidos para as empresas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-6">
                  {plans.map((plan) => (
                    <Card key={plan.name} className="bg-background/40 border-primary/10">
                      <CardHeader>
                        <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                        <CardDescription>Configurações e Benefícios</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="p-3 rounded-lg bg-black/20 border border-primary/5">
                          <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Preços</p>
                          <p className="text-lg font-bold text-gradient">{formatCurrency(plan.monthly)}/mês</p>
                          <p className="text-sm text-primary">Trimestral: {formatCurrency(plan.quarterlyMonthly)}/mês</p>
                          <p className="text-sm text-primary">Anual: {formatCurrency(plan.annualMonthly)}/mês</p>
                        </div>
                        
                        <div className="p-3 rounded-lg bg-black/20 border border-primary/5">
                          <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Benefícios</p>
                          <ul className="text-xs space-y-1 text-muted-foreground">
                            {plan.name === 'Starter' && (
                              <>
                                <li>200 agendamentos por Mês</li>
                                <li>1 profissional / 5 serviços</li>
                                <li>1 Chatbot básico</li>
                                <li>1 conexão WhatsApp</li>
                                <li>700 Mensagens/mês</li>
                              </>
                            )}
                            {plan.name === 'Professional' && (
                              <>
                                <li>700 Agendamentos por mês</li>
                                <li>Até 5 profissionais / 12 serviços</li>
                                <li>3 Chatbots inclusos</li>
                                <li>3 conexões WhatsApp</li>
                                <li>5.000 Mensagens/mês</li>
                              </>
                            )}
                            {plan.name === 'Enterprise' && (
                              <>
                                <li>Agendamentos Ilimitados</li>
                                <li>Profissionais/Serviços Ilimitados</li>
                                <li>Chatbots Ilimitados</li>
                                <li>Conexões WhatsApp Ilimitadas</li>
                                <li>Mensagens Ilimitadas</li>
                              </>
                            )}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
