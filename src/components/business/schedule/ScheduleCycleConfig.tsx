import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";
import { fetchCycleConfig, saveCycleConfig } from "@/lib/api/schedules";

interface Props { tenantId: string; }

export function ScheduleCycleConfig({ tenantId }: Props) {
  const { toast } = useToast();
  const [startDay, setStartDay] = useState(1);
  const [endDay, setEndDay] = useState(31);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchCycleConfig(tenantId).then((c) => {
      setStartDay(c.cycle_start_day);
      setEndDay(c.cycle_end_day);
    }).catch(() => {});
  }, [tenantId]);

  const handleSave = async () => {
    setBusy(true);
    try {
      await saveCycleConfig({ tenant_id: tenantId, cycle_start_day: startDay, cycle_end_day: endDay });
      toast({ title: "Ciclo salvo" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ciclo da Escala</CardTitle>
        <CardDescription>Dias do mês em que cada ciclo começa e termina.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <Label>Dia de início</Label>
          <Input type="number" min={1} max={31} value={startDay} onChange={(e) => setStartDay(+e.target.value)} className="w-24" />
        </div>
        <div className="space-y-1">
          <Label>Dia de fim</Label>
          <Input type="number" min={1} max={31} value={endDay} onChange={(e) => setEndDay(+e.target.value)} className="w-24" />
        </div>
        <Button onClick={handleSave} disabled={busy}>
          <Save className="w-4 h-4 mr-1" /> Salvar
        </Button>
      </CardContent>
    </Card>
  );
}
