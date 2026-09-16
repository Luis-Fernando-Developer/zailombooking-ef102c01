import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  MessageSquare, Send, Users, MessageCircle, Loader2, Search, Plus, PenSquare,
  Image as ImageIcon, Paperclip, Mic, Square, X, FileText, Play, Pause,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/use-permissions";
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
import { BusinessLayout } from "@/components/business/BusinessLayout";

const BUCKET = "chat-attachments";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Administrador",
  manager: "Gerência",
  supervisor: "Supervisor",
  receptionist: "Recepcionista",
  employee: "Funcionário",
  rh: "RH",
  marketing: "Marketing",
  designer: "Designer",
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
  const { hasPermission } = usePermissions(companyId ?? undefined, user);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [myRole, setMyRole] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const [generalMessages, setGeneralMessages] = useState<ChatMessage[]>([]);
  const [dmMessages, setDmMessages] = useState<ChatMessage[]>([]);
  const [activeDmUserId, setActiveDmUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<"geral" | "particular">("geral");
  const [search, setSearch] = useState("");
  const [reads, setReads] = useState<Record<string, string>>({});
  const [pendingFile, setPendingFile] = useState<{ file: File; type: AttachmentType; previewUrl?: string } | null>(null);
  const generalEndRef = useRef<HTMLDivElement>(null);
  const dmEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const canViewChat = hasPermission("chat.view") || ["owner", "admin"].includes(myRole);
  const canSendChat = hasPermission("chat.send") || ["owner", "admin"].includes(myRole);

  // Bootstrap
  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!user || !slug) return;
      const { data: company } = await supabase
        .from("companies").select("id, name, slug, owner_email").eq("slug", slug).maybeSingle();
      if (!mounted || !company) { setLoading(false); return; }
      setCompanyId(company.id);
      setCompanyName((company as any).name || "");

      const { data: emps } = await supabase
        .from("employees")
        .select("id, user_id, name, role, avatar_url, internal_job_title")
        .eq("company_id", company.id);

      const employeeIds = (emps || []).map((e: any) => e.id).filter(Boolean);
      const { data: permissionRows } = employeeIds.length
        ? await supabase
            .from("employee_permissions")
            .select("employee_id, permissions!inner(code, is_active)")
            .in("employee_id", employeeIds)
        : { data: [] as any[] };

      const permissionMap = new Map<string, Set<string>>();
      (permissionRows || []).forEach((row: any) => {
        const permission = Array.isArray(row.permissions) ? row.permissions[0] : row.permissions;
        if (!permission?.code || permission.is_active === false) return;
        if (!permissionMap.has(row.employee_id)) permissionMap.set(row.employee_id, new Set());
        permissionMap.get(row.employee_id)!.add(permission.code);
      });

      const chatEmps = (emps || []).filter((e: any) => {
        const codes = permissionMap.get(e.id) || new Set<string>();
        return ["owner", "admin"].includes(e.role) || codes.has("chat.view");
      });

      const me = (chatEmps || []).find((e: any) => e.user_id === user.id);
      if (me) setMyRole((me as any).role);

      const list: Member[] = (chatEmps || [])
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

  useEffect(() => {
    if (loading || !companyId) return;
    if (tab === "geral" && unreadGeneral > 0) markRead("general");
  }, [tab, generalMessages.length, loading, companyId, unreadGeneral, markRead]);

  useEffect(() => {
    if (loading || !companyId || tab !== "particular" || !activeDmUserId) return;
    if ((unreadByPeer.get(activeDmUserId) || 0) > 0) markRead(activeDmUserId);
  }, [tab, activeDmUserId, dmMessages.length, loading, companyId, unreadByPeer, markRead]);

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
    if (!user || !companyId || !canSendChat) return;
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
      <BusinessLayout companySlug={slug || ""} companyName={companyName} companyId={companyId || undefined} userRole={myRole} currentUser={user}>
        <div className="container max-w-6xl mx-auto p-6 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </BusinessLayout>
    );
  }

  if (!canViewChat) {
    return (
      <BusinessLayout companySlug={slug || ""} companyName={companyName} companyId={companyId || undefined} userRole={myRole} currentUser={user}>
        <div className="container max-w-6xl mx-auto p-6 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Acesso Negado</h2>
            <p className="text-sm text-muted-foreground">Você não possui permissão para acessar o bate-papo.</p>
          </div>
        </div>
      </BusinessLayout>
    );
  }

  return (
    <BusinessLayout companySlug={slug || ""} companyName={companyName} companyId={companyId || undefined} userRole={myRole} currentUser={user}>
      <div className="container max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><MessageSquare className="w-6 h-6" /> Bate-papo</h1>
            <p className="text-sm text-muted-foreground">Converse com os colaboradores da empresa.</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "geral" | "particular")} className="space-y-4">
          <TabsList>
            <TabsTrigger value="geral" className="gap-2"><Users className="w-4 h-4" /> Geral{unreadGeneral > 0 && <Badge variant="secondary">{unreadGeneral}</Badge>}</TabsTrigger>
            <TabsTrigger value="particular" className="gap-2"><MessageCircle className="w-4 h-4" /> Particular</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="mt-0">
            <div className="border rounded-lg overflow-hidden bg-background">
              <ScrollArea className="h-[55vh] p-4">
                <div className="space-y-4">
                  {generalMessages.map((m) => {
                    const sender = memberMap.get(m.sender_user_id);
                    return (
                      <div key={m.id} className={cn("flex gap-3", m.sender_user_id === user?.id && "justify-end")}>
                        {m.sender_user_id !== user?.id && <Avatar className="w-8 h-8"><AvatarImage src={sender?.avatar_url || undefined} /><AvatarFallback>{initials(sender?.name || "?")}</AvatarFallback></Avatar>}
                        <div className={cn("max-w-[75%] rounded-lg px-3 py-2", m.sender_user_id === user?.id ? "bg-primary text-primary-foreground" : "bg-muted")}>
                          {m.sender_user_id !== user?.id && <div className="text-xs font-medium mb-1">{sender?.name || "Colaborador"}</div>}
                          {m.content && <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>}
                          <div className="text-[10px] opacity-70 mt-1 text-right">{formatTime(m.created_at)}</div>
                        </div>
                        {m.sender_user_id === user?.id && <Avatar className="w-8 h-8"><AvatarImage src={user.user_metadata?.avatar_url || undefined} /><AvatarFallback>{initials(user.user_metadata?.full_name || user.email || "?")}</AvatarFallback></Avatar>}
                      </div>
                    );
                  })}
                  <div ref={generalEndRef} />
                </div>
              </ScrollArea>
              <div className="border-t p-3 flex gap-2">
                <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Digite uma mensagem..." disabled={!canSendChat || sending} className="min-h-10 max-h-32" />
                <Button onClick={handleSend} disabled={!canSendChat || sending || (!input.trim() && !pendingFile)}><Send className="w-4 h-4" /></Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="particular" className="mt-0">
            <div className="border rounded-lg overflow-hidden bg-background grid grid-cols-[280px_1fr] min-h-[55vh]">
              <div className="border-r p-3">
                <div className="relative mb-3"><Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar colaborador..." className="pl-8" /></div>
                <ScrollArea className="h-[48vh]">
                  <div className="space-y-1">
                    {contacts.map((m) => {
                      const unread = unreadByPeer.get(m.user_id) || 0;
                      return <button key={m.user_id} onClick={() => setActiveDmUserId(m.user_id)} className={cn("w-full flex items-center gap-2 p-2 rounded-md text-left hover:bg-muted", activeDmUserId === m.user_id && "bg-muted")}>
                        <Avatar className="w-8 h-8"><AvatarImage src={m.avatar_url || undefined} /><AvatarFallback>{initials(m.name)}</AvatarFallback></Avatar>
                        <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{m.name}</div><div className="text-xs text-muted-foreground truncate">{ROLE_LABEL[m.role] || m.role}</div></div>
                        {unread > 0 && <Badge variant="secondary">{unread}</Badge>}
                      </button>;
                    })}
                    {contacts.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">Nenhum colaborador encontrado.</div>}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex flex-col min-w-0">
                {activeContact ? <>
                  <div className="border-b p-3 flex items-center gap-2"><Avatar className="w-9 h-9"><AvatarImage src={activeContact.avatar_url || undefined} /><AvatarFallback>{initials(activeContact.name)}</AvatarFallback></Avatar><div><div className="font-medium">{activeContact.name}</div><div className="text-xs text-muted-foreground">{ROLE_LABEL[activeContact.role] || activeContact.role}</div></div></div>
                  <ScrollArea className="flex-1 p-4 h-[46vh]"><div className="space-y-4">
                    {activeDmMessages.map((m) => {
                      const mine = m.sender_user_id === user?.id;
                      return <div key={m.id} className={cn("flex gap-3", mine && "justify-end")}><div className={cn("max-w-[75%] rounded-lg px-3 py-2", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                        {m.content && <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>}
                        <div className="text-[10px] opacity-70 mt-1 text-right">{formatTime(m.created_at)}</div>
                      </div></div>;
                    })}
                    <div ref={dmEndRef} />
                  </div></ScrollArea>
                  <div className="border-t p-3 flex gap-2"><Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Digite uma mensagem..." disabled={!canSendChat || sending} className="min-h-10 max-h-32" /><Button onClick={handleSend} disabled={!canSendChat || sending || !activeDmUserId || (!input.trim() && !pendingFile)}><Send className="w-4 h-4" /></Button></div>
                </> : <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Selecione um colaborador para iniciar uma conversa.</div>}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </BusinessLayout>
  );
}
