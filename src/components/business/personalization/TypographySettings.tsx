import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "../ColorPicker";

export const fontOptions = [
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Poppins", label: "Poppins" },
  { value: "Playfair Display", label: "Playfair Display" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Berkshire Swash", label: "Berkshire Swash" },
  { value: "My Soul", label: "My Soul" },
  { value: "Bebas Neue", label: "Bebas Neue" },
  { value: "Rubik Puddles", label: "Rubik Puddles" },
  { value: "Henny Penny", label: "Henny Penny" },
  { value: "Londrina Shadow", label: "Londrina Shadow" },
  { value: "Lavishly Yours", label: "Lavishly Yours" },
  { value: "Fleur De Leah", label: "Fleur De Leah" },
  { value: "Tangerine", label: "Tangerine" },
  { value: "Ballet", label: "Ballet" },
  { value: "Mea Culpa", label: "Mea Culpa" },
  { value: "Imperial Script", label: "Imperial Script" },
  { value: "Manufacturing Consent", label: "Manufacturing Consent" },
];

export const fontWeightOptions = [
  { value: "300", label: "300 — Light" },
  { value: "400", label: "400 — Regular" },
  { value: "500", label: "500 — Medium" },
  { value: "600", label: "600 — Semi Bold" },
  { value: "700", label: "700 — Bold" },
  { value: "800", label: "800 — Extra Bold" },
  { value: "900", label: "900 — Black" },
];

export const alignmentOptions = [
  { value: "left", label: "Esquerda" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Direita" },
];

export interface TypographyConfig {
  family?: string;
  size?: number;
  weight?: string;
  color_type?: "solid" | "gradient";
  color?: string;
  gradient?: any;
  align?: string;
  line_height?: number;
  letter_spacing?: number;
}

interface TypographySettingsProps {
  label: string;
  config: TypographyConfig;
  onChange: (config: TypographyConfig) => void;
  disabled?: boolean;
}

export function TypographySettings({ label, config, onChange, disabled }: TypographySettingsProps) {
  const updateConfig = (field: keyof TypographyConfig, value: any) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="space-y-4 border-l-2 pl-4 py-2 border-muted">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{label}</h4>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Família da Fonte</Label>
          <Select 
            value={config.family || "Inter"} 
            onValueChange={(value) => updateConfig("family", value)}
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
          <Label>Tamanho (px)</Label>
          <Input
            type="number"
            value={config.size || ""}
            onChange={(e) => updateConfig("size", parseInt(e.target.value))}
            disabled={disabled}
            placeholder="Ex: 16"
          />
        </div>

        <div className="space-y-2">
          <Label>Peso da Fonte</Label>
          <Select 
            value={config.weight || "400"} 
            onValueChange={(value) => updateConfig("weight", value)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fontWeightOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Alinhamento</Label>
          <Select 
            value={config.align || "left"} 
            onValueChange={(value) => updateConfig("align", value)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {alignmentOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Altura da linha (Line Height)</Label>
          <Input
            type="number"
            step="0.1"
            value={config.line_height || ""}
            onChange={(e) => updateConfig("line_height", parseFloat(e.target.value))}
            disabled={disabled}
            placeholder="Ex: 1.5"
          />
        </div>

        <div className="space-y-2">
          <Label>Espaçamento entre letras (px)</Label>
          <Input
            type="number"
            value={config.letter_spacing || ""}
            onChange={(e) => updateConfig("letter_spacing", parseInt(e.target.value))}
            disabled={disabled}
            placeholder="Ex: 0"
          />
        </div>
      </div>

      <ColorPicker
        type={config.color_type || "solid"}
        solidColor={config.color || "#000000"}
        gradientSettings={config.gradient}
        onTypeChange={(type) => updateConfig("color_type", type)}
        onSolidColorChange={(color) => updateConfig("color", color)}
        onGradientChange={(gradient) => updateConfig("gradient", gradient)}
        label="Cor do Texto"
      />
    </div>
  );
}
