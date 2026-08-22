import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { fontOptions, fontWeightOptions, type TypographyConfig } from "./types";
import { ColorPicker } from "../ColorPicker";
import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";

export interface TypographySettingsProps {
  label: string;
  config: TypographyConfig;
  onChange: (config: TypographyConfig) => void;
  showText?: boolean;
  disabled?: boolean;
}

export function TypographySettings({ label, config, onChange, showText = false, disabled }: TypographySettingsProps) {
  const updateConfig = (field: keyof TypographyConfig, value: any) => {
    // Sanitização para evitar erros minificados do React (como #310)
    // Se o valor for um objeto para um campo que espera primitivo, bloqueia.
    const primitiveFields = ['text', 'family', 'size', 'weight', 'colorType', 'color', 'alignment', 'lineHeight', 'letterSpacing'];
    if (primitiveFields.includes(field) && value && typeof value === 'object' && field !== 'gradient') {
      console.error(`[TypographySettings] Blocked object for field "${field}":`, value);
      return;
    }
    
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="space-y-4 border-l-2 pl-4 border-primary/20 py-2">
      <h4 className="text-sm font-semibold text-muted-foreground">{label}</h4>

      {showText && (
        <div className="space-y-2">
          <Label>Texto</Label>
          <Textarea
            value={config.text || ""}
            onChange={(e) => updateConfig("text", e.target.value)}
            disabled={disabled}
            placeholder="Digite o texto aqui..."
            className="min-h-[80px]"
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Fonte</Label>
          <Select
            value={config.family}
            onValueChange={(val) => updateConfig("family", val)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fontOptions.map((font) => (
                <SelectItem key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                  {font.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Peso</Label>
          <Select
            value={config.weight}
            onValueChange={(val) => updateConfig("weight", val)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fontWeightOptions.map((weight) => (
                <SelectItem key={weight.value} value={weight.value}>
                  {weight.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Tamanho (px)</Label>
            <span className="text-xs text-muted-foreground">{config.size}px</span>
          </div>
          <Slider
            value={[config.size]}
            min={8}
            max={120}
            step={1}
            onValueChange={([val]) => updateConfig("size", val)}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2">
          <Label>Alinhamento</Label>
          <ToggleGroup
            type="single"
            value={config.alignment}
            onValueChange={(val) => val && updateConfig("alignment", val)}
            disabled={disabled}
            className="justify-start"
          >
            <ToggleGroupItem value="left" aria-label="Alinhar à esquerda">
              <AlignLeft className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="center" aria-label="Alinhar ao centro">
              <AlignCenter className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="right" aria-label="Alinhar à direita">
              <AlignRight className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Altura da Linha</Label>
            <span className="text-xs text-muted-foreground">{config.lineHeight}</span>
          </div>
          <Slider
            value={[config.lineHeight || 1.2]}
            min={0.8}
            max={3}
            step={0.1}
            onValueChange={([val]) => updateConfig("lineHeight", val)}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Espaçamento de Letras</Label>
            <span className="text-xs text-muted-foreground">{config.letterSpacing}px</span>
          </div>
          <Slider
            value={[config.letterSpacing || 0]}
            min={-5}
            max={20}
            step={0.5}
            onValueChange={([val]) => updateConfig("letterSpacing", val)}
            disabled={disabled}
          />
        </div>
      </div>

      <ColorPicker
        type={config.colorType}
        solidColor={config.color}
        gradientSettings={config.gradient}
        onTypeChange={(type) => updateConfig("colorType", type)}
        onSolidColorChange={(color) => updateConfig("color", color)}
        onGradientChange={(gradient) => updateConfig("gradient", gradient)}
        label="Cor do Texto"
      />
    </div>
  );
}
