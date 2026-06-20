import { useEffect, useMemo, useState, useCallback } from "react";
import { Bell, Sparkles, Inbox, ExternalLink } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  companyId?: string;
  companySlug?: string;
}

interface CompanyNotif {
  id: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface PlatformNotif {
  id: string;
  title: string;
  message: string | null;
  release_note_id: string | null;
  created_at: string;
  is_read: boolean; // derivado de notification_views
  full_description?: string | null;
}

export function NotificationsBell({ companyId, companySlug }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"notifs" | "news">("notifs");
  const [companyNotifs, setCompanyNotifs] = useState<CompanyNotif[]>([]);
  const [platformNotifs, setPlatformNotifs] = useState<PlatformNotif[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<PlatformNotif | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [cn, vn, pn] = await Promise.all([
        supabase
          .from("company_notifications")
          .select("id,title,message,link,is_read,created_at")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("notification_views")
          .select("notification_id")
          .eq("company_id", companyId),
        supabase
          .from("platform_notifications")
          .select("id,title,message,release_note_id,created_at")
          .eq("is_sent", true)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      const viewed = new Set((vn.data ?? []).map((v: any) => v.notification_id as string));
      setCompanyNotifs((cn.data ?? []) as CompanyNotif[]);
      setPlatformNotifs(
        ((pn.data ?? []) as any[]).map((p) => ({ ...p, is_read: viewed.has(p.id) }))
      );
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Realtime para novas notificações da empresa
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`company-notifs-${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company_notifications", filter: `company_id=eq.${companyId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, load]);

  // Reset seleção ao trocar de aba
  useEffect(() => { setSelected(new Set()); }, [tab]);

  const currentList = tab === "notifs" ? companyNotifs : platformNotifs;
  const unread = useMemo(() => currentList.filter((n) => !n.is_read), [currentList]);

  const totalUnread =
    companyNotifs.filter((n) => !n.is_read).length +
    platformNotifs.filter((n) => !n.is_read).length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllUnread = () => {
    setSelected(new Set(unread.map((n) => n.id)));
  };

  const markRead = async () => {
    if (selected.size === 0 || !companyId) return;
    const ids = Array.from(selected);
    if (tab === "notifs") {
      await supabase
        .from("company_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in("id", ids);
    } else {
      const rows = ids.map((notification_id) => ({ notification_id, company_id: companyId }));
      await supabase.from("notification_views").upsert(rows, { onConflict: "notification_id,company_id", ignoreDuplicates: true });
    }
    setSelected(new Set());
    load();
  };

  const openDetail = async (n: PlatformNotif) => {
    let full = n.full_description ?? null;
    if (!full && n.release_note_id) {
      const { data } = await supabase
        .from("release_notes")
        .select("full_description")
        .eq("id", n.release_note_id)
        .maybeSingle();
      full = (data?.full_description as string | null) ?? null;
    }
    setDetail({ ...n, full_description: full });
    // marcar como visto
    if (!n.is_read && companyId) {
      await supabase
        .from("notification_views")
        .upsert(
          { notification_id: n.id, company_id: companyId },
          { onConflict: "notification_id,company_id" }
        );
      load();
    }
  };

  const handleNotifClick = async (n: CompanyNotif) => {
    if (!n.is_read) {
      await supabase
        .from("company_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", n.id);
      load();
    }
    if (n.link) {
      setOpen(false);
      window.location.href = n.link;
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative text-foreground hover:bg-primary/10"
            aria-label="Notificações"
          >
            <Bell className="h-5 w-5" />
            {totalUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[380px] p-0 bg-card border-primary/20">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <div className="border-b border-primary/10 p-2">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="notifs" className="gap-2">
                  <Inbox className="h-4 w-4" />
                  Notificações
                  {companyNotifs.filter((n) => !n.is_read).length > 0 && (
                    <span className="ml-1 text-xs bg-destructive/20 text-destructive px-1.5 rounded-full">
                      {companyNotifs.filter((n) => !n.is_read).length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="news" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Novidades
                  {platformNotifs.filter((n) => !n.is_read).length > 0 && (
                    <span className="ml-1 text-xs bg-primary/20 text-primary px-1.5 rounded-full">
                      {platformNotifs.filter((n) => !n.is_read).length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {selected.size > 0 && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-primary/10 bg-muted/30">
                <span className="text-xs text-muted-foreground">
                  {selected.size} selecionada(s)
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={selectAllUnread}>
                    Selecionar todas
                  </Button>
                  <Button size="sm" onClick={markRead}>
                    Marcar como lido
                  </Button>
                </div>
              </div>
            )}
            {selected.size === 0 && unread.length > 0 && (
              <div className="flex items-center justify-end px-3 py-2 border-b border-primary/10">
                <Button size="sm" variant="ghost" onClick={selectAllUnread} className="text-xs">
                  Selecionar todas não lidas
                </Button>
              </div>
            )}

            <TabsContent value="notifs" className="m-0">
              <NotifList
                items={companyNotifs}
                selected={selected}
                onToggle={toggle}
                onClickItem={(n) => handleNotifClick(n as CompanyNotif)}
                loading={loading}
                emptyText="Nenhuma notificação ainda"
              />
            </TabsContent>
            <TabsContent value="news" className="m-0">
              <NotifList
                items={platformNotifs}
                selected={selected}
                onToggle={toggle}
                onClickItem={(n) => openDetail(n as PlatformNotif)}
                loading={loading}
                emptyText="Nenhuma novidade ainda"
                showExternal
              />
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {detail?.title}
            </DialogTitle>
          </DialogHeader>
          {detail?.message && (
            <p className="text-sm text-muted-foreground">{detail.message}</p>
          )}
          {detail?.full_description && (
            <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm border border-primary/10 rounded-md p-3 bg-background/50">
              {detail.full_description}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ListItem {
  id: string;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

function NotifList({
  items,
  selected,
  onToggle,
  onClickItem,
  loading,
  emptyText,
  showExternal,
}: {
  items: ListItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onClickItem: (n: ListItem) => void;
  loading: boolean;
  emptyText: string;
  showExternal?: boolean;
}) {
  if (loading && items.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Carregando...</div>;
  }
  if (items.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{emptyText}</div>;
  }
  return (
    <ScrollArea className="h-[360px]">
      <ul className="divide-y divide-primary/5">
        {items.map((n) => (
          <li
            key={n.id}
            className={cn(
              "flex gap-3 p-3 hover:bg-primary/5 transition-colors",
              !n.is_read && "bg-primary/[0.03]"
            )}
          >
            <Checkbox
              checked={selected.has(n.id)}
              onCheckedChange={() => onToggle(n.id)}
              className="mt-1"
              aria-label="Selecionar"
            />
            <button
              type="button"
              onClick={() => onClickItem(n)}
              className="flex-1 text-left min-w-0"
            >
              <div className="flex items-center gap-2">
                {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                <p className={cn("text-sm truncate", !n.is_read ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {n.title}
                </p>
                {showExternal && <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 ml-auto" />}
              </div>
              {n.message && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
              )}
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
