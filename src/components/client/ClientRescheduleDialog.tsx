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

interface ClientRescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: any;
  companyId: string;
  onSuccess: () => void;
}

export function ClientRescheduleDialog({
  open,
  onOpenChange,
  booking,
  companyId,
  onSuccess
}: ClientRescheduleDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<Date[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTimes, setIsLoadingTimes] = useState(false);
  const [isLoadingDates, setIsLoadingDates] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedDate(undefined);
      setSelectedTime("");
      setAvailableTimes([]);
      setAvailableDates([]);
      if (booking?.service_id && booking?.employee_id) {
        fetchAvailableDates();
      }
    }
  }, [open, booking?.id]);

  useEffect(() => {
    if (selectedDate && booking?.service_id && booking?.employee_id) {
      fetchAvailableTimes();
    }
  }, [selectedDate]);

  const fetchAvailableDates = async () => {
    if (!booking?.service_id || !booking?.employee_id || !companyId) return;
    setIsLoadingDates(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const next31 = Array.from({ length: 31 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        return d;
      });

      const results = await Promise.all(
        next31.map(async (date) => {
          const dateStr = format(date, 'yyyy-MM-dd');
          try {
            const { slots, error } = await getAvailability({
              data: {
                company_id: companyId,
                service_id: booking.service_id,
                employee_id: booking.employee_id,
                date: dateStr,
              },
            });
            if (slots && !error && slots.length > 0) return date;
            return null;
          } catch {
            return null;
          }
        })
      );
      setAvailableDates(results.filter((d): d is Date => d !== null));
    } finally {
      setIsLoadingDates(false);
    }
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
      
      const slotsData = data.slots || [];
      const timeSlots = slotsData.map((slot: string | { time: string }) => 
        typeof slot === 'string' ? slot : slot.time
      );
      setAvailableTimes(timeSlots);

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
      const startTime = selectedTime.length === 5 ? `${selectedTime}:00` : selectedTime;

      // Snapshot previous state for notification
      const previousSnapshot = {
        booking_date: booking.booking_date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        employee_id: booking.employee_id,
        service_id: booking.service_id,
        employee: booking.employee ?? null,
        service: booking.service ?? null,
      };

      const { error } = await supabase.rpc('client_reschedule_booking', {
        p_booking_id: booking.id,
        p_new_date: newDate,
        p_new_start: startTime,
        p_new_employee: null,
        p_new_service: null,
      });

      if (error) {
        const raw = (error.message || '').toLowerCase();
        let description = error.message || "Não foi possível reagendar o agendamento.";
        if (raw.includes('slot_taken') || raw.includes('slot_unavailable')) {
          description = "Esse horário não está mais disponível. Escolha outro.";
        } else if (raw.includes('booking_locked')) {
          description = "Este agendamento não pode mais ser alterado.";
        } else if (raw.includes('booking_not_found')) {
          description = "Agendamento não encontrado.";
        }
        console.error('reschedule rpc error:', error);
        throw new Error(description);
      }

      // Fetch updated booking to send accurate current state
      const { data: updated } = await supabase
        .from('bookings')
        .select('id, booking_date, start_time, end_time, employee_id, service_id, employee:employees(id,name), service:services(id,name)')
        .eq('id', booking.id)
        .maybeSingle();

      try {
        const { data: notifData, error: notifError } = await supabase.functions.invoke('notify-booking-change', {
          body: {
            booking_id: booking.id,
            change_type: 'reschedule',
            previous: previousSnapshot,
            current: updated ?? { booking_date: newDate, start_time: startTime, employee_id: booking.employee_id, service_id: booking.service_id, service: booking.service, employee: booking.employee },
          },
        });
        if (notifError) {
          console.error('notify-booking-change error:', notifError, notifData);
        } else {
          console.log('notify-booking-change ok:', notifData);
        }
      } catch (err) {
        console.error('notify-booking-change threw:', err);
      }


      toast({
        title: "Agendamento reagendado!",
        description: `Novo horário: ${format(selectedDate, "dd/MM/yyyy", { locale: ptBR })} às ${selectedTime.slice(0, 5)}`
      });

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


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-primary/20">
        <DialogHeader>
          <DialogTitle className="text-gradient">Reagendar</DialogTitle>
          <DialogDescription>
            Escolha uma nova data e horário para seu agendamento
          </DialogDescription>
        </DialogHeader>

        {/* Current booking info */}
        {booking && (
          <div className="p-3 bg-background/50 rounded-lg border border-primary/20 mb-4">
            <p className="text-sm font-medium">{booking.service?.name}</p>
            <p className="text-xs text-muted-foreground">
              Data atual: {booking.booking_date} às {(booking.start_time?.includes('T') ? booking.start_time.split('T')[1] : booking.start_time)?.slice(0, 5)}
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
                onSelect={setSelectedDate}
                disabled={(date) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  if (date < today) return true;
                  return !availableDates.some(
                    (d) => d.toDateString() === date.toDateString()
                  );
                }}
                locale={ptBR}
                className="rounded-md border border-primary/20"
              />
            </div>
            {isLoadingDates && (
              <p className="text-xs text-center text-muted-foreground">Carregando datas disponíveis...</p>
            )}
            {!isLoadingDates && availableDates.length === 0 && (
              <p className="text-xs text-center text-muted-foreground">Nenhuma data disponível nos próximos 30 dias.</p>
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
              Selecione o novo horário
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
                  <span className="text-muted-foreground">Serviço:</span>
                  <span className="font-medium">{booking?.service?.name}</span>
                </div>
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
