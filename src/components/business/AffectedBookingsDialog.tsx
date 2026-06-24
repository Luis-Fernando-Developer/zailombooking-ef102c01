import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserCog, CalendarClock, X, Calendar } from "lucide-react";
import { ReassignBookingDialog } from "./ReassignBookingDialog";
import { RescheduleBookingDialog } from "./RescheduleBookingDialog";

interface AffectedBookingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
}

export function AffectedBookingsDialog({
  open,
  onOpenChange,
  companyId,
  employeeId,
  employeeName,
  startDate,
  endDate,
}: AffectedBookingsDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState<any[]>([]);
  const [reassignTarget, setReassignTarget] = useState<any>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<any>(null);

  useEffect(() => {
    if (open) load();
  }, [open, employeeId, startDate, endDate]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, client:clients(*), service:services(*), employee:employees(*)")
        .eq("company_id", companyId)
        .eq("employee_id", employeeId)
        .gte("booking_date", startDate)
        .lte("booking_date", endDate)
        .in("booking_status", ["pending", "confirmed"])
        .order("booking_date", { ascending: true });
      if (error) throw error;
      setBookings(data || []);
    } catch (e) {
      console.error(e);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os agendamentos afetados.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Cancelar este agendamento? O cliente deverá ser avisado.")) return;
    const { error } = await supabase
      .from("bookings")
      .update({ booking_status: "cancelled" })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Cancelado", description: "Agendamento cancelado." });
    load();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl bg-card border-primary/20">
          <DialogHeader>
            <DialogTitle className="text-gradient">Agendamentos afetados</DialogTitle>
            <DialogDescription>
              {employeeName} • {startDate} a {endDate}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : bookings.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum agendamento ativo no período.
            </p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className="p-3 rounded-lg border border-primary/20 bg-background/40"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-medium">{b.service?.name || "Serviço"}</p>
                      <p className="text-xs text-muted-foreground">
                        Cliente: {b.client?.name} • {b.client?.phone}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Calendar className="w-3 h-3" />
                        {b.booking_date} às {(b.start_time || "").slice(0, 5)}
                      </p>
                    </div>
                    <Badge variant="outline">{b.booking_status}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="neon"
                      onClick={() => setReassignTarget(b)}
                    >
                      <UserCog className="w-3 h-3 mr-1" />
                      Realocar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRescheduleTarget(b)}
                    >
                      <CalendarClock className="w-3 h-3 mr-1" />
                      Reagendar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => handleCancel(b.id)}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReassignBookingDialog
        open={!!reassignTarget}
        onOpenChange={(o) => !o && setReassignTarget(null)}
        booking={reassignTarget}
        companyId={companyId}
        onSuccess={load}
      />
      <RescheduleBookingDialog
        open={!!rescheduleTarget}
        onOpenChange={(o) => !o && setRescheduleTarget(null)}
        booking={rescheduleTarget}
        companyId={companyId}
        onSuccess={load}
      />
    </>
  );
}
