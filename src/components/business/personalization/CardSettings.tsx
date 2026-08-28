import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ColorPicker } from "../ColorPicker";
import { TypographySettings } from "./TypographySettings";
import { type TypographyConfig, defaultTypography } from "./types";
import { ButtonSettings } from "./ButtonSettings";

export interface CardConfig {
  background_type?: "solid" | "gradient";
  background_color?: string;
  background_gradient?: any;
  title_typography?: TypographyConfig;
  description_typography?: TypographyConfig;
  price_typography?: TypographyConfig;
  border_radius?: number;
  has_border?: boolean;
  border_width?: number;
  border_sides?: string[];
  border_color?: string;
  has_shadow?: boolean;
  shadow_offset_x?: number;
  shadow_offset_y?: number;
  shadow_blur?: number;
  shadow_spread?: number;
  shadow_color?: string;
  badge_combos?: {
    background_type?: "solid" | "gradient";
    background_color?: string;
    background_gradient?: any;
    typography?: TypographyConfig;
    border_radius?: number;
  };
}

interface CardSettingsProps {
  label: string;
  config: CardConfig;
  onChange: (config: CardConfig) => void;
  disabled?: boolean;
}

const ALL_SIDES = ['top', 'right', 'bottom', 'left'];

export function CardSettings({ label, config, onChange, disabled }: CardSettingsProps) {
  const updateConfig = (field: keyof CardConfig, value: any) => {
    const primitiveFields = ['background_type', 'background_color', 'border_radius', 'has_border', 'border_width', 'border_sides', 'border_color', 'has_shadow', 'shadow_offset_x', 'shadow_offset_y', 'shadow_blur', 'shadow_spread', 'shadow_color'];
    if (primitiveFields.includes(field as string) && value && typeof value === 'object' && !Array.isArray(value)) {
      console.error(`[CardSettings] React #310 Prevention: Blocked object for field "${field}":`, value);
      return;
    }
    onChange({ ...config, [field]: value });
  };

  const updateBadge = (field: string, value: any) => {
    onChange({
      ...config,
      badge_combos: { ...config.badge_combos, [field]: value }
    });
  };

  const toggleSide = (side: string) => {
    const current = config.border_sides || [...ALL_SIDES];
    const updated = current.includes(side)
      ? current.filter(s => s !== side)
      : [...current, side];
    updateConfig('border_sides', updated);
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
        label="Badge Combos"
        config={config.badge_combos?.typography || defaultTypography}
        onChange={(val) => updateBadge("typography", val)}
        disabled={disabled}
      />

      <div className="space-y-3 p-3 bg-muted/30 rounded-md">
        <Label className="text-xs font-semibold">Estilo do Badge Combo</Label>
        <ColorPicker
          type={config.badge_combos?.background_type || "solid"}
          solidColor={config.badge_combos?.background_color || "#3b82f6"}
          gradientSettings={config.badge_combos?.background_gradient || { type: "linear", angle: 45, colors: ["#3b82f6", "#2563eb"] }}
          onTypeChange={(type) => updateBadge("background_type", type)}
          onSolidColorChange={(color) => updateBadge("background_color", color)}
          onGradientChange={(gradient) => updateBadge("background_gradient", gradient)}
          label="Fundo do Badge"
        />
        <div className="grid grid-cols-1 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Arredondamento Badge (px)</Label>
            <Input
              type="number"
              value={config.badge_combos?.border_radius ?? 6}
              onChange={(e) => updateBadge("border_radius", parseInt(e.target.value))}
              disabled={disabled}
            />
          </div>
        </div>
      </div>

      <TypographySettings 
        label="Tipografia do Preço"
        config={config.price_typography || defaultTypography}
        onChange={(val) => updateConfig("price_typography", val)}
        disabled={disabled}
      />

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label>Arredondamento (px)</Label>
          <Input
            type="number"
            value={config.border_radius || ""}
            onChange={(e) => updateConfig("border_radius", parseInt(e.target.value))}
            disabled={disabled}
          />
        </div>
        <div className="flex items-center space-x-2">
          <Switch 
            id="has-border" 
            checked={config.has_border} 
            onCheckedChange={(val) => updateConfig("has_border", val)}
            disabled={disabled}
          />
          <Label htmlFor="has-border">Exibir Borda</Label>
        </div>
        {config.has_border && (
          <>
            <div className="space-y-2">
              <Label>Largura da Borda (px)</Label>
              <Input
                type="number"
                value={config.border_width ?? 1}
                onChange={(e) => updateConfig("border_width", parseInt(e.target.value))}
                disabled={disabled}
                min={1}
                max={10}
              />
            </div>
            <div className="space-y-2">
              <Label>Lados da Borda</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_SIDES.map(side => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => toggleSide(side)}
                    className={`px-3 py-1 text-xs rounded border ${
                      (config.border_sides || ALL_SIDES).includes(side)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted border-muted-foreground/20'
                    }`}
                    disabled={disabled}
                  >
                    {side.charAt(0).toUpperCase() + side.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cor da Borda</Label>
              <Input
                type="color"
                value={config.border_color || "#e2e8f0"}
                onChange={(e) => updateConfig("border_color", e.target.value)}
                disabled={disabled}
              />
            </div>
          </>
        )}
        <div className="flex items-center space-x-2">
          <Switch 
            id="has-shadow" 
            checked={config.has_shadow} 
            onCheckedChange={(val) => updateConfig("has_shadow", val)}
            disabled={disabled}
          />
          <Label htmlFor="has-shadow">Exibir Sombra</Label>
        </div>
        {config.has_shadow && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-muted/30 rounded-md">
            <div className="space-y-1">
              <Label className="text-xs">Offset X</Label>
              <Input
                type="number"
                value={config.shadow_offset_x ?? 0}
                onChange={(e) => updateConfig("shadow_offset_x", parseInt(e.target.value))}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Offset Y</Label>
              <Input
                type="number"
                value={config.shadow_offset_y ?? 4}
                onChange={(e) => updateConfig("shadow_offset_y", parseInt(e.target.value))}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Blur</Label>
              <Input
                type="number"
                value={config.shadow_blur ?? 6}
                onChange={(e) => updateConfig("shadow_blur", parseInt(e.target.value))}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Spread</Label>
              <Input
                type="number"
                value={config.shadow_spread ?? 0}
                onChange={(e) => updateConfig("shadow_spread", parseInt(e.target.value))}
                disabled={disabled}
              />
            </div>
            <div className="col-span-2 md:col-span-4 space-y-1">
              <Label className="text-xs">Cor da Sombra</Label>
              <Input
                type="color"
                value={config.shadow_color || "#000000"}
                onChange={(e) => updateConfig("shadow_color", e.target.value)}
                disabled={disabled}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
