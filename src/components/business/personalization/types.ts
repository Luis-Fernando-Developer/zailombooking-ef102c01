import { TypographyConfig } from "./TypographySettings";
import { ButtonConfig } from "./ButtonSettings";
import { CardConfig } from "./CardSettings";

export interface SectionConfig {
  background_type?: "solid" | "gradient";
  background_color?: string;
  background_gradient?: any;
  title_typography?: TypographyConfig;
  buttons?: ButtonConfig;
  cards?: CardConfig;
}

export interface CustomizationData {
  body: {
    font_family: string;
    background_color: string;
  };
  header: {
    position: "fixed" | "relative";
    background_type: "solid" | "gradient";
    background_color: string;
    background_gradient: any;
    menu_typography: TypographyConfig;
    buttons: ButtonConfig;
  };
  hero: {
    background_type: "solid" | "gradient";
    background_color: string;
    background_gradient: any;
    title_typography: TypographyConfig;
    description_typography: TypographyConfig;
    buttons: ButtonConfig;
  };
  services: SectionConfig;
  professionals: SectionConfig;
  about: SectionConfig;
  footer: {
    background_type: "solid" | "gradient";
    background_color: string;
    background_gradient: any;
    typography: TypographyConfig;
  };
  extra: {
    custom_css: string;
  };
}
