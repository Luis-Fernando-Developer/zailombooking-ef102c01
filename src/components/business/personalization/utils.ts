import { 
  TypographyConfig, 
  BackgroundConfig, 
  ButtonConfig, 
  CardConfig,
  CustomizationData 
} from "./types";

export const getTypographyStyles = (
  config?: TypographyConfig, 
  bodyFallback?: { font_family?: string }
): React.CSSProperties => {
  if (!config) return {};

  const styles: React.CSSProperties = {};

  if (config.font_family) styles.fontFamily = config.font_family;
  else if (bodyFallback?.font_family) styles.fontFamily = bodyFallback.font_family;

  if (config.font_size) styles.fontSize = `${config.font_size}px`;
  if (config.font_weight) styles.fontWeight = config.font_weight;
  
  if (config.color_type === 'gradient' && config.gradient) {
    styles.backgroundImage = `linear-gradient(${config.gradient.angle || 0}deg, ${config.gradient.colors.join(', ')})`;
    styles.WebkitBackgroundClip = 'text';
    styles.WebkitTextFillColor = 'transparent';
    styles.backgroundClip = 'text';
  } else if (config.color) {
    styles.color = config.color;
    styles.WebkitTextFillColor = 'initial'; // Reset gradient if color is solid
  }

  return styles;
};

export const getBackgroundStyles = (config?: BackgroundConfig): React.CSSProperties => {
  if (!config) return {};

  const styles: React.CSSProperties = {};

  if (config.background_type === 'gradient' && config.gradient) {
    styles.background = `linear-gradient(${config.gradient.angle || 0}deg, ${config.gradient.colors.join(', ')})`;
  } else if (config.background_color) {
    styles.backgroundColor = config.background_color;
  }

  if (config.opacity !== undefined) {
    styles.opacity = config.opacity / 100;
  }

  return styles;
};

export const getButtonStyles = (config?: ButtonConfig): React.CSSProperties => {
  if (!config) return {};

  const styles: React.CSSProperties = {};

  if (config.background_type === 'gradient' && config.gradient) {
    styles.background = `linear-gradient(${config.gradient.angle || 0}deg, ${config.gradient.colors.join(', ')})`;
    styles.border = 'none';
  } else if (config.background_color) {
    styles.backgroundColor = config.background_color;
    styles.borderColor = config.background_color;
  }

  if (config.border_radius !== undefined) styles.borderRadius = `${config.border_radius}px`;
  if (config.padding_vertical !== undefined) {
    styles.paddingTop = `${config.padding_vertical}px`;
    styles.paddingBottom = `${config.padding_vertical}px`;
  }
  if (config.padding_horizontal !== undefined) {
    styles.paddingLeft = `${config.padding_horizontal}px`;
    styles.paddingRight = `${config.padding_horizontal}px`;
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

  if (config.background_type === 'gradient' && config.gradient) {
    styles.background = `linear-gradient(${config.gradient.angle || 0}deg, ${config.gradient.colors.join(', ')})`;
  } else if (config.background_color) {
    styles.backgroundColor = config.background_color;
  }

  if (config.border_radius !== undefined) styles.borderRadius = `${config.border_radius}px`;
  
  if (config.show_border) {
    styles.border = `1px solid ${config.border_color || 'rgba(255,255,255,0.1)'}`;
  } else {
    styles.border = 'none';
  }

  if (config.show_shadow) {
    styles.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
  }

  return styles;
};
