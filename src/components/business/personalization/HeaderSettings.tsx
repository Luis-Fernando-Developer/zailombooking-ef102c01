import { TypographySettings } from "./TypographySettings";
import { type TypographyConfig, defaultTypography } from "./types";
import { ColorPicker } from "../ColorPicker";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ButtonSettings, type ButtonConfig } from "./ButtonSettings";

export interface HeaderConfig {
  position?: "fixed" | "relative";
  background_type?: "solid" | "gradient";
  background_color?: string;
  background_gradient?: any;
  menu_typography?: TypographyConfig & {
    hover_color?: string;
    active_color?: string;
  };
  cta_button?: ButtonConfig;
}

interface HeaderSettingsProps {
  config: HeaderConfig;
  onChange: (config: HeaderConfig) => void;
  disabled?: boolean;
}

export function HeaderSettings({ config, onChange, disabled }: HeaderSettingsProps) {
  const updateConfig = (field: keyof HeaderConfig, value: any) => {
    console.log(`[HeaderSettings] Updating field "${field}":`, value);
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="space-y-6">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="appearance">
          <AccordionTrigger>Aparência</AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            <ColorPicker
              type={config.background_type || "solid"}
              solidColor={config.background_color || "hsl(251, 91%, 65%)"}
              gradientSettings={config.background_gradient || { type: "linear", angle: 45, colors: ["hsl(251, 91%, 65%)", "hsl(308, 56%, 85%)"] }}
              onTypeChange={(type) => updateConfig("background_type", type)}
              onSolidColorChange={(color) => updateConfig("background_color", color)}
              onGradientChange={(gradient) => updateConfig("background_gradient", gradient)}
              label="Fundo do Header"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="menu">
          <AccordionTrigger>Menu / Navegação</AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            <TypographySettings
              label="Itens do Menu"
              config={config.menu_typography || defaultTypography}
              onChange={(val) => updateConfig("menu_typography", { ...val })}
              disabled={disabled}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="header-cta">
          <AccordionTrigger>Botão de Ação (CTA)</AccordionTrigger>
          <AccordionContent className="pt-4">
            <ButtonSettings
              label="Botão do Header"
              config={config.cta_button || {}}
              onChange={(val) => updateConfig("cta_button", val)}
              disabled={disabled}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
