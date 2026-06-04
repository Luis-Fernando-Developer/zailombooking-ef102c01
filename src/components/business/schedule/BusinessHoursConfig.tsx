import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

interface BusinessHoursConfigProps {
  companyId: string;
}

// Aligned with database schema - business_hours table uses break_start/break_end for intervals
interface BusinessHour {
  id?: string;
  day_of_week: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
  break_start: string | null;
  break_end: string | null;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

const DEFAULT_HOURS: BusinessHour[] = DAYS_OF_WEEK.map(day => ({
  day_of_week: day.value,
  is_open: day.value !== 0, // Fechado aos domingos por padrão
  open_time: "08:00",
  close_time: "18:00",
  break_start: null,
  break_end: null,
}));

export function BusinessHoursConfig({ companyId }: BusinessHoursConfigProps) {
  const { toast } = useToast();
  const [hours, setHours] = useState<BusinessHour[]>(DEFAULT_HOURS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchBusinessHours();
  }, [companyId]);

  const fetchBusinessHours = async () => {
    try {
      const { data, error } = await supabase
        .from('business_hours')
        .select('*')
        .eq('company_id', companyId)
        .order('day_of_week');

      if (error) throw error;

      if (data && data.length > 0) {
        const hoursMap = new Map(data.map(h => [h.day_of_week, h]));
        const mergedHours = DAYS_OF_WEEK.map(day => {
          const existing = hoursMap.get(day.value);
          return existing ? {
            id: existing.id,
            day_of_week: existing.day_of_week,
            is_open: existing.is_open ?? true,
            open_time: existing.open_time || "08:00",
            close_time: existing.close_time || "18:00",
            break_start: existing.break_start,
            break_end: existing.break_end,
          } : DEFAULT_HOURS[day.value];
        });
        setHours(mergedHours);
      }
    } catch (error) {
      console.error('Error fetching business hours:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os horários.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleHourChange = (dayIndex: number, field: keyof BusinessHour, value: any) => {
    setHours(prev => prev.map((h, i) => 
      i === dayIndex ? { ...h, [field]: value } : h
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete existing hours first, then insert new ones
      await supabase
        .from('business_hours')
        .delete()
        .eq('company_id', companyId);

      // Insert all hours
      const { error } = await supabase
        .from('business_hours')
        .insert(
          hours.map(h => ({
            company_id: companyId,
            day_of_week: h.day_of_week,
            is_open: h.is_open,
            open_time: h.open_time,
            close_time: h.close_time,
            break_start: h.break_start || null,
            break_end: h.break_end || null,
          }))
        );

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Horários salvos com sucesso!"
      });
    } catch (error) {
      console.error('Error saving business hours:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar os horários.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Card className="card-glow">
      <CardHeader>
        <CardTitle>Horário de Funcionamento</CardTitle>
        <CardDescription>
          Configure os horários de abertura e fechamento do estabelecimento por dia da semana.
          Para intervalos (ex: fecha para almoço), preencha o horário de intervalo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {hours.map((hour, index) => (
            <div 
              key={hour.day_of_week} 
              className={`p-4 rounded-lg border transition-colors ${
                hour.is_open ? 'border-primary/30 bg-card/50' : 'border-muted bg-muted/20'
              }`}
            >
              <div className="flex flex-wrap items-center gap-4">
                {/* Day name and toggle */}
                <div className="flex items-center gap-3 min-w-[180px]">
                  <Switch
                    checked={hour.is_open}
                    onCheckedChange={(checked) => handleHourChange(index, 'is_open', checked)}
                  />
                  <Label className={`font-medium ${!hour.is_open && 'text-muted-foreground'}`}>
                    {DAYS_OF_WEEK[hour.day_of_week].label}
                  </Label>
                </div>

                {hour.is_open && (
                  <>
                    {/* Main period */}
                    <div className="flex items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Horário:</Label>
                      <Input
                        type="time"
                        value={hour.open_time}
                        onChange={(e) => handleHourChange(index, 'open_time', e.target.value)}
                        className="w-28"
                      />
                      <span className="text-muted-foreground">às</span>
                      <Input
                        type="time"
                        value={hour.close_time}
                        onChange={(e) => handleHourChange(index, 'close_time', e.target.value)}
                        className="w-28"
                      />
                    </div>

                    {/* Break period (optional) */}
                    <div className="flex items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Intervalo:</Label>
                      <Input
                        type="time"
                        value={hour.break_start || ""}
                        onChange={(e) => handleHourChange(index, 'break_start', e.target.value || null)}
                        className="w-28"
                        placeholder="--:--"
                      />
                      <span className="text-muted-foreground">às</span>
                      <Input
                        type="time"
                        value={hour.break_end || ""}
                        onChange={(e) => handleHourChange(index, 'break_end', e.target.value || null)}
                        className="w-28"
                        placeholder="--:--"
                      />
                    </div>
                  </>
                )}

                {!hour.is_open && (
                  <span className="text-muted-foreground italic">Fechado</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando..." : "Salvar Horários"}
        </Button>
      </CardContent>
    </Card>
  );
}
