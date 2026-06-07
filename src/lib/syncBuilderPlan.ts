/**
 * Dispara sync do plano da empresa com o builder-flow-api.
 * Fire-and-forget: nunca bloqueia a UI; apenas loga falhas.
 */
import { getEdgeFunctionUrl } from "./supabaseHelpers";
import { supabase } from "./supabaseClient";

export async function syncBuilderPlan(companyId: string): Promise<void> {
  if (!companyId) return;
  try {
    const { data, error } = await supabase.functions.invoke("sync-builder-plan", {
      body: { company_id: companyId },
    });
    
    if (error || !data?.ok) {
      console.warn("[syncBuilderPlan] falha:", error || data);
    } else {
      console.log("[syncBuilderPlan] ok:", data);
    }
  } catch (err) {
    console.warn("[syncBuilderPlan] erro:", err);
  }
}
