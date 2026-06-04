import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Calendar, Clock, DollarSign } from "lucide-react";

interface ClientCancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: any;
  onSuccess: () => void;
}

export function ClientCancelDialog({
  open,
  onOpenChange,
  booking,
  onSuccess
}: ClientCancelDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleCancel = async () => {
    if (!booking) return;
    setIsLoading(true);

    try {
      // Use 'status' column as per database schema
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', booking.id);

      if (error) throw error;

      toast({
        title: "Agendamento cancelado",
        description: "Seu agendamento foi cancelado com sucesso."
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error cancelling booking:', error);
      toast({
        title: "Erro",
        description: "Não foi possível cancelar o agendamento.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Get time from start_time field (database schema uses start_time, not booking_time)
  const getBookingTime = () => {
    if (booking?.start_time) {
      return booking.start_time.slice(0, 5);
    }
    if (booking?.booking_time) {
      return booking.booking_time.slice(0, 5);
    }
    return '--:--';
  };

  // Get duration - may need to calculate from start_time and end_time
  const getDuration = () => {
    if (booking?.duration_minutes) {
      return booking.duration_minutes;
    }
    // Calculate from start and end time if available
    if (booking?.start_time && booking?.end_time) {
      const [startH, startM] = booking.start_time.split(':').map(Number);
      const [endH, endM] = booking.end_time.split(':').map(Number);
      return (endH * 60 + endM) - (startH * 60 + startM);
    }
    return 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-primary/20">
        <DialogHeader>
          <DialogTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Cancelar Agendamento
          </DialogTitle>
          <DialogDescription>
            Tem certeza que deseja cancelar este agendamento?
          </DialogDescription>
        </DialogHeader>

        {booking && (
          <div className="space-y-4">
            {/* Booking summary */}
            <div className="p-4 bg-background/50 rounded-lg border border-primary/20 space-y-3">
              <div>
                <h4 className="font-semibold text-lg">{booking.service?.name || 'Serviço'}</h4>
                {booking.service?.description && (
                  <p className="text-sm text-muted-foreground">{booking.service.description}</p>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>{formatDate(booking.booking_date)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span>{getBookingTime()} ({getDuration()} minutos)</span>
                </div>
                {booking.price && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span>R$ {Number(booking.price).toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Warning message */}
            <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
              <p className="text-sm text-destructive">
                Esta ação não pode ser desfeita. O horário ficará disponível para outros clientes.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)} 
                className="flex-1"
                disabled={isLoading}
              >
                Manter agendamento
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleCancel} 
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? "Cancelando..." : "Confirmar cancelamento"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
