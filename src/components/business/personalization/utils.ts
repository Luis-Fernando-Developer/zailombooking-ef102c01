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

export const getButtonStyles = (config?: ButtonConfig, hover = false): React.CSSProperties => {
  if (!config) return {};

  const styles: React.CSSProperties = {};

  const bgColor = hover && config.hover_background_color 
    ? config.hover_background_color 
    : (config.background_type === 'gradient' && config.background_gradient 
      ? undefined 
      : config.background_color);

  if (config.background_type === 'gradient' && config.background_gradient && !hover) {
    const g = config.background_gradient;
    styles.background = `linear-gradient(${g.angle || 0}deg, ${g.colors?.join(', ') || ''})`;
    styles.border = 'none';
  } else if (bgColor) {
    styles.backgroundColor = bgColor;
    if (!hover) styles.borderColor = bgColor;
  }

  const textColor = hover && config.hover_text_color ? config.hover_text_color : config.typography?.color;
  if (textColor) {
    styles.color = textColor;
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

  if (config.typography && !hover) {
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
    const borderWidth = config.border_width ?? 1;
    const borderColor = config.border_color || 'rgba(0,0,0,0.1)';
    const sides = config.border_sides || ['top', 'right', 'bottom', 'left'];
    
    if (sides.length === 4) {
      styles.border = `${borderWidth}px solid ${borderColor}`;
    } else {
      const borderMap: Record<string, string> = {
        top: `borderTop`,
        right: `borderRight`,
        bottom: `borderBottom`,
        left: `borderLeft`
      };
      sides.forEach(side => {
        if (borderMap[side]) {
          styles[borderMap[side] as keyof React.CSSProperties] = `${borderWidth}px solid ${borderColor}`;
        }
      });
    }
  } else {
    styles.border = 'none';
  }

  if (config.has_shadow && config.shadow_color) {
    const offsetX = config.shadow_offset_x ?? 0;
    const offsetY = config.shadow_offset_y ?? 4;
    const blurRadius = config.shadow_blur ?? 6;
    const spreadRadius = config.shadow_spread ?? 0;
    styles.boxShadow = `${offsetX}px ${offsetY}px ${blurRadius}px ${spreadRadius}px ${config.shadow_color}`;
  }

  return styles;
};

export const getBadgeStyles = (config?: ButtonConfig): React.CSSProperties => {
  if (!config) return {
    backgroundColor: '#1e293b',
    color: '#ffffff',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: "'Inter', sans-serif",
  };

  const styles: React.CSSProperties = {};

  // Background — respeita o que está salvo ou fallback
  if (config.background_type === 'gradient' && config.background_gradient) {
    const g = config.background_gradient;
    styles.background = `linear-gradient(${g.angle || 0}deg, ${g.colors?.join(', ') || ''})`;
  } else if (config.background_color) {
    styles.backgroundColor = config.background_color;
  } else {
    styles.backgroundColor = '#1e293b';
  }

  // Arredondamento
  styles.borderRadius = config.border_radius !== undefined ? `${config.border_radius}px` : '6px';

  // Padding
  styles.paddingTop = config.padding_v !== undefined ? `${config.padding_v}px` : '4px';
  styles.paddingBottom = config.padding_v !== undefined ? `${config.padding_v}px` : '4px';
  styles.paddingLeft = config.padding_h !== undefined ? `${config.padding_h}px` : '8px';
  styles.paddingRight = config.padding_h !== undefined ? `${config.padding_h}px` : '8px';

  // Tipografia
  if (config.typography) {
    if (config.typography.size) styles.fontSize = `${config.typography.size}px`;
    else styles.fontSize = '12px';

    if (config.typography.weight) styles.fontWeight = config.typography.weight;
    else styles.fontWeight = '600';

    if (config.typography.family) styles.fontFamily = `'${config.typography.family}', sans-serif`;
    else styles.fontFamily = "'Inter', sans-serif";

    if (config.typography.lineHeight) styles.lineHeight = config.typography.lineHeight;
    if (config.typography.letterSpacing !== undefined) styles.letterSpacing = `${config.typography.letterSpacing}px`;
    if (config.typography.alignment) styles.textAlign = config.typography.alignment;

    // COR DO TEXTO — a correção principal: usa typography.color diretamente
    if (config.typography.color) {
      styles.color = config.typography.color;
    } else if (config.typography.colorType === 'gradient' && config.typography.gradient) {
      const g = config.typography.gradient;
      styles.backgroundImage = `linear-gradient(${g.angle || 0}deg, ${g.colors?.join(', ') || ''})`;
      styles.WebkitBackgroundClip = 'text';
      styles.WebkitTextFillColor = 'transparent';
      styles.backgroundClip = 'text';
      styles.color = 'transparent';
    } else {
      styles.color = '#ffffff';
    }
  } else {
    // Fallback completo se não houver tipografia configurada
    styles.fontSize = '12px';
    styles.fontWeight = '600';
    styles.fontFamily = "'Inter', sans-serif";
    styles.color = '#ffffff';
  }

  return styles;
};
