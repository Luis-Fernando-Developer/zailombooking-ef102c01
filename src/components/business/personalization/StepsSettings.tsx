import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ColorPicker } from "../ColorPicker";
import { TypographySettings } from "./TypographySettings";
import { ButtonSettings } from "./ButtonSettings";
import { type StepConfig, type StepsConfig, defaultStepsConfig, defaultStepConfig } from "./types";

interface StepsSettingsProps {
  config: StepsConfig;
  onChange: (config: StepsConfig) => void;
  disabled?: boolean;
}

const STEP_LABELS: Record<keyof StepsConfig, string> = {
  services: "Step — Serviços",
  professional: "Step — Profissional",
  calendar: "Step — Calendário",
  slots: "Step — Slots (Horários)",
  login: "Step — Cadastro / Login",
  confirmation: "Step — Confirmação",
};

export function StepsSettings({ config, onChange, disabled }: StepsSettingsProps) {
  const updateStep = (step: keyof StepsConfig, partial: Partial<StepConfig>) => {
    onChange({ ...config, [step]: { ...config[step], ...partial } });
  };

  const renderStepSettings = (stepKey: keyof StepsConfig) => {
    const step = config[stepKey];
    return (
      <Accordion type="single" collapsible className="w-full">
        {/* Container */}
        <AccordionItem value="container">
          <AccordionTrigger>Container</AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            <ColorPicker
              type={step.container_background_type || "solid"}
              solidColor={step.container_background_color || "#ffffff"}
              gradientSettings={step.container_background_gradient || { type: "linear", angle: 45, colors: ["#ffffff", "#f8fafc"] }}
              onTypeChange={(type) => updateStep(stepKey, { container_background_type: type })}
              onSolidColorChange={(color) => updateStep(stepKey, { container_background_color: color })}
              onGradientChange={(gradient) => updateStep(stepKey, { container_background_gradient: gradient })}
              label="Fundo do Container"
            />
            <div className="space-y-2">
              <Label>Arredondamento do Container (px)</Label>
              <Input
                type="number"
                value={step.container_border_radius ?? 12}
                onChange={(e) => updateStep(stepKey, { container_border_radius: parseInt(e.target.value) })}
                disabled={disabled}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Título e Descrição */}
        <AccordionItem value="typography">
          <AccordionTrigger>Tipografia</AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            <TypographySettings
              label="Título"
              config={step.title_typography || defaultStepConfig.title_typography || { family: "Inter", size: 20, weight: "700", colorType: "solid", color: "#1e293b", alignment: "left" }}
              onChange={(val) => updateStep(stepKey, { title_typography: val })}
              disabled={disabled}
            />
            <TypographySettings
              label="Descrição"
              config={step.description_typography || defaultStepConfig.description_typography || { family: "Inter", size: 14, weight: "400", colorType: "solid", color: "#64748b", alignment: "left" }}
              onChange={(val) => updateStep(stepKey, { description_typography: val })}
              disabled={disabled}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Check */}
        <AccordionItem value="check">
          <AccordionTrigger>Ícone de Seleção (Check)</AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-2">
              <Label>Cor do Check</Label>
              <div className="flex gap-2">
                <Input type="color" value={step.check_color || "#3b82f6"} onChange={(e) => updateStep(stepKey, { check_color: e.target.value })} className="w-12" disabled={disabled} />
                <Input value={step.check_color || "#3b82f6"} onChange={(e) => updateStep(stepKey, { check_color: e.target.value })} disabled={disabled} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Botões */}
        <AccordionItem value="buttons">
          <AccordionTrigger>Botões</AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            <ButtonSettings
              label="Botão Continuar"
              config={step.continue_button || defaultStepConfig.continue_button!}
              onChange={(val) => updateStep(stepKey, { continue_button: val })}
              disabled={disabled}
            />
            <ButtonSettings
              label="Botão Voltar"
              config={step.back_button || defaultStepConfig.back_button!}
              onChange={(val) => updateStep(stepKey, { back_button: val })}
              disabled={disabled}
            />
            {(stepKey === "login") && (
              <ButtonSettings
                label="Botão Secundário (Entrar / Criar Conta)"
                config={step.secondary_button || defaultStepConfig.secondary_button!}
                onChange={(val) => updateStep(stepKey, { secondary_button: val })}
                disabled={disabled}
              />
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Calendário — só para step calendar */}
        {stepKey === "calendar" && (
          <AccordionItem value="calendar">
            <AccordionTrigger>Configurações do Calendário</AccordionTrigger>
            <AccordionContent className="pt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cor Data Disponível</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={step.available_date_color || "#3b82f6"} onChange={(e) => updateStep(stepKey, { available_date_color: e.target.value })} className="w-12" disabled={disabled} />
                    <Input value={step.available_date_color || "#3b82f6"} onChange={(e) => updateStep(stepKey, { available_date_color: e.target.value })} disabled={disabled} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor Data Atual</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={step.current_date_color || "#8b5cf6"} onChange={(e) => updateStep(stepKey, { current_date_color: e.target.value })} className="w-12" disabled={disabled} />
                    <Input value={step.current_date_color || "#8b5cf6"} onChange={(e) => updateStep(stepKey, { current_date_color: e.target.value })} disabled={disabled} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor Data Indisponível</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={step.unavailable_date_color || "#cbd5e1"} onChange={(e) => updateStep(stepKey, { unavailable_date_color: e.target.value })} className="w-12" disabled={disabled} />
                    <Input value={step.unavailable_date_color || "#cbd5e1"} onChange={(e) => updateStep(stepKey, { unavailable_date_color: e.target.value })} disabled={disabled} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor Navegação</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={step.calendar_nav_button_color || "#3b82f6"} onChange={(e) => updateStep(stepKey, { calendar_nav_button_color: e.target.value })} className="w-12" disabled={disabled} />
                    <Input value={step.calendar_nav_button_color || "#3b82f6"} onChange={(e) => updateStep(stepKey, { calendar_nav_button_color: e.target.value })} disabled={disabled} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor Cabeçalho</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={step.calendar_header_color || "#1e293b"} onChange={(e) => updateStep(stepKey, { calendar_header_color: e.target.value })} className="w-12" disabled={disabled} />
                    <Input value={step.calendar_header_color || "#1e293b"} onChange={(e) => updateStep(stepKey, { calendar_header_color: e.target.value })} disabled={disabled} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor Dia da Semana</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={step.weekday_color || "#64748b"} onChange={(e) => updateStep(stepKey, { weekday_color: e.target.value })} className="w-12" disabled={disabled} />
                    <Input value={step.weekday_color || "#64748b"} onChange={(e) => updateStep(stepKey, { weekday_color: e.target.value })} disabled={disabled} />
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Slots — só para step slots */}
        {stepKey === "slots" && (
          <AccordionItem value="slots">
            <AccordionTrigger>Configurações de Slots</AccordionTrigger>
            <AccordionContent className="pt-4 space-y-4">
              <div className="space-y-2">
                <Label>Arredondamento dos Slots (px)</Label>
                <Input
                  type="number"
                  value={step.slot_border_radius ?? 8}
                  onChange={(e) => updateStep(stepKey, { slot_border_radius: parseInt(e.target.value) })}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor do Slot Selecionado</Label>
                <div className="flex gap-2">
                  <Input type="color" value={step.slot_selected_color || "#3b82f6"} onChange={(e) => updateStep(stepKey, { slot_selected_color: e.target.value })} className="w-12" disabled={disabled} />
                  <Input value={step.slot_selected_color || "#3b82f6"} onChange={(e) => updateStep(stepKey, { slot_selected_color: e.target.value })} disabled={disabled} />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    );
  };

  const stepKeys = Object.keys(config) as Array<keyof StepsConfig>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Configure a aparência de cada etapa do fluxo de agendamento.</p>
      {stepKeys.map((key) => (
        <div key={key} className="border rounded-lg p-4">
          <h3 className="text-sm font-bold text-foreground mb-3">{STEP_LABELS[key]}</h3>
          {renderStepSettings(key)}
        </div>
      ))}
    </div>
  );
}
