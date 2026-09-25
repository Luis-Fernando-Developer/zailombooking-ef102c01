import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { BarChart3, CalendarDays, CheckCircle2, Clock3, DollarSign, XCircle } from "lucide-react";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function BusinessReports() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [company, setCompany] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => { load(); }, [slug]);

  async function load() {
    setLoading(true);
    try {
      const [{ data: auth }, { data: c, error: ce }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("companies").select("id,name,slug").eq("slug", slug).single(),
      ]);
      if (!auth.user) throw new Error("Usuário não autenticado.");
      if (ce || !c) throw ce || new Error("Empresa não encontrada.");
      setCurrentUser(auth.user); setCompany(c);
      const { data, error } = await supabase
        .from("bookings")
        .select("id,booking_date,booking_status,payment_status,payment_method,price,client:clients(name),service:services(name),employee:employees(name)")
        .eq("company_id", c.id)
        .order("booking_date", { ascending: false });
      if (error) throw error;
      setBookings(data || []);
    } catch (error: any) {
      toast({ title: "Erro ao carregar relatório", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  const { hasPermission, loading: permissionLoading, userRole } = usePermissions(company?.id, currentUser);
  const isAdmin = userRole === "owner" || userRole === "admin";
  const allowed = isAdmin || hasPermission("reports.view_basic");

  const filtered = useMemo(() => bookings.filter((b) => (!from || b.booking_date >= from) && (!to || b.booking_date <= to)), [bookings, from, to]);
  const stats = useMemo(() => {
    const confirmed = filtered.filter((b) => ["confirmed", "completed"].includes(b.booking_status));
    const cancelled = filtered.filter((b) => b.booking_status === "cancelled");
    const pending = filtered.filter((b) => b.booking_status === "pending");
    const revenue = confirmed.reduce((sum, b) => sum + Number(b.price || 0), 0);
    const paid = filtered.filter((b) => ["confirmed", "paid", "free"].includes(String(b.payment_status || "").toLowerCase())).reduce((sum, b) => sum + Number(b.price || 0), 0);
    return { total: filtered.length, confirmed: confirmed.length, cancelled: cancelled.length, pending: pending.length, revenue, paid };
  }, [filtered]);

  const byService = useMemo(() => {
    const map = new Map<string, { name: string; count: number; revenue: number }>();
    filtered.forEach((b) => { const name = b.service?.name || "Sem serviço"; const row = map.get(name) || { name, count: 0, revenue: 0 }; row.count += 1; if (["confirmed", "completed"].includes(b.booking_status)) row.revenue += Number(b.price || 0); map.set(name, row); });
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);

  if (loading || permissionLoading || !company) return <BusinessLayout companySlug={slug || ""} companyName="Carregando..." companyId="" userRole="loading"><div className="p-10 text-center">Carregando relatório...</div></BusinessLayout>;
  if (!allowed) return <BusinessLayout companySlug={company.slug} companyName={company.name} companyId={company.id} userRole={userRole} currentUser={currentUser}><div className="p-10 text-center">Acesso negado.</div></BusinessLayout>;

  return <BusinessLayout companySlug={company.slug} companyName={company.name} companyId={company.id} userRole={userRole} currentUser={currentUser}>
    <div className="p-4 sm:p-6 sm:px-10 space-y-6">
      <div><h1 className="text-3xl font-bold text-gradient">Relatórios</h1><p className="text-muted-foreground">Indicadores dos agendamentos e faturamento do período.</p></div>
      <Card className="border-primary/20"><CardContent className="pt-6"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><Label>Data inicial</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div><Label>Data final</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></div></CardContent></Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Agendamentos</span><CalendarDays className="w-5 h-5 text-primary" /></div><p className="text-2xl font-bold mt-2">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Confirmados/concluídos</span><CheckCircle2 className="w-5 h-5 text-primary" /></div><p className="text-2xl font-bold mt-2">{stats.confirmed}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Pendentes</span><Clock3 className="w-5 h-5 text-primary" /></div><p className="text-2xl font-bold mt-2">{stats.pending}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Faturamento</span><DollarSign className="w-5 h-5 text-primary" /></div><p className="text-2xl font-bold mt-2">{money(stats.revenue)}</p></CardContent></Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Resumo do período</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex justify-between"><span>Valor pago/confirmado</span><strong>{money(stats.paid)}</strong></div><div className="flex justify-between"><span>Cancelados</span><Badge variant="destructive">{stats.cancelled}</Badge></div><div className="flex justify-between"><span>Ticket médio dos confirmados</span><strong>{money(stats.confirmed ? stats.revenue / stats.confirmed : 0)}</strong></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Serviços mais procurados</CardTitle></CardHeader><CardContent>{byService.length === 0 ? <p className="py-8 text-center text-muted-foreground">Sem dados no período.</p> : <div className="space-y-3">{byService.map((row) => <div key={row.name} className="flex items-center justify-between border-b pb-2 last:border-0"><div><p className="font-medium">{row.name}</p><p className="text-sm text-muted-foreground">{row.count} agendamento(s)</p></div><strong>{money(row.revenue)}</strong></div>)}</div>}</CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Agendamentos do período</CardTitle></CardHeader><CardContent>{filtered.length === 0 ? <div className="py-10 text-center text-muted-foreground">Nenhum registro no período.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-3 pr-4">Data</th><th className="py-3 pr-4">Cliente</th><th className="py-3 pr-4">Serviço</th><th className="py-3 pr-4">Profissional</th><th className="py-3 pr-4">Status</th><th className="py-3 text-right">Valor</th></tr></thead><tbody>{filtered.slice(0, 100).map((b) => <tr key={b.id} className="border-b last:border-0"><td className="py-3 pr-4">{b.booking_date ? new Date(`${b.booking_date}T00:00:00`).toLocaleDateString("pt-BR") : "-"}</td><td className="py-3 pr-4">{b.client?.name || "-"}</td><td className="py-3 pr-4">{b.service?.name || "-"}</td><td className="py-3 pr-4">{b.employee?.name || "-"}</td><td className="py-3 pr-4">{b.booking_status || "-"}</td><td className="py-3 text-right">{money(Number(b.price || 0))}</td></tr>)}</tbody></table></div>}</CardContent></Card>
      <p className="text-xs text-muted-foreground">{filtered.length > 100 ? "Exibindo os 100 registros mais recentes do filtro." : `${filtered.length} registro(s) no período.`}</p>
    </div>
  </BusinessLayout>;
}
