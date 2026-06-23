import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { MessageSquare, Send, Users, MessageCircle, Loader2, Search, Plus, PenSquare } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const CHAT_ROLES = ["owner", "manager", "supervisor", "rh", "marketing"] as const;

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  manager: "Gerência",
  supervisor: "Supervisor",
  rh: "RH",
  marketing: "Marketing",
};

interface Member {
  user_id: string;
  name: string;
  role: string;
  avatar_url: string | null;
  job_title: string | null;
  is_self: boolean;
}

interface ChatMessage {
  id: string;
  company_id: string;
  channel_type: "general" | "direct";
  sender_user_id: string;
  recipient_user_id: string | null;
  content: string;
  created_at: string;
}

function initials(name: string) {
  return (name || "?").trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  return isToday
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Chat() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [generalMessages, setGeneralMessages] = useState<ChatMessage[]>([]);
  const [dmMessages, setDmMessages] = useState<ChatMessage[]>([]);
  const [activeDmUserId, setActiveDmUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<"geral" | "particular">("geral");
  const [search, setSearch] = useState("");
  const generalEndRef = useRef<HTMLDivElement>(null);
  const dmEndRef = useRef<HTMLDivElement>(null);

  // Bootstrap: company + members
  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!user || !slug) return;
      const { data: company } = await supabase
        .from("companies")
        .select("id, owner_email")
        .eq("slug", slug)
        .maybeSingle();
      if (!mounted || !company) { setLoading(false); return; }
      setCompanyId(company.id);

      const { data: emps } = await supabase
        .from("employees")
        .select("user_id, name, role, avatar_url, internal_job_title")
        .eq("company_id", company.id)
        .in("role", CHAT_ROLES as unknown as string[]);

      const list: Member[] = (emps || [])
        .filter((e: any) => e.user_id)
        .map((e: any) => ({
          user_id: e.user_id,
          name: e.name || "Sem nome",
          role: e.role,
          avatar_url: e.avatar_url,
          job_title: e.internal_job_title,
          is_self: e.user_id === user.id,
        }));
      if (mounted) setMembers(list);

      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("company_id", company.id)
        .eq("channel_type", "general")
        .order("created_at", { ascending: true })
        .limit(200);
      if (mounted) setGeneralMessages((msgs || []) as ChatMessage[]);

      const { data: dms } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("company_id", company.id)
        .eq("channel_type", "direct")
        .order("created_at", { ascending: true })
        .limit(500);
      if (mounted) setDmMessages((dms || []) as ChatMessage[]);

      if (mounted) setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, [user, slug]);

  // Realtime
  useEffect(() => {
    if (!companyId || !user) return;
    const ch = supabase
      .channel(`chat_messages_${companyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `company_id=eq.${companyId}` },
        (payload) => {
          const m = payload.new as ChatMessage;
          if (m.channel_type === "general") {
            setGeneralMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
          } else if (m.channel_type === "direct") {
            if (m.sender_user_id === user.id || m.recipient_user_id === user.id) {
              setDmMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, user]);

  // Auto-scroll
  useEffect(() => {
    if (tab === "geral") generalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [generalMessages, tab]);
  useEffect(() => {
    if (tab === "particular") dmEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dmMessages, activeDmUserId, tab]);

  const memberMap = useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((x) => m.set(x.user_id, x));
    return m;
  }, [members]);

  const contacts = useMemo(
    () => members.filter((m) => !m.is_self && m.name.toLowerCase().includes(search.toLowerCase())),
    [members, search]
  );

  // Aggregate DM threads (last message per peer) + unread
  const dmThreads = useMemo(() => {
    if (!user) return [];
    const byPeer = new Map<string, ChatMessage>();
    for (const m of dmMessages) {
      const peer = m.sender_user_id === user.id ? m.recipient_user_id! : m.sender_user_id;
      const prev = byPeer.get(peer);
      if (!prev || new Date(m.created_at) > new Date(prev.created_at)) byPeer.set(peer, m);
    }
    return Array.from(byPeer.entries()).sort(
      (a, b) => new Date(b[1].created_at).getTime() - new Date(a[1].created_at).getTime()
    );
  }, [dmMessages, user]);

  const activeDmMessages = useMemo(() => {
    if (!user || !activeDmUserId) return [];
    return dmMessages.filter(
      (m) =>
        (m.sender_user_id === user.id && m.recipient_user_id === activeDmUserId) ||
        (m.sender_user_id === activeDmUserId && m.recipient_user_id === user.id)
    );
  }, [dmMessages, activeDmUserId, user]);

  const activeContact = activeDmUserId ? memberMap.get(activeDmUserId) : null;

  async function handleSend() {
    if (!user || !companyId) return;
    const text = input.trim();
    if (!text) return;
    setSending(true);
    try {
      const payload: any = {
        company_id: companyId,
        sender_user_id: user.id,
        content: text,
      };
      if (tab === "geral") {
        payload.channel_type = "general";
        payload.recipient_user_id = null;
      } else {
        if (!activeDmUserId) { setSending(false); return; }
        payload.channel_type = "direct";
        payload.recipient_user_id = activeDmUserId;
      }
      const { error } = await supabase.from("chat_messages").insert(payload);
      if (error) throw error;
      setInput("");
    } catch (e: any) {
      toast({ title: "Não foi possível enviar", description: e?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (loading) {
    return (
      <div className="container max-w-6xl mx-auto p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto p-4 sm:p-6">
      <header className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-primary" /> Bate-papo
        </h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="w-4 h-4" /> {members.length} membros habilitados
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "geral" | "particular")}>
        <TabsList>
          <TabsTrigger value="geral" className="gap-2">
            <MessageCircle className="w-4 h-4" /> Geral
          </TabsTrigger>
          <TabsTrigger value="particular" className="gap-2">
            <MessageSquare className="w-4 h-4" /> Particular
          </TabsTrigger>
        </TabsList>

        {/* GERAL */}
        <TabsContent value="geral" className="mt-4">
          <div className="rounded-lg border bg-card flex flex-col h-[70vh]">
            <ScrollArea className="flex-1 p-4">
              {generalMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center text-muted-foreground text-sm py-12">
                  Seja o primeiro a iniciar a conversa do time.
                </div>
              ) : (
                <ul className="space-y-5">
                  {generalMessages.map((m) => {
                    const sender = memberMap.get(m.sender_user_id);
                    const isSelf = sender?.is_self;
                    if (isSelf) {
                      return (
                        <li key={m.id} className="flex justify-end">
                          <div className="max-w-[78%] inline-block rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap break-words">
                            <div>{m.content}</div>
                            <div className="text-[10px] mt-1 opacity-70 text-right">{formatTime(m.created_at)}</div>
                          </div>
                        </li>
                      );
                    }
                    return (
                      <li key={m.id} className="flex justify-start">
                        <div className="max-w-[78%] min-w-0 space-y-1.5">
                          {/* Cartão identificação */}
                          <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-1.5 w-fit">
                            <Avatar className="w-8 h-8 shrink-0">
                              {sender?.avatar_url && <AvatarImage src={sender.avatar_url} alt={sender.name} />}
                              <AvatarFallback className="text-xs">{initials(sender?.name || "?")}</AvatarFallback>
                            </Avatar>
                            <div className="leading-tight min-w-0">
                              <div className="text-sm font-semibold truncate">{sender?.name || "Usuário"}</div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {sender ? (ROLE_LABEL[sender.role] || sender.role) : ""}
                                {sender?.job_title ? ` · ${sender.job_title}` : ""}
                              </div>
                            </div>
                          </div>
                          {/* Balão */}
                          <div className="inline-block rounded-2xl rounded-tl-sm bg-muted text-foreground px-3 py-2 text-sm whitespace-pre-wrap break-words">
                            <div>{m.content}</div>
                            <div className="text-[10px] mt-1 opacity-70 text-right">{formatTime(m.created_at)}</div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  <div ref={generalEndRef} />
                </ul>
              )}
            </ScrollArea>
            <ChatComposer
              value={input}
              onChange={setInput}
              onKeyDown={onKeyDown}
              onSend={handleSend}
              disabled={sending || !input.trim()}
              placeholder="Escreva uma mensagem para a equipe..."
            />
          </div>
        </TabsContent>

        {/* PARTICULAR */}
        <TabsContent value="particular" className="mt-4">
          <div className="rounded-lg border bg-card grid grid-cols-1 md:grid-cols-[280px_1fr] h-[70vh] overflow-hidden">
            {/* Sidebar de contatos */}
            <aside className="border-r flex flex-col min-h-0">
              <div className="p-3 border-b">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Pesquisar..."
                    className="pl-8 h-9 text-sm"
                  />
                </div>
              </div>
              <ScrollArea className="flex-1">
                {dmThreads.length > 0 && (
                  <div className="p-2">
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground px-2 mb-1 tracking-wide">Recentes</div>
                    {dmThreads.map(([peerId, last]) => {
                      const c = memberMap.get(peerId);
                      if (!c) return null;
                      return (
                        <ContactRow
                          key={`recent-${peerId}`}
                          c={c}
                          active={activeDmUserId === peerId}
                          preview={last.content}
                          time={last.created_at}
                          onClick={() => setActiveDmUserId(peerId)}
                        />
                      );
                    })}
                  </div>
                )}
                <div className="p-2">
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground px-2 mb-1 tracking-wide">Contatos</div>
                  {contacts.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-3">Nenhum contato.</p>
                  ) : (
                    contacts.map((c) => (
                      <ContactRow
                        key={c.user_id}
                        c={c}
                        active={activeDmUserId === c.user_id}
                        onClick={() => setActiveDmUserId(c.user_id)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
              <div className="border-t p-2">
                <Button
                  variant="secondary"
                  className="w-full gap-2"
                  size="sm"
                  onClick={() => {
                    setActiveDmUserId(null);
                    setSearch("");
                  }}
                >
                  <PenSquare className="w-4 h-4" /> Nova mensagem
                </Button>
              </div>
            </aside>

            {/* Conversa */}
            <section className="flex flex-col min-h-0">
              {!activeContact ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                  <MessageSquare className="w-10 h-10 mb-3 opacity-50" />
                  <p className="text-sm">Selecione um contato para iniciar uma conversa particular.</p>
                </div>
              ) : (
                <>
                  <header className="border-b p-3 flex items-center gap-3">
                    <Avatar className="w-9 h-9">
                      {activeContact.avatar_url && (
                        <AvatarImage src={activeContact.avatar_url} alt={activeContact.name} />
                      )}
                      <AvatarFallback>{initials(activeContact.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{activeContact.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {ROLE_LABEL[activeContact.role] || activeContact.role}
                        {activeContact.job_title ? ` · ${activeContact.job_title}` : ""}
                      </div>
                    </div>
                  </header>

                  <ScrollArea className="flex-1 p-4">
                    {activeDmMessages.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-center text-muted-foreground text-sm py-12">
                        Diga olá para iniciar a conversa.
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {activeDmMessages.map((m) => {
                          const isSelf = m.sender_user_id === user?.id;
                          return (
                            <li key={m.id} className={cn("flex", isSelf ? "justify-end" : "justify-start")}>
                              <div
                                className={cn(
                                  "max-w-[78%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                                  isSelf
                                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                                    : "bg-muted text-foreground rounded-tl-sm"
                                )}
                              >
                                <div>{m.content}</div>
                                <div className={cn("text-[10px] mt-1 opacity-70", isSelf ? "text-right" : "text-left")}>
                                  {formatTime(m.created_at)}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                        <div ref={dmEndRef} />
                      </ul>
                    )}
                  </ScrollArea>

                  <ChatComposer
                    value={input}
                    onChange={setInput}
                    onKeyDown={onKeyDown}
                    onSend={handleSend}
                    disabled={sending || !input.trim()}
                    placeholder={`Mensagem para ${activeContact.name.split(" ")[0]}...`}
                  />

                </>
              )}
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ContactRow({
  c,
  active,
  preview,
  time,
  onClick,
}: {
  c: Member;
  active: boolean;
  preview?: string;
  time?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left hover:bg-muted/60 transition-colors",
        active && "bg-muted"
      )}
    >
      <Avatar className="w-8 h-8 shrink-0">
        {c.avatar_url && <AvatarImage src={c.avatar_url} alt={c.name} />}
        <AvatarFallback className="text-xs">{initials(c.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate">{c.name}</span>
          {time && <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(time)}</span>}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {preview ? preview : ROLE_LABEL[c.role] || c.role}
        </div>
      </div>
    </button>
  );
}

function ChatComposer({
  value,
  onChange,
  onKeyDown,
  onSend,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
}) {
  return (
    <div className="border-t p-3">
      <div className="flex items-end gap-2 rounded-full border bg-background px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full shrink-0 text-muted-foreground"
          aria-label="Anexar"
        >
          <Plus className="w-4 h-4" />
        </Button>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          className="flex-1 min-h-[32px] max-h-[140px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1 py-1 text-sm"
        />
        <Button
          type="button"
          onClick={onSend}
          disabled={disabled}
          size="icon"
          className="h-8 w-8 rounded-full shrink-0"
          aria-label="Enviar"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
