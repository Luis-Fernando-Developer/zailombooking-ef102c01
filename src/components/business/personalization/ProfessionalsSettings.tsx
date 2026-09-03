import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColorPicker } from "@/components/business/ColorPicker";
import { cn } from "@/lib/utils";

interface TypographyConfig {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  textAlign?: "left" | "center" | "right";
}

interface BadgeConfig {
  enabled: boolean;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
  typography: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
  };
}

interface ProfessionalsSettingsProps {
  config: {
    cards: {
      backgroundColor: string;
      borderColor: string;
      borderWidth: number;
      borderRadius: number;
      shadow: string;
      titleTypography: TypographyConfig;
      subtitleTypography: TypographyConfig;
      badge: BadgeConfig;
    };
  };
  onChange: (path: string, value: any) => void;
}

export function ProfessionalsSettings({ config, onChange }: ProfessionalsSettingsProps) {
  const [activeTab, setActiveTab] = useState("cards");

  // Defaults defensivos para evitar "undefined" crashes
  const cards = config?.cards ?? {};
  const badge = cards?.badge ?? { enabled: true, backgroundColor: '#1e293b', textColor: '#ffffff', borderRadius: 6, typography: { fontFamily: 'Inter', fontSize: 12, fontWeight: '600' } };
  const titleTypo = cards?.titleTypography ?? { fontFamily: 'Inter', fontSize: 16, weight: '700', color: '#000000' };
  const subtitleTypo = cards?.subtitleTypography ?? { fontFamily: 'Inter', fontSize: 14, weight: '400', color: '#666666' };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="cards">Cards de Profissionais</TabsTrigger>
          <TabsTrigger value="typography">Tipografia</TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="space-y-6 pt-4">
          {/* Background */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Cor de Fundo</Label>
            <ColorPicker
              value={cards.backgroundColor ?? '#ffffff'}
              onChange={(v) => onChange("cards.backgroundColor", v)}
            />
          </div>

          {/* Border */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Cor da Borda</Label>
            <ColorPicker
              value={cards.borderColor ?? '#e2e8f0'}
              onChange={(v) => onChange("cards.borderColor", v)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Espessura da Borda: {cards.borderWidth ?? 1}px
            </Label>
            <Slider
              value={[cards.borderWidth ?? 1]}
              onValueChange={([v]) => onChange("cards.borderWidth", v)}
              min={0}
              max={5}
              step={1}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Arredondamento: {cards.borderRadius ?? 12}px
            </Label>
            <Slider
              value={[cards.borderRadius ?? 12]}
              onValueChange={([v]) => onChange("cards.borderRadius", v)}
              min={0}
              max={24}
              step={2}
            />
          </div>

          {/* Shadow */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Sombra</Label>
            <div className="grid grid-cols-4 gap-2">
              {["none", "sm", "md", "lg"].map((s) => (
                <button
                  key={s}
                  onClick={() => onChange("cards.shadow", s)}
                  className={cn(
                    "rounded-md border p-2 text-xs capitalize transition-colors",
                    (cards.shadow ?? 'none') === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Badge Config */}
          <div className="space-y-4 border-t pt-4">
            <Label className="text-xs font-medium text-muted-foreground">Badge Profissionais</Label>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="badge-enabled"
                  checked={!!badge.enabled}
                  onChange={(e) => onChange("cards.badge.enabled", e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="badge-enabled" className="text-xs font-normal">Habilitar Badge</Label>
              </div>
            </div>

            {badge.enabled && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Cor do Fundo</Label>
                  <ColorPicker
                    value={badge.backgroundColor ?? '#1e293b'}
                    onChange={(v) => onChange("cards.badge.backgroundColor", v)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Cor do Texto</Label>
                  <ColorPicker
                    value={badge.textColor ?? '#ffffff'}
                    onChange={(v) => onChange("cards.badge.textColor", v)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Arredondamento: {badge.borderRadius ?? 6}px
                  </Label>
                  <Slider
                    value={[badge.borderRadius ?? 6]}
                    onValueChange={([v]) => onChange("cards.badge.borderRadius", v)}
                    min={0}
                    max={16}
                    step={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Família da Fonte</Label>
                  <Input
                    value={badge.typography?.fontFamily ?? ""}
                    onChange={(e) => onChange("cards.badge.typography.fontFamily", e.target.value)}
                    placeholder="Ex: Inter, sans-serif"
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Tamanho da Fonte: {badge.typography?.fontSize ?? 12}px
                  </Label>
                  <Slider
                    value={[badge.typography?.fontSize ?? 12]}
                    onValueChange={([v]) => onChange("cards.badge.typography.fontSize", v)}
                    min={8}
                    max={20}
                    step={1}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Peso da Fonte</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {["400", "500", "600", "700"].map((w) => (
                      <button
                        key={w}
                        onClick={() => onChange("cards.badge.typography.fontWeight", w)}
                        className={cn(
                          "rounded-md border p-2 text-xs transition-colors",
                          (badge.typography?.fontWeight ?? '600') === w
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        {w === "400" ? "Normal" : w === "500" ? "Medium" : w === "600" ? "Semibold" : "Bold"}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="typography" className="space-y-6 pt-4">
          {/* Title */}
          <div className="space-y-4">
            <Label className="text-xs font-semibold text-muted-foreground">Título do Profissional</Label>

            <div className="space-y-2">
              <Label className="text-xs font-normal text-muted-foreground">Família da Fonte</Label>
              <Input
                value={titleTypo.fontFamily ?? ""}
                onChange={(e) => onChange("cards.titleTypography.fontFamily", e.target.value)}
                placeholder="Ex: Inter, sans-serif"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-normal text-muted-foreground">
                Tamanho: {titleTypo.fontSize ?? 16}px
              </Label>
              <Slider
                value={[titleTypo.fontSize ?? 16]}
                onValueChange={([v]) => onChange("cards.titleTypography.fontSize", v)}
                min={12}
                max={32}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-normal text-muted-foreground">Cor</Label>
              <ColorPicker
                value={titleTypo.color ?? "#000000"}
                onChange={(v) => onChange("cards.titleTypography.color", v)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-normal text-muted-foreground">Peso</Label>
              <div className="grid grid-cols-4 gap-2">
                {["400", "500", "600", "700"].map((w) => (
                  <button
                    key={w}
                    onClick={() => onChange("cards.titleTypography.fontWeight", w)}
                    className={cn(
                      "rounded-md border p-2 text-xs transition-colors",
                      (titleTypo.fontWeight ?? '700') === w
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {w === "400" ? "Normal" : w === "500" ? "Medium" : w === "600" ? "Semibold" : "Bold"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Subtitle */}
          <div className="space-y-4">
            <Label className="text-xs font-semibold text-muted-foreground">Subtítulo do Profissional</Label>

            <div className="space-y-2">
              <Label className="text-xs font-normal text-muted-foreground">Família da Fonte</Label>
              <Input
                value={subtitleTypo.fontFamily ?? ""}
                onChange={(e) => onChange("cards.subtitleTypography.fontFamily", e.target.value)}
                placeholder="Ex: Inter, sans-serif"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-normal text-muted-foreground">
                Tamanho: {subtitleTypo.fontSize ?? 14}px
              </Label>
              <Slider
                value={[subtitleTypo.fontSize ?? 14]}
                onValueChange={([v]) => onChange("cards.subtitleTypography.fontSize", v)}
                min={10}
                max={24}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-normal text-muted-foreground">Cor</Label>
              <ColorPicker
                value={subtitleTypo.color ?? "#666666"}
                onChange={(v) => onChange("cards.subtitleTypography.color", v)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-normal text-muted-foreground">Peso</Label>
              <div className="grid grid-cols-4 gap-2">
                {["400", "500", "600", "700"].map((w) => (
                  <button
                    key={w}
                    onClick={() => onChange("cards.subtitleTypography.fontWeight", w)}
                    className={cn(
                      "rounded-md border p-2 text-xs transition-colors",
                      (subtitleTypo.fontWeight ?? '400') === w
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {w === "400" ? "Normal" : w === "500" ? "Medium" : w === "600" ? "Semibold" : "Bold"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
