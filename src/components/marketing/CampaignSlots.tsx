import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useActiveCampaigns, CampaignWithMaterials } from "@/hooks/use-active-campaigns";
import { trackCampaignClick, type PlacementCTA } from "@/lib/api/marketing";
import { cn } from "@/lib/utils";

function MaterialMedia({ url, mime, alt }: { url: string; mime?: string | null; alt: string }) {
  if (mime?.startsWith("video/")) {
    return <video src={url} className="w-full h-full object-cover" autoPlay muted loop playsInline />;
  }
  return <img src={url} alt={alt} className="w-full h-full object-cover" />;
}

function getCfg(c: CampaignWithMaterials, placement: string): PlacementCTA {
  return (c.placement_config?.[placement] ?? {}) as PlacementCTA;
}

function resolveHref(cfg: PlacementCTA, placement: string): string | null {
  if (placement === "whatsapp" && cfg.phone) {
    const text = encodeURIComponent(cfg.message ?? "");
    return `https://wa.me/${cfg.phone.replace(/\D/g, "")}${text ? `?text=${text}` : ""}`;
  }
  if (placement === "sms" && cfg.phone) {
    const body = cfg.message ? `?body=${encodeURIComponent(cfg.message)}` : "";
    return `sms:${cfg.phone}${body}`;
  }
  return cfg.url ? cfg.url : null;
}

function openHref(href: string) {
  if (href.startsWith("/")) {
    window.location.href = href;
  } else {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

function useCountdown(endIso?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endIso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endIso]);
  if (!endIso) return null;
  const diff = new Date(endIso).getTime() - now;
  if (diff <= 0) return "00:00:00";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function handleClick(c: CampaignWithMaterials, placement: string) {
  const cfg = getCfg(c, placement);
  const href = resolveHref(cfg, placement);
  if (!href) return;
  trackCampaignClick({ campaignId: c.id, companyId: c.company_id, placement, url: href });
  openHref(href);
}

function TopBarItem({ c }: { c: CampaignWithMaterials }) {
  const cfg = getCfg(c, "top_bar");
  const countdown = useCountdown(c.end_at ?? undefined);
  const href = resolveHref(cfg, "top_bar");
  return (
    <div
      className="w-full py-2 px-4 text-center flex items-center justify-center gap-3 flex-wrap"
      style={{
        background: cfg.bg ?? "hsl(var(--primary))",
        color: cfg.fg ?? "hsl(var(--primary-foreground))",
        fontFamily: cfg.font && cfg.font !== "system" ? cfg.font : undefined,
        fontSize: cfg.fontSize ? `${cfg.fontSize}px` : undefined,
      }}
    >
      <strong>{c.name}</strong>
      {c.description && <span className="opacity-90">{c.description}</span>}
      {countdown && (
        <span className="opacity-90 font-mono">
          {cfg.countdownPrefix ?? "Termina em"} {countdown}
        </span>
      )}
      {href && (
        <button
          type="button"
          onClick={() => handleClick(c, "top_bar")}
          className="px-3 py-1 rounded font-semibold text-xs hover:opacity-90"
          style={{ background: cfg.btnBg ?? "#fff", color: cfg.btnFg ?? "#000" }}
        >
          {cfg.label ?? "Saiba mais"}
        </button>
      )}
    </div>
  );
}

/** Barra superior informativa — renderiza todas as campanhas ativas empilhadas */
export function CampaignTopBar({ companyId }: { companyId?: string | null }) {
  const { campaigns } = useActiveCampaigns(companyId, "top_bar");
  if (campaigns.length === 0) return null;
  return (
    <div className="w-full flex flex-col">
      {campaigns.map((c) => <TopBarItem key={c.id} c={c} />)}
    </div>
  );
}

function HeroLike({ c, placement }: { c: CampaignWithMaterials; placement: string }) {
  const cfg = getCfg(c, placement);
  const m = c.materials[0];
  if (!m?.file_url) return null;
  const href = resolveHref(cfg, placement);
  const fullClickable = cfg.buttonPosition === "full" && href;
  return (
    <div
      className={cn("relative w-full h-[400px] overflow-hidden", fullClickable && "cursor-pointer")}
      onClick={fullClickable ? () => handleClick(c, placement) : undefined}
      role={fullClickable ? "button" : undefined}
    >
      <MaterialMedia url={m.file_url} mime={m.file_mime} alt={c.name} />
      <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent flex items-end p-6">
        <div className="flex-1">
          <h2 className="text-2xl md:text-4xl font-bold text-foreground">{c.name}</h2>
          {c.description && <p className="text-muted-foreground mt-2">{c.description}</p>}
        </div>
        {href && cfg.buttonPosition !== "full" && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleClick(c, placement); }}
            className="ml-4 px-4 py-2 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90"
          >
            {cfg.label ?? "Saiba mais"}
          </button>
        )}
      </div>
    </div>
  );
}

export function CampaignHeroBanner({ companyId }: { companyId?: string | null }) {
  const { campaigns } = useActiveCampaigns(companyId, "hero");
  const first = campaigns.find((c) => c.materials.length > 0);
  if (!first) return null;
  return <HeroLike c={first} placement="hero" />;
}

export function CampaignHeroCarousel({ companyId }: { companyId?: string | null }) {
  const { campaigns } = useActiveCampaigns(companyId, "hero_carousel");
  const items = useMemo(() => campaigns.filter((c) => c.materials.length > 0), [campaigns]);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 5000);
    return () => clearInterval(t);
  }, [items.length]);
  if (items.length === 0) return null;
  return (
    <div className="relative">
      <HeroLike c={items[idx]} placement="hero_carousel" />
      {items.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {items.map((_, i) => (
            <button
              key={i}
              aria-label={`Slide ${i + 1}`}
              onClick={(e) => { e.stopPropagation(); setIdx(i); }}
              className={`w-2 h-2 rounded-full ${i === idx ? "bg-primary" : "bg-muted-foreground/50"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CampaignPopup({ companyId }: { companyId?: string | null }) {
  const { campaigns } = useActiveCampaigns(companyId, "popup");
  const [open, setOpen] = useState(false);
  const first = campaigns[0];
  const cfg = first ? getCfg(first, "popup") : {};
  const countdown = useCountdown(first?.end_at ?? undefined);
  useEffect(() => {
    if (!first) return;
    setOpen(true);
  }, [first?.id, first?.updated_at]);
  if (!open || !first) return null;
  const m = first.materials[0];
  const href = resolveHref(cfg, "popup");
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div
        className="relative rounded-lg max-w-lg w-full overflow-hidden border border-border"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: cfg.bg ?? "hsl(var(--card))",
          color: cfg.fg ?? "hsl(var(--foreground))",
          fontFamily: cfg.font && cfg.font !== "system" ? cfg.font : undefined,
          fontSize: cfg.fontSize ? `${cfg.fontSize}px` : undefined,
        }}
      >
        <button
          onClick={() => setOpen(false)}
          aria-label="Fechar"
          className="absolute top-2 right-2 z-10 p-1 rounded-full bg-background/80 text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
        {m?.file_url && (
          <div className="w-full aspect-video">
            <MaterialMedia url={m.file_url} mime={m.file_mime} alt={first.name} />
          </div>
        )}
        <div className="p-4 space-y-2">
          <h3 className="text-lg font-bold">{first.name}</h3>
          {first.description && <p className="text-sm opacity-80">{first.description}</p>}
          {countdown && (
            <p className="text-sm font-mono opacity-80">
              {cfg.countdownPrefix ?? "Termina em"} {countdown}
            </p>
          )}
          {href && (
            <button
              type="button"
              onClick={() => handleClick(first, "popup")}
              className="w-full mt-2 px-4 py-2 rounded-md font-semibold hover:opacity-90"
              style={{ background: cfg.btnBg ?? "hsl(var(--primary))", color: cfg.btnFg ?? "hsl(var(--primary-foreground))" }}
            >
              {cfg.label ?? "Saiba mais"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CampaignBlock({ companyId, placement, title }: { companyId?: string | null; placement: string; title?: string }) {
  const { campaigns } = useActiveCampaigns(companyId, placement);
  if (campaigns.length === 0) return null;
  return (
    <div className="space-y-4">
      {title && <h3 className="text-lg font-semibold text-foreground">{title}</h3>}
      {campaigns.map((c) => {
        const m = c.materials[0];
        const cfg = getCfg(c, placement);
        const href = resolveHref(cfg, placement);
        return (
          <div key={c.id} className="rounded-lg border border-border bg-card overflow-hidden">
            {m?.file_url && (
              <div className="w-full aspect-video">
                <MaterialMedia url={m.file_url} mime={m.file_mime} alt={c.name} />
              </div>
            )}
            <div className="p-4 space-y-2">
              <div className="font-semibold text-foreground">{c.name}</div>
              {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
              {href && (
                <button
                  type="button"
                  onClick={() => handleClick(c, placement)}
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
                >
                  {cfg.label ?? "Saiba mais"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
