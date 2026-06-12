/**
 * Dispara sync do plano da empresa com o builder-flow-api.
 * Fire-and-forget: nunca bloqueia a UI; apenas loga falhas.
 */
import { getEdgeFunctionUrl } from "./supabaseHelpers";
import { supabase } from "./supabaseClient";

export async function syncBuilderPlan(companyId: string, planName?: string, limits?: any): Promise<void> {
  if (!companyId) return;
  try {
    const { data, error } = await supabase.functions.invoke("chatbot-integration", {
      body: { 
        action: "sync-plan",
        company_id: companyId,
        plan: planName,
        limits: limits
      },
    });
    
    if (error || !data?.success) {
      console.warn("[syncBuilderPlan] falha:", error || data);
    } else {
      console.log("[syncBuilderPlan] ok:", data);
    }
  } catch (err) {
    console.warn("[syncBuilderPlan] erro:", err);
  }
}
