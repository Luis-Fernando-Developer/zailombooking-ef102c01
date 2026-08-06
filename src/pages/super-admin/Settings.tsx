import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "@/components/admin/SuperAdminSidebar";
import { BookingLogo } from "@/components/BookingLogo";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabaseClient";
import {
  Settings as SettingsIcon, Building2, Users, CreditCard, Smartphone,
  ShieldCheck, Zap, ExternalLink, Server, RefreshCw, MessageSquare,
} from "lucide-react";

interface SystemStats {
  companies: number;
  companiesActive: number;
  users: number;
  instances: number;
  plans: number;
}

interface HealthCheck {
  name: string;
  status: "ok" | "warn" | "error" | "checking";
  detail?: string;
}

export default function SuperAdminSettings() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [checks, setChecks] = useState<HealthCheck[]>([
    { name: "Supabase Auth", status: "checking" },
    { name: "Evolution Manager (WhatsApp)", status: "checking" },
    { name: "Zailom Flow API", status: "checking" },
  ]);
  const [loading, setLoading] = useState(false);

  async function loadStats() {
    setLoading(true);
    try {
      const [c, ca, u, i, p] = await Promise.all([
        supabase.from("companies").select("*", { count: "exact", head: true }),
        supabase.from("companies").select("*", { count: "exact", head: true }).eq("billing_status", "active"),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("whatsapp_instances").select("*", { count: "exact", head: true }),
        supabase.from("plans").select("*", { count: "exact", head: true }),
      ]);
      setStats({
        companies: c.count ?? 0,
        companiesActive: ca.count ?? 0,
        users: u.count ?? 0,
        instances: i.count ?? 0,
        plans: p.count ?? 0,
      });
    } finally {
      setLoading(false);
    }
  }

  async function runHealthChecks() {
    setChecks((prev) => prev.map((c) => ({ ...c, status: "checking" as const })));
    const next: HealthCheck[] = [];

    // Supabase Auth
    const { data: sess } = await supabase.auth.getSession();
    next.push({
      name: "Supabase Auth",
      status: sess.session ? "ok" : "warn",
      detail: sess.session ? "Sessão ativa" : "Sem sessão",
    });

    // Evolution
    try {
      const { data, error } = await supabase.functions.invoke("super-admin-list-instances", { body: {} });
      if (error) throw error;
      next.push({
        name: "Evolution Manager (WhatsApp)",
        status: "ok",
        detail: `${data?.total ?? 0} instâncias globais`,
      });
    } catch (e) {
      next.push({
        name: "Evolution Manager (WhatsApp)",
        status: "error",
        detail: (e as Error).message,
      });
    }

    // Zailom Flow (ping público)
    try {
      const res = await fetch("https://api-flowbuilder.zailom.com/functions/v1/flow-api/v1/health");
      next.push({
        name: "Zailom Flow API",
        status: res.ok ? "ok" : "warn",
        detail: `HTTP ${res.status}`,
      });
    } catch (e) {
      next.push({
        name: "Zailom Flow API",
        status: "error",
        detail: (e as Error).message,
      });
    }

    setChecks(next);
  }

  useEffect(() => {
    loadStats();
    runHealthChecks();
  }, []);

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

          <main className="p-4 lg:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-3xl font-bold text-gradient mb-1 flex items-center gap-3">
                  <SettingsIcon className="h-7 w-7" /> Configurações
                </h1>
                <p className="text-muted-foreground">Visão geral do sistema, saúde dos serviços e atalhos administrativos.</p>
              </div>
              <Button variant="outline" onClick={() => { loadStats(); runHealthChecks(); }} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
              </Button>
            </div>

            {/* Estatísticas gerais */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { label: "Empresas", value: stats?.companies ?? "—", icon: Building2 },
                { label: "Ativas", value: stats?.companiesActive ?? "—", icon: ShieldCheck },
                { label: "Usuários", value: stats?.users ?? "—", icon: Users },
                { label: "Instâncias WA", value: stats?.instances ?? "—", icon: Smartphone },
                { label: "Planos", value: stats?.plans ?? "—", icon: CreditCard },
              ].map(({ label, value, icon: Icon }) => (
                <Card key={label} className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
                  <CardContent className="p-4 flex flex-col items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <div className="text-2xl font-bold text-gradient">{value}</div>
                    <div className="text-xs text-muted-foreground text-center">{label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Saúde do sistema */}
              <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-primary" /> Saúde do sistema
                  </CardTitle>
                  <CardDescription>Status em tempo real dos serviços críticos.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {checks.map((c) => (
                    <div key={c.name} className="flex items-center justify-between p-3 rounded-md border border-primary/10 bg-card/40">
                      <div>
                        <div className="text-sm font-medium">{c.name}</div>
                        {c.detail && <div className="text-xs text-muted-foreground">{c.detail}</div>}
                      </div>
                      {c.status === "ok" && <Badge className="bg-green-600">Online</Badge>}
                      {c.status === "warn" && <Badge className="bg-amber-500">Atenção</Badge>}
                      {c.status === "error" && <Badge variant="destructive">Falha</Badge>}
                      {c.status === "checking" && <Badge variant="outline">Verificando…</Badge>}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Atalhos */}
              <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" /> Atalhos administrativos
                  </CardTitle>
                  <CardDescription>Acesso rápido às áreas de gestão global.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { to: "/super-admin/dashboard", label: "Dashboard", icon: Building2 },
                    { to: "/super-admin/plans", label: "Planos & Limites", icon: CreditCard },
                    { to: "/super-admin/instances", label: "Instâncias WhatsApp", icon: Smartphone },
                    { to: "/super-admin/gateways", label: "Gateways de Pagamento", icon: CreditCard },
                    { to: "/super-admin/feature-registry", label: "Feature Registry", icon: ShieldCheck },
                    { to: "/super-admin/release-notes", label: "Release Notes", icon: MessageSquare },
                  ].map(({ to, label, icon: Icon }) => (
                    <Button key={to} asChild variant="outline" className="justify-start h-auto py-3">
                      <Link to={to}>
                        <Icon className="h-4 w-4 mr-2 text-primary" /> {label}
                      </Link>
                    </Button>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Informações do ambiente */}
            <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" /> Ambiente
                </CardTitle>
                <CardDescription>Parâmetros globais desta instalação.</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Row label="Modo">
                  <Badge variant="secondary">{import.meta.env.MODE}</Badge>
                </Row>
                <Row label="URL do painel">
                  <code className="text-xs bg-muted px-2 py-0.5 rounded truncate max-w-[220px]">{window.location.origin}</code>
                </Row>
                <Row label="Supabase URL">
                  <code className="text-xs bg-muted px-2 py-0.5 rounded truncate max-w-[220px]">
                    {import.meta.env.VITE_SUPABASE_URL ?? "—"}
                  </code>
                </Row>
                <Row label="Publicação">
                  <a href="https://zailom.com" target="_blank" rel="noopener" className="text-primary inline-flex items-center gap-1">
                    zailom.com <ExternalLink className="h-3 w-3" />
                  </a>
                </Row>
                <Separator className="sm:col-span-2 my-2" />
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  Secrets globais (chaves da Evolution, Zailom Flow, gateways) são geridos via variáveis de ambiente das Edge Functions.
                  Para adicionar ou rotacionar, use o painel de secrets do Supabase.
                </p>
              </CardContent>
            </Card>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
