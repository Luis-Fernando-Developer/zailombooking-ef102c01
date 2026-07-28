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
  | "integrations"
  | "whatsapp_instances";

export interface PlanLimitCheck {
  resource: PlanResource;
  current: number;
  limit: number | null;
  plan_name: string | null;
  unlimited: boolean;
  in_grace: boolean;
  grace_until: string | null;
  allowed: boolean;
  subscription_status?: string | null;
}

const RESOURCE_LABEL: Record<PlanResource, string> = {
  employees: "profissionais ativos",
  services: "servicos ativos",
  combos: "combos ativos",
  bookings_month: "agendamentos no mes",
  chatbots: "bots",
  chatbot_messages: "mensagens",
  integrations: "integracoes",
  whatsapp_instances: "instancias de WhatsApp",
};

const COLUMN_MAP: Record<PlanResource, string> = {
  employees:          "max_employees",
  services:           "max_services",
  combos:             "max_services",
  bookings_month:     "max_bookings_month",
  chatbots:           "max_chatbots",
  chatbot_messages:   "max_chatbot_messages",
  integrations:       "max_integrations",
  whatsapp_instances: "max_whatsapp_instances",
};

export function usePlanLimits(companyId?: string) {
  const { toast } = useToast();

  const check = useCallback(
    async (resource: PlanResource): Promise<PlanLimitCheck | null> => {
      if (!companyId) return null;

      // 1) v2 rpc: retorna limites + subscription_status
      const { data, error } = await supabase.rpc("check_plan_limit_v2", {
        _company_id: companyId,
        _resource: resource,
      });

      if (error) {
        console.error("[usePlanLimits] rpc error:", error);
      }

      // 2) fonte da verdade: plan_limits
      const { data: sub } = await supabase
        .from("company_subscriptions")
        .select("plan_id, subscription_plans(name), billing_status")
        .eq("company_id", companyId)
        .maybeSingle();

      const subscriptionPlanId = (sub as any)?.plan_id?.toString() ?? null;
      const planKey =
        ((sub as any)?.subscription_plans?.name ?? "starter")
          .toString()
          .toLowerCase();

      const { data: limitRowById } = subscriptionPlanId
        ? await supabase
            .from("plan_limits")
            .select("*")
            .eq("plan_id", subscriptionPlanId)
            .maybeSingle()
        : { data: null };

      const { data: limitRowByName } = limitRowById
        ? { data: null }
        : await supabase
            .from("plan_limits")
            .select("*")
            .ilike("plan_name", planKey)
            .maybeSingle();

      const resolvedLimitRow = limitRowById ?? limitRowByName;

      const col = COLUMN_MAP[resource];
      const rawLimit = resolvedLimitRow ? (resolvedLimitRow as any)[col] : -1;
      const unlimited = rawLimit === -1 || rawLimit === null;
      const limit = unlimited ? null : Number(rawLimit);

      const base = (data as unknown as PlanLimitCheck) ?? {
        resource,
        current: 0,
        limit,
        plan_name: planKey,
        unlimited,
        in_grace: false,
        grace_until: null,
        allowed: true,
      };

      const subStatus =
        (base as any).subscription_status ??
        (sub as any)?.billing_status ??
        "active";
      const inactive =
        subStatus === "suspended" || subStatus === "blocked" || subStatus === "paused";

      const result: PlanLimitCheck = {
        ...base,
        limit,
        unlimited,
        plan_name: planKey,
        subscription_status: subStatus,
        allowed:
          !inactive && (unlimited || (limit !== null && base.current < limit)),
      };
      return result;
    },
    [companyId],
  );

  const guard = useCallback(
    async (resource: PlanResource): Promise<boolean> => {
      const r = await check(resource);
      if (!r) return true; // fail-open se rpc falhou
      if (r.allowed) return true;

      if (
        r.subscription_status === "suspended" ||
        r.subscription_status === "blocked" ||
        r.subscription_status === "paused"
      ) {
        toast({
          title: "Assinatura inativa",
          description:
            "Sua assinatura esta " +
            r.subscription_status +
            ". Regularize o pagamento para continuar usando o sistema.",
          variant: "destructive",
        });
        return false;
      }

      toast({
        title: "Limite do plano atingido",
        description: `Seu plano ${r.plan_name ?? ""} permite ${r.limit} ${RESOURCE_LABEL[resource]} (uso atual: ${r.current}). Faca upgrade ou desative algum item para continuar.`,
        variant: "destructive",
      });
      return false;
    },
    [check, toast],
  );

  return { check, guard };
}
