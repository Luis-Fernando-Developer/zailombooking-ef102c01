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
  const styles: React.CSSProperties = {};

  // Auxiliar para pegar valor com fallback
  const getValue = (key: keyof TypographyConfig, configVal: any, fallbackVal: any) => {
    return configVal !== undefined ? configVal : fallbackVal;
  };

  const family = config?.family || fallbackConfig?.family || fallbackConfig?.default_font_family;
  if (family) styles.fontFamily = `${family}, system-ui, sans-serif`;

  const size = config?.size || fallbackConfig?.size || fallbackConfig?.default_font_size;
  if (size) styles.fontSize = `${size}px`;

  const weight = config?.weight || fallbackConfig?.weight;
  if (weight) styles.fontWeight = weight;

  const alignment = config?.alignment || fallbackConfig?.alignment;
  if (alignment) styles.textAlign = alignment;

  const lineHeight = config?.lineHeight || fallbackConfig?.lineHeight;
  if (lineHeight) styles.lineHeight = lineHeight;

  const letterSpacing = config?.letterSpacing || fallbackConfig?.letterSpacing;
  if (letterSpacing !== undefined) styles.letterSpacing = `${letterSpacing}px`;

  // Cores
  const colorType = config?.colorType || fallbackConfig?.colorType || (fallbackConfig?.default_text_color ? 'solid' : undefined);
  
  if (colorType === 'gradient') {
    const grad = config?.gradient || fallbackConfig?.gradient;
    if (grad) {
      const { type, angle, colors } = grad;
      const colorString = colors.join(', ');
      const gradient = type === 'linear' 
        ? `linear-gradient(${angle}deg, ${colorString})`
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

  const color = config?.color || fallbackConfig?.color || fallbackConfig?.default_text_color;
  if (color) styles.color = color;

  return styles;
}

/**
 * Gera estilo de fundo (solid ou gradient)
 */
export function getBackgroundStyles(config: any): React.CSSProperties {
  if (!config) return {};

  const type = config.background_type || config.type;
  
  if (type === 'gradient') {
    const grad = config.background_gradient || config.gradient;
    if (grad) {
      const { type: gradType, angle, colors } = grad;
      const colorString = colors.join(', ');
      return {
        background: gradType === 'linear' 
          ? `linear-gradient(${angle}deg, ${colorString})`
          : `radial-gradient(circle, ${colorString})`
      };
    }
  }

  const color = config.background_color || config.solidColor || config.color;
  if (color) return { backgroundColor: color };

  return {};
}
