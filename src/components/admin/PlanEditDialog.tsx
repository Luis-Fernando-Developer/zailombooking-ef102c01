import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

export interface PlanLimitRow {
  id?: string;
  plan_id: string;
  plan_name: string;
  max_employees: number;
  max_services: number;
  max_bookings_month: number;
  max_chatbots: number;
  max_chatbot_messages: number;
  max_integrations: number;
  max_whatsapp_instances: number;
  white_label: boolean;
}

interface Props {
  plan: PlanLimitRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}

const NUMERIC_FIELDS: (keyof PlanLimitRow)[] = [
  "max_employees",
  "max_services",
  "max_bookings_month",
  "max_chatbots",
  "max_chatbot_messages",
  "max_integrations",
  "max_whatsapp_instances",
];

const LABEL: Record<string, string> = {
  max_employees: "Profissionais",
  max_services: "Servicos",
  max_bookings_month: "Agendamentos / mes",
  max_chatbots: "Chatbots",
  max_chatbot_messages: "Mensagens / mes",
  max_integrations: "Integracoes",
  max_whatsapp_instances: "Instancias WhatsApp",
};

export function PlanEditDialog({ plan, open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<PlanLimitRow | null>(plan);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(plan), [plan]);

  if (!form) return null;

  const setNum = (k: keyof PlanLimitRow, v: string) => {
    const n = v === "" ? 0 : Number(v);
    setForm({ ...form, [k]: n } as PlanLimitRow);
  };
  const toggleUnlimited = (k: keyof PlanLimitRow, unlimited: boolean) => {
    setForm({ ...form, [k]: unlimited ? -1 : 1 } as PlanLimitRow);
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("plan_limits")
      .update({
        plan_name: form.plan_name,
        max_employees: form.max_employees,
        max_services: form.max_services,
        max_bookings_month: form.max_bookings_month,
        max_chatbots: form.max_chatbots,
        max_chatbot_messages: form.max_chatbot_messages,
        max_integrations: form.max_integrations,
        max_whatsapp_instances: form.max_whatsapp_instances,
        white_label: form.white_label,
      })
      .eq("plan_id", form.plan_id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Plano atualizado" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar plano: {form.plan_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nome do plano</Label>
            <Input
              value={form.plan_name}
              onChange={(e) => setForm({ ...form, plan_name: e.target.value })}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {NUMERIC_FIELDS.map((k) => {
              const value = form[k] as number;
              const unlimited = value === -1;
              return (
                <div key={k} className="p-3 rounded-lg border border-primary/10 bg-black/10">
                  <div className="flex items-center justify-between mb-2">
                    <Label>{LABEL[k]}</Label>
                    <div className="flex items-center gap-2 text-xs">
                      <span>Ilimitado</span>
                      <Switch checked={unlimited} onCheckedChange={(c) => toggleUnlimited(k, c)} />
                    </div>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    disabled={unlimited}
                    value={unlimited ? "" : value}
                    placeholder={unlimited ? "Sem limite" : "0"}
                    onChange={(e) => setNum(k, e.target.value)}
                  />
                </div>
              );
            })}
          </div>

          <div className="p-3 rounded-lg border border-primary/10 bg-black/10 flex items-center justify-between">
            <div>
              <Label>White label</Label>
              <p className="text-xs text-muted-foreground">Permite marca propria e customizacao total.</p>
            </div>
            <Switch
              checked={form.white_label}
              onCheckedChange={(c) => setForm({ ...form, white_label: c })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
