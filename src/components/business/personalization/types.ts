
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
  show?: boolean;
  background_type?: "solid" | "gradient";
  background_color?: string;
  background_gradient?: any;
  title_typography?: TypographyConfig;
  buttons?: ButtonConfig;
  cards?: CardConfig;
  badge_combos?: ButtonConfig;
  show_map?: boolean;
  show_business_hours?: boolean;
  show_description?: boolean;
  description_typography?: TypographyConfig;
}

export interface StepConfig {
  // Container
  container_background_type?: "solid" | "gradient";
  container_background_color?: string;
  container_background_gradient?: any;
  container_border_radius?: number;
  // Título do container
  title_typography?: TypographyConfig;
  // Descrição do container
  description_typography?: TypographyConfig;
  // Check
  check_color?: string;
  // Botões (continuar, voltar, etc)
  continue_button?: ButtonConfig;
  back_button?: ButtonConfig;
  // Step Calendário — datas
  available_date_color?: string;
  current_date_color?: string;
  unavailable_date_color?: string;
  calendar_header_color?: string;
  weekday_color?: string;
  calendar_nav_button_color?: string;
  // Step Slots
  slot_selected_color?: string;
  slot_border_radius?: number;
  // Step Login
  secondary_button?: ButtonConfig;
}

export interface StepsConfig {
  services: StepConfig;
  professional: StepConfig;
  calendar: StepConfig;
  slots: StepConfig;
  login: StepConfig;
  confirmation: StepConfig;
}

export const defaultStepConfig: StepConfig = {
  container_background_type: "solid",
  container_background_color: "#ffffff",
  container_border_radius: 12,
  check_color: "#3b82f6",
  continue_button: {
    background_type: "solid",
    background_color: "#3b82f6",
    typography: { family: "Inter", size: 14, weight: "600", colorType: "solid", color: "#ffffff", alignment: "center" },
    border_radius: 8,
    padding_v: 10,
    padding_h: 24,
  },
  back_button: {
    background_type: "solid",
    background_color: "#e2e8f0",
    typography: { family: "Inter", size: 14, weight: "600", colorType: "solid", color: "#475569", alignment: "center" },
    border_radius: 8,
    padding_v: 10,
    padding_h: 24,
  },
  available_date_color: "#3b82f6",
  current_date_color: "#8b5cf6",
  unavailable_date_color: "#cbd5e1",
  calendar_header_color: "#1e293b",
  weekday_color: "#64748b",
  calendar_nav_button_color: "#3b82f6",
  slot_selected_color: "#3b82f6",
  slot_border_radius: 8,
};

export const defaultStepsConfig: StepsConfig = {
  services: { ...defaultStepConfig },
  professional: { ...defaultStepConfig },
  calendar: { ...defaultStepConfig },
  slots: { ...defaultStepConfig },
  login: { ...defaultStepConfig, secondary_button: { background_type: "solid", background_color: "#f1f5f9", typography: { family: "Inter", size: 14, weight: "600", colorType: "solid", color: "#3b82f6", alignment: "center" }, border_radius: 8, padding_v: 10, padding_h: 24 } },
  confirmation: { ...defaultStepConfig },
};

export interface CustomizationData {
  body: {
    font_family: string;
    background_color: string;
  };
  steps?: StepsConfig;
  header: {
    position: "fixed" | "relative";
    background_type: "solid" | "gradient";
    background_color: string;
    background_gradient: any;
    menu_typography: TypographyConfig;
    buttons: ButtonConfig;
  };
  hero: {
    show?: boolean;
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
