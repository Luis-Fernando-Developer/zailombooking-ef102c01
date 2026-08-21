import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "../ColorPicker";
import { TypographySettings, type TypographyConfig, fontOptions } from "./TypographySettings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface BodyConfig {
  background_type?: "solid" | "gradient";
  background_color?: string;
  background_gradient?: any;
  default_font_family?: string;
  default_text_color?: string;
  default_font_size?: number;
  max_width?: number;
}

interface BodySettingsProps {
  config: BodyConfig;
  onChange: (config: BodyConfig) => void;
  disabled?: boolean;
}

export function BodySettings({ config, onChange, disabled }: BodySettingsProps) {
  const updateConfig = (field: keyof BodyConfig, value: any) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="space-y-6">
      <ColorPicker
        type={config.background_type || "solid"}
        solidColor={config.background_color || "#ffffff"}
        gradientSettings={config.background_gradient}
        onTypeChange={(type) => updateConfig("background_type", type)}
        onSolidColorChange={(color) => updateConfig("background_color", color)}
        onGradientChange={(gradient) => updateConfig("background_gradient", gradient)}
        label="Fundo da Página (Body)"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Fonte Padrão (Fallback)</Label>
          <Select 
            value={config.default_font_family || "Inter"} 
            onValueChange={(value) => updateConfig("default_font_family", value)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fontOptions.map((font) => (
                <SelectItem key={font.value} value={font.value}>
                  {font.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Cor de Texto Padrão</Label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={config.default_text_color || "#000000"}
              onChange={(e) => updateConfig("default_text_color", e.target.value)}
              className="w-12"
              disabled={disabled}
            />
            <Input
              value={config.default_text_color || "#000000"}
              onChange={(e) => updateConfig("default_text_color", e.target.value)}
              className="flex-1"
              disabled={disabled}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Tamanho de Fonte Base (px)</Label>
          <Input
            type="number"
            value={config.default_font_size || ""}
            onChange={(e) => updateConfig("default_font_size", parseInt(e.target.value))}
            disabled={disabled}
            placeholder="Ex: 16"
          />
        </div>

        <div className="space-y-2">
          <Label>Largura Máxima do Conteúdo (px)</Label>
          <Input
            type="number"
            value={config.max_width || ""}
            onChange={(e) => updateConfig("max_width", parseInt(e.target.value))}
            disabled={disabled}
            placeholder="Ex: 1200"
          />
        </div>
      </div>
    </div>
  );
}
