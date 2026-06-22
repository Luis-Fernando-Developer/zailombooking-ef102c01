import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { exportSchedule, ExportFormat, NameFormat } from "@/lib/scheduleExport";
import { ScheduleRow } from "@/lib/api/schedules";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  schedule: ScheduleRow | null;
  tenantId: string;
}

export function ExportScheduleDialog({ open, onOpenChange, schedule, tenantId }: Props) {
  const { toast } = useToast();
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [nameFormat, setNameFormat] = useState<NameFormat>("first");
  const [includeHours, setIncludeHours] = useState<"yes" | "no">("yes");
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    if (!schedule) return;
    setBusy(true);
    try {
      await exportSchedule(schedule, tenantId, format, {
        nameFormat,
        includeHours: includeHours === "yes",
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao exportar", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Baixar escala</DialogTitle>
          <DialogDescription>Escolha o formato e os dados a exportar.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Formato do arquivo</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                <SelectItem value="csv">CSV (.csv)</SelectItem>
                <SelectItem value="ods">OpenDocument (.ods)</SelectItem>
                <SelectItem value="pdf">PDF (.pdf)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Nome do colaborador</Label>
            <RadioGroup value={nameFormat} onValueChange={(v) => setNameFormat(v as NameFormat)} className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="first" /> Primeiro nome</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="second" /> Sobrenome</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="last" /> Último nome</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="full" /> Nome completo</label>
              <label className="flex items-center gap-2 text-sm col-span-2"><RadioGroupItem value="nickname" /> Apelido (fallback: nome + sobrenome)</label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Incluir horário de entrada e saída?</Label>
            <RadioGroup value={includeHours} onValueChange={(v) => setIncludeHours(v as "yes" | "no")} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="yes" /> Sim</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="no" /> Não (apenas "T")</label>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handleDownload} disabled={busy}>{busy ? "Gerando..." : "Baixar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
