import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useActiveCampaigns, CampaignWithMaterials } from "@/hooks/use-active-campaigns";

function MaterialMedia({ url, mime, alt }: { url: string; mime?: string | null; alt: string }) {
  if (mime?.startsWith("video/")) {
    return <video src={url} className="w-full h-full object-cover" autoPlay muted loop playsInline />;
  }
  return <img src={url} alt={alt} className="w-full h-full object-cover" />;
}

/** Barra superior informativa */
export function CampaignTopBar({ companyId }: { companyId?: string | null }) {
  const { campaigns } = useActiveCampaigns(companyId, "top_bar");
  if (campaigns.length === 0) return null;
  const c = campaigns[0];
  return (
    <div className="w-full bg-primary text-primary-foreground text-sm py-2 px-4 text-center">
      <strong className="mr-2">{c.name}</strong>
      {c.description && <span className="opacity-90">{c.description}</span>}
    </div>
  );
}

/** Hero — primeira campanha aprovada com material */
export function CampaignHeroBanner({ companyId }: { companyId?: string | null }) {
  const { campaigns } = useActiveCampaigns(companyId, "hero");
  const first = campaigns.find((c) => c.materials.length > 0);
  if (!first) return null;
  const m = first.materials[0];
  if (!m?.file_url) return null;
  return (
    <div className="relative w-full h-[400px] overflow-hidden">
      <MaterialMedia url={m.file_url} mime={m.file_mime} alt={first.name} />
      <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent flex items-end p-6">
        <div>
          <h2 className="text-2xl md:text-4xl font-bold text-foreground">{first.name}</h2>
          {first.description && <p className="text-muted-foreground mt-2">{first.description}</p>}
        </div>
      </div>
    </div>
  );
}

/** Carrossel — combina todos os materiais das campanhas em hero_carousel */
export function CampaignHeroCarousel({ companyId }: { companyId?: string | null }) {
  const { campaigns } = useActiveCampaigns(companyId, "hero_carousel");
  const items = campaigns.flatMap((c) => c.materials.map((m) => ({ c, m })));
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 5000);
    return () => clearInterval(t);
  }, [items.length]);
  if (items.length === 0) return null;
  const cur = items[idx];
  if (!cur.m.file_url) return null;
  return (
    <div className="relative w-full h-[400px] overflow-hidden">
      <MaterialMedia url={cur.m.file_url} mime={cur.m.file_mime} alt={cur.c.name} />
      {items.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
          {items.map((_, i) => (
            <button
              key={i}
              aria-label={`Slide ${i + 1}`}
              onClick={() => setIdx(i)}
              className={`w-2 h-2 rounded-full ${i === idx ? "bg-primary" : "bg-muted-foreground/50"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Popup — exibe a primeira campanha popup uma vez por sessão */
export function CampaignPopup({ companyId }: { companyId?: string | null }) {
  const { campaigns } = useActiveCampaigns(companyId, "popup");
  const [open, setOpen] = useState(false);
  const first = campaigns[0];
  useEffect(() => {
    if (!first) return;
    const key = `mkt-popup-${first.id}`;
    if (sessionStorage.getItem(key)) return;
    setOpen(true);
    sessionStorage.setItem(key, "1");
  }, [first?.id]);
  if (!open || !first) return null;
  const m = first.materials[0];
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="relative bg-card rounded-lg max-w-lg w-full overflow-hidden border border-border" onClick={(e) => e.stopPropagation()}>
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
        <div className="p-4">
          <h3 className="text-lg font-bold text-foreground">{first.name}</h3>
          {first.description && <p className="text-sm text-muted-foreground mt-1">{first.description}</p>}
        </div>
      </div>
    </div>
  );
}

/** Bloco genérico — útil para client_area / employee_area */
export function CampaignBlock({ companyId, placement, title }: { companyId?: string | null; placement: string; title?: string }) {
  const { campaigns } = useActiveCampaigns(companyId, placement);
  if (campaigns.length === 0) return null;
  return (
    <div className="space-y-4">
      {title && <h3 className="text-lg font-semibold text-foreground">{title}</h3>}
      {campaigns.map((c: CampaignWithMaterials) => {
        const m = c.materials[0];
        return (
          <div key={c.id} className="rounded-lg border border-border bg-card overflow-hidden">
            {m?.file_url && (
              <div className="w-full aspect-video">
                <MaterialMedia url={m.file_url} mime={m.file_mime} alt={c.name} />
              </div>
            )}
            <div className="p-4">
              <div className="font-semibold text-foreground">{c.name}</div>
              {c.description && <p className="text-sm text-muted-foreground mt-1">{c.description}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
