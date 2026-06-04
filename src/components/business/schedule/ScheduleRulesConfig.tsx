import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

interface ScheduleRulesConfigProps {
  companyId: string;
}

// Aligned with database schema - company_schedule_settings table
interface ScheduleSettings {
  slot_duration_minutes: number;
  min_advance_hours: number;
  max_advance_days: number;
  allow_simultaneous_breaks: boolean;
  max_simultaneous_breaks: number;
}

const DEFAULT_SETTINGS: ScheduleSettings = {
  slot_duration_minutes: 30,
  min_advance_hours: 1,
  max_advance_days: 30,
  allow_simultaneous_breaks: false,
  max_simultaneous_breaks: 1,
};

export function ScheduleRulesConfig({ companyId }: ScheduleRulesConfigProps) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ScheduleSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [companyId]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('company_schedule_settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          slot_duration_minutes: data.slot_duration_minutes ?? DEFAULT_SETTINGS.slot_duration_minutes,
          min_advance_hours: data.min_advance_hours ?? DEFAULT_SETTINGS.min_advance_hours,
          max_advance_days: data.max_advance_days ?? DEFAULT_SETTINGS.max_advance_days,
          allow_simultaneous_breaks: data.allow_simultaneous_breaks ?? DEFAULT_SETTINGS.allow_simultaneous_breaks,
          max_simultaneous_breaks: data.max_simultaneous_breaks ?? DEFAULT_SETTINGS.max_simultaneous_breaks,
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = (field: keyof ScheduleSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Check if settings exist
      const { data: existing } = await supabase
        .from('company_schedule_settings')
        .select('id')
        .eq('company_id', companyId)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('company_schedule_settings')
          .update({
            slot_duration_minutes: settings.slot_duration_minutes,
            min_advance_hours: settings.min_advance_hours,
            max_advance_days: settings.max_advance_days,
            allow_simultaneous_breaks: settings.allow_simultaneous_breaks,
            max_simultaneous_breaks: settings.max_simultaneous_breaks,
          })
          .eq('company_id', companyId);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('company_schedule_settings')
          .insert({
            company_id: companyId,
            slot_duration_minutes: settings.slot_duration_minutes,
            min_advance_hours: settings.min_advance_hours,
            max_advance_days: settings.max_advance_days,
            allow_simultaneous_breaks: settings.allow_simultaneous_breaks,
            max_simultaneous_breaks: settings.max_simultaneous_breaks,
          });

        if (error) throw error;
      }

      toast({
        title: "Sucesso",
        description: "Configurações salvas com sucesso!"
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar as configurações.",
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
    <div className="space-y-6">
      {/* Configurações de Agendamento */}
      <Card className="card-glow">
        <CardHeader>
          <CardTitle>Configurações de Agendamento</CardTitle>
          <CardDescription>
            Configure como os slots de horário são gerados para os clientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Duração do Slot (minutos)</Label>
            <Input
              type="number"
              min={5}
              step={5}
              value={settings.slot_duration_minutes}
              onChange={(e) => handleSettingChange('slot_duration_minutes', parseInt(e.target.value) || 30)}
              className="max-w-[200px]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Intervalo entre horários disponíveis (ex: 30 = 9:00, 9:30, 10:00...)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Antecedência Mínima (horas)</Label>
              <Input
                type="number"
                min={0}
                value={settings.min_advance_hours}
                onChange={(e) => handleSettingChange('min_advance_hours', parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Quantas horas antes o cliente pode agendar
              </p>
            </div>
            <div>
              <Label>Antecedência Máxima (dias)</Label>
              <Input
                type="number"
                min={1}
                value={settings.max_advance_days}
                onChange={(e) => handleSettingChange('max_advance_days', parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Até quantos dias no futuro o cliente pode agendar
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Regras de Intervalo */}
      <Card className="card-glow">
        <CardHeader>
          <CardTitle>Regras de Intervalo</CardTitle>
          <CardDescription>
            Configure as regras de intervalo/pausa para os colaboradores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={settings.allow_simultaneous_breaks}
              onCheckedChange={(checked) => handleSettingChange('allow_simultaneous_breaks', checked)}
            />
            <Label>Permitir pausas simultâneas</Label>
          </div>

          {settings.allow_simultaneous_breaks && (
            <div>
              <Label>Máximo de Pessoas em Pausa Simultânea</Label>
              <Input
                type="number"
                min={1}
                value={settings.max_simultaneous_breaks}
                onChange={(e) => handleSettingChange('max_simultaneous_breaks', parseInt(e.target.value) || 1)}
                className="max-w-[200px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Evita que o estabelecimento fique sem atendimento
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        <Save className="w-4 h-4 mr-2" />
        {saving ? "Salvando..." : "Salvar Configurações"}
      </Button>
    </div>
  );
}
