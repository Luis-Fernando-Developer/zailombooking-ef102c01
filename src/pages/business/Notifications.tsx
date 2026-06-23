import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Bell, Check, CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BusinessLayout } from "@/components/business/BusinessLayout";

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
  const [company, setCompany] = useState<{ id: string; name: string; slug: string; owner_email: string } | null>(null);
  const [user, setUser] = useState<any>(null);
  const [employeeRole, setEmployeeRole] = useState<string | null>(null);
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u);
      const { data } = await supabase
        .from("companies").select("id,name,slug,owner_email").eq("slug", slug).single();
      setCompany((data ?? null) as any);
      if (u && data?.id) {
        const { data: emp } = await supabase
          .from("employees").select("role").eq("company_id", data.id).eq("user_id", u.id).maybeSingle();
        setEmployeeRole((emp as any)?.role ?? null);
      }
    })();
  }, [slug]);

  const load = useCallback(async () => {
    if (!company?.id || !user?.id) return;
    setLoading(true);
    // Apenas notificações destinadas a este usuário (RLS já restringe,
    // mas filtramos no client para esconder broadcasts antigos sem owner).
    const { data } = await supabase
      .from("company_notifications")
      .select("id,type,title,message,link,is_read,created_at,target_user_id")
      .eq("company_id", company.id)
      .eq("target_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data ?? []) as Notif[]);
    setLoading(false);
  }, [company?.id, user?.id]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    await supabase.from("company_notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const markAllRead = async () => {
    if (!company?.id || !user?.id) return;
    await supabase.from("company_notifications").update({ is_read: true, read_at: new Date().toISOString() })
      .eq("company_id", company.id).eq("target_user_id", user.id).eq("is_read", false);
    await load();
    toast({ title: "Todas marcadas como lidas" });
  };

  if (!company) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  const role = (company.owner_email || "").toLowerCase() === (user?.email || "").toLowerCase() ? "owner" : "employee";

  return (
    <BusinessLayout
      companySlug={company.slug}
      companyName={company.name}
      companyId={company.id}
      userRole={role}
      currentUser={user}
    >
      <div className="container max-w-3xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bell className="w-6 h-6" /> Notificações</h1>
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="w-4 h-4 mr-1" /> Marcar todas como lidas
          </Button>
        </div>

        {loading && <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>}

        {!loading && items.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">Nenhuma notificação pessoal ainda.</div>
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
    </BusinessLayout>
  );
}
