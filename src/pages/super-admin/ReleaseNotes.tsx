import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "@/components/admin/SuperAdminSidebar";
import { BookingLogo } from "@/components/BookingLogo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

interface Note {
  id: string;
  title: string;
  summary: string | null;
  full_description: string | null;
  version: string | null;
  status: string;
  target_plans: string[] | null;
  target_companies: string[] | null;
  published_at: string | null;
  created_at: string;
}

const PLANS = ["basic", "pro", "master"];

export default function ReleaseNotes() {
  const { toast } = useToast();
  const [params] = useSearchParams();
  const focusId = params.get("id");

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Note | null>(null);
  const [saving, setSaving] = useState(false);
  const [targetType, setTargetType] = useState<"all" | "plans" | "companies">("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("release_notes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    const list = (data as Note[]) ?? [];
    setNotes(list);
    if (focusId) {
      const found = list.find((n) => n.id === focusId);
      if (found) setEditing(found);
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [focusId]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from("release_notes")
      .update({
        title: editing.title,
        summary: editing.summary,
        full_description: editing.full_description,
        version: editing.version,
        target_plans: editing.target_plans ?? [],
        target_companies: editing.target_companies ?? [],
      })
      .eq("id", editing.id);
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Release salva" });
    load();
  };

  const publish = async () => {
    if (!editing) return;
    setSaving(true);
    const { error: uErr } = await supabase
      .from("release_notes")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", editing.id);
    if (uErr) { setSaving(false); return toast({ title: "Erro", description: uErr.message, variant: "destructive" }); }

    const { error: nErr } = await supabase.from("platform_notifications").insert({
      title: editing.title,
      message: editing.summary,
      type: "feature_update",
      release_note_id: editing.id,
      target_type: targetType,
      target_plans: targetType === "plans" ? (editing.target_plans ?? []) : [],
      target_companies: targetType === "companies" ? (editing.target_companies ?? []) : [],
      is_sent: true,
    });
    setSaving(false);
    if (nErr) return toast({ title: "Erro notificação", description: nErr.message, variant: "destructive" });
    toast({ title: "Release publicada e notificação enviada" });
    load();
  };

  const togglePlan = (p: string) => {
    if (!editing) return;
    const set = new Set(editing.target_plans ?? []);
    set.has(p) ? set.delete(p) : set.add(p);
    setEditing({ ...editing, target_plans: Array.from(set) });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-hero">
        <SuperAdminSidebar />
        <SidebarInset className="flex-1 bg-transparent">
          <header className="border-b border-primary/20 bg-card/30 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center justify-between px-4 h-16">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div className="flex items-center gap-2 lg:hidden">
                  <BookingLogo showText={false} className="h-8 w-8" />
                  <span className="font-bold text-gradient">Super Admin</span>
                </div>
              </div>
            </div>
          </header>

          <main className="p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* lista */}
            <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20 lg:col-span-1">
              <CardHeader>
                <CardTitle>Release Notes</CardTitle>
                <CardDescription>Histórico de publicações</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> :
                  notes.length === 0 ? <p className="text-sm text-muted-foreground italic">Vazio.</p> :
                  notes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => setEditing(n)}
                      className={`w-full text-left p-3 rounded-lg border transition ${editing?.id === n.id ? "border-primary bg-primary/10" : "border-primary/10 hover:bg-primary/5"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{n.title}</span>
                        <Badge variant={n.status === "published" ? "default" : "outline"}>{n.status}</Badge>
                      </div>
                      {n.summary && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{n.summary}</p>}
                    </button>
                  ))
                }
              </CardContent>
            </Card>

            {/* editor */}
            <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20 lg:col-span-2">
              <CardHeader>
                <CardTitle>{editing ? "Editar release" : "Selecione uma release"}</CardTitle>
                <CardDescription>Revise o conteúdo gerado pela IA antes de publicar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!editing ? <p className="text-muted-foreground italic">Nada selecionado.</p> : (
                  <>
                    <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Título" />
                    <Input value={editing.version ?? ""} onChange={(e) => setEditing({ ...editing, version: e.target.value })} placeholder="Versão (ex: v1.4.0)" />
                    <Textarea value={editing.summary ?? ""} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} placeholder="Resumo" rows={2} />
                    <Textarea value={editing.full_description ?? ""} onChange={(e) => setEditing({ ...editing, full_description: e.target.value })} placeholder="Descrição completa (markdown)" rows={10} />

                    <div className="space-y-2 pt-2 border-t border-primary/10">
                      <label className="text-sm font-medium">Público-alvo</label>
                      <Select value={targetType} onValueChange={(v) => setTargetType(v as typeof targetType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas as empresas</SelectItem>
                          <SelectItem value="plans">Por planos</SelectItem>
                          <SelectItem value="companies">Empresas selecionadas</SelectItem>
                        </SelectContent>
                      </Select>

                      {targetType === "plans" && (
                        <div className="flex gap-2 flex-wrap">
                          {PLANS.map((p) => (
                            <Badge
                              key={p}
                              variant={editing.target_plans?.includes(p) ? "default" : "outline"}
                              className="cursor-pointer"
                              onClick={() => togglePlan(p)}
                            >{p}</Badge>
                          ))}
                        </div>
                      )}

                      {targetType === "companies" && (
                        <Input
                          placeholder="UUIDs das empresas separados por vírgula"
                          value={(editing.target_companies ?? []).join(", ")}
                          onChange={(e) => setEditing({ ...editing, target_companies: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                        />
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" onClick={save} disabled={saving} className="gap-2"><Save className="h-4 w-4" />Salvar</Button>
                      <Button onClick={publish} disabled={saving || editing.status === "published"} className="gap-2">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Publicar
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
