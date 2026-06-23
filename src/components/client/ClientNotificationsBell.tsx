import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

interface ClientNotificationsBellProps {
  companyId?: string;
}

interface ClientNotification {
  id: string;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

export function ClientNotificationsBell({ companyId }: ClientNotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ClientNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data.user?.id ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    if (!companyId || !userId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("company_notifications")
        .select("id,title,message,is_read,created_at")
        .eq("company_id", companyId)
        .eq("target_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      setItems((data ?? []) as ClientNotification[]);
    } catch (error) {
      console.error("[ClientNotificationsBell]", error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!companyId || !userId) return;

    const channel = supabase
      .channel(`client-notifications-${companyId}-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company_notifications", filter: `company_id=eq.${companyId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, load, userId]);

  const unreadCount = useMemo(() => items.filter((item) => !item.is_read).length, [items]);

  const markRead = async (id: string) => {
    await supabase
      .from("company_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);

    setItems((current) => current.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-foreground hover:bg-primary/10"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[360px] border-primary/20 bg-card p-0">
        <div className="flex items-center gap-2 border-b border-primary/10 px-3 py-3">
          <Inbox className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Notificações</p>
        </div>

        {loading && items.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma notificação ainda</div>
        ) : (
          <ScrollArea className="h-[360px]">
            <ul className="divide-y divide-primary/5">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={cn("flex gap-3 p-3 transition-colors hover:bg-primary/5", !item.is_read && "bg-primary/[0.03]")}
                >
                  <button type="button" className="flex-1 text-left" onClick={() => markRead(item.id)}>
                    <div className="flex items-center gap-2">
                      {!item.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      <p className={cn("truncate text-sm", !item.is_read ? "font-semibold text-foreground" : "text-muted-foreground")}>
                        {item.title}
                      </p>
                    </div>
                    {item.message && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.message}</p>}
                    <p className="mt-1 text-[10px] text-muted-foreground/70">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </button>

                  {!item.is_read && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => markRead(item.id)} aria-label="Marcar como lida">
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}