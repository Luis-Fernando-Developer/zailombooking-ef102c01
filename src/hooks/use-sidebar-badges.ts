import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type BadgeSeverity = "red" | "yellow";
export interface BadgeInfo {
  count: number;
  severity: BadgeSeverity;
}
export type SidebarBadges = Partial<Record<string, BadgeInfo>>;

async function countQuery(p: any): Promise<number> {
  const r = await p;
  return (r?.count as number) ?? 0;
}

/**
 * Contagens em tempo real para os badges do sidebar.
 * - Vermelho: demanda IMEDIATA do usuário (notificações, mensagens, reagendamento).
 * - Amarelo: demanda APROVAÇÃO/atenção do gestor (solicitações pendentes).
 */
export function useSidebarBadges(companyId?: string, userId?: string): SidebarBadges {
  const [badges, setBadges] = useState<SidebarBadges>({});

  const refresh = useCallback(async () => {
    if (!companyId) return;
    const today = new Date().toISOString().slice(0, 10);

    const [agendamentos, solicitacoes, ausencias, horarios, realocacao, notificacoes] = await Promise.all([
      countQuery(
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("booking_date", today)
          .in("booking_status", ["pending", "scheduled"])
      ),
      countQuery(
        supabase
          .from("requests")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", companyId)
          .eq("status", "pending")
      ),
      countQuery(
        supabase
          .from("requests")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", companyId)
          .eq("status", "pending")
          .eq("request_type", "absence")
      ),
      countQuery(
        supabase
          .from("schedules")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", companyId)
          .in("status", ["submitted", "in_review"])
      ),
      countQuery(
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .gte("booking_date", today)
          .in("booking_status", ["needs_reallocation", "cancelled_by_employee"])
      ),
      userId
        ? countQuery(
            supabase
              .from("company_notifications")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .eq("target_user_id", userId)
              .eq("is_read", false)
          )
        : Promise.resolve(0),
    ]);

    const next: SidebarBadges = {};
    const put = (key: string, count: number, severity: BadgeSeverity) => {
      if (count > 0) next[key] = { count, severity };
    };
    put("Agendamentos", agendamentos, "red");
    put("Solicitações", solicitacoes, "yellow");
    put("Ausências", ausencias, "yellow");
    put("Horários", horarios, "yellow");
    put("Realocação", realocacao, "red");
    put("Notificações", notificacoes, "red");
    setBadges(next);
  }, [companyId, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`sidebar-badges-${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `company_id=eq.${companyId}` },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "requests", filter: `tenant_id=eq.${companyId}` },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedules", filter: `tenant_id=eq.${companyId}` },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company_notifications", filter: `company_id=eq.${companyId}` },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_absences", filter: `company_id=eq.${companyId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [companyId, refresh]);

  return badges;
}
