import { TypographySettings } from "./TypographySettings";
import { type SectionConfig, defaultTypography } from "./types";
import { ColorPicker } from "../ColorPicker";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ButtonSettings } from "./ButtonSettings";
import { CardSettings } from "./CardSettings";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface ServicesSettingsProps {
  config: SectionConfig;
  onChange: (config: SectionConfig) => void;
  disabled?: boolean;
}

export function ServicesSettings({ config, onChange, disabled }: ServicesSettingsProps) {
  const updateConfig = (field: keyof SectionConfig, value: any) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="space-y-0.5">
          <Label>Exibir Section Serviços</Label>
          <p className="text-sm text-muted-foreground">Ative para mostrar a seção de serviços na landing page</p>
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

        <AccordionItem value="buttons">
          <AccordionTrigger>Botões de Serviços</AccordionTrigger>
          <AccordionContent className="pt-4">
            <ButtonSettings
              label="Estilo dos Botões"
              config={config.buttons || {}}
              onChange={(val) => updateConfig("buttons", val)}
              disabled={disabled}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="cards">
          <AccordionTrigger>Cards de Serviços</AccordionTrigger>
          <AccordionContent className="pt-4">
            <CardSettings
              label="Estilo dos Cards"
              config={config.cards || {}}
              onChange={(val) => updateConfig("cards", val)}
              disabled={disabled}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
