import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

// Lista curada de países. Cada `dial` é o DDI sem "+".
// Bandeiras via emoji (regional indicator) — funciona em todos os browsers modernos.
export const COUNTRIES: Array<{ code: string; name: string; dial: string; flag: string }> = [
  { code: "BR", name: "Brasil", dial: "55", flag: "🇧🇷" },
  { code: "US", name: "Estados Unidos", dial: "1", flag: "🇺🇸" },
  { code: "PT", name: "Portugal", dial: "351", flag: "🇵🇹" },
  { code: "AR", name: "Argentina", dial: "54", flag: "🇦🇷" },
  { code: "CL", name: "Chile", dial: "56", flag: "🇨🇱" },
  { code: "CO", name: "Colômbia", dial: "57", flag: "🇨🇴" },
  { code: "MX", name: "México", dial: "52", flag: "🇲🇽" },
  { code: "PY", name: "Paraguai", dial: "595", flag: "🇵🇾" },
  { code: "UY", name: "Uruguai", dial: "598", flag: "🇺🇾" },
  { code: "PE", name: "Peru", dial: "51", flag: "🇵🇪" },
  { code: "BO", name: "Bolívia", dial: "591", flag: "🇧🇴" },
  { code: "VE", name: "Venezuela", dial: "58", flag: "🇻🇪" },
  { code: "EC", name: "Equador", dial: "593", flag: "🇪🇨" },
  { code: "ES", name: "Espanha", dial: "34", flag: "🇪🇸" },
  { code: "FR", name: "França", dial: "33", flag: "🇫🇷" },
  { code: "DE", name: "Alemanha", dial: "49", flag: "🇩🇪" },
  { code: "IT", name: "Itália", dial: "39", flag: "🇮🇹" },
  { code: "GB", name: "Reino Unido", dial: "44", flag: "🇬🇧" },
  { code: "CA", name: "Canadá", dial: "1", flag: "🇨🇦" },
  { code: "AU", name: "Austrália", dial: "61", flag: "🇦🇺" },
  { code: "JP", name: "Japão", dial: "81", flag: "🇯🇵" },
  { code: "CN", name: "China", dial: "86", flag: "🇨🇳" },
  { code: "IN", name: "Índia", dial: "91", flag: "🇮🇳" },
  { code: "AO", name: "Angola", dial: "244", flag: "🇦🇴" },
  { code: "MZ", name: "Moçambique", dial: "258", flag: "🇲🇿" },
];

const DEFAULT_COUNTRY = COUNTRIES[0]; // Brasil

/**
 * Divide um valor E.164 (só dígitos) em { dial, national }.
 * Se o valor não bater com nenhum DDI conhecido, assume DDI padrão (55).
 */
function splitValue(raw: string): { dial: string; national: string } {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return { dial: DEFAULT_COUNTRY.dial, national: "" };
  // Tenta match do DDI mais longo primeiro para evitar colisão (ex: "1" vs "351").
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (digits.startsWith(c.dial)) {
      return { dial: c.dial, national: digits.slice(c.dial.length) };
    }
  }
  return { dial: DEFAULT_COUNTRY.dial, national: digits };
}

/**
 * Formata o número nacional apenas para exibição (não altera o value).
 * BR: (DD) 9NNNN-NNNN. Outros: agrupa em blocos de 3-4 dígitos.
 */
function formatNational(dial: string, national: string): string {
  const d = national.replace(/\D/g, "");
  if (!d) return "";
  if (dial === "55") {
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
  }
  return d.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

export interface PhoneInputProps {
  /** Valor E.164 sem "+", ex: "5511999999999" */
  value: string;
  /** Chamado com o valor completo (DDI + nacional, só dígitos) */
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}

export function PhoneInput({
  value,
  onChange,
  placeholder = "DDD + Número",
  id,
  required,
  disabled,
  className,
  inputClassName,
}: PhoneInputProps) {
  const { dial, national } = useMemo(() => splitValue(value), [value]);
  const country = useMemo(
    () => COUNTRIES.find((c) => c.dial === dial) ?? DEFAULT_COUNTRY,
    [dial],
  );
  const [open, setOpen] = useState(false);

  const handleCountry = (c: typeof DEFAULT_COUNTRY) => {
    setOpen(false);
    onChange(`${c.dial}${national.replace(/\D/g, "")}`);
  };

  const handleNational = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    onChange(`${dial}${digits}`);
  };

  return (
    <div className={cn("flex items-stretch gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex items-center gap-2 rounded-md border border-primary/30 bg-background/50 px-3 text-sm",
              "hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            aria-label="Selecionar país"
          >
            <span className="text-lg leading-none">{country.flag}</span>
            <span className="font-medium">+{country.dial}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar país..." />
            <CommandList>
              <CommandEmpty>Nenhum país encontrado.</CommandEmpty>
              <CommandGroup>
                {COUNTRIES.map((c) => (
                  <CommandItem
                    key={c.code}
                    value={`${c.name} +${c.dial}`}
                    onSelect={() => handleCountry(c)}
                  >
                    <span className="mr-2 text-lg leading-none">{c.flag}</span>
                    <span className="flex-1">{c.name}</span>
                    <span className="text-muted-foreground text-xs">+{c.dial}</span>
                    {c.code === country.code && <Check className="ml-2 h-4 w-4" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={placeholder}
        value={formatNational(dial, national)}
        onChange={(e) => handleNational(e.target.value)}
        required={required}
        disabled={disabled}
        className={cn("flex-1 bg-background/50 border-primary/30 focus:border-primary", inputClassName)}
      />
    </div>
  );
}
