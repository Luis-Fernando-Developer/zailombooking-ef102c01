import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PlacementCTA } from "@/lib/api/marketing";

interface Props {
  placement: string;
  label: string;
  value: PlacementCTA;
  onChange: (patch: Partial<PlacementCTA>) => void;
}

const COLOR_PLACEMENTS = new Set(["top_bar", "popup"]);
const POSITION_PLACEMENTS = new Set(["hero", "hero_carousel"]);
const MESSAGE_PLACEMENTS = new Set(["whatsapp", "sms"]);

export function PlacementConfigEditor({ placement, label, value, onChange }: Props) {
  const showColors = COLOR_PLACEMENTS.has(placement);
  const showPosition = POSITION_PLACEMENTS.has(placement);
  const showMessage = MESSAGE_PLACEMENTS.has(placement);

  return (
    <div className="border rounded p-3 bg-background space-y-2">
      <div className="text-sm font-medium text-foreground">{label}</div>

      {showMessage ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Telefone (DDI+DDD)</Label>
              <Input value={value.phone ?? ""} onChange={(e) => onChange({ phone: e.target.value })} placeholder="5511999998888" />
            </div>
            <div>
              <Label className="text-xs">Texto do botão</Label>
              <Input value={value.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} placeholder="Falar no WhatsApp" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Mensagem pré-pronta</Label>
            <Input value={value.message ?? ""} onChange={(e) => onChange({ message: e.target.value })} placeholder="Olá! Quero saber mais..." />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Link (URL/rota)</Label>
            <Input value={value.url ?? ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="/agendar  ou  https://..." />
          </div>
          <div>
            <Label className="text-xs">Texto do botão</Label>
            <Input value={value.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} placeholder="Saiba mais" />
          </div>
        </div>
      )}

      {showColors && (
        <>
          <div className="grid grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">Cor de fundo</Label>
              <Input type="color" value={value.bg ?? "#0f172a"} onChange={(e) => onChange({ bg: e.target.value })} className="h-9 p-1" />
            </div>
            <div>
              <Label className="text-xs">Cor do texto</Label>
              <Input type="color" value={value.fg ?? "#ffffff"} onChange={(e) => onChange({ fg: e.target.value })} className="h-9 p-1" />
            </div>
            <div>
              <Label className="text-xs">Botão fundo</Label>
              <Input type="color" value={value.btnBg ?? "#ffffff"} onChange={(e) => onChange({ btnBg: e.target.value })} className="h-9 p-1" />
            </div>
            <div>
              <Label className="text-xs">Botão texto</Label>
              <Input type="color" value={value.btnFg ?? "#0f172a"} onChange={(e) => onChange({ btnFg: e.target.value })} className="h-9 p-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Fonte</Label>
              <Select value={value.font ?? "system"} onValueChange={(v) => onChange({ font: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">Padrão do sistema</SelectItem>
                  <SelectItem value="Inter, sans-serif">Inter</SelectItem>
                  <SelectItem value="Georgia, serif">Georgia</SelectItem>
                  <SelectItem value="'Courier New', monospace">Mono</SelectItem>
                  <SelectItem value="'Playfair Display', serif">Playfair</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tamanho da fonte (px)</Label>
              <Input type="number" min={10} max={32} value={value.fontSize ?? 14} onChange={(e) => onChange({ fontSize: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Countdown — termina em (ISO)</Label>
              <Input type="datetime-local" value={value.countdownEnd ? value.countdownEnd.slice(0, 16) : ""} onChange={(e) => onChange({ countdownEnd: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
            </div>
            <div>
              <Label className="text-xs">Prefixo do countdown</Label>
              <Input value={value.countdownPrefix ?? ""} onChange={(e) => onChange({ countdownPrefix: e.target.value })} placeholder="Termina em" />
            </div>
          </div>
        </>
      )}

      {showPosition && (
        <div>
          <Label className="text-xs">Posição do botão no banner</Label>
          <Select value={value.buttonPosition ?? "footer"} onValueChange={(v) => onChange({ buttonPosition: v as "footer" | "full" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="footer">Rodapé do banner (botão visível)</SelectItem>
              <SelectItem value="full">Banner inteiro clicável</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
