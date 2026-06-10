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
                        <CardDescription>Configurações de preço</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="p-3 rounded-lg bg-black/20 border border-primary/5">
                          <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Mensal</p>
                          <p className="text-2xl font-bold text-gradient">{formatCurrency(plan.monthly)}</p>
                        </div>
                        
                        <div className="p-3 rounded-lg bg-black/20 border border-primary/5">
                          <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Trimestral</p>
                          <p className="text-xl font-bold text-white">{formatCurrency(plan.quarterlyMonthly)}/mês</p>
                          <p className="text-xs text-primary">Total: {formatCurrency(plan.quarterly)}</p>
                          <p className="text-[10px] text-muted-foreground">Economia de {plan.savingsQuarterly}</p>
                        </div>

                        <div className="p-3 rounded-lg bg-black/20 border border-primary/5">
                          <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Anual</p>
                          <p className="text-xl font-bold text-white">{formatCurrency(plan.annualMonthly)}/mês</p>
                          <p className="text-xs text-primary">Total: {formatCurrency(plan.annual)}</p>
                          <p className="text-[10px] text-muted-foreground">Economia de {plan.savingsAnnual}</p>
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
