import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";

type Trial = { trial_started_at: string; trial_ends_at: string; trial_converted_at: string | null };

export function TrialStatusBanner({ companyId, companySlug }: { companyId?: string; companySlug: string }) {
  const [trial, setTrial] = useState<Trial | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    supabase.from("company_subscriptions")
      .select("trial_started_at,trial_ends_at,trial_converted_at")
      .eq("company_id", companyId)
      .not("trial_started_at", "is", null)
      .maybeSingle()
      .then(({ data }) => { if (active && data?.trial_started_at && !data.trial_converted_at) setTrial(data as Trial); });
    return () => { active = false; };
  }, [companyId]);

  if (!trial) return null;
  const remainingMs = new Date(trial.trial_ends_at).getTime() - Date.now();
  const expired = remainingMs <= 0;
  const hours = Math.max(0, Math.ceil(remainingMs / 3600000));
  const days = Math.ceil(hours / 24);
  const urgent = expired || hours <= 24;

  return (
    <Card className={expired ? "border-destructive/40 bg-destructive/5" : urgent ? "border-amber-500/40 bg-amber-500/5" : "border-primary/20 bg-primary/5"}>
      <CardContent className="py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          {urgent ? <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-600" /> : <Clock3 className="w-5 h-5 mt-0.5 text-primary" />}
          <div>
            <p className="font-semibold text-sm">{expired ? "Seu período de teste terminou" : "Você está no período de teste do Zailom Booking"}</p>
            <p className="text-xs text-muted-foreground">{expired ? "Seus dados continuam preservados. Escolha um plano para voltar a utilizar as operações da plataforma." : hours <= 24 ? "Seu teste termina em menos de 24 horas." : `Restam ${days} dia(s) de teste. Não haverá cobrança automática ao término.`}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => navigate(`/${companySlug}/admin/billing`)}>{expired ? "Contratar plano" : "Ver planos"}</Button>
      </CardContent>
    </Card>
  );
}
