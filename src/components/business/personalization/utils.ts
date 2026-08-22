import { type TypographyConfig, type ButtonConfig, type CardConfig } from "./types";

/**
 * Generates CSS custom properties for typography configuration.
 */
export const getTypographyStyles = (config?: TypographyConfig, fallback?: any): React.CSSProperties => {
  if (!config) return {};
  
  const styles: any = {};
  
  if (config.family) styles.fontFamily = `${config.family}, system-ui, sans-serif`;
  if (config.size) styles.fontSize = `${config.size}px`;
  if (config.weight) styles.fontWeight = config.weight;
  
  if (config.colorType === 'gradient' && config.gradient) {
    const { type, angle, colors } = config.gradient;
    const colorString = colors.join(', ');
    styles.backgroundImage = type === 'linear' 
      ? `linear-gradient(${angle}deg, ${colorString})`
      : `radial-gradient(${colorString})`;
    styles.WebkitBackgroundClip = 'text';
    styles.WebkitTextFillColor = 'transparent';
    styles.backgroundClip = 'text';
    styles.color = 'transparent';
  } else if (config.color) {
    styles.color = config.color;
    styles.backgroundImage = 'none';
    styles.WebkitBackgroundClip = 'initial';
    styles.WebkitTextFillColor = 'initial';
  }

  if (config.alignment) styles.textAlign = config.alignment;
  if (config.lineHeight) styles.lineHeight = config.lineHeight;
  if (config.letterSpacing !== undefined) styles.letterSpacing = `${config.letterSpacing}px`;
  
  return styles;
};

/**
 * Generates CSS custom properties for background configuration (solid or gradient).
 */
export const getBackgroundStyles = (config?: { 
  background_type?: "solid" | "gradient", 
  background_color?: string, 
  background_gradient?: any 
}): React.CSSProperties => {
  if (!config) return {};
  
  const styles: any = {};
  
  if (config.background_type === 'gradient' && config.background_gradient) {
    const { type, angle, colors } = config.background_gradient;
    const colorString = colors.join(', ');
    styles.background = type === 'linear' 
      ? `linear-gradient(${angle}deg, ${colorString})`
      : `radial-gradient(${colorString})`;
  } else if (config.background_color) {
    styles.backgroundColor = config.background_color;
  }
  
  return styles;
};

/**
 * Generates CSS styles for a button based on its configuration.
 */
export const getButtonStyles = (config?: ButtonConfig, fallbackBody?: any): React.CSSProperties => {
  if (!config) return {};
  
  const bgStyles = getBackgroundStyles(config as any);
  const typographyStyles = getTypographyStyles(config.typography, fallbackBody);
  
  return {
    ...bgStyles,
    ...typographyStyles,
    borderRadius: config.border_radius !== undefined ? `${config.border_radius}px` : undefined,
    padding: config.padding_v !== undefined && config.padding_h !== undefined 
      ? `${config.padding_v}px ${config.padding_h}px` 
      : undefined
  };
};

/**
 * Generates CSS styles for a card based on its configuration.
 */
export const getCardStyles = (config?: CardConfig): React.CSSProperties => {
  if (!config) return {};
  
  const bgStyles = getBackgroundStyles(config as any);
  
  return {
    ...bgStyles,
    borderRadius: config.border_radius !== undefined ? `${config.border_radius}px` : undefined,
    border: config.has_border ? `1px solid ${config.border_color || '#e2e8f0'}` : 'none',
    boxShadow: config.has_shadow ? '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' : 'none'
  };
};
