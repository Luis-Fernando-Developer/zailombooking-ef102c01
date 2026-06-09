import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "@/components/admin/SuperAdminSidebar";
import { BookingLogo } from "@/components/BookingLogo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard } from "lucide-react";

export default function SuperAdminPlans() {
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
                  {/* Mocked plans */}
                  {['Starter', 'Professional', 'Enterprise'].map((plan) => (
                    <Card key={plan} className="bg-background/40 border-primary/10">
                      <CardHeader>
                        <CardTitle className="text-lg">{plan}</CardTitle>
                        <CardDescription>Recursos do plano {plan}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-gradient">R$ 99,00/mês</p>
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
