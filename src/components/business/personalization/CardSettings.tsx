import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ColorPicker } from "../ColorPicker";
import { TypographySettings } from "./TypographySettings";
import { type TypographyConfig, defaultTypography } from "./types";

export interface CardConfig {
  background_type?: "solid" | "gradient";
  background_color?: string;
  background_gradient?: any;
  title_typography?: TypographyConfig;
  description_typography?: TypographyConfig;
  price_typography?: TypographyConfig;
  border_radius?: number;
  has_border?: boolean;
  border_color?: string;
  has_shadow?: boolean;
}

interface CardSettingsProps {
  label: string;
  config: CardConfig;
  onChange: (config: CardConfig) => void;
  disabled?: boolean;
}

export function CardSettings({ label, config, onChange, disabled }: CardSettingsProps) {
  const updateConfig = (field: keyof CardConfig, value: any) => {
    console.log(`[CardSettings] Updating field "${field}":`, value);
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="space-y-6 border-l-2 pl-4 py-2 border-accent">
      <h4 className="text-sm font-bold text-accent-foreground uppercase tracking-wider">{label}</h4>
      
      <ColorPicker
        type={config.background_type || "solid"}
        solidColor={config.background_color || "#ffffff"}
        gradientSettings={config.background_gradient || { type: "linear", angle: 45, colors: ["#ffffff", "#f8fafc"] }}
        onTypeChange={(type) => updateConfig("background_type", type)}
        onSolidColorChange={(color) => updateConfig("background_color", color)}
        onGradientChange={(gradient) => updateConfig("background_gradient", gradient)}
        label="Fundo do Card"
      />

      <TypographySettings 
        label="Tipografia do Título"
        config={config.title_typography || defaultTypography}
        onChange={(val) => updateConfig("title_typography", val)}
        disabled={disabled}
      />

      <TypographySettings 
        label="Tipografia da Descrição"
        config={config.description_typography || defaultTypography}
        onChange={(val) => updateConfig("description_typography", val)}
        disabled={disabled}
      />

      <TypographySettings 
        label="Tipografia do Preço"
        config={config.price_typography || defaultTypography}
        onChange={(val) => updateConfig("price_typography", val)}
        disabled={disabled}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Arredondamento (px)</Label>
          <Input
            type="number"
            value={config.border_radius || ""}
            onChange={(e) => updateConfig("border_radius", parseInt(e.target.value))}
            disabled={disabled}
          />
        </div>
        <div className="flex items-center space-x-2 pt-8">
          <Switch 
            id="has-border" 
            checked={config.has_border} 
            onCheckedChange={(val) => updateConfig("has_border", val)}
            disabled={disabled}
          />
          <Label htmlFor="has-border">Exibir Borda</Label>
        </div>
        {config.has_border && (
          <div className="space-y-2">
            <Label>Cor da Borda</Label>
            <Input
              type="color"
              value={config.border_color || "#e2e8f0"}
              onChange={(e) => updateConfig("border_color", e.target.value)}
              disabled={disabled}
            />
          </div>
        )}
        <div className="flex items-center space-x-2 pt-8">
          <Switch 
            id="has-shadow" 
            checked={config.has_shadow} 
            onCheckedChange={(val) => updateConfig("has_shadow", val)}
            disabled={disabled}
          />
          <Label htmlFor="has-shadow">Exibir Sombra</Label>
        </div>
      </div>
    </div>
  );
}
