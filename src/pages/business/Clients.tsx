import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Search, Plus, Pencil, UserRound, Phone, Mail, CalendarDays } from "lucide-react";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";

export default function BusinessClients() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [company, setCompany] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", cpf: "" });

  useEffect(() => { load(); }, [slug]);

  async function load() {
    setLoading(true);
    try {
      const [{ data: auth }, { data: c, error: ce }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("companies").select("id,name,slug").eq("slug", slug).single(),
      ]);
      if (!auth.user) throw new Error("Usuário não autenticado.");
      if (ce || !c) throw ce || new Error("Empresa não encontrada.");
      setCurrentUser(auth.user);
      setCompany(c);
      const { data, error } = await supabase
        .from("clients")
        .select("id,name,email,phone,cpf,is_active,created_at,updated_at")
        .eq("company_id", c.id)
        .order("name", { ascending: true });
      if (error) throw error;
      setClients(data || []);
    } catch (error: any) {
      toast({ title: "Erro ao carregar clientes", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const { hasPermission, loading: permissionLoading, userRole } = usePermissions(company?.id, currentUser);
  const isAdmin = userRole === "owner" || userRole === "admin";
  const canCreate = isAdmin || hasPermission("clients.create");
  const canEdit = isAdmin || hasPermission("clients.edit");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) =>
      [client.name, client.email, client.phone, client.cpf].some((value) => String(value ?? "").toLowerCase().includes(q))
    );
  }, [clients, search]);

  function openNew() {
    setEditing(null);
    setForm({ name: "", email: "", phone: "", cpf: "" });
    setDialogOpen(true);
  }

  function openEdit(client: any) {
    setEditing(client);
    setForm({ name: client.name || "", email: client.email || "", phone: client.phone || "", cpf: client.cpf || "" });
    setDialogOpen(true);
  }

  async function save() {
    if (!company || !form.name.trim()) {
      toast({ title: "Informe o nome do cliente", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        cpf: form.cpf.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("clients").update(payload).eq("id", editing.id).eq("company_id", company.id);
        if (error) throw error;
        toast({ title: "Cliente atualizado" });
      } else {
        const { error } = await supabase.from("clients").insert({ ...payload, company_id: company.id });
        if (error) throw error;
        toast({ title: "Cliente cadastrado" });
      }
      setDialogOpen(false);
      await load();
    } catch (error: any) {
      toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading || permissionLoading || !company) {
    return <BusinessLayout companySlug={slug || ""} companyName="Carregando..." companyId="" userRole="loading"><div className="p-10 text-center">Carregando clientes...</div></BusinessLayout>;
  }

  if (!isAdmin && !hasPermission("clients.view")) {
    return <BusinessLayout companySlug={company.slug} companyName={company.name} companyId={company.id} userRole={userRole} currentUser={currentUser}><div className="p-10 text-center">Acesso negado.</div></BusinessLayout>;
  }

  return (
    <BusinessLayout companySlug={company.slug} companyName={company.name} companyId={company.id} userRole={userRole} currentUser={currentUser}>
      <div className="p-4 sm:p-6 sm:px-10 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-3xl font-bold text-gradient">Clientes</h1><p className="text-muted-foreground">Gerencie os clientes vinculados a esta empresa.</p></div>
          {canCreate && <Button variant="neon" onClick={openNew}><Plus className="w-4 h-4 mr-2" />Novo cliente</Button>}
        </div>
        <Card className="border-primary/20">
          <CardHeader><CardTitle>Lista de clientes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar por nome, e-mail, telefone ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            {filtered.length === 0 ? <div className="py-12 text-center text-muted-foreground">Nenhum cliente encontrado.</div> : <div className="space-y-3">{filtered.map((client) => (
              <div key={client.id} className="rounded-lg border p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3"><div className="rounded-full bg-primary/10 p-2"><UserRound className="w-5 h-5 text-primary" /></div><div><div className="flex items-center gap-2"><p className="font-semibold">{client.name || "Sem nome"}</p><Badge variant={client.is_active === false ? "secondary" : "default"}>{client.is_active === false ? "Inativo" : "Ativo"}</Badge></div><div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:gap-4"><span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{client.email || "Sem e-mail"}</span><span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{client.phone || "Sem telefone"}</span><span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{client.created_at ? new Date(client.created_at).toLocaleDateString("pt-BR") : "-"}</span></div></div></div>
                {canEdit && <Button variant="outline" onClick={() => openEdit(client)}><Pencil className="w-4 h-4 mr-2" />Editar</Button>}
              </div>
            ))}</div>}
            <p className="text-sm text-muted-foreground">{filtered.length} cliente(s) exibido(s).</p>
          </CardContent>
        </Card>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div><div><Label>CPF</Label><Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></div></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button variant="neon" disabled={saving} onClick={save}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </BusinessLayout>
  );
}
