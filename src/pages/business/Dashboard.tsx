import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import {
  CalendarIcon, Users, DollarSign, TrendingUp, Clock, CheckCircle,
  XCircle, AlertCircle, Activity, UserMinus, Repeat2, Star, Scissors,
  Wallet, CreditCard, Banknote, UserX,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Link } from "react-router-dom";
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth, subDays,
  subMonths, format,
} from "date-fns";
import { useDashboardData, DateRange } from "@/hooks/useDashboardData";
import { MetricGroup, PieDistribution, BarRanking, EmptyChart } from "@/components/business/dashboard/MetricGroup";

// ─── InconsistencyAlert (preserved) ───────────────────────────────────────────
function InconsistencyAlert({ companyId, companySlug }: { companyId: string; companySlug: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: flags } = await supabase
        .from("bookings_needing_action")
        .select("id, is_inconsistent")
        .eq("company_id", companyId);
      const ids = (flags || []).filter((r: any) => r.is_inconsistent).map((r: any) => r.id);
      if (ids.length === 0) { setItems([]); return; }
      const { data: rows } = await supabase
        .from("bookings")
        .select("id, booking_date, start_time, booking_status, client:clients(name), service:services(name), combo:service_combos(name), employee:employees(name)")
        .in("id", ids)
        .order("booking_date", { ascending: true });
      setItems(rows || []);
    })();
  }, [companyId]);

  const count = items.length;
  if (!count) return null;

  const fmtDate = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("pt-BR");
  };
  const fmtTime = (t: string) => {
    if (!t) return "";
    if (t.includes("T")) return t.split("T")[1].slice(0, 5);
    return t.slice(0, 5);
  };

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
            <div>
              <p className="font-medium">
                {count} agendamento{count > 1 ? "s" : ""} fora da escala atual
              </p>
              <p className="text-sm text-muted-foreground">
                Profissional ficou indisponível. Realoque para liberar a agenda.
              </p>
            </div>
          </div>
          <button onClick={() => setOpen((v) => !v)} className="text-sm font-medium text-primary hover:underline shrink-0">
            {open ? "Ocultar" : "Ver detalhes"}
          </button>
        </div>
        {open && (
          <div className="space-y-2 pt-2 border-t border-destructive/20">
            {items.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-background/40 border border-primary/10">
                <div className="text-sm space-y-0.5 min-w-0">
                  <p className="font-medium truncate">{b.client?.name || "Cliente"} — {b.combo?.name || b.service?.name || "Serviço"}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(b.booking_date)} às {fmtTime(b.start_time)} · Prof.: {b.employee?.name || "—"}</p>
                </div>
                <Link to={`/${companySlug}/admin/agendamentos?bookingId=${b.id}`} className="text-sm font-medium text-primary hover:underline shrink-0">
                  Resolver →
                </Link>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function StatCard({
  title, value, description, icon: Icon, iconColor,
}: {
  title: string; value: string | number; description?: string;
  icon?: React.ElementType; iconColor?: string;
}) {
  return (
    <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && <Icon className={`h-4 w-4 ${iconColor ?? "text-muted-foreground"}`} />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-gradient">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        {/* TODO: comparação com período anterior */}
      </CardContent>
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold text-gradient mb-4">{children}</h2>;
}

function SkeletonCards({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: n }).map((_, i) => (
        <Card key={i} className="bg-card/50 border-primary/20">
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Period filter helpers ─────────────────────────────────────────────────────
type PeriodKey =
  | "today" | "yesterday" | "last7" | "last15" | "last30"
  | "thisMonth" | "lastMonth" | "custom";

function rangeForPeriod(key: PeriodKey): DateRange {
  const now = new Date();
  switch (key) {
    case "today": return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last7": return { from: subDays(now, 6), to: now };
    case "last15": return { from: subDays(now, 14), to: now };
    case "last30": return { from: subDays(now, 29), to: now };
    case "thisMonth": return { from: startOfMonth(now), to: endOfMonth(now) };
    case "lastMonth": {
      const lm = subMonths(now, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    default: return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  last7: "Últimos 7 dias",
  last15: "Últimos 15 dias",
  last30: "Últimos 30 dias",
  thisMonth: "Este mês",
  lastMonth: "Mês passado",
  custom: "Personalizado",
};

// ─── Main Component ────────────────────────────────────────────────────────────
export default function BusinessDashboard() {
  const { slug } = useParams();
  const [company, setCompany] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [companyLoading, setCompanyLoading] = useState(true);

  const [period, setPeriod] = useState<PeriodKey>("thisMonth");
  const [range, setRange] = useState<DateRange>(rangeForPeriod("thisMonth"));
  const [customOpen, setCustomOpen] = useState(false);
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});

  const handlePeriodChange = useCallback((key: PeriodKey) => {
    setPeriod(key);
    if (key !== "custom") setRange(rangeForPeriod(key));
    else setCustomOpen(true);
  }, []);

  const applyCustomRange = useCallback(() => {
    if (customRange.from && customRange.to) {
      setRange({ from: customRange.from, to: customRange.to });
      setCustomOpen(false);
    }
  }, [customRange]);

  useEffect(() => {
    (async () => {
      try {
        const { data: companyData } = await supabase
          .from("companies").select("*").eq("slug", slug).single();
        if (!companyData) return;
        setCompany(companyData);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUser(user);
          const { data: emp } = await supabase
            .from("employees").select("*")
            .eq("company_id", companyData.id).eq("user_id", user.id).single();
          setEmployee(emp);
        }
      } catch (e) { console.error(e); }
      finally { setCompanyLoading(false); }
    })();
  }, [slug]);

  const { data, loading } = useDashboardData(company?.id ?? null, range);

  if (companyLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  if (!company || !employee) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gradient mb-4">Acesso Negado</h2>
          <p className="text-muted-foreground">Você não tem permissão para acessar este painel.</p>
        </div>
      </div>
    );
  }

  const d = data;
  const netBalance = d.revenue - d.toRepayAutonomous;

  return (
    <BusinessLayout
      companySlug={company.slug}
      companyName={company.name}
      companyId={company.id}
      userRole={employee.role}
      currentUser={currentUser}
    >
      <div className="p-6 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gradient mb-2">
            Bem-vindo, {employee.name}!
          </h1>
          <p className="text-muted-foreground">Painel completo de gestão do seu estabelecimento.</p>
        </div>

        <InconsistencyAlert companyId={company.id} companySlug={company.slug} />

        {/* ── GLOBAL FILTER (sticky) ── */}
        <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-background/80 backdrop-blur-md border-b border-primary/10 flex flex-wrap gap-3 items-center">
          <span className="text-sm font-medium text-muted-foreground">Período:</span>
          <Select value={period} onValueChange={(v) => handlePeriodChange(v as PeriodKey)}>
            <SelectTrigger className="w-48 bg-card/50 border-primary/20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((k) => (
                <SelectItem key={k} value={k}>{PERIOD_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {period === "custom" && (
            <Popover open={customOpen} onOpenChange={setCustomOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="border-primary/20 gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {customRange.from && customRange.to
                    ? `${format(customRange.from, "dd/MM/yyyy")} – ${format(customRange.to, "dd/MM/yyyy")}`
                    : "Selecionar datas"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={{ from: customRange.from, to: customRange.to }}
                  onSelect={(r) => setCustomRange({ from: r?.from, to: r?.to })}
                  numberOfMonths={2}
                />
                <div className="p-3 border-t border-primary/10 flex justify-end">
                  <Button size="sm" onClick={applyCustomRange} disabled={!customRange.from || !customRange.to}>
                    Aplicar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {format(range.from, "dd/MM/yyyy")} – {format(range.to, "dd/MM/yyyy")}
          </span>
        </div>

        {/* ══ GROUP 1 — Indicadores Principais ══ */}
        <section>
          <SectionTitle>📊 Indicadores Principais</SectionTitle>
          {loading ? <SkeletonCards n={4} /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Agendamentos" value={d.bookingsCount} description="no período" icon={CalendarIcon} />
              <StatCard title="Receita" value={BRL(d.revenue)} description="confirmados + concluídos" icon={DollarSign} />
              <StatCard title="Novos Clientes" value={d.newClients} description="cadastrados no período" icon={Users} />
              <StatCard title="Ticket Médio" value={BRL(d.avgTicket)} description="por atendimento" icon={TrendingUp} />
            </div>
          )}
        </section>

        {/* ══ GROUP 2 — Operação ══ */}
        <section>
          <SectionTitle>⚙️ Operação</SectionTitle>
          {loading ? <SkeletonCards n={4} /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Cancelamentos" value={d.cancellations} description="no período" icon={XCircle} iconColor="text-destructive" />
              <StatCard title="Taxa de Comparecimento" value={`${d.attendanceRate}%`} description="concluídos / (concluídos + não compareceu)" icon={CheckCircle} iconColor="text-green-500" />
              <StatCard title="Novos Clientes" value={d.newClients} description="cadastrados no período" icon={Users} />
              <StatCard title="Tempo Médio" value={d.avgDurationMinutes > 0 ? `${d.avgDurationMinutes} min` : "—"} description="dos atendimentos concluídos" icon={Clock} />
            </div>
          )}
        </section>

        {/* ══ GROUP 3 — Financeiro ══ */}
        {loading ? (
          <section><SectionTitle>💳 Financeiro — Formas de Pagamento</SectionTitle><SkeletonCards n={3} /></section>
        ) : (
          <MetricGroup
            title="💳 Financeiro — Formas de Pagamento"
            storageKey="financeiro"
            numbers={
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="Recebido via Pix" value={BRL(d.receivedPix)} description="pagamentos Pix no período" icon={Wallet} iconColor="text-green-400" />
                <StatCard title="Recebido via Cartão" value={BRL(d.receivedCard)} description="crédito / débito" icon={CreditCard} iconColor="text-blue-400" />
                <StatCard title="Recebido em Dinheiro" value={BRL(d.receivedCash)} description="pagamentos em espécie" icon={Banknote} iconColor="text-yellow-400" />
              </div>
            }
            chart={
              (d.receivedPix + d.receivedCard + d.receivedCash) > 0 ? (
                <PieDistribution
                  data={[
                    { name: "Pix", value: d.receivedPix },
                    { name: "Cartão", value: d.receivedCard },
                    { name: "Dinheiro", value: d.receivedCash },
                  ].filter((x) => x.value > 0)}
                  valueFormatter={BRL}
                />
              ) : <EmptyChart />
            }
          />
        )}

        {/* ══ GROUP 4 — Repasses de Autônomos ══ */}
        <section>
          <SectionTitle>🤝 Repasses de Autônomos</SectionTitle>
          {loading ? <SkeletonCards n={3} /> : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard title="A repassar para Autônomos" value={BRL(d.toRepayAutonomous)} description="comissão devida no período" icon={DollarSign} iconColor="text-orange-400" />
              <StatCard title="A receber dos Autônomos" value={BRL(d.toReceiveFromAutonomous)} description="comissão que autônomos devem" icon={DollarSign} iconColor="text-green-400" />
              <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Saldo Líquido Estimado</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="text-2xl font-bold text-gradient">{BRL(netBalance)}</div>
                  <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
                    <div>Receita: {BRL(d.revenue)}</div>
                    <div>Repasses: − {BRL(d.toRepayAutonomous)}</div>
                    <div className="font-medium text-foreground">Saldo: {BRL(netBalance)}</div>
                  </div>
                  {/* TODO: comparação com período anterior */}
                </CardContent>
              </Card>
            </div>
          )}
        </section>

        {/* ══ GROUP 5 — Status dos Agendamentos ══ */}
        {loading ? (
          <section><SectionTitle>📅 Status dos Agendamentos</SectionTitle><SkeletonCards n={6} /></section>
        ) : (() => {
          const statusMeta = [
            { key: "pending", label: "Pendentes", icon: AlertCircle, color: "text-yellow-400" },
            { key: "confirmed", label: "Confirmados", icon: CheckCircle, color: "text-green-400" },
            { key: "in_progress", label: "Em andamento", icon: Activity, color: "text-blue-400" },
            { key: "completed", label: "Finalizados", icon: Star, color: "text-primary" },
            { key: "cancelled", label: "Cancelados", icon: XCircle, color: "text-destructive" },
            { key: "no_show", label: "Não compareceu", icon: UserMinus, color: "text-orange-400" },
          ];
          const chartData = statusMeta
            .map((s) => ({ name: s.label, value: d.statusCounts[s.key] ?? 0 }))
            .filter((x) => x.value > 0);
          return (
            <MetricGroup
              title="📅 Status dos Agendamentos"
              storageKey="status"
              numbers={
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {statusMeta.map(({ key, label, icon: Icon, color }) => (
                    <Card key={key} className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
                      <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
                        <Icon className={`h-6 w-6 ${color}`} />
                        <div className="text-xl font-bold text-gradient">{d.statusCounts[key] ?? 0}</div>
                        <div className="text-xs text-muted-foreground">{label}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              }
              chart={chartData.length ? <BarRanking data={chartData} layout="vertical" /> : <EmptyChart />}
            />
          );
        })()}

        {/* ══ GROUP 6 — Equipe ══ */}
        {loading ? (
          <section><SectionTitle>👥 Equipe</SectionTitle><SkeletonCards n={4} /></section>
        ) : (
          <MetricGroup
            title="👥 Equipe"
            storageKey="equipe"
            numbers={
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  title="Maior Faturamento"
                  value={d.topEmployeeByRevenue?.name ?? "—"}
                  description={d.topEmployeeByRevenue ? BRL(d.topEmployeeByRevenue.value) : "sem dados"}
                  icon={TrendingUp}
                />
                <StatCard
                  title="Mais Atendimentos"
                  value={d.topEmployeeByCount?.name ?? "—"}
                  description={d.topEmployeeByCount ? `${d.topEmployeeByCount.count} atendimentos` : "sem dados"}
                  icon={Users}
                />
                <StatCard
                  title="Colaboradores Ausentes"
                  value={d.absentEmployees}
                  description="com ausência no período"
                  icon={UserX}
                  iconColor="text-orange-400"
                />
                <StatCard
                  title="Realocações"
                  value={d.reallocations}
                  description="agendamentos realocados"
                  icon={Repeat2}
                />
              </div>
            }
            chart={
              d.employeesByRevenue.length ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2 px-1">Faturamento por profissional</p>
                    <BarRanking data={d.employeesByRevenue} layout="vertical" valueFormatter={BRL} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2 px-1">Atendimentos por profissional</p>
                    <BarRanking data={d.employeesByCount} layout="vertical" color="#10b981" />
                  </div>
                </div>
              ) : <EmptyChart />
            }
          />
        )}

        {/* ══ GROUP 7 — Serviços ══ */}
        {loading ? (
          <section><SectionTitle>✂️ Serviços</SectionTitle><SkeletonCards n={2} /></section>
        ) : (
          <MetricGroup
            title="✂️ Serviços"
            storageKey="servicos"
            numbers={
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatCard
                  title="Serviço Mais Vendido"
                  value={d.mostSoldService?.name ?? "—"}
                  description={d.mostSoldService ? `${d.mostSoldService.count} agendamentos` : "sem dados no período"}
                  icon={Scissors}
                  iconColor="text-green-400"
                />
                <StatCard
                  title="Serviço Menos Vendido"
                  value={d.leastSoldService?.name ?? "—"}
                  description={d.leastSoldService ? `${d.leastSoldService.count} agendamentos` : "sem dados no período"}
                  icon={Scissors}
                  iconColor="text-muted-foreground"
                />
              </div>
            }
            chart={
              d.servicesRanking.length ? (
                <BarRanking data={d.servicesRanking} layout="vertical" />
              ) : <EmptyChart />
            }
          />
        )}

        {/* ══ GROUP 8 — Clientes ══ */}
        {loading ? (
          <section><SectionTitle>🏆 Clientes</SectionTitle><SkeletonCards n={3} /></section>
        ) : (
          <MetricGroup
            title="🏆 Clientes"
            storageKey="clientes"
            numbers={
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                  title="Cliente que Mais Gastou"
                  value={d.topSpender?.name ?? "—"}
                  description={d.topSpender ? BRL(d.topSpender.value) : "sem dados no período"}
                  icon={DollarSign}
                  iconColor="text-yellow-400"
                />
                <StatCard
                  title="Cliente Mais Frequente"
                  value={d.mostFrequent?.name ?? "—"}
                  description={d.mostFrequent ? `${d.mostFrequent.count} visitas` : "sem dados no período"}
                  icon={Star}
                  iconColor="text-primary"
                />
                <StatCard
                  title="Clientes Inativos"
                  value={d.inactiveClients}
                  description={`sem visitas há mais de 60 dias`}
                  icon={UserX}
                  iconColor="text-destructive"
                />
              </div>
            }
            chart={
              d.clientsBySpending.length ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2 px-1">Top gastadores</p>
                    <BarRanking data={d.clientsBySpending} layout="vertical" valueFormatter={BRL} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2 px-1">Mais frequentes</p>
                    <BarRanking data={d.clientsByFrequency} layout="vertical" color="#f59e0b" />
                  </div>
                </div>
              ) : <EmptyChart />
            }
          />
        )}



        {/* ══ Ações Rápidas (preserved) ══ */}
        <section>
          <SectionTitle>⚡ Ações Rápidas</SectionTitle>
          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
            <CardContent className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { href: `/${company.slug}/admin/agendamentos`, icon: CalendarIcon, label: "Ver Agenda" },
                  { href: `/${company.slug}/admin/servicos`, icon: Clock, label: "Gerenciar Serviços" },
                  { href: `/${company.slug}/admin/colaboradores`, icon: Users, label: "Colaboradores" },
                  { href: `/${company.slug}/admin/configuracoes`, icon: TrendingUp, label: "Configurações" },
                ].map(({ href, icon: Icon, label }) => (
                  <a
                    key={href}
                    href={href}
                    className="flex flex-col items-center gap-2 p-4 bg-background/50 rounded-lg hover:bg-primary/10 transition-colors"
                  >
                    <Icon className="w-8 h-8 text-primary" />
                    <span className="text-sm font-medium text-center">{label}</span>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </BusinessLayout>
  );
}
