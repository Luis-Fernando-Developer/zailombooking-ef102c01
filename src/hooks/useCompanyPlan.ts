import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Returns the current plan NAME (lowercased) for a company, defaulting to "starter",
 * plus an `isPremiumPlan` convenience flag (anything not "starter").
 *
 * NOTE: company_subscriptions.plan_id is a UUID FK to subscription_plans.id,
 * so we must join to get the human-readable plan name.
 */
export function useCompanyPlan(companyId?: string) {
  const [planId, setPlanId] = useState<string>("starter");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("company_subscriptions")
        .select("subscription_plans(name)")
        .eq("company_id", companyId)
        .maybeSingle();
      if (cancelled) return;
      const name =
        (data as { subscription_plans?: { name?: string } } | null)
          ?.subscription_plans?.name?.toLowerCase() || "starter";
      setPlanId(name);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { planId, isPremiumPlan: planId !== "starter", loading };
}
