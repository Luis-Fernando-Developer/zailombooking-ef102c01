export type WhatsappProviderId =
  | "evolution"
  | "wppconnect"
  | "baileys"
  | "whatsapp-web-js"
  | "gowa";

export interface WhatsappProvider {
  id: WhatsappProviderId;
  /** Label neutro exibido ao cliente. */
  label: string;
  /** Só habilitados podem ser usados para criar novas conexões. */
  enabled: boolean;
}

export const WHATSAPP_PROVIDERS: WhatsappProvider[] = [
  { id: "evolution",        label: "API WhatsApp - 1", enabled: true  },
  { id: "wppconnect",       label: "API WhatsApp - 2", enabled: false },
  { id: "baileys",          label: "API WhatsApp - 3", enabled: false },
  { id: "whatsapp-web-js",  label: "API WhatsApp - 4", enabled: false },
  { id: "gowa",             label: "API WhatsApp - 5", enabled: false },
];

export function providerLabel(id: string | null | undefined): string {
  const found = WHATSAPP_PROVIDERS.find((p) => p.id === id);
  return found?.label ?? "API WhatsApp";
}
