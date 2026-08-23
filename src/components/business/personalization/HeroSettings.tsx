import { TypographySettings } from "./TypographySettings";
import { type TypographyConfig, defaultTypography } from "./types";
import { ColorPicker } from "../ColorPicker";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ButtonSettings, type ButtonConfig } from "./ButtonSettings";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export interface HeroConfig {
  show?: boolean;
  banner_type?: string;
  banner_urls?: string[];
  background_type?: "solid" | "gradient";
  background_color?: string;
  background_gradient?: any;
  content_position?: string;
  title_typography?: TypographyConfig;
  description_typography?: TypographyConfig;
  cta_button?: ButtonConfig;
}

interface HeroSettingsProps {
  config: HeroConfig;
  onChange: (config: HeroConfig) => void;
  disabled?: boolean;
}

export function HeroSettings({ config, onChange, disabled }: HeroSettingsProps) {
  const updateConfig = (field: keyof HeroConfig, value: any) => {
    // Sanitização para banner_urls que deve ser um array de strings
    if (field === 'banner_urls' && Array.isArray(value)) {
      const sanitizedUrls = value.filter(url => typeof url === 'string');
      onChange({ ...config, [field]: sanitizedUrls });
      return;
    }
    
    // Bloqueio de objetos em campos primitivos
    const primitiveFields = ['banner_type', 'background_type', 'background_color', 'content_position'];
    if (primitiveFields.includes(field as string) && value && typeof value === 'object') {
      console.error(`[HeroSettings] Blocked object for field "${field}":`, value);
      return;
    }

    onChange({ ...config, [field]: value });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="space-y-0.5">
          <Label>Exibir Section Hero</Label>
          <p className="text-sm text-muted-foreground">Ative para mostrar a seção hero na landing page</p>
        </div>
        <Switch
          checked={config.show !== false}
          onCheckedChange={(val) => updateConfig("show", val)}
          disabled={disabled}
        />
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="background">
          <AccordionTrigger>Fundo do Hero</AccordionTrigger>
          <AccordionContent className="pt-4">
            <ColorPicker
              type={config.background_type || "gradient"}
              solidColor={config.background_color || "hsl(240, 10%, 3.9%)"}
              gradientSettings={config.background_gradient || { type: "linear", angle: 135, colors: ["hsl(251, 91%, 65%)", "hsl(308, 56%, 85%)", "hsl(240, 10%, 3.9%)"] }}
              onTypeChange={(type) => updateConfig("background_type", type)}
              onSolidColorChange={(color) => updateConfig("background_color", color)}
              onGradientChange={(gradient) => updateConfig("background_gradient", gradient)}
              label="Cor de Fundo"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="title">
          <AccordionTrigger>Tipografia do Título</AccordionTrigger>
          <AccordionContent className="pt-4">
            <TypographySettings
              label="Título do Hero"
              config={config.title_typography || defaultTypography}
              onChange={(val) => updateConfig("title_typography", val)}
              showText
              disabled={disabled}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="description">
          <AccordionTrigger>Tipografia da Descrição</AccordionTrigger>
          <AccordionContent className="pt-4">
            <TypographySettings
              label="Descrição do Hero"
              config={config.description_typography || defaultTypography}
              onChange={(val) => updateConfig("description_typography", val)}
              showText
              disabled={disabled}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="button">
          <AccordionTrigger>Botão do Hero</AccordionTrigger>
          <AccordionContent className="pt-4">
            <ButtonSettings
              label="Configurações do CTA"
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
