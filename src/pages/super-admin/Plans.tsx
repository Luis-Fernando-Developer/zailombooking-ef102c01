import { useEffect, useState, useCallback } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "@/components/admin/SuperAdminSidebar";
import { BookingLogo } from "@/components/BookingLogo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Pencil, Infinity as InfinityIcon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { PlanEditDialog, type PlanLimitRow } from "@/components/admin/PlanEditDialog";

function fmtLimit(v: number | null | undefined) {
  if (v === -1 || v === null || v === undefined) return "Ilimitado";
  return String(v);
}

export default function SuperAdminPlans() {
  const [plans, setPlans] = useState<PlanLimitRow[]>([]);
  const [editing, setEditing] = useState<PlanLimitRow | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("plan_limits").select("*").order("max_employees");
    setPlans((data ?? []) as PlanLimitRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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
              <p className="text-muted-foreground">Edite limites e beneficios dos planos.</p>
            </div>

            <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <CardTitle>Planos Disponiveis</CardTitle>
                </div>
                <CardDescription>Os valores aqui viram fonte da verdade para bloqueios.</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Carregando...</p>
                ) : (
                  <div className="grid md:grid-cols-3 gap-6">
                    {plans.map((p) => (
                      <Card key={p.plan_id} className="bg-background/40 border-primary/10">
                        <CardHeader className="flex-row justify-between items-start space-y-0">
                          <div>
                            <CardTitle className="text-xl font-bold">{p.plan_name}</CardTitle>
                            <CardDescription className="mt-1">
                              {p.white_label ? (
                                <Badge variant="default">White label</Badge>
                              ) : (
                                <Badge variant="outline">Padrao</Badge>
                              )}
                            </CardDescription>
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <LimitLine label="Profissionais" v={p.max_employees} />
                          <LimitLine label="Servicos" v={p.max_services} />
                          <LimitLine label="Agendamentos / mes" v={p.max_bookings_month} />
                          <LimitLine label="Chatbots" v={p.max_chatbots} />
                          <LimitLine label="Mensagens / mes" v={p.max_chatbot_messages} />
                          <LimitLine label="Integracoes" v={p.max_integrations} />
                          <LimitLine label="Instancias WhatsApp" v={p.max_whatsapp_instances} />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </main>
        </SidebarInset>
      </div>

      <PlanEditDialog plan={editing} open={open} onOpenChange={setOpen} onSaved={load} />
    </SidebarProvider>
  );
}

function LimitLine({ label, v }: { label: string; v: number | null | undefined }) {
  const unlimited = v === -1 || v === null || v === undefined;
  return (
    <div className="flex justify-between items-center py-1 border-b border-primary/5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">
        {unlimited ? <InfinityIcon className="w-4 h-4 inline text-primary" /> : fmtLimit(v)}
      </span>
    </div>
  );
}
