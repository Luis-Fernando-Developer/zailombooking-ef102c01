import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Ban, UserCheck, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { getAvailability } from "@/lib/api/availability";

export function toHHMM(v?: string | null): string {
  if (!v) return "";
  const s = String(v);
  if (s.includes("T")) {
    const m = s.match(/T(\d{2}):(\d{2})/);
    if (m) return `${m[1]}:${m[2]}`;
  }
  const m2 = s.match(/^(\d{2}):(\d{2})/);
  if (m2) return `${m2[1]}:${m2[2]}`;
  return s.slice(0, 5);
}

export function toHHMMSS(v?: string | null): string {
  const hhmm = toHHMM(v);
  return hhmm ? `${hhmm}:00` : "";
}

export function toTimestamptz(date: string, time: string): string {
  // IMPORTANT: keep ISO WITHOUT timezone suffix (same convention as
  // client/Booking.tsx) so the value round-trips visually instead of being
  // shifted to UTC on read.
  const t = time.length === 5 ? `${time}:00` : time;
  return `${date}T${t}`;
}

export interface ReallocateBooking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  service_id: string;
  employee_id: string;
  booking_status: string;
  client?: { name?: string; phone?: string } | null;
  service?: { name?: string; duration_minutes?: number } | null;
  employee?: { name?: string } | null;
}

interface Employee {
  id: string;
  name: string;
  is_active: boolean;
}

interface ReallocateDialogProps {
  booking: ReallocateBooking;
  companyId: string;
  currentUser?: { id?: string } | null;
  onClose: () => void;
  onDone: () => void;
  initialMode?: "swap" | "reschedule" | "cancel";
}

export function ReallocateDialog({
  booking,
  companyId,
  currentUser,
  onClose,
  onDone,
  initialMode = "swap",
}: ReallocateDialogProps) {
  const { toast } = useToast();

  type Mode = "swap" | "reschedule" | "cancel";
  const [mode, setMode] = useState<Mode>(initialMode);

  const [eligible, setEligible] = useState<Employee[]>([]);
  const [loadingEligible, setLoadingEligible] = useState(true);

  const [newEmployeeId, setNewEmployeeId] = useState<string>(booking.employee_id);
  const [newDate, setNewDate] = useState<Date | undefined>(new Date(booking.booking_date + "T00:00:00"));
  const [slots, setSlots] = useState<string[]>([]);
  const [slotReason, setSlotReason] = useState<string | null>(null);
  const [newTime, setNewTime] = useState<string>("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);

  const [cancelReason, setCancelReason] = useState("");

  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [availableDatesLoaded, setAvailableDatesLoaded] = useState(false);
  const [availableDatesError, setAvailableDatesError] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    newDate ?? new Date(booking.booking_date + "T00:00:00")
  );
  const [loadingDates, setLoadingDates] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingEligible(true);
      try {
        if (!booking.service_id) {
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

  useEffect(() => {
    if (newDate && newEmployeeId) loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDate, newEmployeeId]);

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
          setAvailableDatesError("Não foi possível validar as datas disponíveis.");
          setAvailableDates(new Set());
        } else {
          const next = new Set<string>(
            (data || []).map((r: any) =>
              typeof r === "string" ? r : String(r.available_date ?? r.date ?? r)
            )
          );
          setAvailableDates(next);
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

  async function checkSlotViaAvailability(params: {
    employeeId: string;
    date: string;
    timeHHMM: string;
  }): Promise<boolean> {
    const data = await getAvailability({
      data: {
        company_id: companyId,
        service_id: booking.service_id,
        employee_id: params.employeeId,
        date: params.date,
      },
    });
    const raw = data?.slots || [];
    const normalized = raw.map((s: any) => (typeof s === "string" ? s : s.time)).map((s: string) => s.slice(0, 5));
    return normalized.includes(params.timeHHMM.slice(0, 5));
  }

  async function handleSwapSameSlot() {
    if (!newEmployeeId || newEmployeeId === booking.employee_id) {
      toast({ title: "Selecione outro profissional", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const startHHMMSS = toHHMMSS(booking.start_time);
      const endHHMMSS = toHHMMSS(booking.end_time);
      const ok = await checkSlotViaAvailability({
        employeeId: newEmployeeId,
        date: booking.booking_date,
        timeHHMM: startHHMMSS,
      });
      if (!ok) {
        toast({
          title: "Horário indisponível para este profissional",
          description: "Use 'Nova data/horário' para escolher outra data/horário.",
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

      const ok = await checkSlotViaAvailability({
        employeeId: newEmployeeId,
        date: dateStr,
        timeHHMM: start,
      });
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

            <TabsContent value="reschedule" className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Profissional</label>
                <Select value={newEmployeeId} onValueChange={setNewEmployeeId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
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
                      if (!d) { setNewDate(undefined); return; }
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
