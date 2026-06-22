import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Bell, Check, CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Notif {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  target_user_id: string | null;
}

export default function Notifications() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    supabase.from("companies").select("id").eq("slug", slug).single()
      .then(({ data }) => setCompanyId(data?.id ?? null));
  }, [slug]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("company_notifications")
      .select("id,type,title,message,link,is_read,created_at,target_user_id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data ?? []) as Notif[]);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    await supabase.from("company_notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const markAllRead = async () => {
    if (!companyId) return;
    await supabase.from("company_notifications").update({ is_read: true, read_at: new Date().toISOString() })
      .eq("company_id", companyId).eq("is_read", false);
    await load();
    toast({ title: "Todas marcadas como lidas" });
  };

  return (
    <div className="container max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Bell className="w-6 h-6" /> Notificações</h1>
        <Button variant="outline" size="sm" onClick={markAllRead}>
          <CheckCheck className="w-4 h-4 mr-1" /> Marcar todas como lidas
        </Button>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>}

      {!loading && items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">Nenhuma notificação ainda.</div>
      )}

      <div className="space-y-2">
        {items.map((n) => (
          <div
            key={n.id}
            className={`p-4 rounded-lg border transition-colors ${
              n.is_read ? "bg-card" : "bg-primary/5 border-primary/30"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium">{n.title}</h3>
                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                {n.message && <p className="text-sm text-muted-foreground">{n.message}</p>}
                <p className="text-xs text-muted-foreground mt-2">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                {n.link && (
                  <Button asChild size="sm" variant="ghost">
                    <Link to={`/${slug}${n.link}`} onClick={() => markRead(n.id)}>
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </Button>
                )}
                {!n.is_read && (
                  <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                    <Check className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
