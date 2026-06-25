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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { getAvailability } from "@/lib/api/availability";

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

export default function Realocacao() {
  const { slug } = useParams();
  const { toast } = useToast();
  const [company, setCompany] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
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
        .from("employees").select("id, name").eq("company_id", companyData.id).order("name");
      setEmployees(emps || []);
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
            Reorganize agendamentos quando um profissional ficar indisponível.
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
                  {employees.map((e) => (
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
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{b.start_time?.slice(0,5)}</span>
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
            employees={employees}
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
  employees: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}

function ReallocateDialog({ booking, companyId, employees, onClose, onDone }: ReallocateDialogProps) {
  const { toast } = useToast();
  const [newEmployeeId, setNewEmployeeId] = useState<string>(booking.employee_id);
  const [newDate, setNewDate] = useState<Date | undefined>(new Date(booking.booking_date + "T00:00:00"));
  const [slots, setSlots] = useState<string[]>([]);
  const [newTime, setNewTime] = useState<string>("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (newDate && newEmployeeId) loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDate, newEmployeeId]);

  async function loadSlots() {
    if (!newDate) return;
    setLoadingSlots(true);
    setNewTime("");
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
    } catch (e) {
      console.error(e);
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleSave() {
    if (!newDate || !newTime) return;
    setSaving(true);
    try {
      const dateStr = format(newDate, "yyyy-MM-dd");
      const start = newTime.length === 5 ? `${newTime}:00` : newTime;
      const duration = booking.service?.duration_minutes || 30;
      const [hh, mm] = start.split(":").map(Number);
      const endMins = hh * 60 + mm + duration;
      const end = `${String(Math.floor(endMins / 60)).padStart(2, "0")}:${String(endMins % 60).padStart(2, "0")}:00`;

      // Check conflict
      const { data: conflicts } = await supabase
        .from("bookings")
        .select("id, start_time, end_time")
        .eq("company_id", companyId)
        .eq("employee_id", newEmployeeId)
        .eq("booking_date", dateStr)
        .not("booking_status", "in", "(cancelled,no_show)")
        .neq("id", booking.id);

      const overlap = (conflicts || []).some((c: any) => start < c.end_time && end > c.start_time);
      if (overlap) {
        toast({ title: "Conflito de horário", description: "Esse horário já está ocupado.", variant: "destructive" });
        return;
      }

      const old = { ...booking };
      const { data: updated, error: updErr } = await supabase
        .from("bookings")
        .update({
          booking_date: dateStr,
          start_time: start,
          end_time: end,
          employee_id: newEmployeeId,
        })
        .eq("id", booking.id)
        .select()
        .single();

      if (updErr) throw updErr;

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("booking_history").insert({
        booking_id: booking.id,
        changed_by: user?.id,
        change_type: "reallocation",
        old_data: old,
        new_data: updated,
      });

      toast({
        title: "Agendamento realocado",
        description: `Movido para ${format(newDate, "dd/MM/yyyy")} às ${newTime.slice(0, 5)}.`,
      });
      onDone();
    } catch (e: any) {
      console.error(e);
      toast({ title: "Erro", description: e?.message || "Falha ao realocar.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Realocar agendamento</DialogTitle>
          <DialogDescription>
            {booking.client?.name} · {booking.service?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Novo profissional</label>
            <Select value={newEmployeeId} onValueChange={setNewEmployeeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
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
                onSelect={setNewDate}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                locale={ptBR}
                className="rounded-md border border-primary/20"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Novo horário</label>
              {loadingSlots ? (
                <p className="text-sm text-muted-foreground">Carregando horários...</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum horário disponível.</p>
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
            <Button variant="neon" disabled={!newTime || saving} onClick={handleSave}>
              {saving ? "Salvando..." : "Confirmar realocação"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
