import { 
  TypographyConfig, 
  ButtonConfig, 
  CardConfig,
  SectionConfig
} from "./types";

export const getTypographyStyles = (
  config?: TypographyConfig, 
  bodyFallback?: { font_family?: string }
): React.CSSProperties => {
  if (!config) return {};

  const styles: React.CSSProperties = {};
  
  if (config.family) {
    styles.fontFamily = `'${config.family}', sans-serif`;
  } else if (bodyFallback?.font_family) {
    styles.fontFamily = `'${bodyFallback.font_family}', sans-serif`;
  }

  if (config.size) styles.fontSize = `${config.size}px`;
  if (config.weight) styles.fontWeight = config.weight;
  
  if (config.colorType === 'gradient' && config.gradient) {
    styles.backgroundImage = `linear-gradient(${config.gradient.angle || 0}deg, ${config.gradient.colors.join(', ')})`;
    styles.WebkitBackgroundClip = 'text';
    styles.WebkitTextFillColor = 'transparent';
    styles.backgroundClip = 'text';
  } else if (config.color) {
    styles.color = config.color;
    styles.WebkitTextFillColor = 'initial';
  }

  if (config.lineHeight) styles.lineHeight = config.lineHeight;
  if (config.letterSpacing !== undefined) styles.letterSpacing = `${config.letterSpacing}px`;
  if (config.alignment) styles.textAlign = config.alignment;

  return styles;
};

export const getBackgroundStyles = (config?: any): React.CSSProperties => {
  if (!config) return {};

  const styles: React.CSSProperties = {};

  if (config.background_type === 'gradient' && config.background_gradient) {
    const g = config.background_gradient;
    styles.background = `linear-gradient(${g.angle || 0}deg, ${g.colors?.join(', ') || ''})`;
  } else if (config.background_color) {
    styles.backgroundColor = config.background_color;
  }

  return styles;
};

export const getButtonStyles = (config?: ButtonConfig): React.CSSProperties => {
  if (!config) return {};

  const styles: React.CSSProperties = {};

  if (config.background_type === 'gradient' && config.background_gradient) {
    const g = config.background_gradient;
    styles.background = `linear-gradient(${g.angle || 0}deg, ${g.colors?.join(', ') || ''})`;
    styles.border = 'none';
  } else if (config.background_color) {
    styles.backgroundColor = config.background_color;
    styles.borderColor = config.background_color;
  }

  if (config.border_radius !== undefined) styles.borderRadius = `${config.border_radius}px`;
  if (config.padding_v !== undefined) {
    styles.paddingTop = `${config.padding_v}px`;
    styles.paddingBottom = `${config.padding_v}px`;
  }
  if (config.padding_h !== undefined) {
    styles.paddingLeft = `${config.padding_h}px`;
    styles.paddingRight = `${config.padding_h}px`;
  }

  if (config.typography) {
    const typo = getTypographyStyles(config.typography);
    Object.assign(styles, typo);
  }

  return styles;
};

export const getCardStyles = (config?: CardConfig): React.CSSProperties => {
  if (!config) return {};

  const styles: React.CSSProperties = {};

  if (config.background_type === 'gradient' && config.background_gradient) {
    const g = config.background_gradient;
    styles.background = `linear-gradient(${g.angle || 0}deg, ${g.colors?.join(', ') || ''})`;
  } else if (config.background_color) {
    styles.backgroundColor = config.background_color;
  }

  if (config.border_radius !== undefined) styles.borderRadius = `${config.border_radius}px`;
  
  if (config.has_border) {
    styles.border = `1px solid ${config.border_color || 'rgba(255,255,255,0.1)'}`;
  } else {
    styles.border = 'none';
  }

  if (config.has_shadow) {
    styles.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
  }

  return styles;
};
