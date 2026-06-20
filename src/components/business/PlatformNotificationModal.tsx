import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface Notif {
  id: string;
  title: string;
  message: string | null;
  release_note_id: string | null;
  target_type: string;
  target_plans: string[] | null;
  target_companies: string[] | null;
}

interface Props { companyId?: string; planSlug?: string | null }

/**
 * Modal que mostra a próxima release não-visualizada para esta empresa.
 * Filtra no cliente por target_type/target_plans/target_companies.
 */
export function PlatformNotificationModal({ companyId, planSlug }: Props) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<(Notif & { full_description?: string | null }) | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const { data: viewed } = await supabase
        .from("notification_views")
        .select("notification_id")
        .eq("company_id", companyId);
      const viewedIds = new Set((viewed ?? []).map((v) => v.notification_id as string));

      const { data: notifs } = await supabase
        .from("platform_notifications")
        .select("id,title,message,release_note_id,target_type,target_plans,target_companies")
        .eq("is_sent", true)
        .order("created_at", { ascending: false })
        .limit(20);

      const match = (notifs ?? []).find((n) => {
        if (viewedIds.has(n.id)) return false;
        if (n.target_type === "all") return true;
        if (n.target_type === "plans") return planSlug ? (n.target_plans ?? []).includes(planSlug) : false;
        if (n.target_type === "companies") return (n.target_companies ?? []).includes(companyId);
        if (n.target_type === "manual_selection") return (n.target_companies ?? []).includes(companyId);
        return false;
      });

      if (!match || cancelled) return;

      let full: string | null = null;
      if (match.release_note_id) {
        const { data: rn } = await supabase
          .from("release_notes")
          .select("full_description")
          .eq("id", match.release_note_id)
          .maybeSingle();
        full = (rn?.full_description as string | null) ?? null;
      }
      setCurrent({ ...(match as Notif), full_description: full });
      setOpen(true);
    })();
    return () => { cancelled = true; };
  }, [companyId, planSlug]);

  const dismiss = async () => {
    if (current && companyId) {
      await supabase.from("notification_views").insert({
        notification_id: current.id,
        company_id: companyId,
      });
    }
    setOpen(false);
  };

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {current.title}
          </DialogTitle>
        </DialogHeader>
        {current.message && <p className="text-sm text-muted-foreground">{current.message}</p>}
        {current.full_description && (
          <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm border border-primary/10 rounded-md p-3 bg-background/50">
            {current.full_description}
          </div>
        )}
        <DialogFooter>
          <Button onClick={dismiss}>Ver novidades</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
