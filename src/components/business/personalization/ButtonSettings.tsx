import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "../ColorPicker";
import { TypographySettings } from "./TypographySettings";
import { type TypographyConfig, defaultTypography } from "./types";

export interface ButtonConfig {
  background_type?: "solid" | "gradient";
  background_color?: string;
  background_gradient?: any;
  typography?: TypographyConfig;
  border_radius?: number;
  padding_v?: number;
  padding_h?: number;
  hover_background_color?: string;
  hover_text_color?: string;
}

interface ButtonSettingsProps {
  label: string;
  config: ButtonConfig;
  onChange: (config: ButtonConfig) => void;
  disabled?: boolean;
}

export function ButtonSettings({ label, config, onChange, disabled }: ButtonSettingsProps) {
  const updateConfig = (field: keyof ButtonConfig, value: any) => {
    // Strict validation for ButtonConfig primitives
    const primitiveFields = ['background_type', 'background_color', 'border_radius', 'padding_v', 'padding_h', 'hover_background_color', 'hover_text_color'];
    if (primitiveFields.includes(field as string) && value && typeof value === 'object') {
      console.error(`[ButtonSettings] React #310 Prevention: Blocked object for field "${field}":`, value);
      return;
    }
    onChange({ ...config, [field]: value });
  };

  const handleTypographyChange = (typography: TypographyConfig) => {
    updateConfig("typography", typography);
  };

  return (
    <div className="space-y-6 border-l-2 pl-4 py-2 border-primary/30">
      <h4 className="text-sm font-bold text-primary uppercase tracking-wider">{label}</h4>
      
      <ColorPicker
        type={config.background_type || "solid"}
        solidColor={config.background_color || "#3b82f6"}
        gradientSettings={config.background_gradient || { type: "linear", angle: 45, colors: ["#3b82f6", "#2563eb"] }}
        onTypeChange={(type) => updateConfig("background_type", type)}
        onSolidColorChange={(color) => updateConfig("background_color", color)}
        onGradientChange={(gradient) => updateConfig("background_gradient", gradient)}
        label="Fundo do Botão"
      />

      <TypographySettings 
        label="Tipografia do Botão"
        config={config.typography || defaultTypography}
        onChange={handleTypographyChange}
        disabled={disabled}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Arredondamento (px)</Label>
          <Input
            type="number"
            value={config.border_radius || ""}
            onChange={(e) => updateConfig("border_radius", parseInt(e.target.value))}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label>Padding Vertical (px)</Label>
          <Input
            type="number"
            value={config.padding_v || ""}
            onChange={(e) => updateConfig("padding_v", parseInt(e.target.value))}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label>Padding Horizontal (px)</Label>
          <Input
            type="number"
            value={config.padding_h || ""}
            onChange={(e) => updateConfig("padding_h", parseInt(e.target.value))}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Cor do Fundo (Hover)</Label>
          <Input
            type="color"
            value={config.hover_background_color || "#2563eb"}
            onChange={(e) => updateConfig("hover_background_color", e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label>Cor do Texto (Hover)</Label>
          <Input
            type="color"
            value={config.hover_text_color || "#ffffff"}
            onChange={(e) => updateConfig("hover_text_color", e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
