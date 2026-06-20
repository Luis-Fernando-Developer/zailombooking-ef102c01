import { useEffect, useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "@/components/admin/SuperAdminSidebar";
import { BookingLogo } from "@/components/BookingLogo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Sparkles, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface Feature {
  id: string;
  title: string;
  technical_notes: string | null;
  status: string;
  tags: string[] | null;
  plan_visibility: string[] | null;
  created_at: string;
}

export default function FeatureRegistry() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  // form
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("feature_registry")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setItems((data as Feature[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  const createFeature = async () => {
    if (!title.trim()) return;
    const { error } = await supabase.from("feature_registry").insert({
      title: title.trim(),
      technical_notes: notes.trim() || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Feature registrada" });
    setOpen(false); setTitle(""); setNotes(""); setTags("");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir feature?")) return;
    await supabase.from("feature_registry").delete().eq("id", id);
    load();
  };

  const generateRelease = async () => {
    if (selected.size === 0) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-release-notes", {
        body: { features: Array.from(selected) },
      });
      if (error) throw error;
      const r = (data as { result?: { title?: string; summary?: string; full_description?: string; suggested_plans?: string[] } })?.result ?? {};
      const { data: inserted, error: iErr } = await supabase
        .from("release_notes")
        .insert({
          title: r.title ?? "Nova Atualização",
          summary: r.summary ?? null,
          full_description: r.full_description ?? null,
          features_ids: Array.from(selected),
          target_plans: r.suggested_plans ?? [],
        })
        .select("id")
        .single();
      if (iErr) throw iErr;
      // mark features as generated
      await supabase.from("feature_registry").update({ status: "generated" }).in("id", Array.from(selected));
      toast({ title: "Release gerada com IA" });
      navigate(`/super-admin/release-notes?id=${inserted.id}`);
    } catch (e) {
      toast({ title: "Erro ao gerar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
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

          <main className="p-4 lg:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl font-bold text-gradient mb-2">Central de Features</h1>
                <p className="text-muted-foreground">Registre e transforme features em release notes com IA.</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={generateRelease} disabled={selected.size === 0 || generating} className="gap-2">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Gerar Release Notes com IA ({selected.size})
                </Button>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />Nova feature</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Registrar feature</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
                      <Textarea placeholder="Notas técnicas (o que mudou no código)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} />
                      <Input placeholder="Tags (separadas por vírgula)" value={tags} onChange={(e) => setTags(e.target.value)} />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                      <Button onClick={createFeature}>Salvar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle>Features</CardTitle>
                <CardDescription>Selecione múltiplas para gerar uma release com IA.</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : items.length === 0 ? (
                  <p className="text-muted-foreground italic">Nenhuma feature registrada ainda.</p>
                ) : (
                  <ul className="divide-y divide-primary/10">
                    {items.map((f) => (
                      <li key={f.id} className="flex items-start gap-3 py-3">
                        <Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f.id)} className="mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{f.title}</span>
                            <Badge variant="outline">{f.status}</Badge>
                            {f.tags?.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                          </div>
                          {f.technical_notes && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{f.technical_notes}</p>}
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => remove(f.id)}><Trash2 className="h-4 w-4" /></Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
