import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { MarketingCampaign, MarketingMaterial } from "@/lib/api/marketing";

export interface CampaignWithMaterials extends MarketingCampaign {
  materials: MarketingMaterial[];
}

/**
 * Retorna campanhas ativas (aprovadas/agendadas/ativas) para uma empresa
 * filtradas por placement e dentro da janela de datas (quando definida).
 */
export function useActiveCampaigns(companyId: string | undefined | null, placement: string) {
  const [campaigns, setCampaigns] = useState<CampaignWithMaterials[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const nowIso = new Date().toISOString();
        const { data: camps, error } = await supabase
          .from("marketing_campaigns")
          .select("*")
          .eq("company_id", companyId)
          .in("status", ["approved", "scheduled", "active"])
          .is("deleted_at", null)
          .contains("placements", [placement])
          .or(`start_at.is.null,start_at.lte.${nowIso}`)
          .or(`end_at.is.null,end_at.gte.${nowIso}`);
        if (error) throw error;
        const list = (camps ?? []) as MarketingCampaign[];
        if (list.length === 0) {
          if (!cancelled) setCampaigns([]);
          return;
        }
        const ids = list.map((c) => c.id);
        const { data: rels } = await supabase
          .from("marketing_campaign_materials")
          .select("campaign_id, ordering, marketing_materials(*)")
          .in("campaign_id", ids)
          .order("ordering");
        const byId: Record<string, MarketingMaterial[]> = {};
        (rels ?? []).forEach((r: any) => {
          const m = r.marketing_materials;
          if (!m) return;
          if (m.status && m.status !== "approved") return;
          byId[r.campaign_id] = byId[r.campaign_id] || [];
          byId[r.campaign_id].push(m as MarketingMaterial);
        });
        if (!cancelled) {
          setCampaigns(list.map((c) => ({ ...c, materials: byId[c.id] ?? [] })));
        }
      } catch (err) {
        console.error("[useActiveCampaigns]", err);
        if (!cancelled) setCampaigns([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, placement]);

  return { campaigns, loading };
}
