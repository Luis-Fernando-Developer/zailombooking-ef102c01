import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getEdgeFunctionUrl } from "@/lib/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

const EVENTS: { key: string; label: string; description: string; defaultTpl: string }[] = [
  {
    key: "booking_pending", label: "Agendamento pendente",
    description: "Enviado ao cliente quando o agendamento é criado e aguarda confirmação.",
    defaultTpl: "⏳ Olá {{client_name}}! Recebemos sua solicitação em *{{company_name}}*. Está *pendente* de confirmação.\n📋 {{service_name}} — {{employee_name}}\n📅 {{date}} às {{time}}",
  },
  {
    key: "booking_confirmed", label: "Agendamento confirmado",
    description: "Enviado quando o estabelecimento (ou pagamento) confirma o agendamento.",
    defaultTpl: "✅ Olá {{client_name}}! Seu agendamento em *{{company_name}}* foi *confirmado*.\n📋 {{service_name}} — {{employee_name}}\n📅 {{date}} às {{time}}",
  },
  {
    key: "booking_reallocated", label: "Agendamento realocado",
    description: "Enviado quando o profissional/horário é realocado por decisão do estabelecimento.",
    defaultTpl: "🔀 Olá {{client_name}}! Houve uma realocação no seu agendamento em *{{company_name}}*.\n📋 {{service_name}} — {{employee_name}}\n📅 {{date}} às {{time}}",
  },
  {
    key: "booking_cancelled", label: "Agendamento cancelado",
    description: "Enviado quando o agendamento é cancelado.",
    defaultTpl: "❌ Olá {{client_name}}, seu agendamento em *{{company_name}}* foi *cancelado*.\n📋 {{service_name}} — {{employee_name}}\n📅 {{date}} às {{time}}",
  },
  {
    key: "booking_rescheduled", label: "Agendamento reagendado",
    description: "Enviado quando o cliente ou o estabelecimento reagenda a data/hora.",
    defaultTpl: "🔄 Olá {{client_name}}! Seu agendamento em *{{company_name}}* foi *reagendado*.\n📋 {{service_name}} — {{employee_name}}\n📅 {{date}} às {{time}}",
  },
  {
    key: "booking_reminder", label: "Lembrete de agendamento",
    description: "Lembrete disparado antes do horário marcado.",
    defaultTpl: "⏰ Olá {{client_name}}! Lembrete do seu agendamento em *{{company_name}}*.\n📋 {{service_name}} — {{employee_name}}\n📅 {{date}} às {{time}}",
  },
  {
    key: "payment_confirmed", label: "Pagamento confirmado",
    description: "Enviado quando o gateway (Asaas) confirma o pagamento do agendamento.",
    defaultTpl: "💳 Olá {{client_name}}! Recebemos o pagamento do seu agendamento em *{{company_name}}*.\n📋 {{service_name}} — {{employee_name}}\n📅 {{date}} às {{time}}",
  },
  {
    key: "payment_pending", label: "Pagamento pendente",
    description: "Enviado enquanto o pagamento ainda não foi identificado.",
    defaultTpl: "⏳ Olá {{client_name}}! Estamos aguardando o pagamento do seu agendamento em *{{company_name}}*.\n📋 {{service_name}} — {{employee_name}}\n📅 {{date}} às {{time}}",
  },
];

const VARS = ["client_name", "service_name", "employee_name", "date", "time", "company_name"];

type Row = { event_key: string; template: string; enabled: boolean };

export function TemplatesEditor({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("whatsapp_templates").select("*").eq("company_id", companyId);
    const map: Record<string, Row> = {};
    (data ?? []).forEach((r: any) => { map[r.event_key] = { event_key: r.event_key, template: r.template, enabled: r.enabled }; });
    // preenche default para os que faltam
    EVENTS.forEach((e) => { if (!map[e.key]) map[e.key] = { event_key: e.key, template: e.defaultTpl, enabled: true }; });
    setRows(map);
    setLoading(false);
  };
  useEffect(() => { load(); }, [companyId]);

  const save = async (key: string) => {
    setSaving(key);
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(getEdgeFunctionUrl("whatsapp-integration"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({
        company_id: companyId, action: "save-template",
        event_key: key, template: rows[key].template, enabled: rows[key].enabled,
      }),
    });
    setSaving(null);
    if (!r.ok) return toast.error("Falha ao salvar");
    toast.success("Template salvo");
  };

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  if (loading) return <Card><CardContent className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Templates de mensagem</CardTitle>
        <CardDescription>
          Personalize as mensagens enviadas para cada evento. Variáveis disponíveis:
          <span className="ml-1 text-xs font-mono">
            {VARS.map((v) => `{{${v}}}`).join(", ")}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          {EVENTS.map((ev) => {
            const row = rows[ev.key];
            return (
              <AccordionItem key={ev.key} value={ev.key}>
                <AccordionTrigger>
                  <div className="flex items-center gap-3 flex-1">
                    <span className="font-medium">{ev.label}</span>
                    {row.enabled ? null : <span className="text-xs text-muted-foreground">(desativado)</span>}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">{ev.description}</p>
                  <div className="flex items-center gap-2">
                    <Switch checked={row.enabled} onCheckedChange={(v) => update(ev.key, { enabled: v })} />
                    <Label className="text-sm">Ativo</Label>
                  </div>
                  <div className="space-y-2">
                    <Label>Mensagem</Label>
                    <Textarea rows={4} value={row.template} onChange={(e) => update(ev.key, { template: e.target.value })} />
                  </div>
                  <Button size="sm" onClick={() => save(ev.key)} disabled={saving === ev.key}>
                    {saving === ev.key ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar
                  </Button>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
