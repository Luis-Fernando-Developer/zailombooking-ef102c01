import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Send, Trash2, Upload } from "lucide-react";
import {
  listMaterials, createMaterial, deleteMaterial,
  submitMaterialForApproval, uploadMaterialFile,
  type MaterialType, type MarketingMaterial,
} from "@/lib/api/marketing";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho", pending_approval: "Em aprovação",
  approved: "Aprovado", rejected: "Reprovado",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "secondary", pending_approval: "default",
  approved: "default", rejected: "destructive",
};

const ACCEPT = ".png,.jpg,.jpeg,.webp,.svg,.gif,.mp4,.pdf";

export function MaterialsTab({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "", description: "", category: "",
    tags: "", material_type: "imagem" as MaterialType,
    file: null as File | null,
  });

  const q = useQuery({
    queryKey: ["mkt-materials", companyId],
    queryFn: () => listMaterials(companyId),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!form.title) throw new Error("Título é obrigatório");
      let file_url: string | null = null;
      let file_path: string | null = null;
      let file_mime: string | null = null;
      let file_size: number | null = null;
      if (form.file) {
        const up = await uploadMaterialFile(companyId, form.file);
        file_url = up.url; file_path = up.path;
        file_mime = form.file.type; file_size = form.file.size;
      }
      return createMaterial({
        company_id: companyId,
        title: form.title,
        description: form.description || null,
        category: form.category || null,
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
        material_type: form.material_type,
        file_url, file_path, file_mime, file_size,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mkt-materials", companyId] });
      setOpen(false);
      setForm({ title: "", description: "", category: "", tags: "", material_type: "imagem", file: null });
      toast({ title: "Material criado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteMaterial(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mkt-materials", companyId] }),
  });

  const submitMut = useMutation({
    mutationFn: (id: string) => submitMaterialForApproval(id, []),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mkt-materials", companyId] });
      toast({ title: "Enviado para aprovação" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Biblioteca de Materiais</h2>
          <p className="text-sm text-muted-foreground">Ativos reutilizáveis para campanhas.</p>
        </div>
        {canEdit && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Novo Material
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {q.data?.map((m) => (
          <Card key={m.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start gap-2">
                <CardTitle className="text-base">{m.title}</CardTitle>
                <Badge variant={STATUS_COLOR[m.status] as any}>{STATUS_LABEL[m.status]}</Badge>
              </div>
              <CardDescription>{m.material_type} · {new Date(m.updated_at).toLocaleDateString()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {m.file_url && m.material_type !== 'video' && m.material_type !== 'documento' && (
                <img src={m.file_url} alt={m.title} className="w-full h-32 object-cover rounded" />
              )}
              {m.description && <p className="text-sm text-muted-foreground line-clamp-2">{m.description}</p>}
              {m.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.tags.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
                </div>
              )}
              {canEdit && (
                <div className="flex gap-2 pt-2">
                  {m.status === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => submitMut.mutate(m.id)}>
                      <Send className="w-3 h-3 mr-1" /> Enviar p/ aprovação
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => delMut.mutate(m.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {q.data?.length === 0 && (
          <p className="text-muted-foreground col-span-full text-center py-12">Nenhum material cadastrado.</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Material</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.material_type} onValueChange={(v) => setForm({ ...form, material_type: v as MaterialType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="banner">Banner</SelectItem>
                    <SelectItem value="imagem">Imagem</SelectItem>
                    <SelectItem value="video">Vídeo</SelectItem>
                    <SelectItem value="gif">GIF</SelectItem>
                    <SelectItem value="documento">Documento</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Tags (vírgula)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="promo, verão, 2026" />
            </div>
            <div>
              <Label>Arquivo</Label>
              <Input type="file" accept={ACCEPT} onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              <Upload className="w-4 h-4 mr-2" />
              {createMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
