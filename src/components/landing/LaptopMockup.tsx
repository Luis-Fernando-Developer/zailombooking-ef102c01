import macbookMockup from "@/assets/macbook-mockup.png.asset.json";

interface LaptopMockupProps {
  src: string;
  alt: string;
  urlLabel?: string;
  /** Optional max width in px (default lets container decide) */
  maxWidth?: number;
}

/**
 * Photorealistic MacBook Pro mockup. The frame is a real product photo
 * (transparent PNG) and the provided screenshot is overlaid inside the
 * black screen area with pixel-measured insets.
 */
export function LaptopMockup({ src, alt, urlLabel, maxWidth }: LaptopMockupProps) {
  // Screen area measured on the mockup image (1600x1024).
  // top ~3.6%, left ~13.4%, right ~13.1%, bottom ~25.5%
  const screen = {
    top: "3.6%",
    left: "13.4%",
    right: "13.1%",
    bottom: "25.5%",
  };

  return (
    <div
      className="relative w-full mx-auto"
      style={maxWidth ? { maxWidth: `${maxWidth}px` } : undefined}
    >
      {/* Aspect ratio wrapper: 1600 / 1024 = 1.5625 → padding-bottom 64% */}
      <div className="relative w-full" style={{ paddingBottom: "64%" }}>
        {/* Screenshot inside the screen area */}
        <div
          className="absolute overflow-hidden bg-black"
          style={{ ...screen }}
        >
          {urlLabel && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-b from-[#141a26] to-[#0a0f1a] border-b border-white/5">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-[#ff5f57]" />
                <span className="w-2 h-2 rounded-full bg-[#febc2e]" />
                <span className="w-2 h-2 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex-1 flex justify-center px-4">
                <div className="px-2 py-0.5 rounded bg-black/50 border border-white/5 text-[9px] text-muted-foreground truncate max-w-[80%]">
                  {urlLabel}
                </div>
              </div>
            </div>
          )}
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-cover object-top"
            loading="lazy"
          />
          {/* Screen gloss */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/[0.04] via-transparent to-white/[0.06]" />
        </div>

        {/* Laptop frame on top */}
        <img
          src={macbookMockup.url}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}
