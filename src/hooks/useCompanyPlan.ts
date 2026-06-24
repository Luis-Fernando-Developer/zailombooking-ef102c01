import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Returns the current plan id for a company (defaults to "starter")
 * and a convenience `isPremiumPlan` flag (anything not "starter").
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
        .select("plan_id")
        .eq("company_id", companyId)
        .maybeSingle();
      if (cancelled) return;
      setPlanId(data?.plan_id || "starter");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { planId, isPremiumPlan: planId !== "starter", loading };
}
