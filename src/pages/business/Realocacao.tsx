import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRightLeft, Calendar as CalIcon, Clock, User, AlertCircle } from "lucide-react";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { ReallocateDialog, toHHMM } from "@/components/business/ReallocateDialog";

interface BookingRow {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  service_id: string;
  employee_id: string;
  booking_status: string;
  client?: { name: string; phone?: string };
  service?: { name: string; duration_minutes: number };
  employee?: { name: string };
}

interface Employee {
  id: string;
  name: string;
  is_active: boolean;
}

export default function Realocacao() {
  const { slug } = useParams();
  const { toast } = useToast();
  const [company, setCompany] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterEmployee, setFilterEmployee] = useState<string>("");
  const [filterDate, setFilterDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [target, setTarget] = useState<BookingRow | null>(null);

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (company?.id) loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, filterEmployee, filterDate]);

  async function bootstrap() {
    try {
      const { data: companyData } = await supabase
        .from("companies").select("*").eq("slug", slug).maybeSingle();
      if (!companyData) { setLoading(false); return; }
      setCompany(companyData);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user);
        const { data: emp } = await supabase
          .from("employees").select("*").eq("user_id", user.id).maybeSingle();
        setEmployee(emp);
      }

      const { data: emps } = await supabase
        .from("employees").select("id, name, is_active").eq("company_id", companyData.id).order("name");
      setEmployees((emps || []) as Employee[]);
    } finally {
      setLoading(false);
    }
  }

  async function loadBookings() {
    let q = supabase
      .from("bookings")
      .select(`id, booking_date, start_time, end_time, service_id, employee_id, booking_status,
               client:clients(name, phone), service:services(name, duration_minutes), employee:employees(name)`)
      .eq("company_id", company.id)
      .eq("booking_date", filterDate)
      .not("booking_status", "in", "(cancelled,no_show,completed)")
      .order("start_time", { ascending: true });
    if (filterEmployee) q = q.eq("employee_id", filterEmployee);
    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setBookings((data as any) || []);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!company || !employee) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Acesso não autorizado.</p>
      </div>
    );
  }

  const canManage = ["owner", "manager", "supervisor"].includes(employee.role || "");

  return (
    <BusinessLayout
      companySlug={company.slug}
      companyName={company.name}
      companyId={company.id}
      userRole={employee.role}
      currentUser={currentUser}
    >
      <div className="p-4 md:p-6 space-y-6 w-full">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-gradient flex items-center gap-2">
            <ArrowRightLeft className="w-7 h-7" /> Realocação de Agendamentos
          </h1>
          <p className="text-muted-foreground">
            Troque profissional, mude data/horário ou cancele um agendamento.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Profissional</label>
              <Select value={filterEmployee || "all"} onValueChange={(v) => setFilterEmployee(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {employees.filter(e => e.is_active).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Data</label>
              <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {bookings.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              Nenhum agendamento ativo para os filtros selecionados.
            </CardContent></Card>
          ) : bookings.map((b) => (
            <Card key={b.id} className="hover:border-primary/40 transition">
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{b.booking_status}</Badge>
                    <span className="font-medium">{b.service?.name}</span>
                  </div>
                  <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{b.client?.name}</span>
                    <span className="flex items-center gap-1"><CalIcon className="w-3.5 h-3.5" />
                      {format(new Date(b.booking_date + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{toHHMM(b.start_time)}</span>
                    <span>Prof.: {b.employee?.name}</span>
                  </div>
                </div>
                {canManage && (
                  <Button variant="neon" onClick={() => setTarget(b)}>
                    <ArrowRightLeft className="w-4 h-4 mr-2" /> Realocar
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {target && (
          <ReallocateDialog
            booking={target}
            companyId={company.id}
            currentUser={currentUser}
            onClose={() => setTarget(null)}
            onDone={() => { setTarget(null); loadBookings(); }}
          />
        )}
      </div>
    </BusinessLayout>
  );
}

interface ReallocateDialogProps {
  booking: BookingRow;
  companyId: string;
  currentUser: any;
  onClose: () => void;
  onDone: () => void;
}

function ReallocateDialog({ booking, companyId, currentUser, onClose, onDone }: ReallocateDialogProps) {
  const { toast } = useToast();

  // Modos de operação
  type Mode = "swap" | "reschedule" | "cancel";
  const [mode, setMode] = useState<Mode>("swap");

  // Profissionais elegíveis: ativos + vinculados ao serviço
  const [eligible, setEligible] = useState<Employee[]>([]);
  const [loadingEligible, setLoadingEligible] = useState(true);

  // Estado de troca/reagendamento
  const [newEmployeeId, setNewEmployeeId] = useState<string>(booking.employee_id);
  const [newDate, setNewDate] = useState<Date | undefined>(new Date(booking.booking_date + "T00:00:00"));
  const [slots, setSlots] = useState<string[]>([]);
  const [slotReason, setSlotReason] = useState<string | null>(null);
  const [newTime, setNewTime] = useState<string>("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);

  // Cancelamento
  const [cancelReason, setCancelReason] = useState("");

  // Datas disponíveis (pré-calculadas) são a fonte visual do calendário:
  // somente datas com pelo menos um slot real ficam clicáveis. Datas com A/FE/F/D,
  // desligamento efetivo ou sem horários ficam cinza e não selecionáveis.
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [availableDatesLoaded, setAvailableDatesLoaded] = useState(false);
  const [availableDatesError, setAvailableDatesError] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    newDate ?? new Date(booking.booking_date + "T00:00:00")
  );
  const [loadingDates, setLoadingDates] = useState(false);

  // Carrega profissionais elegíveis para o SERVIÇO desse agendamento
  useEffect(() => {
    (async () => {
      setLoadingEligible(true);
      try {
        if (!booking.service_id) {
          // Combo / sem service_id único — limita à pessoa atual
          setEligible([]);
          return;
        }
        const { data: es } = await supabase
          .from("employee_services")
          .select("employee_id")
          .eq("service_id", booking.service_id);
        const ids = (es || []).map((r: any) => r.employee_id).filter(Boolean);
        if (ids.length === 0) {
          setEligible([]);
          return;
        }
        const { data: emps } = await supabase
          .from("employees")
          .select("id, name, is_active")
          .in("id", ids)
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name");
        setEligible((emps || []) as Employee[]);
      } finally {
        setLoadingEligible(false);
      }
    })();
  }, [booking.service_id, companyId]);

  // Carrega slots quando data/profissional mudam
  useEffect(() => {
    if (newDate && newEmployeeId) loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDate, newEmployeeId]);

  // Pré-calcula datas disponíveis do mês visível para desabilitar no calendário
  useEffect(() => {
    if (!newEmployeeId || !booking.service_id) {
      setAvailableDates(new Set());
      setAvailableDatesLoaded(true);
      setAvailableDatesError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingDates(true);
      setAvailableDatesLoaded(false);
      setAvailableDatesError(null);
      setAvailableDates(new Set());
      try {
        const from = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
        const to = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (from < today) from.setTime(today.getTime());
        const { data, error } = await supabase.rpc("list_available_dates", {
          p_company: companyId,
          p_employee: newEmployeeId,
          p_service: booking.service_id,
          p_from: format(from, "yyyy-MM-dd"),
          p_to: format(to, "yyyy-MM-dd"),
        });
        if (cancelled) return;
        if (error) {
          console.warn("list_available_dates indisponível:", error.message);
          setAvailableDatesError("Não foi possível validar as datas disponíveis.");
          setAvailableDates(new Set());
        } else {
          const next = new Set<string>(
            (data || []).map((r: any) =>
              typeof r === "string" ? r : String(r.available_date ?? r.date ?? r)
            )
          );
          setAvailableDates(next);

          // Não limpa a data selecionada quando a lista mensal vem vazia.
          // A validação real acontece ao carregar horários em get_available_slots.
        }
      } finally {
        if (!cancelled) {
          setAvailableDatesLoaded(true);
          setLoadingDates(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [calendarMonth, newEmployeeId, booking.service_id, companyId]);

  function isCalendarDateSelectable(date: Date): boolean {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (date < today) return false;
    if (!availableDatesLoaded || availableDatesError) return false;
    return availableDates.has(format(date, "yyyy-MM-dd"));
  }

  async function loadSlots() {
    if (!newDate) return;
    setLoadingSlots(true);
    setNewTime("");
    setSlotReason(null);
    try {
      const data = await getAvailability({
        data: {
          company_id: companyId,
          service_id: booking.service_id,
          employee_id: newEmployeeId,
          date: format(newDate, "yyyy-MM-dd"),
        },
      });
      const raw = data?.slots || [];
      setSlots(raw.map((s: any) => (typeof s === "string" ? s : s.time)));
      setSlotReason((data?.reason as string | null) ?? null);
    } catch (e) {
      console.error(e);
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }

  const eligibleForSwap = useMemo(
    () => eligible.filter((e) => e.id !== booking.employee_id),
    [eligible, booking.employee_id]
  );

  async function persistReallocation(payload: {
    booking_date: string;
    start_time: string;
    end_time: string;
    employee_id: string;
  }) {
    const old = { ...booking };
    const { data: updated, error: updErr } = await supabase
      .from("bookings")
      .update(payload)
      .eq("id", booking.id)
      .select()
      .single();
    if (updErr) throw updErr;

    await supabase.from("booking_history").insert({
      booking_id: booking.id,
      changed_by: currentUser?.id,
      change_type: "reallocation",
      old_data: old,
      new_data: updated,
    });

    supabase.functions.invoke("notify-booking-change", {
      body: { booking_id: booking.id, change_type: "reallocation", previous: old, current: updated },
    }).catch((err) => console.error("notify failed", err));
  }

  async function handleSwapSameSlot() {
    // Troca direta: mantém data/horário, troca SOMENTE o profissional.
    if (!newEmployeeId || newEmployeeId === booking.employee_id) {
      toast({ title: "Selecione outro profissional", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const startHHMMSS = toHHMMSS(booking.start_time);
      const endHHMMSS = toHHMMSS(booking.end_time);
      const { data: ok, error: gateErr } = await supabase.rpc("is_slot_available", {
        p_company: companyId,
        p_employee: newEmployeeId,
        p_service: booking.service_id,
        p_date: booking.booking_date,
        p_start: startHHMMSS,
        p_ignore_booking: booking.id,
      });
      if (gateErr) throw gateErr;
      if (!ok) {
        toast({
          title: "Horário indisponível para este profissional",
          description: "Use 'Reagendar' para escolher outra data/horário.",
          variant: "destructive",
        });
        return;
      }
      await persistReallocation({
        booking_date: booking.booking_date,
        start_time: toTimestamptz(booking.booking_date, startHHMMSS),
        end_time: toTimestamptz(booking.booking_date, endHHMMSS),
        employee_id: newEmployeeId,
      });
      toast({ title: "Profissional alterado" });
      onDone();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Falha ao trocar.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleReschedule() {
    if (!newDate || !newTime) return;
    setSaving(true);
    try {
      const dateStr = format(newDate, "yyyy-MM-dd");
      const start = newTime.length === 5 ? `${newTime}:00` : newTime;
      const duration = booking.service?.duration_minutes || 30;
      const [hh, mm] = start.split(":").map(Number);
      const endMins = hh * 60 + mm + duration;
      const end = `${String(Math.floor(endMins / 60)).padStart(2, "0")}:${String(endMins % 60).padStart(2, "0")}:00`;

      const { data: ok, error: gateErr } = await supabase.rpc("is_slot_available", {
        p_company: companyId,
        p_employee: newEmployeeId,
        p_service: booking.service_id,
        p_date: dateStr,
        p_start: start,
        p_ignore_booking: booking.id,
      });
      if (gateErr) throw gateErr;
      if (!ok) {
        toast({
          title: "Horário indisponível",
          description: "Este horário não está livre na escala do profissional escolhido.",
          variant: "destructive",
        });
        return;
      }

      await persistReallocation({
        booking_date: dateStr,
        start_time: toTimestamptz(dateStr, start),
        end_time: toTimestamptz(dateStr, end),
        employee_id: newEmployeeId,
      });
      toast({
        title: "Agendamento realocado",
        description: `Movido para ${format(newDate, "dd/MM/yyyy")} às ${newTime.slice(0, 5)}.`,
      });
      onDone();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Falha ao reagendar.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    setSaving(true);
    try {
      const old = { ...booking };
      const { data: updated, error } = await supabase
        .from("bookings")
        .update({
          booking_status: "cancelled",
          cancellation_reason: cancelReason || "Cancelado pela gestão (realocação)",
        })
        .eq("id", booking.id)
        .select()
        .single();
      if (error) throw error;

      await supabase.from("booking_history").insert({
        booking_id: booking.id,
        changed_by: currentUser?.id,
        change_type: "cancel",
        old_data: old,
        new_data: updated,
      });

      supabase.functions.invoke("notify-booking-change", {
        body: { booking_id: booking.id, change_type: "cancellation", previous: old, current: updated },
      }).catch((err) => console.error("notify failed", err));

      toast({ title: "Agendamento cancelado" });
      onDone();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Falha ao cancelar.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Realocar agendamento</DialogTitle>
          <DialogDescription>
            {booking.client?.name} · {booking.service?.name} · {format(new Date(booking.booking_date + "T00:00:00"), "dd/MM/yyyy")} {toHHMM(booking.start_time)} · Prof. atual: {booking.employee?.name}
          </DialogDescription>
        </DialogHeader>

        {loadingEligible ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando profissionais...</div>
        ) : (
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="w-full">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="swap" className="gap-2">
                <UserCheck className="w-4 h-4" /> Trocar profissional
              </TabsTrigger>
              <TabsTrigger value="reschedule" className="gap-2">
                <CalendarClock className="w-4 h-4" /> Nova data/horário
              </TabsTrigger>
              <TabsTrigger value="cancel" className="gap-2 text-destructive data-[state=active]:text-destructive">
                <Ban className="w-4 h-4" /> Cancelar
              </TabsTrigger>
            </TabsList>

            {/* SWAP: troca só o profissional, mantém data/horário */}
            <TabsContent value="swap" className="space-y-4 pt-4">
              {eligibleForSwap.length === 0 ? (
                <div className="p-4 rounded-md border border-yellow-500/40 bg-yellow-500/10 text-sm">
                  Nenhum outro profissional ativo executa este serviço. Use "Nova data/horário" para mover o atendimento ou "Cancelar".
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Novo profissional</label>
                    <Select value={newEmployeeId === booking.employee_id ? "" : newEmployeeId} onValueChange={setNewEmployeeId}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {eligibleForSwap.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mantém a data ({format(new Date(booking.booking_date + "T00:00:00"), "dd/MM/yyyy")}) e o horário ({toHHMM(booking.start_time)}). Se o novo profissional não tiver disponibilidade nesse slot, use a aba "Nova data/horário".
                  </p>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={onClose}>Fechar</Button>
                    <Button
                      variant="neon"
                      disabled={saving || !newEmployeeId || newEmployeeId === booking.employee_id}
                      onClick={handleSwapSameSlot}
                    >
                      {saving ? "Salvando..." : "Confirmar troca"}
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            {/* RESCHEDULE: escolhe profissional (atual ou outro), nova data e novo horário */}
            <TabsContent value="reschedule" className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Profissional</label>
                <Select value={newEmployeeId} onValueChange={setNewEmployeeId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {/* Inclui o atual + outros elegíveis (ativos + vinculados ao serviço) */}
                    {(eligible.length > 0 ? eligible : [{ id: booking.employee_id, name: booking.employee?.name || "Atual", is_active: true }]).map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}{e.id === booking.employee_id ? " (atual)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Nova data</label>
                  <Calendar
                    mode="single"
                    selected={newDate}
                    onSelect={(d) => {
                      if (!d) {
                        setNewDate(undefined);
                        return;
                      }
                      if (!isCalendarDateSelectable(d)) return;
                      setNewDate(d);
                      setCalendarMonth(d);
                    }}
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    disabled={(d) => !isCalendarDateSelectable(d)}
                    locale={ptBR}
                    className="rounded-md border border-primary/20"
                    classNames={{
                      disabled:
                        "text-muted-foreground opacity-35 [&_button]:cursor-not-allowed [&_button]:text-muted-foreground [&_button]:opacity-50",
                    }}
                  />
                  {loadingDates && (
                    <p className="text-xs text-muted-foreground mt-1">Verificando disponibilidade…</p>
                  )}
                  {!loadingDates && availableDatesLoaded && availableDates.size === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {availableDatesError || "Selecione uma data para consultar os horários deste profissional."}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Novo horário</label>
                  {loadingSlots ? (
                    <p className="text-sm text-muted-foreground">Carregando horários...</p>
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum horário disponível{slotReason ? ` (${slotReason})` : ""}.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                      {slots.map((t) => (
                        <Button
                          key={t}
                          size="sm"
                          variant={newTime === t ? "neon" : "outline"}
                          onClick={() => setNewTime(t)}
                        >{t.slice(0, 5)}</Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                <Button variant="neon" disabled={!newTime || saving} onClick={handleReschedule}>
                  {saving ? "Salvando..." : "Confirmar reagendamento"}
                </Button>
              </div>
            </TabsContent>

            {/* CANCEL */}
            <TabsContent value="cancel" className="space-y-4 pt-4">
              <div className="p-4 rounded-md border border-destructive/40 bg-destructive/5 text-sm">
                O agendamento será cancelado e o cliente receberá notificação. Esta ação não remove o histórico.
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Motivo (opcional)</label>
                <Textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ex: profissional desligado / sem substituto disponível"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onClose}>Voltar</Button>
                <Button variant="destructive" disabled={saving} onClick={handleCancel}>
                  {saving ? "Cancelando..." : "Confirmar cancelamento"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
