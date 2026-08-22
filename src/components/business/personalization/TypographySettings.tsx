import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorPicker } from "../ColorPicker";
import { fontOptions, fontWeightOptions, TypographyConfig } from "./types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Type } from "lucide-react";
import { useState } from "react";

interface TypographySettingsProps {
  label: string;
  config: TypographyConfig;
  onChange: (config: TypographyConfig) => void;
  showText?: boolean;
  disabled?: boolean;
}

export function TypographySettings({
  label,
  config,
  onChange,
  showText = false,
  disabled = false
}: TypographySettingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const updateConfig = (field: keyof TypographyConfig, value: any) => {
    // Basic validation to prevent nesting objects in simple fields
    if (value && typeof value === 'object' && !Array.isArray(value) && field !== 'gradient') {
      console.warn(`[TypographySettings] Attempted to set nested object to field "${field}":`, value);
      return;
    }
    onChange({ ...config, [field]: value });
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="border rounded-md p-2 bg-card"
    >
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded-sm transition-colors text-left">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{label}</span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="pt-4 pb-2 px-2 space-y-4">
        {showText && (
          <div className="space-y-2">
            <Label className="text-xs">Texto</Label>
            <Input
              value={config.text || ""}
              onChange={(e) => updateConfig("text", e.target.value)}
              disabled={disabled}
              className="h-8 text-xs"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Família da Fonte</Label>
            <Select
              value={config.family}
              onValueChange={(value) => updateConfig("family", value)}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fontOptions.map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    {font.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Peso da Fonte</Label>
            <Select
              value={config.weight}
              onValueChange={(value) => updateConfig("weight", value)}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs">
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

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-2">
            <Label className="text-xs">Tamanho (px)</Label>
            <Input
              type="number"
              value={config.size}
              onChange={(e) => updateConfig("size", parseInt(e.target.value))}
              disabled={disabled}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Line Height</Label>
            <Input
              type="number"
              step="0.1"
              value={config.lineHeight || 1.2}
              onChange={(e) => updateConfig("lineHeight", parseFloat(e.target.value))}
              disabled={disabled}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Espaçamento</Label>
            <Input
              type="number"
              value={config.letterSpacing || 0}
              onChange={(e) => updateConfig("letterSpacing", parseInt(e.target.value))}
              disabled={disabled}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Alinhamento</Label>
          <Select
            value={config.alignment}
            onValueChange={(value: "left" | "center" | "right") => updateConfig("alignment", value)}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Esquerda</SelectItem>
              <SelectItem value="center">Centro</SelectItem>
              <SelectItem value="right">Direita</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border-t pt-4">
          <ColorPicker
            type={config.colorType}
            solidColor={config.color}
            gradientSettings={config.gradient || { type: "linear", angle: 45, colors: ["#8b5cf6", "#d8b4fe"] }}
            onTypeChange={(type) => updateConfig("colorType", type)}
            onSolidColorChange={(color) => updateConfig("color", color)}
            onGradientChange={(gradient) => updateConfig("gradient", gradient)}
            label="Cor do Texto"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
