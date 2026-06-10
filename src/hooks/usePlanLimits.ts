import { useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

export type PlanResource =
  | "employees"
  | "services"
  | "combos"
  | "bookings_month"
  | "chatbots"
  | "chatbot_messages"
  | "integrations";

export interface PlanLimitCheck {
  resource: PlanResource;
  current: number;
  limit: number | null;
  plan_name: string | null;
  unlimited: boolean;
  in_grace: boolean;
  grace_until: string | null;
  allowed: boolean;
}

const RESOURCE_LABEL: Record<PlanResource, string> = {
  employees: "profissionais ativos",
  services: "serviços ativos",
  combos: "combos ativos",
  bookings_month: "agendamentos confirmados no mês",
  chatbots: "bots",
  chatbot_messages: "mensagens",
  integrations: "integrações",
};

export function usePlanLimits(companyId?: string) {
  const { toast } = useToast();

  const check = useCallback(
    async (resource: PlanResource): Promise<PlanLimitCheck | null> => {
      if (!companyId) return null;
      
      // First, get the company's current plan
      const { data: sub } = await supabase
        .from("company_subscriptions")
        .select("plan_id")
        .eq("company_id", companyId)
        .maybeSingle();
      
      const planId = sub?.plan_id || 'starter';

      // Then get limits from plan_limits table (the new source of truth)
      const { data: limitData } = await supabase
        .from("plan_limits")
        .select("*")
        .eq("plan_id", planId)
        .maybeSingle();

      if (!limitData) return null;

      // Map resource to database column
      const columnMap: Record<PlanResource, string> = {
        employees: "max_employees",
        services: "max_services",
        combos: "max_services", // Usually tied to services or separate
        bookings_month: "max_bookings_month",
        chatbots: "max_chatbots",
        chatbot_messages: "max_chatbot_messages",
        integrations: "max_integrations"
      };

      const limit = limitData[columnMap[resource]] ?? -1;
      
      // Perform local check or RPC for current usage
      // For now, we still rely on the RPC for the usage calculation logic
      const { data, error } = await supabase.rpc("check_plan_limit", {
        _company_id: companyId,
        _resource: resource,
      });

      if (error) {
        console.error("[usePlanLimits] erro:", error);
        return null;
      }
      
      // Override the limit with the one from our new table if needed
      const result = data as unknown as PlanLimitCheck;
      return {
        ...result,
        limit: limit === -1 ? null : limit,
        unlimited: limit === -1,
        allowed: limit === -1 || result.current < limit
      };
    },
    [companyId]
  );


  /** Returns true if allowed; otherwise shows a toast and returns false. */
  const guard = useCallback(
    async (resource: PlanResource): Promise<boolean> => {
      const r = await check(resource);
      if (!r) return true; // fail-open if check itself errors
      if (r.allowed) return true;
      toast({
        title: "Limite do plano atingido",
        description: `Seu plano ${r.plan_name ?? ""} permite ${r.limit} ${RESOURCE_LABEL[resource]} (uso atual: ${r.current}). Faça upgrade ou desative algum item para continuar.`,
        variant: "destructive",
      });
      return false;
    },
    [check, toast]
  );

  return { check, guard };
}
