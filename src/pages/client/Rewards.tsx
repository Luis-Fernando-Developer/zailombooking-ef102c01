import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Gift, Clock3, CheckCircle2, XCircle, CalendarPlus } from "lucide-react";
import { format, differenceInSeconds } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientSidebar } from "@/components/client/ClientSidebar";
import { ClientNotificationsBell } from "@/components/client/ClientNotificationsBell";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

type Achievement = {
  id: string;
  reward_id: string;
  reward_name: string;
  reward_description: string | null;
  reward_value: number;
  reward_service_ids: string[];
  earned_at: string;
  expires_at: string;
  status: "available" | "redeemed" | "expired";
  redeemed_at: string | null;
  qualifying_booking_id: string | null;
  redeemed_booking_id: string | null;
  achievement_number: number;
};

type Service = { id: string; name: string };

function countdown(expiresAt: string) {
  const seconds = Math.max(0, differenceInSeconds(new Date(expiresAt), new Date()));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h ${minutes}min` : `${hours}h ${minutes}min`;
}

export default function ClientRewards() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [company, setCompany] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [items, setItems] = useState<Achievement[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        navigate(`/${slug}/entrar?returnTo=client/premios`);
        return;
      }

      const { data: companyData, error: companyError } = await supabase
        .from("companies").select("id,name,slug").eq("slug", slug).single();
      if (companyError || !companyData) throw companyError || new Error("Empresa não encontrada");
      setCompany(companyData);

      const { data: clientData, error: clientError } = await supabase
        .from("clients").select("id,name").eq("company_id", companyData.id).eq("user_id", user.id).single();
      if (clientError || !clientData) throw clientError || new Error("Cliente não encontrado");
      setClient(clientData);

      await supabase.rpc("refresh_reward_expirations");

      const { data, error } = await supabase
        .from("client_reward_achievements")
        .select("id,reward_id,reward_name,reward_description,reward_value,reward_service_ids,earned_at,expires_at,status,redeemed_at,qualifying_booking_id,redeemed_booking_id,achievement_number")
        .eq("company_id", companyData.id)
        .eq("client_id", clientData.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = Array.from(new Set((data ?? []).flatMap((x: any) => x.reward_service_ids ?? [])));
      if (ids.length) {
        const { data: serviceRows } = await supabase.from("services").select("id,name").in("id", ids);
        setServices(serviceRows ?? []);
      } else {
        setServices([]);
      }
      setItems((data ?? []) as Achievement[]);
    } catch (e: any) {
      console.error("[ClientRewards]", e);
      toast({ title: "Erro", description: e.message || "Não foi possível carregar seus brindes.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [navigate, slug, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const available = useMemo(() => items.filter(i => i.status === "available" && new Date(i.expires_at) > now), [items, now]);
  const history = useMemo(() => items.filter(i => !(i.status === "available" && new Date(i.expires_at) > now)), [items, now]);

  const redeem = (achievement: Achievement) => {
    navigate(`/${slug}/agendar?reward_id=${encodeURIComponent(achievement.id)}`);
  };

  if (loading || !company || !client) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen w-full flex bg-gradient-hero">
        <ClientSidebar
          companySlug={company.slug}
          companyName={company.name}
          companyId={company.id}
          clientId={client.id}
          clientName={client.name}
        />
        <SidebarInset>
          <header className="h-20 border-b border-primary/20 bg-card/30 backdrop-blur-sm flex items-center px-6">
            <div>
              <h1 className="text-xl font-bold">Prêmios e Brindes</h1>
              <p className="text-sm text-muted-foreground">Seus benefícios conquistados</p>
            </div>
            <div className="ml-auto"><ClientNotificationsBell companyId={company.id} /></div>
          </header>

          <main className="p-6 md:p-8">
            <div className="max-w-6xl mx-auto space-y-8">
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Gift className="h-6 w-6 text-primary" />
                  <h2 className="text-2xl font-bold">Disponíveis</h2>
                  {available.length > 0 && <Badge>{available.length}</Badge>}
                </div>

                {available.length === 0 ? (
                  <Card><CardContent className="py-12 text-center text-muted-foreground">Você ainda não possui brindes disponíveis.</CardContent></Card>
                ) : (
                  <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {available.map(item => {
                      const names = (item.reward_service_ids ?? []).map(id => services.find(s => s.id === id)?.name).filter(Boolean);
                      return (
                        <Card key={item.id} className="border-primary/20 overflow-hidden">
                          <CardHeader>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-primary" />{item.reward_name}</CardTitle>
                                <p className="text-xs text-muted-foreground mt-1">Prêmio #{item.achievement_number}</p>
                              </div>
                              <Badge variant="secondary">{Number(item.reward_value) === 0 ? "Grátis" : `R$ ${Number(item.reward_value).toFixed(2).replace(".", ",")}`}</Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {item.reward_description && <p className="text-sm text-muted-foreground">{item.reward_description}</p>}
                            {names.length > 0 && <div><p className="text-xs text-muted-foreground mb-1">Serviços disponíveis</p><p className="text-sm font-medium">{names.join(", ")}</p></div>}
                            <div className="rounded-lg bg-primary/5 p-3 flex items-center gap-2">
                              <Clock3 className="h-4 w-4 text-primary" />
                              <div><p className="text-xs text-muted-foreground">Expira em</p><p className="font-semibold">{countdown(item.expires_at)}</p></div>
                            </div>
                            <Button className="w-full" onClick={() => redeem(item)}>
                              <CalendarPlus className="h-4 w-4 mr-2" /> Resgatar
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">Histórico</h2>
                {history.length === 0 ? (
                  <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum brinde resgatado ou expirado.</CardContent></Card>
                ) : (
                  <div className="space-y-3">
                    {history.map(item => {
                      const expired = item.status === "expired" || new Date(item.expires_at) <= now;
                      return (
                        <Card key={item.id} className="opacity-80">
                          <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                            {expired ? <XCircle className="h-5 w-5 text-muted-foreground" /> : <CheckCircle2 className="h-5 w-5 text-green-500" />}
                            <div className="flex-1">
                              <p className="font-semibold">{item.reward_name}</p>
                              <p className="text-xs text-muted-foreground">
                                Conquistado em {format(new Date(item.earned_at), "dd/MM/yyyy", { locale: ptBR })}
                                {item.redeemed_at ? ` • Resgatado em ${format(new Date(item.redeemed_at), "dd/MM/yyyy", { locale: ptBR })}` : ""}
                              </p>
                            </div>
                            <Badge variant={expired ? "outline" : "default"}>{expired ? "Expirado" : "Resgatado"}</Badge>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
