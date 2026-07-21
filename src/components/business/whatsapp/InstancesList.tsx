import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getEdgeFunctionUrl } from "@/lib/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Plus, RefreshCw, Trash2, QrCode, Send, Star, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

interface InstanceRow {
  id: string; instance_name: string; api_key_prefix: string | null;
  connected_number: string | null; status: string; is_default: boolean;
  last_synced_at: string | null; has_instance_key: boolean;
}

const statusBadge = (s: string) => {
  if (s === "connected")   return <Badge className="bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" />Conectada</Badge>;
  if (s === "qrcode")      return <Badge className="bg-amber-500"><QrCode className="h-3 w-3 mr-1" />Aguardando QR</Badge>;
  if (s === "connecting")  return <Badge className="bg-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Conectando</Badge>;
  if (s === "disconnected")return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Desconectada</Badge>;
  return <Badge variant="secondary">Desconhecida</Badge>;
};

export function InstancesList({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<InstanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState<{ id: string; name: string } | null>(null);
  const [qrData, setQrData] = useState<any>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [testOpen, setTestOpen] = useState<InstanceRow | null>(null);
  const [testTo, setTestTo] = useState("");

  // create dialog state
  const [newOpen, setNewOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "register">("create");
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");

  const call = async (body: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(getEdgeFunctionUrl("whatsapp-integration"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ company_id: companyId, ...body }),
    });
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("whatsapp_instances_public")
      .select("*").eq("company_id", companyId).order("created_at", { ascending: false });
    setRows((data as any) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [companyId]);

  const refresh = async (id?: string) => {
    setBusy(true);
    const r = await call({ action: "refresh-status", instance_id: id });
    setBusy(false);
    if (!r.ok) return toast.error(r.body?.error || "Falha ao sincronizar");
    toast.success(`Sincronizadas ${r.body?.updated ?? 0} instância(s)`);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta instância? Isso também remove da Evolution.")) return;
    setBusy(true);
    const r = await call({ action: "delete-instance", instance_id: id });
    setBusy(false);
    if (!r.ok) return toast.error("Falha ao excluir");
    toast.success("Instância excluída");
    load();
  };

  const setDefault = async (id: string) => {
    setBusy(true);
    await call({ action: "set-default-instance", instance_id: id });
    setBusy(false);
    load();
  };

  const openQr = async (row: InstanceRow) => {
    setQrOpen({ id: row.id, name: row.instance_name });
    setQrData(null); setQrLoading(true);
    const r = await call({ action: "get-qrcode", instance_id: row.id });
    setQrLoading(false);
    if (!r.ok) return toast.error(r.body?.error || "Falha ao obter QR");
    setQrData(r.body?.qrcode);
  };

  const submitCreate = async () => {
    if (!newName.trim()) return toast.error("Nome da instância é obrigatório");
    setBusy(true);
    const r = mode === "create"
      ? await call({ action: "create-instance", instance_name: newName.trim() })
      : await call({ action: "register-instance", instance_name: newName.trim(), instance_api_key: newKey.trim() });
    setBusy(false);
    if (!r.ok) return toast.error(r.body?.error || r.body?.message || "Falha");
    toast.success(mode === "create" ? "Instância criada!" : "Instância registrada!");
    setNewOpen(false); setNewName(""); setNewKey("");
    load();
  };

  const submitTest = async () => {
    if (!testOpen || !testTo.trim()) return;
    setBusy(true);
    const r = await call({ action: "send-test", instance_id: testOpen.id, to: testTo.trim() });
    setBusy(false);
    if (!r.ok) return toast.error(r.body?.error || "Falha ao enviar");
    toast.success("Mensagem de teste enviada!");
    setTestOpen(null); setTestTo("");
  };

  const qrBase64 =
    qrData?.base64 ??
    qrData?.qrcode?.base64 ??
    (typeof qrData?.code === "string" && qrData.code.startsWith("data:") ? qrData.code : null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Instâncias</CardTitle>
          <CardDescription>Todas as instâncias Evolution vinculadas a esta empresa.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh()} disabled={busy}>
            <RefreshCw className={`h-4 w-4 mr-2 ${busy ? "animate-spin" : ""}`} />Sincronizar
          </Button>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" />Nova instância</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar instância</DialogTitle>
                <DialogDescription>Crie uma nova ou registre uma existente via apikey específica.</DialogDescription>
              </DialogHeader>
              <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
                <TabsList className="grid grid-cols-2">
                  <TabsTrigger value="create">Criar nova</TabsTrigger>
                  <TabsTrigger value="register">Registrar existente</TabsTrigger>
                </TabsList>
                <TabsContent value="create" className="space-y-3 pt-3">
                  <p className="text-xs text-muted-foreground">Requer Global API Key configurada.</p>
                  <div className="space-y-2">
                    <Label>Nome da instância</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ex: minha-empresa" />
                  </div>
                </TabsContent>
                <TabsContent value="register" className="space-y-3 pt-3">
                  <div className="space-y-2">
                    <Label>Nome da instância (na Evolution)</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>apikey da instância</Label>
                    <Input type="password" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
                  </div>
                </TabsContent>
              </Tabs>
              <DialogFooter>
                <Button onClick={submitCreate} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma instância cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{r.instance_name}</span>
                    {r.is_default && <Badge variant="outline"><Star className="h-3 w-3 mr-1" />Padrão</Badge>}
                    {statusBadge(r.status)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {r.connected_number ? `📱 ${r.connected_number}` : "Sem número conectado"}
                    {r.api_key_prefix && ` · key ${r.api_key_prefix}…`}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" title="QR Code" onClick={() => openQr(r)}>
                    <QrCode className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Sincronizar" onClick={() => refresh(r.id)} disabled={busy}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Teste" onClick={() => setTestOpen(r)}>
                    <Send className="h-4 w-4" />
                  </Button>
                  {!r.is_default && (
                    <Button size="icon" variant="ghost" title="Definir padrão" onClick={() => setDefault(r.id)}>
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" title="Excluir" onClick={() => remove(r.id)} disabled={busy}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* QR Dialog */}
      <Dialog open={!!qrOpen} onOpenChange={(o) => !o && setQrOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR Code — {qrOpen?.name}</DialogTitle>
            <DialogDescription>Abra o WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            {qrLoading ? <Loader2 className="h-8 w-8 animate-spin" /> :
              qrBase64 ? <img src={qrBase64} alt="QR Code" className="w-64 h-64" /> :
              <p className="text-sm text-muted-foreground">QR não disponível — clique em Sincronizar após conectar.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => qrOpen && refresh(qrOpen.id)}>
              <RefreshCw className="h-4 w-4 mr-2" />Verificar status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send test dialog */}
      <Dialog open={!!testOpen} onOpenChange={(o) => !o && setTestOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar teste — {testOpen?.instance_name}</DialogTitle>
            <DialogDescription>Envia "Teste de conexão…" para o número informado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Número (com DDI, ex: 5511999999999)</Label>
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={submitTest} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
