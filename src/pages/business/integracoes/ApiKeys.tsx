import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { Copy, KeyRound, Trash2, ShieldAlert, Plus, ExternalLink } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export default function ApiKeysPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState<string>("owner");
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!slug) return;
      const { data: company } = await supabase
        .from("companies").select("id, name, owner_email").eq("slug", slug).single();
      if (!company) return;
      setCompanyId(company.id);
      setCompanyName(company.name);
      if (user?.email && company.owner_email?.toLowerCase() === user.email.toLowerCase()) {
        setRole("owner");
      } else if (user) {
        const { data: emp } = await supabase.from("employees")
          .select("role").eq("company_id", company.id).eq("user_id", user.id).maybeSingle();
        setRole((emp?.role as string) || "employee");
      }
      await loadKeys(company.id);
    })();
  }, [slug, user]);

  async function loadKeys(cid: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, scopes, is_active, last_used_at, created_at, revoked_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    setKeys((data as ApiKeyRow[]) ?? []);
    setLoading(false);
  }

  async function handleCreate() {
    if (!companyId || !newKeyName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.rpc("create_api_key", {
      p_company_id: companyId,
      p_name: newKeyName.trim(),
      p_scopes: ["read", "write"],
    });
    setCreating(false);
    if (error) {
      toast({ title: "Erro ao criar chave", description: error.message, variant: "destructive" });
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.plaintext) {
      setFreshKey(row.plaintext);
      setNewKeyName("");
      await loadKeys(companyId);
    }
  }

  async function handleRevoke(id: string) {
    const { error } = await supabase.rpc("revoke_api_key", { p_id: id });
    if (error) {
      toast({ title: "Erro ao revogar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Chave revogada" });
    if (companyId) await loadKeys(companyId);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado" });
  }

  return (
    <BusinessLayout companySlug={slug || ""} companyName={companyName} companyId={companyId || undefined} userRole={role} currentUser={user}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <KeyRound className="w-6 h-6 text-primary" /> Chaves de API
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gere chaves para consumir a API REST do Zailom Booking em integrações externas (Zailom Flow, apps, terceiros).
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href="/api-docs" target="_blank" rel="noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" /> Documentação
            </a>
          </Button>
        </div>

        {freshKey && (
          <Alert className="border-primary/50 bg-primary/5">
            <ShieldAlert className="w-4 h-4" />
            <AlertTitle>Copie sua chave agora — ela não será exibida novamente</AlertTitle>
            <AlertDescription className="space-y-2 mt-2">
              <code className="block p-3 rounded bg-background border font-mono text-sm break-all">
                {freshKey}
              </code>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => copy(freshKey)}><Copy className="w-4 h-4 mr-1" /> Copiar</Button>
                <Button size="sm" variant="ghost" onClick={() => setFreshKey(null)}>Já copiei</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Uso: <code>Authorization: Bearer {freshKey.slice(0, 12)}...</code>
              </p>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Plus className="w-4 h-4" /> Nova chave</CardTitle>
            <CardDescription>Dê um nome para identificar onde essa chave será usada (ex: "Zailom Flow — Produção").</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="name" className="sr-only">Nome</Label>
              <Input id="name" placeholder="Ex: Zailom Flow — Produção"
                value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
            </div>
            <Button onClick={handleCreate} disabled={creating || !newKeyName.trim()}>
              {creating ? "Gerando..." : "Gerar chave"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Chaves ativas</CardTitle>
            <CardDescription>Você vê apenas o prefixo. Se perder a chave completa, revogue e gere uma nova.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma chave criada ainda.</p>
            ) : (
              <div className="space-y-2">
                {keys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/30 transition">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{k.name}</span>
                        {k.is_active ? (
                          <Badge variant="secondary">Ativa</Badge>
                        ) : (
                          <Badge variant="destructive">Revogada</Badge>
                        )}
                        {k.scopes.map((s) => (
                          <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-mono">
                        {k.key_prefix}••••••••••••
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Criada em {new Date(k.created_at).toLocaleString("pt-BR")}
                        {k.last_used_at && <> · Último uso {new Date(k.last_used_at).toLocaleString("pt-BR")}</>}
                      </div>
                    </div>
                    {k.is_active && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revogar chave "{k.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Qualquer integração usando essa chave deixará de funcionar imediatamente. Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRevoke(k.id)}>Revogar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Como usar</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs p-3 bg-muted rounded overflow-x-auto">
{`curl https://api-booking.zailom.com/v1/services \\
  -H "Authorization: Bearer zlm_sua_key"`}
            </pre>
          </CardContent>
        </Card>
      </div>
    </BusinessLayout>
  );
}
