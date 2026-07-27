import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { getEdgeFunctionUrl } from "@/lib/supabaseHelpers";
import { useAuth } from "@/contexts/AuthContext";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

type Client = { id: string; name: string; phone: string | null };

export default function AutomacoesDisparos() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("Olá {{name}}! Aqui é da {{company}}. Temos novidades para você 🎉");
  const [manualNumbers, setManualNumbers] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!slug) return;
    supabase.from("companies").select("id,name").eq("slug", slug).maybeSingle().then(({ data }) => {
      if (data) { setCompanyId(data.id); setCompanyName(data.name); }
    });
  }, [slug]);

  useEffect(() => {
    if (!companyId) return;
    supabase.from("clients").select("id,name,phone").eq("company_id", companyId).order("name")
      .then(({ data }) => setClients((data ?? []) as Client[]));
  }, [companyId]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return clients.filter((c) => c.phone && (!f || c.name.toLowerCase().includes(f) || (c.phone ?? "").includes(f)));
  }, [clients, filter]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map((c) => c.id)));
  const clearAll = () => setSelected(new Set());

  const parseManual = (): string[] =>
    manualNumbers.split(/[\s,;\n]+/).map((s) => s.replace(/\D/g, "")).filter((s) => s.length >= 10);

  const recipients = useMemo(() => {
    const fromSelected = clients.filter((c) => selected.has(c.id) && c.phone).map((c) => ({
      phone: c.phone!.replace(/\D/g, ""),
      name: c.name,
    }));
    const manuals = parseManual().map((p) => ({ phone: p, name: "" }));
    const map = new Map<string, { phone: string; name: string }>();
    [...fromSelected, ...manuals].forEach((r) => { if (r.phone) map.set(r.phone, r); });
    return Array.from(map.values());
  }, [selected, clients, manualNumbers]);

  const send = async () => {
    if (!companyId) return;
    if (!message.trim()) return toast.error("Escreva a mensagem");
    if (recipients.length === 0) return toast.error("Selecione ao menos um destinatário");
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Envia individualmente para poder personalizar {{name}}
      let ok = 0, failed = 0;
      for (const r of recipients) {
        const personalized = message
          .replace(/\{\{\s*name\s*\}\}/g, r.name || "")
          .replace(/\{\{\s*company\s*\}\}/g, companyName);
        const resp = await fetch(getEdgeFunctionUrl("whatsapp-integration"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
          body: JSON.stringify({
            company_id: companyId,
            action: "broadcast",
            message: personalized,
            recipients: [r.phone],
          }),
        });
        const j = await resp.json().catch(() => ({}));
        if (resp.ok && j?.sent > 0) ok++; else failed++;
      }
      toast.success(`Enviados: ${ok} • Falhas: ${failed}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no disparo");
    } finally {
      setSending(false);
    }
  };

  if (!companyId) return null;

  return (
    <BusinessLayout companySlug={slug!} companyName={companyName} companyId={companyId} userRole="owner" currentUser={user}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Send className="h-6 w-6" /> Disparos WhatsApp
          </h1>
          <p className="text-muted-foreground">
            Envie mensagens em massa personalizadas para seus clientes via WhatsApp.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Mensagem</CardTitle>
              <CardDescription>
                Variáveis disponíveis: <code className="text-xs">{"{{name}}"}</code>, <code className="text-xs">{"{{company}}"}</code>, <code className="text-xs">{"{{phone}}"}</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Texto</Label>
                <Textarea rows={8} value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Números adicionais (opcional)</Label>
                <Textarea
                  rows={3}
                  placeholder="5511999999999, 5511888888888..."
                  value={manualNumbers}
                  onChange={(e) => setManualNumbers(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between gap-2 pt-2">
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" /> {recipients.length} destinatário(s)
                </Badge>
                <Button onClick={send} disabled={sending || recipients.length === 0}>
                  {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Disparar
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Clientes</CardTitle>
              <CardDescription>Selecione os clientes que devem receber a mensagem.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Input placeholder="Buscar por nome ou telefone" value={filter} onChange={(e) => setFilter(e.target.value)} />
                <Button variant="outline" size="sm" onClick={selectAll}>Todos</Button>
                <Button variant="ghost" size="sm" onClick={clearAll}>Limpar</Button>
              </div>
              <div className="max-h-[420px] overflow-y-auto rounded border divide-y">
                {filtered.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Nenhum cliente com telefone encontrado.
                  </div>
                )}
                {filtered.map((c) => (
                  <label key={c.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.phone}</div>
                    </div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </BusinessLayout>
  );
}
