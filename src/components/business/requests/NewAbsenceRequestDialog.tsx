import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { createRequest } from "@/lib/api/requests";
import { Plus } from "lucide-react";

interface Props {
  tenantId: string;
  employeeId?: string | null;
  onCreated?: () => void;
}

export function NewAbsenceRequestDialog({ tenantId, employeeId, onCreated }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [absenceType, setAbsenceType] = useState("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const submit = async () => {
    if (!employeeId) {
      toast({ title: "Vínculo de colaborador não encontrado", variant: "destructive" });
      return;
    }
    if (!startDate || !endDate) {
      toast({ title: "Informe as datas", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await createRequest({
        tenant_id: tenantId,
        request_type: "absence_request",
        title: `Ausência (${absenceType}) ${startDate} → ${endDate}`,
        description: reason,
        priority: "normal",
        request_payload: {
          employee_id: employeeId,
          absence_type: absenceType,
          start_date: startDate,
          end_date: endDate,
          reason,
        },
      });
      toast({ title: "Solicitação enviada" });
      setOpen(false);
      setStartDate(""); setEndDate(""); setReason("");
      onCreated?.();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Plus className="w-4 h-4 mr-1" /> Solicitar ausência</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Solicitar ausência</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select value={absenceType} onValueChange={setAbsenceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vacation">Férias</SelectItem>
                <SelectItem value="sick">Atestado</SelectItem>
                <SelectItem value="personal">Pessoal</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Fim</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Motivo (opcional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={busy}>Enviar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
