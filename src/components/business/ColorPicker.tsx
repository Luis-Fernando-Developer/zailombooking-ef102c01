import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X } from "lucide-react";

interface GradientSettings {
  type: "linear" | "radial";
  angle: number;
  colors: string[];
}

interface ColorPickerProps {
  type: "solid" | "gradient";
  solidColor?: string;
  gradientSettings?: GradientSettings;
  onTypeChange: (type: "solid" | "gradient") => void;
  onSolidColorChange: (color: string) => void;
  onGradientChange: (gradient: GradientSettings) => void;
  label: string;
}

export function ColorPicker({
  type,
  solidColor = "hsl(251, 91%, 65%)",
  gradientSettings = { type: "linear", angle: 45, colors: ["hsl(251, 91%, 65%)", "hsl(308, 56%, 85%)"] },
  onTypeChange,
  onSolidColorChange,
  onGradientChange,
  label
}: ColorPickerProps) {
  const [newColor, setNewColor] = useState("hsl(251, 91%, 65%)");

  const addColor = () => {
    if (gradientSettings.colors.length < 5) {
      onGradientChange({
        ...gradientSettings,
        colors: [...gradientSettings.colors, newColor]
      });
    }
  };

  const removeColor = (index: number) => {
    if (gradientSettings.colors.length > 2) {
      const newColors = gradientSettings.colors.filter((_, i) => i !== index);
      onGradientChange({
        ...gradientSettings,
        colors: newColors
      });
    }
  };

  const updateColor = (index: number, color: string) => {
    const newColors = [...gradientSettings.colors];
    newColors[index] = color;
    onGradientChange({
      ...gradientSettings,
      colors: newColors
    });
  };

  const getGradientPreview = () => {
    if (gradientSettings.type === "linear") {
      return `linear-gradient(${gradientSettings.angle}deg, ${gradientSettings.colors.join(", ")})`;
    } else {
      return `radial-gradient(circle, ${gradientSettings.colors.join(", ")})`;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select value={type} onValueChange={onTypeChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Sólida</SelectItem>
              <SelectItem value="gradient">Gradiente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {type === "solid" ? (
          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={solidColor.startsWith("hsl") ? "#8b5cf6" : solidColor}
                onChange={(e) => onSolidColorChange(e.target.value)}
                className="w-12 h-10 p-1 border rounded"
              />
              <Input
                value={solidColor}
                onChange={(e) => onSolidColorChange(e.target.value)}
                placeholder="hsl(251, 91%, 65%)"
                className="flex-1"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Gradiente</Label>
              <Select 
                value={gradientSettings.type} 
                onValueChange={(value: "linear" | "radial") => 
                  onGradientChange({ ...gradientSettings, type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linear">Linear</SelectItem>
                  <SelectItem value="radial">Radial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {gradientSettings.type === "linear" && (
              <div className="space-y-2">
                <Label>Ângulo: {gradientSettings.angle}°</Label>
                <Slider
                  value={[gradientSettings.angle]}
                  onValueChange={([angle]) => 
                    onGradientChange({ ...gradientSettings, angle })
                  }
                  max={360}
                  min={0}
                  step={1}
                  className="w-full"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Cores do Gradiente</Label>
              <div className="space-y-2">
                {gradientSettings.colors.map((color, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Input
                      type="color"
                      value={color.startsWith("hsl") ? "#8b5cf6" : color}
                      onChange={(e) => updateColor(index, e.target.value)}
                      className="w-12 h-8 p-1 border rounded"
                    />
                    <Input
                      value={color}
                      onChange={(e) => updateColor(index, e.target.value)}
                      placeholder="hsl(251, 91%, 65%)"
                      className="flex-1"
                    />
                    {gradientSettings.colors.length > 2 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeColor(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {gradientSettings.colors.length < 5 && (
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={newColor.startsWith("hsl") ? "#8b5cf6" : newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-12 h-8 p-1 border rounded"
                  />
                  <Input
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    placeholder="hsl(251, 91%, 65%)"
                    className="flex-1"
                  />
                  <Button size="sm" onClick={addColor}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Preview</Label>
              <div
                className="w-full h-12 rounded border"
                style={{ background: getGradientPreview() }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}