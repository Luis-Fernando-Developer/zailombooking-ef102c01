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
              value={config.cards.backgroundColor}
              onChange={(v) => onChange("cards.backgroundColor", v)}
            />
          </div>

          {/* Border */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Cor da Borda</Label>
            <ColorPicker
              value={config.cards.borderColor}
              onChange={(v) => onChange("cards.borderColor", v)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Espessura da Borda: {config.cards.borderWidth}px
            </Label>
            <Slider
              value={[config.cards.borderWidth]}
              onValueChange={([v]) => onChange("cards.borderWidth", v)}
              min={0}
              max={5}
              step={1}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Arredondamento: {config.cards.borderRadius}px
            </Label>
            <Slider
              value={[config.cards.borderRadius]}
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
                    config.cards.shadow === s
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
                  checked={config.cards.badge.enabled}
                  onChange={(e) => onChange("cards.badge.enabled", e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="badge-enabled" className="text-xs font-normal">Habilitar Badge</Label>
              </div>
            </div>

            {config.cards.badge.enabled && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Cor do Fundo</Label>
                  <ColorPicker
                    value={config.cards.badge.backgroundColor}
                    onChange={(v) => onChange("cards.badge.backgroundColor", v)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Cor do Texto</Label>
                  <ColorPicker
                    value={config.cards.badge.textColor}
                    onChange={(v) => onChange("cards.badge.textColor", v)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Arredondamento: {config.cards.badge.borderRadius}px
                  </Label>
                  <Slider
                    value={[config.cards.badge.borderRadius]}
                    onValueChange={([v]) => onChange("cards.badge.borderRadius", v)}
                    min={0}
                    max={16}
                    step={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Família da Fonte</Label>
                  <Input
                    value={config.cards.badge.typography.fontFamily || ""}
                    onChange={(e) => onChange("cards.badge.typography.fontFamily", e.target.value)}
                    placeholder="Ex: Inter, sans-serif"
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Tamanho da Fonte: {config.cards.badge.typography.fontSize || 12}px
                  </Label>
                  <Slider
                    value={[config.cards.badge.typography.fontSize || 12]}
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
                          config.cards.badge.typography.fontWeight === w
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
                value={config.cards.titleTypography.fontFamily || ""}
                onChange={(e) => onChange("cards.titleTypography.fontFamily", e.target.value)}
                placeholder="Ex: Inter, sans-serif"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-normal text-muted-foreground">
                Tamanho: {config.cards.titleTypography.fontSize || 16}px
              </Label>
              <Slider
                value={[config.cards.titleTypography.fontSize || 16]}
                onValueChange={([v]) => onChange("cards.titleTypography.fontSize", v)}
                min={12}
                max={32}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-normal text-muted-foreground">Cor</Label>
              <ColorPicker
                value={config.cards.titleTypography.color || "#000000"}
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
                      config.cards.titleTypography.fontWeight === w
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
                value={config.cards.subtitleTypography.fontFamily || ""}
                onChange={(e) => onChange("cards.subtitleTypography.fontFamily", e.target.value)}
                placeholder="Ex: Inter, sans-serif"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-normal text-muted-foreground">
                Tamanho: {config.cards.subtitleTypography.fontSize || 14}px
              </Label>
              <Slider
                value={[config.cards.subtitleTypography.fontSize || 14]}
                onValueChange={([v]) => onChange("cards.subtitleTypography.fontSize", v)}
                min={10}
                max={24}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-normal text-muted-foreground">Cor</Label>
              <ColorPicker
                value={config.cards.subtitleTypography.color || "#666666"}
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
                      config.cards.subtitleTypography.fontWeight === w
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
