import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type BadgeSeverity = "red" | "yellow";
export interface BadgeInfo {
  count: number;
  severity: BadgeSeverity;
}
export type SidebarBadges = Partial<Record<string, BadgeInfo>>;

/**
 * Contagens em tempo real para os badges do sidebar.
 * Keys = títulos exatos dos itens do menu (ver BusinessSidebar.menuItems).
 *
 * - Vermelho (red): demanda IMEDIATA do usuário (notificações, mensagens, reagendamento).
 * - Amarelo (yellow): demanda APROVAÇÃO/atenção do gestor (solicitações pendentes).
 */
export function useSidebarBadges(companyId?: string, userId?: string): SidebarBadges {
  const [badges, setBadges] = useState<SidebarBadges>({});

  const refresh = useCallback(async () => {
    if (!companyId) return;
    const today = new Date().toISOString().slice(0, 10);

    const queries: Promise<{ key: string; sev: BadgeSeverity; count: number }>[] = [];

    // Agendamentos: criados hoje aguardando confirmação
    queries.push(
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("booking_date", today)
        .in("booking_status", ["pending", "scheduled"])
        .then((r) => ({ key: "Agendamentos", sev: "red", count: r.count ?? 0 }))
    );

    // Solicitações pendentes (qualquer tipo)
    queries.push(
      supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", companyId)
        .eq("status", "pending")
        .then((r) => ({ key: "Solicitações", sev: "yellow", count: r.count ?? 0 }))
    );

    // Ausências (solicitação de ausência = atenção do gestor)
    queries.push(
      supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", companyId)
        .eq("status", "pending")
        .eq("request_type", "absence")
        .then((r) => ({ key: "Ausências", sev: "yellow", count: r.count ?? 0 }))
    );

    // Horários: escalas aguardando aprovação
    queries.push(
      supabase
        .from("schedules")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", companyId)
        .in("status", ["submitted", "in_review"])
        .then((r) => ({ key: "Horários", sev: "yellow", count: r.count ?? 0 }))
    );

    // Realocação: cancelamentos/rejeições recentes (>= hoje) que ainda têm a data futura
    queries.push(
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gte("booking_date", today)
        .in("booking_status", ["needs_reallocation", "cancelled_by_employee"])
        .then((r) => ({ key: "Realocação", sev: "red", count: r.count ?? 0 }))
    );

    // Notificações do usuário (não lidas)
    if (userId) {
      queries.push(
        supabase
          .from("company_notifications")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("target_user_id", userId)
          .eq("is_read", false)
          .then((r) => ({ key: "Notificações", sev: "red", count: r.count ?? 0 }))
      );
    }

    const results = await Promise.all(queries);
    const next: SidebarBadges = {};
    for (const { key, sev, count } of results) {
      if (count > 0) next[key] = { count, severity: sev };
    }
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
        {
          event: "*",
          schema: "public",
          table: "company_notifications",
          filter: `company_id=eq.${companyId}`,
        },
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
