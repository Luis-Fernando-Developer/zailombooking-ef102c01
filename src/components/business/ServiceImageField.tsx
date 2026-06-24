import { useRef, useState } from "react";
import { Camera, Link as LinkIcon, Lock, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { useCompanyPlan } from "@/hooks/useCompanyPlan";

interface ServiceImageFieldProps {
  companyId: string;
  value: string;
  onChange: (url: string) => void;
}

const BUCKET = "service-images";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export function ServiceImageField({ companyId, value, onChange }: ServiceImageFieldProps) {
  const { isPremiumPlan, loading: planLoading } = useCompanyPlan(companyId);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  if (planLoading) return null;

  if (!isPremiumPlan) {
    return (
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          Imagem do serviço
          <Badge variant="secondary" className="text-xs">
            <Lock className="w-3 h-3 mr-1" />
            Plano Premium
          </Badge>
        </Label>
        <p className="text-xs text-muted-foreground">
          A imagem do serviço aparece nos cards da Landing Page personalizada.
          Faça upgrade do seu plano para liberar essa personalização.
        </p>
      </div>
    );
  }

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Selecione uma imagem.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_SIZE) {
      toast({ title: "Imagem muito grande", description: "Tamanho máximo: 5MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${companyId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
      toast({ title: "Imagem enviada", description: "Upload concluído com sucesso." });
    } catch (err: any) {
      console.error("[ServiceImageField] upload error:", err);
      toast({
        title: "Erro no upload",
        description: err?.message ?? "Não foi possível enviar a imagem.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label>Imagem do serviço</Label>

      {value && (
        <div className="relative w-full h-32 rounded-md overflow-hidden border bg-muted">
          <img src={value} alt="Pré-visualização" className="w-full h-full object-cover" />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-1 right-1 h-7 w-7"
            onClick={() => onChange("")}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      <Tabs defaultValue={value?.startsWith("http") && !value.includes("/service-images/") ? "url" : "upload"}>
        <TabsList className="grid grid-cols-2 w-full h-8">
          <TabsTrigger value="upload" className="text-xs gap-1">
            <Upload className="w-3 h-3" /> Upload
          </TabsTrigger>
          <TabsTrigger value="url" className="text-xs gap-1">
            <LinkIcon className="w-3 h-3" /> Link
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="pt-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="w-4 h-4" />
            {uploading ? "Enviando..." : "Selecionar imagem"}
          </Button>
          <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WebP — até 5MB.</p>
        </TabsContent>

        <TabsContent value="url" className="pt-2">
          <Input
            placeholder="https://exemplo.com/imagem.jpg"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
