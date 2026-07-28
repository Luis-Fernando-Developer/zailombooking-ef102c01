interface LaptopMockupProps {
  src: string;
  alt: string;
  urlLabel?: string;
}

/**
 * Realistic laptop mockup: screen bezel with camera notch,
 * hinge, and tapered aluminum base. Screen area displays the given image.
 */
export function LaptopMockup({ src, alt, urlLabel }: LaptopMockupProps) {
  return (
    <div className="relative w-full mx-auto">
      {/* Screen assembly */}
      <div
        className="relative rounded-[18px] p-[10px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
        style={{
          background:
            "linear-gradient(180deg, #2a2a2e 0%, #1a1a1d 40%, #0f0f11 100%)",
          boxShadow:
            "0 30px 80px -20px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        {/* Camera notch */}
        <div className="absolute top-[4px] left-1/2 -translate-x-1/2 flex items-center gap-1 z-10">
          <span className="w-1 h-1 rounded-full bg-neutral-700" />
        </div>

        {/* Bezel */}
        <div
          className="relative rounded-[10px] overflow-hidden bg-black"
          style={{
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
          }}
        >
          {/* Optional URL bar */}
          {urlLabel && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-b from-[#141a26] to-[#0a0f1a] border-b border-white/5">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex-1 flex justify-center px-6">
                <div className="px-3 py-1 rounded bg-black/50 border border-white/5 text-[10px] text-muted-foreground truncate max-w-xs">
                  {urlLabel}
                </div>
              </div>
            </div>
          )}
          <img src={src} alt={alt} className="w-full h-auto block" loading="lazy" />
          {/* Screen gloss */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/[0.03] via-transparent to-white/[0.06]" />
        </div>
      </div>

      {/* Hinge shadow */}
      <div
        className="mx-[8%] h-[6px] rounded-b-md"
        style={{
          background:
            "linear-gradient(180deg, #0a0a0b 0%, #1a1a1d 40%, #26262a 100%)",
          boxShadow: "0 2px 4px rgba(0,0,0,0.6)",
        }}
      />

      {/* Base / keyboard deck */}
      <div className="relative -mx-[3%]">
        <div
          className="mx-auto h-[14px] rounded-b-[18px]"
          style={{
            background:
              "linear-gradient(180deg, #3a3a3e 0%, #2a2a2d 40%, #1c1c1f 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 40px -10px rgba(0,0,0,0.7)",
          }}
        />
        {/* Trackpad notch */}
        <div
          className="absolute left-1/2 -translate-x-1/2 top-0 h-[4px] w-[16%] rounded-b-md"
          style={{
            background: "linear-gradient(180deg, #0a0a0b 0%, #1a1a1d 100%)",
          }}
        />
      </div>

      {/* Ambient reflection */}
      <div className="relative -mt-2 mx-[10%] h-10 opacity-20 blur-md pointer-events-none">
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover object-top scale-y-[-1]"
          style={{
            maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)",
          }}
        />
      </div>
    </div>
  );
}
