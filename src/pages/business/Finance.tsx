import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowDownToLine, Clock3, CreditCard, DollarSign, Search, WalletCards } from "lucide-react";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusLabel: Record<string, string> = { pending: "Pendente", paid: "Pago", confirmed: "Confirmado", cancelled: "Cancelado", failed: "Falhou", refunded: "Estornado", free: "Isento" };

export default function BusinessFinance() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [company, setCompany] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");

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
      setCurrentUser(auth.user);
      setCompany(c);

      // Use only columns confirmed to exist in booking_payments.
      // The payment gateway identifier is not needed by this page.
      const { data: paymentRows, error: paymentError } = await supabase
        .from("booking_payments")
        .select("id,booking_id,status,method,amount,created_at,paid_at")
        .eq("company_id", c.id)
        .order("created_at", { ascending: false });
      if (paymentError) throw paymentError;

      const rows = paymentRows || [];
      const bookingIds = Array.from(new Set(rows.map((p) => p.booking_id).filter(Boolean)));
      let bookings: any[] = [];

      if (bookingIds.length > 0) {
        const { data, error } = await supabase
          .from("bookings")
          .select("id,booking_date,client_id,service_id")
          .eq("company_id", c.id)
          .in("id", bookingIds);
        if (error) throw error;
        bookings = data || [];
      }

      const clientIds = Array.from(new Set(bookings.map((b) => b.client_id).filter(Boolean)));
      const serviceIds = Array.from(new Set(bookings.map((b) => b.service_id).filter(Boolean)));
      const [clientsResult, servicesResult] = await Promise.all([
        clientIds.length ? supabase.from("clients").select("id,name").eq("company_id", c.id).in("id", clientIds) : Promise.resolve({ data: [], error: null }),
        serviceIds.length ? supabase.from("services").select("id,name").eq("company_id", c.id).in("id", serviceIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (clientsResult.error) throw clientsResult.error;
      if (servicesResult.error) throw servicesResult.error;

      const clientsById = new Map((clientsResult.data || []).map((client: any) => [client.id, client]));
      const servicesById = new Map((servicesResult.data || []).map((service: any) => [service.id, service]));
      const bookingsById = new Map(bookings.map((booking) => [booking.id, {
        ...booking,
        client: clientsById.get(booking.client_id) || null,
        service: servicesById.get(booking.service_id) || null,
      }]));

      setPayments(rows.map((payment) => ({ ...payment, booking: bookingsById.get(payment.booking_id) || null })));
    } catch (error: any) {
      toast({ title: "Erro ao carregar financeiro", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  const { hasPermission, loading: permissionLoading, userRole } = usePermissions(company?.id, currentUser);
  const isAdmin = userRole === "owner" || userRole === "admin";
  const allowed = isAdmin || hasPermission("finance.view");

  const filtered = useMemo(() => payments.filter((p) => {
    const date = String(p.created_at || "").slice(0, 10);
    const q = search.trim().toLowerCase();
    const text = [p.status, p.method, p.booking?.client?.name, p.booking?.service?.name].map((v) => String(v ?? "").toLowerCase()).join(" ");
    return (!from || date >= from) && (!to || date <= to) && (!q || text.includes(q));
  }), [payments, from, to, search]);

  const totals = useMemo(() => {
    const paid = filtered.filter((p) => ["paid", "confirmed", "free"].includes(String(p.status).toLowerCase()));
    const pending = filtered.filter((p) => String(p.status).toLowerCase() === "pending");
    const cancelled = filtered.filter((p) => ["cancelled", "failed", "refunded"].includes(String(p.status).toLowerCase()));
    return {
      total: filtered.reduce((s, p) => s + Number(p.amount || 0), 0),
      paid: paid.reduce((s, p) => s + Number(p.amount || 0), 0),
      pending: pending.reduce((s, p) => s + Number(p.amount || 0), 0),
      cancelled: cancelled.reduce((s, p) => s + Number(p.amount || 0), 0),
      count: filtered.length,
    };
  }, [filtered]);

  if (loading || permissionLoading || !company) return <BusinessLayout companySlug={slug || ""} companyName="Carregando..." companyId="" userRole="loading"><div className="p-10 text-center">Carregando financeiro...</div></BusinessLayout>;
  if (!allowed) return <BusinessLayout companySlug={company.slug} companyName={company.name} companyId={company.id} userRole={userRole} currentUser={currentUser}><div className="p-10 text-center">Acesso negado.</div></BusinessLayout>;

  return <BusinessLayout companySlug={company.slug} companyName={company.name} companyId={company.id} userRole={userRole} currentUser={currentUser}>
    <div className="p-4 sm:p-6 sm:px-10 space-y-6">
      <div><h1 className="text-3xl font-bold text-gradient">Financeiro</h1><p className="text-muted-foreground">Acompanhe os pagamentos dos agendamentos desta empresa.</p></div>
      <Card className="border-primary/20"><CardContent className="pt-6"><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div><Label>Data inicial</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div><Label>Data final</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div><div><Label>Buscar</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Cliente, serviço ou pagamento..." value={search} onChange={(e) => setSearch(e.target.value)} /></div></div></div></CardContent></Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex justify-between"><span className="text-sm text-muted-foreground">Movimentado</span><WalletCards className="w-5 h-5 text-primary" /></div><p className="text-2xl font-bold mt-2">{money(totals.total)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex justify-between"><span className="text-sm text-muted-foreground">Recebido</span><DollarSign className="w-5 h-5 text-primary" /></div><p className="text-2xl font-bold mt-2">{money(totals.paid)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex justify-between"><span className="text-sm text-muted-foreground">Pendente</span><Clock3 className="w-5 h-5 text-primary" /></div><p className="text-2xl font-bold mt-2">{money(totals.pending)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex justify-between"><span className="text-sm text-muted-foreground">Cancelado/estornado</span><ArrowDownToLine className="w-5 h-5 text-primary" /></div><p className="text-2xl font-bold mt-2">{money(totals.cancelled)}</p></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Pagamentos</CardTitle></CardHeader><CardContent>{filtered.length === 0 ? <div className="py-10 text-center text-muted-foreground">Nenhum pagamento no período.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-3 pr-4">Data</th><th className="py-3 pr-4">Cliente</th><th className="py-3 pr-4">Serviço</th><th className="py-3 pr-4">Método</th><th className="py-3 pr-4">Status</th><th className="py-3 text-right">Valor</th></tr></thead><tbody>{filtered.slice(0, 100).map((p) => <tr key={p.id} className="border-b last:border-0"><td className="py-3 pr-4">{p.created_at ? new Date(p.created_at).toLocaleDateString("pt-BR") : "-"}</td><td className="py-3 pr-4">{p.booking?.client?.name || "-"}</td><td className="py-3 pr-4">{p.booking?.service?.name || "-"}</td><td className="py-3 pr-4"><span className="inline-flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" />{p.method || "-"}</span></td><td className="py-3 pr-4"><Badge variant={p.status === "paid" || p.status === "confirmed" ? "default" : p.status === "pending" ? "secondary" : "destructive"}>{statusLabel[p.status] || p.status || "-"}</Badge></td><td className="py-3 text-right">{money(Number(p.amount || 0))}</td></tr>)}</tbody></table></div>}<p className="text-xs text-muted-foreground mt-4">{filtered.length > 100 ? "Exibindo os 100 pagamentos mais recentes do filtro." : `${totals.count} pagamento(s) no período.`}</p></CardContent></Card>
    </div>
  </BusinessLayout>;
}
