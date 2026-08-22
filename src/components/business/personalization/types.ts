
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

export interface TypographyConfig {
  text?: string;
  family: string;
  size: number;
  weight: string;
  colorType: "solid" | "gradient";
  color: string;
  gradient?: {
    type: "linear" | "radial";
    angle: number;
    colors: string[];
  };
  alignment: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
}

export const defaultTypography: TypographyConfig = {
  family: "Inter",
  size: 16,
  weight: "400",
  colorType: "solid",
  color: "#000000",
  alignment: "left",
  lineHeight: 1.2,
  letterSpacing: 0
};

export interface ButtonConfig {
  background_type?: "solid" | "gradient";
  background_color?: string;
  background_gradient?: any;
  typography?: TypographyConfig;
  border_radius?: number;
  padding_v?: number;
  padding_h?: number;
  hover_background_color?: string;
  hover_text_color?: string;
}

export interface CardConfig {
  background_type?: "solid" | "gradient";
  background_color?: string;
  background_gradient?: any;
  title_typography?: TypographyConfig;
  description_typography?: TypographyConfig;
  price_typography?: TypographyConfig;
  border_radius?: number;
  has_border?: boolean;
  border_color?: string;
  has_shadow?: boolean;
}

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
