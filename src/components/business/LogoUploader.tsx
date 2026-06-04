import { useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "@/hooks/use-toast";

interface LogoUploaderProps {
  currentLogo?: string;
  onLogoChange: (logoPath: string | null) => void;
  companyId: string;
  disabled?: boolean;
}

export function LogoUploader({ currentLogo, onLogoChange, companyId, disabled = false }: LogoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentLogo || null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Erro",
        description: "Por favor, selecione apenas arquivos de imagem.",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Erro", 
        description: "O arquivo deve ter no máximo 5MB.",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${companyId}-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      // Upload file to Supabase Storage
      const { error: uploadError, data } = await supabase.storage
        .from('company-logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('company-logos')
        .getPublicUrl(filePath);

      setPreview(publicUrl);
      onLogoChange(filePath);

      toast({
        title: "Sucesso",
        description: "Logo enviado com sucesso!",
      });

    } catch (error: any) {
      console.error('Erro no upload:', error);
      toast({
        title: "Erro",
        description: "Erro ao enviar logo. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (currentLogo) {
      try {
        const { error } = await supabase.storage
          .from('company-logos')
          .remove([currentLogo]);

        if (error) console.error('Erro ao remover arquivo:', error);
      } catch (error) {
        console.error('Erro ao remover logo:', error);
      }
    }

    setPreview(null);
    onLogoChange(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          {preview ? (
            <div className="w-20 h-20 rounded-full overflow-hidden bg-muted border-2 border-border">
              <img 
                src={preview} 
                alt="Logo preview" 
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center border-2 border-border">
              <span className="text-sm font-medium text-muted-foreground">LOGO</span>
            </div>
          )}
          
          {preview ? (
            <Button
              variant="destructive"
              size="sm"
              className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full p-0 shadow-lg"
              onClick={handleRemoveLogo}
              disabled={disabled}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <label className={`absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-background border-2 border-border shadow-lg flex items-center justify-center transition-colors ${
              disabled 
                ? 'cursor-not-allowed opacity-50' 
                : 'cursor-pointer hover:bg-accent'
            }`}>
              <Camera className="h-4 w-4 text-foreground" />
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={uploading || disabled}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>
      
      {uploading && (
        <p className="text-sm text-muted-foreground text-center">
          Enviando logo...
        </p>
      )}
      
      <p className="text-xs text-muted-foreground text-center">
        Formatos suportados: JPG, PNG, GIF (máx. 5MB)
      </p>
    </div>
  );
}