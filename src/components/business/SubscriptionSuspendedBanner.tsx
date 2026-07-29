import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertOctagon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

/**
 * Banner exibido quando a assinatura da empresa esta suspensa,
 * bloqueada ou pausada. Alem de mostrar o aviso, redireciona
 * automaticamente para a tela de billing para bloquear o uso
 * do painel enquanto a fatura estiver em aberto.
 */
export function SubscriptionSuspendedBanner({ companyId }: { companyId?: string }) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<string | null>(null);
  const [graceUntil, setGraceUntil] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("company_subscriptions")
        .select("billing_status, grace_until, next_renewal_at")
        .eq("company_id", companyId)
        .maybeSingle();
      if (cancelled) return;
      setStatus(data?.billing_status ?? null);
      setGraceUntil(data?.grace_until ?? null);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  // Bloqueia navegacao: se assinatura inativa, forca a tela de billing.
  useEffect(() => {
    if (!slug || !status) return;
    const blocked = status === "suspended" || status === "blocked" || status === "paused";
    if (!blocked) return;
    const path = location.pathname;
    const allowed =
      path.includes("/business/billing") ||
      path.includes("/admin/billing") ||
      path.includes("/admin/configuracoes");
    if (!allowed) {
      navigate(`/${slug}/business/billing`, { replace: true });
    }
  }, [status, location.pathname, slug, navigate]);

  if (!status || status === "active" || status === "past_due") return null;

  const label: Record<string, string> = {
    suspended: "Assinatura suspensa",
    blocked:   "Assinatura bloqueada",
    paused:    "Assinatura pausada",
  };
  const message: Record<string, string> = {
    suspended: "O pagamento do novo ciclo nao foi confirmado. Regularize para reativar os recursos.",
    blocked:   "Sua assinatura esta bloqueada. Entre em contato com o suporte.",
    paused:    "Sua assinatura esta pausada. Reative para continuar usando o sistema.",
  };

  return (
    <div className="rounded-lg border border-destructive/60 bg-destructive/10 p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertOctagon className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-destructive">{label[status] ?? "Assinatura inativa"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {message[status] ?? "Regularize sua assinatura para continuar."}
          </p>
          {graceUntil && status === "suspended" && (
            <p className="text-xs text-muted-foreground mt-1">
              Ciclo venceu em {new Date(graceUntil).toLocaleString("pt-BR")}.
            </p>
          )}
          <Button
            size="sm"
            variant="destructive"
            className="mt-3"
            onClick={() => navigate(`/${slug}/business/billing`)}
          >
            Regularizar pagamento
          </Button>
        </div>
      </div>
    </div>
  );
}
