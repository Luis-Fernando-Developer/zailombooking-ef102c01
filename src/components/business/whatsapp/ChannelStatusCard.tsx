import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio, Bot, Smartphone, XCircle, Loader2, Route } from "lucide-react";

type Pref = "auto" | "flow_only" | "direct_only" | "disabled";
type ActiveChannel = "flow" | "direct" | "none";

interface Props {
  companyId: string;
  onChanged?: () => void;
}

interface CompanyChannelRow {
  whatsapp_channel_preference: Pref | null;
}

const prefLabel: Record<Pref, string> = {
  auto: "Automático — Flow primeiro, Evolution como fallback",
  flow_only: "Somente Flow",
  direct_only: "Somente Evolution direta",
  disabled: "Envio WhatsApp desativado",
};

const routeLabel: Record<ActiveChannel, string> = {
  flow: "Booking → Flow ↔ Evolution → WhatsApp",
  direct: "Booking ↔ Evolution → WhatsApp",
  none: "Nenhum envio ativo",
};

function isPref(value: unknown): value is Pref {
  return value === "auto" || value === "flow_only" || value === "direct_only" || value === "disabled";
}

function isActiveChannel(value: unknown): value is ActiveChannel {
  return value === "flow" || value === "direct" || value === "none";
}

export function ChannelStatusCard({ companyId }: Props) {
  const [pref, setPref] = useState<Pref>("auto");
  const [active, setActive] = useState<ActiveChannel>("none");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: comp }, { data: channel }] = await Promise.all([
      supabase.from("companies").select("whatsapp_channel_preference").eq("id", companyId).maybeSingle(),
      supabase.rpc("resolve_whatsapp_channel", { p_company: companyId }),
    ]);
    const company = comp as CompanyChannelRow | null;
    setPref(isPref(company?.whatsapp_channel_preference) ? company.whatsapp_channel_preference : "auto");
    setActive(isActiveChannel(channel) ? channel : "none");
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  const badge = active === "flow"
    ? <Badge><Bot className="mr-1 h-3 w-3" />Via Zailom Flow</Badge>
    : active === "direct"
      ? <Badge><Smartphone className="mr-1 h-3 w-3" />Evolution direta</Badge>
      : <Badge variant="secondary"><XCircle className="mr-1 h-3 w-3" />Desativado</Badge>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5" />Status do canal</CardTitle>
        <CardDescription>Resumo somente leitura da rota WhatsApp ativa neste momento.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3">
              <span className="text-xs text-muted-foreground">Canal ativo agora</span>
              <div className="mt-2">{badge}</div>
            </div>
            <div className="rounded-md border p-3">
              <span className="text-xs text-muted-foreground">Configuração selecionada</span>
              <p className="mt-2 text-sm font-medium">{prefLabel[pref]}</p>
            </div>
            <div className="rounded-md border p-3">
              <span className="text-xs text-muted-foreground">Rota efetiva</span>
              <p className="mt-2 flex items-center gap-2 text-sm font-medium">
                <Route className="h-4 w-4" />{routeLabel[active]}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
