import { TypographySettings } from "./TypographySettings";
import { type SectionConfig, defaultTypography } from "./types";
import { ColorPicker } from "../ColorPicker";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface BadgeConfig {
  enabled?: boolean;
  background_type?: "solid" | "gradient";
  background_color?: string;
  background_gradient?: any;
  typography?: {
    family?: string;
    size?: number;
    weight?: string;
    color?: string;
  };
  border_radius?: number;
  padding_v?: number;
  padding_h?: number;
}

interface ProfessionalsSettingsProps {
  config: SectionConfig;
  onChange: (config: SectionConfig) => void;
  disabled?: boolean;
}

export function ProfessionalsSettings({ config, onChange, disabled }: ProfessionalsSettingsProps) {
  const updateConfig = (field: keyof SectionConfig, value: any) => {
    onChange({ ...config, [field]: value });
  };

  const badge = config?.cards?.badge_combos ?? {};

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
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cor de Fundo</Label>
                  <ColorPicker
                    value={config.cards?.background_color || "#ffffff"}
                    onChange={(v) => updateConfig("cards", { ...config.cards, background_color: v })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cor da Borda</Label>
                  <ColorPicker
                    value={config.cards?.border_color || "#e2e8f0"}
                    onChange={(v) => updateConfig("cards", { ...config.cards, border_color: v })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Arredondamento (px)</Label>
                  <Input
                    type="number"
                    className="w-full p-2 bg-background border rounded"
                    value={config.cards?.border_radius ?? 12}
                    onChange={(e) => updateConfig("cards", { ...config.cards, border_radius: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Espessura da Borda (px)</Label>
                  <Input
                    type="number"
                    className="w-full p-2 bg-background border rounded"
                    value={config.cards?.has_border ? 1 : 0}
                    onChange={(e) => updateConfig("cards", { ...config.cards, has_border: parseInt(e.target.value) > 0 })}
                  />
                </div>
              </div>
            </div>

            {/* Badge Profissionais */}
            <div className="space-y-4 border-t pt-4">
              <Label className="text-xs font-medium text-muted-foreground">Badge Profissionais</Label>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={badge.enabled !== false}
                    onCheckedChange={(val) => updateConfig("cards", { ...config.cards, badge_combos: { ...badge, enabled: val } })}
                  />
                  <Label className="text-xs font-normal">Habilitar Badge</Label>
                </div>
              </div>

              {badge.enabled !== false && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Cor do Fundo</Label>
                    <ColorPicker
                      value={badge.background_color || "#1e293b"}
                      onChange={(v) => updateConfig("cards", { ...config.cards, badge_combos: { ...badge, background_color: v } })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Arredondamento: {badge.border_radius ?? 6}px
                      </Label>
                      <Slider
                        value={[badge.border_radius ?? 6]}
                        onValueChange={([v]) => updateConfig("cards", { ...config.cards, badge_combos: { ...badge, border_radius: v } })}
                        min={0}
                        max={16}
                        step={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Padding: {badge.padding_v ?? 4}px
                      </Label>
                      <Slider
                        value={[badge.padding_v ?? 4]}
                        onValueChange={([v]) => updateConfig("cards", { ...config.cards, badge_combos: { ...badge, padding_v: v } })}
                        min={0}
                        max={16}
                        step={1}
                      />
                    </div>
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
