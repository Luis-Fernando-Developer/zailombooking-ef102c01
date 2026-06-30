import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { getAvailability } from "@/lib/api/availability";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Calendar as CalendarIcon, Clock, Check } from "lucide-react";

interface RescheduleBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: any;
  companyId: string;
  onSuccess: () => void;
}

export function RescheduleBookingDialog({
  open,
  onOpenChange,
  booking,
  companyId,
  onSuccess
}: RescheduleBookingDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [availableDatesLoaded, setAvailableDatesLoaded] = useState(false);
  const [availableDatesError, setAvailableDatesError] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTimes, setIsLoadingTimes] = useState(false);
  const [isLoadingDates, setIsLoadingDates] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedDate(undefined);
      setSelectedTime("");
      setAvailableTimes([]);
      const initialMonth = booking?.booking_date ? new Date(`${booking.booking_date}T00:00:00`) : new Date();
      setCalendarMonth(initialMonth);
      setAvailableDates(new Set());
      setAvailableDatesLoaded(false);
      setAvailableDatesError(null);
    }
  }, [open]);

  useEffect(() => {
    if (open && booking?.service_id && booking?.employee_id && companyId) {
      fetchAvailableDates();
    }
  }, [open, calendarMonth, booking?.service_id, booking?.employee_id, companyId]);

  useEffect(() => {
    if (selectedDate && booking?.service_id && booking?.employee_id) {
      fetchAvailableTimes();
    }
  }, [selectedDate]);

  const fetchAvailableDates = async () => {
    if (!booking?.service_id || !booking?.employee_id) return;
    setIsLoadingDates(true);
    setAvailableDatesLoaded(false);
    setAvailableDatesError(null);
    setAvailableDates(new Set());

    try {
      const from = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
      const to = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (from < today) from.setTime(today.getTime());

      const { data, error } = await supabase.rpc("list_available_dates", {
        p_company: companyId,
        p_employee: booking.employee_id,
        p_service: booking.service_id,
        p_from: format(from, "yyyy-MM-dd"),
        p_to: format(to, "yyyy-MM-dd"),
      });

      if (error) throw error;

      setAvailableDates(new Set(
        (data || []).map((row: any) =>
          typeof row === "string" ? row : String(row.available_date ?? row.date ?? row)
        )
      ));
    } catch (error: any) {
      console.error("Error fetching available dates:", error);
      setAvailableDatesError(error?.message || "Não foi possível validar as datas disponíveis.");
    } finally {
      setAvailableDatesLoaded(true);
      setIsLoadingDates(false);
    }
  };

  const isCalendarDateSelectable = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return false;
    if (!availableDatesLoaded || availableDatesError) return false;
    return availableDates.has(format(date, "yyyy-MM-dd"));
  };

  const fetchAvailableTimes = async () => {
    if (!selectedDate || !booking) return;
    setIsLoadingTimes(true);

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      const data = await getAvailability({
        data: {
          company_id: companyId,
          service_id: booking.service_id,
          employee_id: booking.employee_id,
          date: dateStr
        }
      });

      if (!data || data.error) throw new Error(data?.error || 'Failed to fetch availability');
      
      const slots = data.slots || [];
      const times = slots.map((slot: any) => 
        typeof slot === 'string' ? slot : slot.time
      ).filter(Boolean);
      setAvailableTimes(times);

    } catch (error) {
      console.error('Error fetching availability:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os horários disponíveis.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingTimes(false);
    }
  };

  const handleReschedule = async () => {
    if (!selectedDate || !selectedTime || !booking) return;
    setIsLoading(true);

    try {
      const newDate = format(selectedDate, 'yyyy-MM-dd');
      const start = selectedTime.length === 5 ? `${selectedTime}:00` : selectedTime;
      const duration = booking.service?.duration_minutes || 30;
      const [hours, minutes] = start.split(":").map(Number);
      const totalEndMinutes = hours * 60 + minutes + duration;
      const end = `${String(Math.floor(totalEndMinutes / 60)).padStart(2, "0")}:${String(totalEndMinutes % 60).padStart(2, "0")}:00`;

      // Gate único de disponibilidade
      const { data: ok, error: gateErr } = await supabase.rpc('is_slot_available', {
        p_company: companyId,
        p_employee: booking.employee_id,
        p_service: booking.service_id,
        p_date: newDate,
        p_start: start,
        p_ignore_booking: booking.id,
      });
      if (gateErr) throw gateErr;
      if (!ok) {
        toast({
          title: "Horário indisponível",
          description: "Esse horário não está livre na escala atual (ausência, folga, intervalo ou conflito).",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('bookings')
        .update({
          booking_date: newDate,
          start_time: start,
          end_time: end,
          booking_status: booking.booking_status === "no_show" ? "confirmed" : booking.booking_status,
        })
        .eq('id', booking.id);

      if (error) throw error;

      const current = {
        ...booking,
        booking_date: newDate,
        start_time: start,
        end_time: end,
        booking_status: booking.booking_status === "no_show" ? "confirmed" : booking.booking_status,
      };

      await supabase.from("booking_history").insert({
        booking_id: booking.id,
        change_type: "reschedule",
        old_data: booking,
        new_data: current,
      });

      toast({
        title: "Agendamento reagendado",
        description: `Novo horário: ${format(selectedDate, "dd/MM/yyyy", { locale: ptBR })} às ${selectedTime.slice(0, 5)}`
      });

      supabase.functions.invoke("notify-booking-change", {
        body: { booking_id: booking.id, change_type: "reschedule", previous: booking, current },
      }).catch((err) => console.error("notify failed", err));

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error rescheduling:', error);
      toast({
        title: "Erro",
        description: error?.message || "Não foi possível reagendar o agendamento.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };


  const formatCurrentDate = (date: string) => {
    if (!date) return "";
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-primary/20">
        <DialogHeader>
          <DialogTitle className="text-gradient">Reagendar</DialogTitle>
          <DialogDescription>
            Escolha uma nova data e horário para o agendamento
          </DialogDescription>
        </DialogHeader>

        {/* Current booking info */}
        {booking && (
          <div className="p-3 bg-background/50 rounded-lg border border-primary/20 mb-4">
            <p className="text-sm font-medium">{booking.service?.name}</p>
            <p className="text-xs text-muted-foreground">
              Cliente: {booking.client?.name}
            </p>
            <p className="text-xs text-muted-foreground">
              Data atual: {formatCurrentDate(booking.booking_date)} às {booking.start_time?.includes('T') ? booking.start_time.split('T')[1].slice(0, 5) : booking.start_time?.slice(0, 5)}
            </p>
          </div>
        )}

        {/* Step 1: Select date */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <CalendarIcon className="w-4 h-4" />
              Selecione a nova data
            </div>
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (!date) {
                    setSelectedDate(undefined);
                    return;
                  }
                  if (!isCalendarDateSelectable(date)) return;
                  setSelectedDate(date);
                  setCalendarMonth(date);
                }}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                disabled={(date) => !isCalendarDateSelectable(date)}
                locale={ptBR}
                className="rounded-md border border-primary/20"
                classNames={{
                  disabled:
                    "text-muted-foreground opacity-35 [&_button]:cursor-not-allowed [&_button]:text-muted-foreground [&_button]:opacity-50",
                }}
              />
            </div>
            {isLoadingDates && (
              <p className="text-xs text-muted-foreground text-center">Verificando disponibilidade…</p>
            )}
            {!isLoadingDates && availableDatesLoaded && availableDates.size === 0 && (
              <p className="text-xs text-muted-foreground text-center">
                {availableDatesError || "Nenhuma data disponível neste mês."}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancelar
              </Button>
              <Button 
                variant="neon" 
                onClick={() => setStep(2)} 
                disabled={!selectedDate}
                className="flex-1"
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Select time */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Clock className="w-4 h-4" />
              Selecione o novo horário para {selectedDate && format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
            </div>

            {isLoadingTimes ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-sm text-muted-foreground mt-2">Carregando horários...</p>
              </div>
            ) : availableTimes.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Nenhum horário disponível para esta data.</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto">
                {availableTimes.map((time) => (
                  <Button
                    key={time}
                    variant={selectedTime === time ? "neon" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTime(time)}
                    className="text-sm"
                  >
                    {time.slice(0, 5)}
                  </Button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Voltar
              </Button>
              <Button 
                variant="neon" 
                onClick={() => setStep(3)} 
                disabled={!selectedTime}
                className="flex-1"
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
              <h4 className="font-medium mb-3">Confirmar reagendamento</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nova data:</span>
                  <span className="font-medium">
                    {selectedDate && format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Novo horário:</span>
                  <span className="font-medium">{selectedTime?.slice(0, 5)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                Voltar
              </Button>
              <Button 
                variant="neon" 
                onClick={handleReschedule} 
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? "Reagendando..." : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Confirmar
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
