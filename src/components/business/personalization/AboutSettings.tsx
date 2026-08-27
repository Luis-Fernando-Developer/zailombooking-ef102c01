import { TypographySettings } from "./TypographySettings";
import { type SectionConfig, defaultTypography } from "./types";
import { ColorPicker } from "../ColorPicker";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface AboutSettingsProps {
  config: SectionConfig;
  onChange: (config: SectionConfig) => void;
  disabled?: boolean;
}

export function AboutSettings({ config, onChange, disabled }: AboutSettingsProps) {
  const updateConfig = (field: keyof SectionConfig, value: any) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="space-y-0.5">
            <Label>Exibir Section Sobre</Label>
            <p className="text-sm text-muted-foreground">Mostra a seção na landing page</p>
          </div>
          <Switch
            checked={config.show !== false}
            onCheckedChange={(val) => updateConfig("show", val)}
            disabled={disabled}
          />
        </div>

        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="space-y-0.5">
            <Label>Exibir Descrição</Label>
            <p className="text-sm text-muted-foreground">Mostra o texto descritivo da empresa</p>
          </div>
          <Switch
            checked={config.show_description !== false}
            onCheckedChange={(val) => updateConfig("show_description", val)}
            disabled={disabled}
          />
        </div>

        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="space-y-0.5">
            <Label>Card de Horários</Label>
            <p className="text-sm text-muted-foreground">Exibe horários de funcionamento</p>
          </div>
          <Switch
            checked={config.show_business_hours !== false}
            onCheckedChange={(val) => updateConfig("show_business_hours", val)}
            disabled={disabled}
          />
        </div>

        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="space-y-0.5">
            <Label>Exibir Mapa (Google Maps)</Label>
            <p className="text-sm text-muted-foreground">Usa o CEP da empresa para o mapa</p>
          </div>
          <Switch
            checked={config.show_map === true}
            onCheckedChange={(val) => updateConfig("show_map", val)}
            disabled={disabled}
          />
        </div>
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
            <TypographySettings
              label="Tipografia da Descrição"
              config={config.description_typography || { ...defaultTypography, size: 16, color: "#666666", alignment: "center" }}
              onChange={(val) => updateConfig("description_typography", val)}
              showText
              disabled={disabled}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="cards">
          <AccordionTrigger>Configurações de Cards</AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            <div className="space-y-4">
              <ColorPicker
                type={config.cards?.background_type || "solid"}
                solidColor={config.cards?.background_color || "#ffffff"}
                gradientSettings={config.cards?.background_gradient}
                onTypeChange={(type) => updateConfig("cards", { ...config.cards, background_type: type })}
                onSolidColorChange={(color) => updateConfig("cards", { ...config.cards, background_color: color })}
                onGradientChange={(gradient) => updateConfig("cards", { ...config.cards, background_gradient: gradient })}
                label="Fundo do Card"
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Arredondamento (px)</Label>
                  <input
                    type="number"
                    className="w-full p-2 bg-background border rounded"
                    value={config.cards?.border_radius ?? 12}
                    onChange={(e) => updateConfig("cards", { ...config.cards, border_radius: parseInt(e.target.value) })}
                  />
                </div>
                <div className="flex items-center gap-2 pt-8">
                  <Switch
                    checked={config.cards?.has_border}
                    onCheckedChange={(val) => updateConfig("cards", { ...config.cards, has_border: val })}
                  />
                  <Label>Exibir Borda</Label>
                </div>
              </div>
              <TypographySettings
                label="Tipografia do Conteúdo do Card"
                config={config.cards?.description_typography || { ...defaultTypography, size: 14 }}
                onChange={(val) => updateConfig("cards", { ...config.cards, description_typography: val })}
                disabled={disabled}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
