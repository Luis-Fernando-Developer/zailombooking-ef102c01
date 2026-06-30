import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserCheck, AlertCircle } from "lucide-react";

interface ReassignBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: any;
  companyId: string;
  onSuccess: () => void;
}

interface Candidate {
  id: string;
  name: string;
  available: boolean;
  reason?: string;
}

const normalizeTimeValue = (time?: string) => {
  if (!time) return "";
  const isoMatch = time.match(/T(\d{2}):(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}:${isoMatch[2]}`;
  const timeMatch = time.match(/^(\d{2}):(\d{2})/);
  if (timeMatch) return `${timeMatch[1]}:${timeMatch[2]}`;
  return time.slice(0, 5);
};

const toHHMMSS = (time?: string) => {
  const normalized = normalizeTimeValue(time);
  return normalized ? `${normalized}:00` : "";
};

export function ReassignBookingDialog({
  open,
  onOpenChange,
  booking,
  companyId,
  onSuccess,
}: ReassignBookingDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    if (open && booking) {
      setSelectedId("");
      loadCandidates();
    }
  }, [open, booking?.id]);

  const normalizeTime = (t?: string) => {
    return normalizeTimeValue(t);
  };

  const loadCandidates = async () => {
    if (!booking?.service_id) {
      toast({
        title: "Aviso",
        description: "Este agendamento não tem um serviço único associado (combo). Use Reagendar.",
      });
      return;
    }
    setLoading(true);
    try {
      // 1) Funcionários ativos da empresa que executam este serviço
      const { data: es } = await supabase
        .from("employee_services")
        .select("employee_id")
        .eq("service_id", booking.service_id);

      const eligibleIds = (es || [])
        .map((r) => r.employee_id)
        .filter((id) => id && id !== booking.employee_id);

      if (eligibleIds.length === 0) {
        setCandidates([]);
        setLoading(false);
        return;
      }

      const { data: employeesData } = await supabase
        .from("employees")
        .select("id, name")
        .in("id", eligibleIds)
        .eq("company_id", companyId);

      const list: Candidate[] = [];

      // 2) Para cada candidato, checar o mesmo gate da Realocação/agenda publicada.
      for (const emp of employeesData || []) {
        try {
          const { data: ok, error: gateErr } = await supabase.rpc("is_slot_available", {
            p_company: companyId,
            p_employee: emp.id,
            p_service: booking.service_id,
            p_date: booking.booking_date,
            p_start: toHHMMSS(booking.start_time),
            p_ignore_booking: booking.id,
          });
          if (gateErr) throw gateErr;
          list.push({
            id: emp.id,
            name: emp.name,
            available: Boolean(ok),
            reason: ok ? undefined : "Sem disponibilidade no horário",
          });
        } catch {
          list.push({ id: emp.id, name: emp.name, available: false, reason: "Erro ao checar agenda" });
        }
      }

      // Disponíveis primeiro
      list.sort((a, b) => Number(b.available) - Number(a.available));
      setCandidates(list);
    } catch (e) {
      console.error(e);
      toast({
        title: "Erro",
        description: "Não foi possível carregar candidatos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const selectedEmployee = candidates.find((candidate) => candidate.id === selectedId);
      const { data: ok, error: gateErr } = await supabase.rpc("is_slot_available", {
        p_company: companyId,
        p_employee: selectedId,
        p_service: booking.service_id,
        p_date: booking.booking_date,
        p_start: toHHMMSS(booking.start_time),
        p_ignore_booking: booking.id,
      });
      if (gateErr) throw gateErr;
      if (!ok) {
        toast({
          title: "Horário indisponível",
          description: "A escala do profissional não permite esse horário.",
          variant: "destructive",
        });
        return;
      }

      const previous = { ...booking };
      const { error } = await supabase
        .from("bookings")
        .update({ employee_id: selectedId })
        .eq("id", booking.id);
      if (error) throw error;

      const current = {
        ...booking,
        employee_id: selectedId,
        employee: selectedEmployee ? { name: selectedEmployee.name } : booking.employee,
      };

      await supabase.from("booking_history").insert({
        booking_id: booking.id,
        change_type: "reallocation",
        old_data: previous,
        new_data: current,
      });

      supabase.functions.invoke("notify-booking-change", {
        body: { booking_id: booking.id, change_type: "reallocation", previous, current },
      }).catch((err) => console.error("notify failed", err));

      toast({
        title: "Realocado",
        description: "Agendamento transferido para o novo profissional.",
      });
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Erro",
        description: e.message || "Falha ao realocar.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-primary/20">
        <DialogHeader>
          <DialogTitle className="text-gradient">Realocar para outro profissional</DialogTitle>
          <DialogDescription>
            Mantendo a mesma data e horário, escolha um profissional disponível.
          </DialogDescription>
        </DialogHeader>

        {booking && (
          <div className="p-3 bg-background/50 rounded-lg border border-primary/20 text-sm">
            <p className="font-medium">{booking.service?.name || "Serviço"}</p>
            <p className="text-xs text-muted-foreground">
              Cliente: {booking.client?.name}
            </p>
            <p className="text-xs text-muted-foreground">
              Data: {booking.booking_date} às {normalizeTime(booking.start_time)}
            </p>
            <p className="text-xs text-muted-foreground">
              Profissional atual: {booking.employee?.name || "—"}
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex items-start gap-2 p-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10">
            <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
            <div className="text-sm">
              Nenhum outro profissional executa este serviço. Considere reagendar com o mesmo
              profissional em outra data, ou cancelar avisando o cliente.
            </div>
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {candidates.map((c) => (
              <button
                key={c.id}
                disabled={!c.available}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedId === c.id
                    ? "border-primary bg-primary/10"
                    : "border-primary/20 bg-background/40 hover:bg-background/70"
                } ${!c.available ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium flex items-center gap-2">
                    <UserCheck className="w-4 h-4" />
                    {c.name}
                  </span>
                  {c.available ? (
                    <Badge className="bg-green-500/20 text-green-500 border-green-500/40">
                      Disponível
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      {c.reason}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancelar
          </Button>
          <Button
            variant="neon"
            onClick={handleConfirm}
            disabled={!selectedId || saving}
            className="flex-1"
          >
            {saving ? "Salvando..." : "Confirmar realocação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
