import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radio, Bot, Smartphone, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Pref = "auto" | "flow_only" | "direct_only" | "disabled";

interface Props {
  companyId: string;
  onChanged?: () => void;
}

export function ChannelStatusCard({ companyId, onChanged }: Props) {
  const [pref, setPref] = useState<Pref>("auto");
  const [active, setActive] = useState<"flow" | "direct" | "none">("none");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: comp }, { data: channel }] = await Promise.all([
      supabase.from("companies").select("whatsapp_channel_preference").eq("id", companyId).maybeSingle(),
      supabase.rpc("resolve_whatsapp_channel", { p_company: companyId }),
    ]);
    setPref(((comp as any)?.whatsapp_channel_preference ?? "auto") as Pref);
    setActive((channel as any) ?? "none");
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  const savePref = async (val: Pref) => {
    setSaving(true);
    const { error } = await supabase.from("companies")
      .update({ whatsapp_channel_preference: val }).eq("id", companyId);
    setSaving(false);
    if (error) return toast.error("Erro ao salvar preferência");
    setPref(val);
    toast.success("Preferência atualizada");
    load();
    onChanged?.();
  };

  const badge = active === "flow"
    ? <Badge className="bg-purple-600"><Bot className="h-3 w-3 mr-1" />Via Zailom Flow</Badge>
    : active === "direct"
    ? <Badge className="bg-emerald-600"><Smartphone className="h-3 w-3 mr-1" />Evolution direta</Badge>
    : <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Desativado</Badge>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5" />Status do canal</CardTitle>
        <CardDescription>Como as notificações do Booking sairão para o WhatsApp neste momento.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Canal ativo agora:</span>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : badge}
        </div>
        <div className="space-y-2">
          <Label>Preferência de roteamento</Label>
          <Select value={pref} onValueChange={(v) => savePref(v as Pref)} disabled={saving}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automático — Flow &gt; Evolution direta</SelectItem>
              <SelectItem value="flow_only">Somente Zailom Flow</SelectItem>
              <SelectItem value="direct_only">Somente Evolution direta</SelectItem>
              <SelectItem value="disabled">Desativado (não enviar WhatsApp)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            No modo automático o sistema usa o Flow se estiver conectado; caso contrário cai para a Evolution direta.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
