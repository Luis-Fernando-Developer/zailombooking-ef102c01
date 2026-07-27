import { useEffect, useState } from "react";
import { SuperAdminSidebar } from "@/components/admin/SuperAdminSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, CreditCard, DollarSign, RefreshCw, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Skeleton } from "@/components/ui/skeleton";

type GatewayInfo = {
  key: string;
  name: string;
  description: string;
  icon: any;
  secretsRequired: string[];
  docsUrl?: string;
};

const GATEWAYS: GatewayInfo[] = [
  {
    key: "asaas",
    name: "Asaas",
    description: "Gateway padrão para checkout de assinaturas e pagamentos de agendamentos (Pix, boleto, cartão).",
    icon: Wallet,
    secretsRequired: ["ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"],
    docsUrl: "https://docs.asaas.com/",
  },
  {
    key: "stripe",
    name: "Stripe",
    description: "Alternativa internacional (cartões, assinaturas recorrentes).",
    icon: CreditCard,
    secretsRequired: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    docsUrl: "https://stripe.com/docs",
  },
];

export default function SuperAdminGateways() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ totalRevenue: number; activeSubs: number; pending: number }>({
    totalRevenue: 0, activeSubs: 0, pending: 0,
  });

  const load = async () => {
    setLoading(true);
    // Faturamento consolidado
    const { data: payments } = await supabase
      .from("booking_payments")
      .select("amount,status");
    const totalRevenue = (payments ?? []).filter((p: any) => ["paid", "confirmed", "received"].includes(String(p.status).toLowerCase()))
      .reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    const pending = (payments ?? []).filter((p: any) => String(p.status).toLowerCase() === "pending").length;

    const { count: activeSubs } = await supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    setStats({ totalRevenue, activeSubs: activeSubs ?? 0, pending });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <SuperAdminSidebar />
        <div className="flex-1 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Wallet className="h-7 w-7" /> Gateways de Pagamento
              </h1>
              <p className="text-muted-foreground">
                Controle central dos provedores de pagamento usados na plataforma.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
            </Button>
          </div>

          {/* Faturamento consolidado */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Faturamento total</CardDescription>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  {loading ? <Skeleton className="h-6 w-24" /> : `R$ ${stats.totalRevenue.toFixed(2)}`}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Empresas ativas</CardDescription>
                <CardTitle className="text-2xl">
                  {loading ? <Skeleton className="h-6 w-16" /> : stats.activeSubs}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pagamentos pendentes</CardDescription>
                <CardTitle className="text-2xl">
                  {loading ? <Skeleton className="h-6 w-16" /> : stats.pending}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Gateways */}
          <div className="grid gap-4 md:grid-cols-2">
            {GATEWAYS.map((g) => {
              const Icon = g.icon;
              return (
                <Card key={g.key}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Icon className="h-5 w-5" /> {g.name}
                      </CardTitle>
                      <Badge variant={g.key === "asaas" ? "default" : "secondary"}>
                        {g.key === "asaas" ? "Ativo" : "Opcional"}
                      </Badge>
                    </div>
                    <CardDescription>{g.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="text-sm font-medium mb-2">Secrets necessários</div>
                      <div className="flex flex-wrap gap-2">
                        {g.secretsRequired.map((s) => (
                          <Badge key={s} variant="outline" className="font-mono text-xs">{s}</Badge>
                        ))}
                      </div>
                    </div>
                    {g.docsUrl && (
                      <a
                        href={g.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        Documentação <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <p className="text-xs text-muted-foreground pt-2 border-t">
                      As chaves são armazenadas via Supabase Secrets (não visíveis nesta tela por segurança).
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Checkout personalizado</CardTitle>
              <CardDescription>
                A configuração de checkout (moeda, retorno, split, taxas) é herdada do provedor ativo.
                Ajustes granulares por empresa ficam em <span className="font-mono">/:slug/admin/faturamento</span>.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </SidebarProvider>
  );
}
