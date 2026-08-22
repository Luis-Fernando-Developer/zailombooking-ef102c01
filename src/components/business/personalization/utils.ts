import { TypographyConfig } from "./types";

/**
 * Utilitário para gerar estilos CSS a partir de uma configuração de tipografia.
 * @param config Configuração de tipografia do elemento.
 * @param fallbackConfig Configuração de fallback (seção ou body).
 * @returns Um objeto de estilo CSS.
 */
export function getTypographyStyles(
  config?: TypographyConfig,
  fallbackConfig?: TypographyConfig | any
): React.CSSProperties {
  try {
    const styles: React.CSSProperties = {};

    // Logging to catch invalid data
    if (typeof config === 'object' && config !== null) {
      Object.entries(config).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value) && key !== 'gradient') {
          console.warn(`[Typography] Found nested object in field "${key}":`, value);
        }
      });
    }

    const family = config?.family || fallbackConfig?.family || (fallbackConfig as any)?.default_font_family;
    if (family && typeof family === 'string') styles.fontFamily = `${family}, system-ui, sans-serif`;

    const size = config?.size || fallbackConfig?.size || (fallbackConfig as any)?.default_font_size;
    if (size) styles.fontSize = `${size}px`;

    const weight = config?.weight || fallbackConfig?.weight;
    if (weight && typeof weight === 'string') styles.fontWeight = weight;

    const alignment = config?.alignment || fallbackConfig?.alignment;
    if (alignment && typeof alignment === 'string') styles.textAlign = alignment;

    const lineHeight = config?.lineHeight || fallbackConfig?.lineHeight;
    if (lineHeight) styles.lineHeight = lineHeight;

    const letterSpacing = config?.letterSpacing || fallbackConfig?.letterSpacing;
    if (letterSpacing !== undefined) styles.letterSpacing = `${letterSpacing}px`;

    // Cores
    const colorType = config?.colorType || fallbackConfig?.colorType || ((fallbackConfig as any)?.default_text_color ? 'solid' : undefined);
    
    if (colorType === 'gradient') {
      const grad = config?.gradient || fallbackConfig?.gradient;
      if (grad && typeof grad === 'object' && Array.isArray(grad.colors)) {
        const { type, angle, colors } = grad;
        const colorString = colors.join(', ');
        const gradient = type === 'linear' 
          ? `linear-gradient(${angle || 0}deg, ${colorString})`
          : `radial-gradient(circle, ${colorString})`;
        
        return {
          ...styles,
          background: gradient,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          display: 'inline-block'
        };
      }
    }

    const color = config?.color || fallbackConfig?.color || (fallbackConfig as any)?.default_text_color;
    if (color && typeof color === 'string') styles.color = color;

    return styles;
  } catch (error) {
    console.error("Error in getTypographyStyles:", error, { config, fallbackConfig });
    return {};
  }
}

/**
 * Gera estilo de fundo (solid ou gradient)
 */
export function getBackgroundStyles(config: any): React.CSSProperties {
  try {
    if (!config || typeof config !== 'object') return {};

    const type = config.background_type || config.type;
    
    if (type === 'gradient') {
      const grad = config.background_gradient || config.gradient;
      if (grad && typeof grad === 'object' && Array.isArray(grad.colors)) {
        const { type: gradType, angle, colors } = grad;
        const colorString = colors.join(', ');
        return {
          background: gradType === 'linear' 
            ? `linear-gradient(${angle || 0}deg, ${colorString})`
            : `radial-gradient(circle, ${colorString})`
        };
      }
    }

    const color = config.background_color || config.solidColor || config.color;
    if (color && typeof color === 'string') return { backgroundColor: color };

    return {};
  } catch (error) {
    console.error("Error in getBackgroundStyles:", error, { config });
    return {};
  }
}