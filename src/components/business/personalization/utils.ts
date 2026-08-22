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

    // Strict primitive extraction to prevent React #310
    const getSafeValue = (val: any) => {
      if (val === null || val === undefined) return undefined;
      // If we got an object, it's corrupt data (React #310)
      if (typeof val === 'object') {
        // Log specifically what we found to help debugging
        console.warn("[Typography Styles] React #310 Prevention: Object found instead of string/number:", val);
        return undefined;
      }
      return val;
    };

    const family = getSafeValue(config?.family) || getSafeValue(fallbackConfig?.family) || getSafeValue((fallbackConfig as any)?.default_font_family);
    if (family && typeof family === 'string') styles.fontFamily = `${family}, system-ui, sans-serif`;

    const size = getSafeValue(config?.size) || getSafeValue(fallbackConfig?.size) || getSafeValue((fallbackConfig as any)?.default_font_size);
    if (size) styles.fontSize = `${size}px`;

    const weight = getSafeValue(config?.weight) || getSafeValue(fallbackConfig?.weight);
    if (weight && (typeof weight === 'string' || typeof weight === 'number')) {
      styles.fontWeight = weight as any;
    }

    const alignment = getSafeValue(config?.alignment) || getSafeValue(fallbackConfig?.alignment);
    if (alignment && typeof alignment === 'string') {
      styles.textAlign = alignment as any;
    }

    const lineHeight = getSafeValue(config?.lineHeight) || getSafeValue(fallbackConfig?.lineHeight);
    if (lineHeight) styles.lineHeight = lineHeight;

    const letterSpacing = getSafeValue(config?.letterSpacing) ?? getSafeValue(fallbackConfig?.letterSpacing);
    if (letterSpacing !== undefined) styles.letterSpacing = `${letterSpacing}px`;

    // Cores
    const colorType = getSafeValue(config?.colorType) || getSafeValue(fallbackConfig?.colorType) || (getSafeValue((fallbackConfig as any)?.default_text_color) ? 'solid' : undefined);
    
    if (colorType === 'gradient') {
      const grad = config?.gradient || fallbackConfig?.gradient;
      if (grad && typeof grad === 'object' && Array.isArray(grad.colors)) {
        const { type, angle, colors } = grad;
        const colorString = colors.filter((c: any) => typeof c === 'string').join(', ');
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

    const color = getSafeValue(config?.color) || getSafeValue(fallbackConfig?.color) || getSafeValue((fallbackConfig as any)?.default_text_color);
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
    if (!config || typeof config !== 'object' || Array.isArray(config)) return {};

    const type = config.background_type || config.type;
    
    if (type === 'gradient') {
      const grad = config.background_gradient || config.gradient;
      if (grad && typeof grad === 'object' && Array.isArray(grad.colors)) {
        const { type: gradType, angle, colors } = grad;
        // Filter out non-string colors to prevent crashes
        const colorString = colors.filter((c: any) => typeof c === 'string').join(', ');
        if (!colorString) return {};
        
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