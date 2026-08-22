import { TypographySettings } from "./TypographySettings";
import { type TypographyConfig, defaultTypography } from "./types";
import { ColorPicker } from "../ColorPicker";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export interface FooterConfig {
  background_type?: "solid" | "gradient";
  background_color?: string;
  background_gradient?: any;
  title_typography?: TypographyConfig;
  text_typography?: TypographyConfig;
  links_typography?: TypographyConfig & {
    hover_color?: string;
  };
}

interface FooterSettingsProps {
  config: FooterConfig;
  onChange: (config: FooterConfig) => void;
  disabled?: boolean;
}

export function FooterSettings({ config, onChange, disabled }: FooterSettingsProps) {
  const updateConfig = (field: keyof FooterConfig, value: any) => {
    // Strict validation for FooterConfig primitives
    const primitiveFields = ['background_type', 'background_color'];
    if (primitiveFields.includes(field as string) && value && typeof value === 'object') {
      console.error(`[FooterSettings] React #310 Prevention: Blocked object for field "${field}":`, value);
      return;
    }
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="space-y-6">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="background">
          <AccordionTrigger>Fundo do Footer</AccordionTrigger>
          <AccordionContent className="pt-4">
            <ColorPicker
              type={config.background_type || "solid"}
              solidColor={config.background_color || "hsl(240, 10%, 3.9%)"}
              gradientSettings={config.background_gradient || { type: "linear", angle: 180, colors: ["hsl(240, 10%, 3.9%)", "hsl(251, 91%, 65%)"] }}
              onTypeChange={(type) => updateConfig("background_type", type)}
              onSolidColorChange={(color) => updateConfig("background_color", color)}
              onGradientChange={(gradient) => updateConfig("background_gradient", gradient)}
              label="Cor de Fundo"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="title">
          <AccordionTrigger>Tipografia dos Títulos</AccordionTrigger>
          <AccordionContent className="pt-4">
            <TypographySettings
              label="Títulos do Footer"
              config={config.title_typography || defaultTypography}
              onChange={(val) => updateConfig("title_typography", val)}
              disabled={disabled}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="text">
          <AccordionTrigger>Tipografia de Textos</AccordionTrigger>
          <AccordionContent className="pt-4">
            <TypographySettings
              label="Textos Gerais"
              config={config.text_typography || defaultTypography}
              onChange={(val) => updateConfig("text_typography", val)}
              disabled={disabled}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
