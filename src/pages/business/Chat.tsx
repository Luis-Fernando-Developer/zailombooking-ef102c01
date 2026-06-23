import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  MessageSquare, Send, Users, MessageCircle, Loader2, Search, Plus, PenSquare,
  Image as ImageIcon, Paperclip, Mic, Square, X, FileText, Play, Pause,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const CHAT_ROLES = ["owner", "manager", "supervisor", "rh", "marketing"] as const;
const BUCKET = "chat-attachments";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  manager: "Gerência",
  supervisor: "Supervisor",
  rh: "RH",
  marketing: "Marketing",
};

type AttachmentType = "image" | "audio" | "file";

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
  content: string | null;
  attachment_url: string | null;
  attachment_type: AttachmentType | null;
  attachment_name: string | null;
  created_at: string;
}

interface ReadState {
  thread_key: string;
  last_read_at: string;
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

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
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
  const [reads, setReads] = useState<Record<string, string>>({}); // thread_key -> last_read_at
  const [pendingFile, setPendingFile] = useState<{ file: File; type: AttachmentType; previewUrl?: string } | null>(null);
  const generalEndRef = useRef<HTMLDivElement>(null);
  const dmEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Bootstrap
  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!user || !slug) return;
      const { data: company } = await supabase
        .from("companies").select("id, owner_email").eq("slug", slug).maybeSingle();
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

      const [{ data: msgs }, { data: dms }, { data: readRows }] = await Promise.all([
        supabase.from("chat_messages").select("*")
          .eq("company_id", company.id).eq("channel_type", "general")
          .order("created_at", { ascending: true }).limit(200),
        supabase.from("chat_messages").select("*")
          .eq("company_id", company.id).eq("channel_type", "direct")
          .order("created_at", { ascending: true }).limit(500),
        supabase.from("chat_reads").select("thread_key, last_read_at")
          .eq("company_id", company.id).eq("user_id", user.id),
      ]);
      if (!mounted) return;
      setGeneralMessages((msgs || []) as ChatMessage[]);
      setDmMessages((dms || []) as ChatMessage[]);
      const readMap: Record<string, string> = {};
      (readRows || []).forEach((r: ReadState) => { readMap[r.thread_key] = r.last_read_at; });
      setReads(readMap);
      setLoading(false);
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

  // Unread counts
  const unreadGeneral = useMemo(() => {
    if (!user) return 0;
    const lr = reads["general"];
    return generalMessages.filter((m) => m.sender_user_id !== user.id && (!lr || m.created_at > lr)).length;
  }, [generalMessages, reads, user]);

  const unreadByPeer = useMemo(() => {
    const map = new Map<string, number>();
    if (!user) return map;
    for (const m of dmMessages) {
      if (m.sender_user_id === user.id) continue;
      const peer = m.sender_user_id;
      const lr = reads[peer];
      if (!lr || m.created_at > lr) map.set(peer, (map.get(peer) || 0) + 1);
    }
    return map;
  }, [dmMessages, reads, user]);

  const dmThreads = useMemo(() => {
    if (!user) return [] as Array<[string, ChatMessage]>;
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

  // Mark thread as read
  const markRead = useCallback(async (threadKey: string) => {
    if (!user || !companyId) return;
    const now = new Date().toISOString();
    setReads((prev) => ({ ...prev, [threadKey]: now }));
    await supabase.from("chat_reads").upsert({
      user_id: user.id,
      company_id: companyId,
      thread_key: threadKey,
      last_read_at: now,
    }, { onConflict: "user_id,company_id,thread_key" });
  }, [user, companyId]);

  // Auto-mark when viewing
  useEffect(() => {
    if (loading || !companyId) return;
    if (tab === "geral" && unreadGeneral > 0) markRead("general");
  }, [tab, generalMessages.length, loading, companyId, unreadGeneral, markRead]);

  useEffect(() => {
    if (loading || !companyId || tab !== "particular" || !activeDmUserId) return;
    if ((unreadByPeer.get(activeDmUserId) || 0) > 0) markRead(activeDmUserId);
  }, [tab, activeDmUserId, dmMessages.length, loading, companyId, unreadByPeer, markRead]);

  // Upload helper
  async function uploadAttachment(file: File, type: AttachmentType): Promise<{ url: string; name: string } | null> {
    if (!user || !companyId) return null;
    const ext = file.name.includes(".") ? file.name.split(".").pop() : (type === "audio" ? "webm" : "bin");
    const path = `${companyId}/${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) {
      toast({ title: "Falha no upload", description: error.message, variant: "destructive" });
      return null;
    }
    return { url: path, name: file.name };
  }

  async function handleSend() {
    if (!user || !companyId) return;
    const text = input.trim();
    if (!text && !pendingFile) return;
    if (tab === "particular" && !activeDmUserId) return;
    setSending(true);
    try {
      let attachment: { url: string; name: string } | null = null;
      let attachmentType: AttachmentType | null = null;
      if (pendingFile) {
        attachment = await uploadAttachment(pendingFile.file, pendingFile.type);
        if (!attachment) { setSending(false); return; }
        attachmentType = pendingFile.type;
      }
      const payload: any = {
        company_id: companyId,
        sender_user_id: user.id,
        content: text || null,
        attachment_url: attachment?.url || null,
        attachment_type: attachmentType,
        attachment_name: attachment?.name || null,
      };
      if (tab === "geral") {
        payload.channel_type = "general";
        payload.recipient_user_id = null;
      } else {
        payload.channel_type = "direct";
        payload.recipient_user_id = activeDmUserId;
      }
      const { error } = await supabase.from("chat_messages").insert(payload);
      if (error) throw error;
      setInput("");
      if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
      setPendingFile(null);
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

  function handlePickImage(file: File) {
    const previewUrl = URL.createObjectURL(file);
    setPendingFile({ file, type: "image", previewUrl });
  }
  function handlePickFile(file: File) {
    setPendingFile({ file, type: "file" });
  }
  function handleRecorded(blob: Blob, durationSec: number) {
    const file = new File([blob], `audio-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
    setPendingFile({ file, type: "audio", previewUrl: URL.createObjectURL(blob) });
    void durationSec;
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

      <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePickImage(f); e.target.value = ""; }} />
      <input ref={fileInputRef} type="file" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePickFile(f); e.target.value = ""; }} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "geral" | "particular")}>
        <TabsList>
          <TabsTrigger value="geral" className="gap-2">
            <MessageCircle className="w-4 h-4" /> Geral
            {unreadGeneral > 0 && <Badge className="h-5 px-1.5 text-[10px]">{unreadGeneral}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="particular" className="gap-2">
            <MessageSquare className="w-4 h-4" /> Particular
            {(() => {
              let total = 0;
              unreadByPeer.forEach((n) => { total += n; });
              return total > 0 ? <Badge className="h-5 px-1.5 text-[10px]">{total}</Badge> : null;
            })()}
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
                            <AttachmentView msg={m} self />
                            {m.content && <div>{m.content}</div>}
                            <div className="text-[10px] mt-1 opacity-70 text-right">{formatTime(m.created_at)}</div>
                          </div>
                        </li>
                      );
                    }
                    return (
                      <li key={m.id} className="flex justify-start">
                        <div className="max-w-[78%] min-w-0 space-y-1.5">
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
                          <div className="inline-block rounded-2xl rounded-tl-sm bg-muted text-foreground px-3 py-2 text-sm whitespace-pre-wrap break-words">
                            <AttachmentView msg={m} />
                            {m.content && <div>{m.content}</div>}
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
              sending={sending}
              pendingFile={pendingFile}
              clearPending={() => {
                if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
                setPendingFile(null);
              }}
              onPickImage={() => imageInputRef.current?.click()}
              onPickFile={() => fileInputRef.current?.click()}
              onRecorded={handleRecorded}
              placeholder="Escreva uma mensagem para a equipe..."
            />
          </div>
        </TabsContent>

        {/* PARTICULAR */}
        <TabsContent value="particular" className="mt-4">
          <div className="rounded-lg border bg-card grid grid-cols-1 md:grid-cols-[280px_1fr] h-[70vh] overflow-hidden">
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
                          preview={last.content || (last.attachment_type === "image" ? "📷 Imagem" : last.attachment_type === "audio" ? "🎙️ Áudio" : "📎 Arquivo")}
                          time={last.created_at}
                          unread={unreadByPeer.get(peerId) || 0}
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
                        unread={unreadByPeer.get(c.user_id) || 0}
                        onClick={() => setActiveDmUserId(c.user_id)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
              <div className="border-t p-2">
                <Button variant="secondary" className="w-full gap-2" size="sm"
                  onClick={() => { setActiveDmUserId(null); setSearch(""); }}>
                  <PenSquare className="w-4 h-4" /> Nova mensagem
                </Button>
              </div>
            </aside>

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
                      {activeContact.avatar_url && <AvatarImage src={activeContact.avatar_url} alt={activeContact.name} />}
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
                                <AttachmentView msg={m} self={isSelf} />
                                {m.content && <div>{m.content}</div>}
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
                    sending={sending}
                    pendingFile={pendingFile}
                    clearPending={() => {
                      if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
                      setPendingFile(null);
                    }}
                    onPickImage={() => imageInputRef.current?.click()}
                    onPickFile={() => fileInputRef.current?.click()}
                    onRecorded={handleRecorded}
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

/* ----------------------------- Attachments ----------------------------- */

function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) { setUrl(null); return; }
    supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60).then(({ data }) => {
      if (active) setUrl(data?.signedUrl || null);
    });
    return () => { active = false; };
  }, [path]);
  return url;
}

function AttachmentView({ msg, self }: { msg: ChatMessage; self?: boolean }) {
  const url = useSignedUrl(msg.attachment_url);
  if (!msg.attachment_url || !msg.attachment_type) return null;
  if (!url) return <div className="text-xs opacity-70 py-2">Carregando anexo…</div>;

  if (msg.attachment_type === "image") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block mb-1">
        <img src={url} alt={msg.attachment_name || "imagem"}
          className="rounded-lg max-h-64 max-w-full object-cover" />
      </a>
    );
  }
  if (msg.attachment_type === "audio") {
    return <audio controls src={url} className="mb-1 max-w-full" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className={cn("flex items-center gap-2 mb-1 underline-offset-2 hover:underline", self ? "text-primary-foreground" : "text-foreground")}>
      <FileText className="w-4 h-4" />
      <span className="text-xs truncate max-w-[200px]">{msg.attachment_name || "Arquivo"}</span>
    </a>
  );
}

/* ----------------------------- Contact row ----------------------------- */

function ContactRow({
  c, active, preview, time, unread = 0, onClick,
}: {
  c: Member; active: boolean; preview?: string; time?: string; unread?: number; onClick: () => void;
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
          <span className={cn("text-sm truncate", unread > 0 ? "font-semibold" : "font-medium")}>{c.name}</span>
          {time && <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(time)}</span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className={cn("text-xs truncate", unread > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
            {preview ? preview : ROLE_LABEL[c.role] || c.role}
          </div>
          {unread > 0 && (
            <Badge className="h-4 min-w-4 px-1 text-[10px] rounded-full shrink-0">{unread}</Badge>
          )}
        </div>
      </div>
    </button>
  );
}

/* ----------------------------- Composer + recorder ----------------------------- */

function ChatComposer({
  value, onChange, onKeyDown, onSend, sending, placeholder,
  pendingFile, clearPending, onPickImage, onPickFile, onRecorded,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  sending: boolean;
  placeholder: string;
  pendingFile: { file: File; type: AttachmentType; previewUrl?: string } | null;
  clearPending: () => void;
  onPickImage: () => void;
  onPickFile: () => void;
  onRecorded: (blob: Blob, durationSec: number) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const dur = (Date.now() - startedAtRef.current) / 1000;
        stream.getTracks().forEach((t) => t.stop());
        onRecorded(blob, dur);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      startedAtRef.current = Date.now();
      setRecSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setRecSeconds((s) => s + 1);
      }, 1000);
    } catch (e: any) {
      toast({ title: "Microfone indisponível", description: e?.message || "Permita o acesso ao microfone.", variant: "destructive" });
    }
  }
  function stopRecording(cancel = false) {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    if (cancel) {
      mr.ondataavailable = null as any;
      mr.onstop = () => mr.stream.getTracks().forEach((t) => t.stop());
    }
    try { mr.stop(); } catch {}
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    mediaRecorderRef.current = null;
  }
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const disabled = sending || (!value.trim() && !pendingFile);

  return (
    <div className="border-t p-3 space-y-2">
      {pendingFile && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
          {pendingFile.type === "image" && pendingFile.previewUrl ? (
            <img src={pendingFile.previewUrl} alt="preview" className="w-12 h-12 rounded object-cover" />
          ) : pendingFile.type === "audio" && pendingFile.previewUrl ? (
            <audio controls src={pendingFile.previewUrl} className="h-8" />
          ) : (
            <div className="w-12 h-12 rounded bg-background flex items-center justify-center">
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{pendingFile.file.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {(pendingFile.file.size / 1024).toFixed(1)} KB
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={clearPending} aria-label="Remover anexo">
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5">
          <span className="relative flex w-2.5 h-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
          </span>
          <span className="text-sm flex-1">Gravando… {fmtDuration(recSeconds)}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => stopRecording(true)} className="h-8">
            Cancelar
          </Button>
          <Button type="button" size="icon" className="h-8 w-8 rounded-full" onClick={() => stopRecording(false)} aria-label="Parar">
            <Square className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2 rounded-full border bg-background px-2 py-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon"
                className="h-8 w-8 rounded-full shrink-0 text-muted-foreground" aria-label="Anexar">
                <Plus className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuItem onClick={onPickImage}>
                <ImageIcon className="w-4 h-4 mr-2" /> Imagem
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onPickFile}>
                <Paperclip className="w-4 h-4 mr-2" /> Arquivo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={startRecording}>
                <Mic className="w-4 h-4 mr-2" /> Gravar áudio
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 min-h-[32px] max-h-[140px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1 py-1 text-sm"
          />
          {!value.trim() && !pendingFile ? (
            <Button type="button" variant="ghost" size="icon"
              className="h-8 w-8 rounded-full shrink-0 text-muted-foreground"
              onClick={startRecording} aria-label="Gravar áudio">
              <Mic className="w-4 h-4" />
            </Button>
          ) : (
            <Button type="button" onClick={onSend} disabled={disabled}
              size="icon" className="h-8 w-8 rounded-full shrink-0" aria-label="Enviar">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
