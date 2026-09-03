import { TypographySettings } from "./TypographySettings";
import { type SectionConfig, defaultTypography } from "./types";
import { ColorPicker } from "../ColorPicker";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

interface ProfessionalsSettingsProps {
  config: SectionConfig;
  onChange: (config: SectionConfig) => void;
  disabled?: boolean;
}

const ALL_SIDES = ['top', 'right', 'bottom', 'left'];

export function ProfessionalsSettings({ config, onChange, disabled }: ProfessionalsSettingsProps) {
  const cards = config.cards ?? {};
  const badge = cards.badge_combos ?? {};

  const updateConfig = (field: keyof SectionConfig, value: any) => {
    onChange({ ...config, [field]: value });
  };

  const updateCards = (patch: any) => {
    onChange({ ...config, cards: { ...cards, ...patch } });
  };

  const updateBadge = (patch: any) => {
    updateCards({ badge_combos: { ...badge, ...patch } });
  };

  const toggleBorderSide = (side: string) => {
    const current = cards.border_sides ?? [...ALL_SIDES];
    const updated = current.includes(side)
      ? current.filter(s => s !== side)
      : [...current, side];
    updateCards({ border_sides: updated });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="space-y-0.5">
          <Label>Exibir Section Profissionais</Label>
          <p className="text-sm text-muted-foreground">Ative para mostrar a seção de profissionais na landing page</p>
        </div>
        <Switch
          checked={config.show !== false}
          onCheckedChange={(val) => updateConfig("show", val)}
          disabled={disabled}
        />
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="appearance">
          <AccordionTrigger>Aparência da Seção</AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            <ColorPicker
              type={config.background_type || "solid"}
              solidColor={config.background_color || "transparent"}
              gradientSettings={config.background_gradient || { type: "linear", angle: 135, colors: ["#ffffff", "#f8fafc"] }}
              onTypeChange={(type) => updateConfig("background_type", type)}
              onSolidColorChange={(color) => updateConfig("background_color", color)}
              onGradientChange={(gradient) => updateConfig("background_gradient", gradient)}
              label="Fundo da Seção"
            />
            <TypographySettings
              label="Título da Seção"
              config={config.title_typography || { ...defaultTypography, size: 32, weight: "700", alignment: "center" }}
              onChange={(val) => updateConfig("title_typography", val)}
              showText
              disabled={disabled}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="cards">
          <AccordionTrigger>Cards de Profissionais</AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            {/* Background */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Cor de Fundo</Label>
              <ColorPicker
                type={cards.background_type || "solid"}
                solidColor={cards.background_color || "#ffffff"}
                gradientSettings={cards.background_gradient || { type: "linear", angle: 45, colors: ["#ffffff", "#f8fafc"] }}
                onTypeChange={(type) => updateCards({ background_type: type })}
                onSolidColorChange={(color) => updateCards({ background_color: color })}
                onGradientChange={(gradient) => updateCards({ background_gradient: gradient })}
                label="Fundo do Card"
              />
            </div>

            {/* Border toggle */}
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <Switch
                checked={cards.has_border ?? false}
                onCheckedChange={(val) => updateCards({ has_border: val })}
                disabled={disabled}
              />
              <Label className="text-sm">Exibir Borda</Label>
            </div>

            {cards.has_border && (
              <>
                {/* Border color */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Cor da Borda</Label>
                  <ColorPicker
                    type={cards.border_type || "solid"}
                    solidColor={cards.border_color || "#e2e8f0"}
                    gradientSettings={cards.border_gradient || { type: "linear", angle: 45, colors: ["#e2e8f0", "#cbd5e1"] }}
                    onTypeChange={(type) => updateCards({ border_type: type })}
                    onSolidColorChange={(color) => updateCards({ border_color: color })}
                    onGradientChange={(gradient) => updateCards({ border_gradient: gradient })}
                    label="Cor da Borda"
                  />
                </div>

                {/* Border width */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Espessura da Borda (px)</Label>
                  <Input
                    type="number"
                    value={cards.border_width ?? 1}
                    onChange={(e) => updateCards({ border_width: parseInt(e.target.value) || 1 })}
                    min={1}
                    max={10}
                    disabled={disabled}
                  />
                </div>

                {/* Border sides */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Lados da Borda</Label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_SIDES.map(side => (
                      <button
                        key={side}
                        type="button"
                        onClick={() => toggleBorderSide(side)}
                        className={`px-3 py-1 text-xs rounded border ${
                          (cards.border_sides ?? ALL_SIDES).includes(side)
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
              </>
            )}

            {/* Shadow toggle */}
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <Switch
                checked={cards.has_shadow ?? false}
                onCheckedChange={(val) => updateCards({ has_shadow: val })}
                disabled={disabled}
              />
              <Label className="text-sm">Exibir Sombra</Label>
            </div>

            {cards.has_shadow && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-muted/30 rounded-md">
                <div className="space-y-1">
                  <Label className="text-xs">Offset X</Label>
                  <Input
                    type="number"
                    value={cards.shadow_offset_x ?? 0}
                    onChange={(e) => updateCards({ shadow_offset_x: parseInt(e.target.value) || 0 })}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Offset Y</Label>
                  <Input
                    type="number"
                    value={cards.shadow_offset_y ?? 4}
                    onChange={(e) => updateCards({ shadow_offset_y: parseInt(e.target.value) || 4 })}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Blur</Label>
                  <Input
                    type="number"
                    value={cards.shadow_blur ?? 6}
                    onChange={(e) => updateCards({ shadow_blur: parseInt(e.target.value) || 6 })}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Spread</Label>
                  <Input
                    type="number"
                    value={cards.shadow_spread ?? 0}
                    onChange={(e) => updateCards({ shadow_spread: parseInt(e.target.value) || 0 })}
                    disabled={disabled}
                  />
                </div>
                <div className="col-span-2 md:col-span-4 space-y-1">
                  <Label className="text-xs">Cor da Sombra</Label>
                  <Input
                    type="color"
                    value={cards.shadow_color || "#000000"}
                    onChange={(e) => updateCards({ shadow_color: e.target.value })}
                    disabled={disabled}
                  />
                </div>
              </div>
            )}

            {/* Border radius — after shadow section */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Arredondamento: {cards.border_radius ?? 12}px
              </Label>
              <Slider
                value={[cards.border_radius ?? 12]}
                onValueChange={([v]) => updateCards({ border_radius: v })}
                min={0}
                max={32}
                step={2}
                disabled={disabled}
              />
            </div>

            {/* Badge */}
            <div className="space-y-4 border-t pt-4">
              <Label className="text-xs font-medium text-muted-foreground">Badge Profissionais</Label>

              <div className="flex items-center gap-2">
                <Switch
                  checked={badge.enabled !== false}
                  onCheckedChange={(val) => updateBadge({ enabled: val })}
                  disabled={disabled}
                />
                <Label className="text-xs font-normal">Habilitar Badge</Label>
              </div>

              {badge.enabled !== false && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Cor do Fundo</Label>
                    <ColorPicker
                      type={badge.background_type || "solid"}
                      solidColor={badge.background_color || "#1e293b"}
                      gradientSettings={badge.background_gradient || { type: "linear", angle: 135, colors: ["#1e293b", "#0f172a"] }}
                      onTypeChange={(type) => updateBadge({ background_type: type })}
                      onSolidColorChange={(color) => updateBadge({ background_color: color })}
                      onGradientChange={(gradient) => updateBadge({ background_gradient: gradient })}
                      label="Fundo do Badge"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Arredondamento: {badge.border_radius ?? 6}px
                      </Label>
                      <Slider
                        value={[badge.border_radius ?? 6]}
                        onValueChange={([v]) => updateBadge({ border_radius: v })}
                        min={0}
                        max={16}
                        step={2}
                        disabled={disabled}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Padding: {badge.padding_v ?? 4}px
                      </Label>
                      <Slider
                        value={[badge.padding_v ?? 4]}
                        onValueChange={([v]) => updateBadge({ padding_v: v })}
                        min={0}
                        max={16}
                        step={1}
                        disabled={disabled}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Tipografia do Badge</Label>
                    <TypographySettings
                      label=""
                      config={badge.typography || defaultTypography}
                      onChange={(val) => updateBadge({ typography: val })}
                      showText={false}
                      disabled={disabled}
                    />
                  </div>
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
