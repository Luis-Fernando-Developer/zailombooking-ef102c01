// Lógica para mudanças de plano baseada em tempo (dias restantes)
// Substitui o modelo de crédito financeiro pelo modelo de crédito temporal.

export type BillingPeriod = "monthly" | "quarterly" | "annual";

export const cycleDays = (p: BillingPeriod) =>
  p === "annual" ? 365 : p === "quarterly" ? 90 : 30;

export const addPeriod = (from: Date, p: BillingPeriod): Date => {
  const d = new Date(from);
  if (p === "annual") d.setFullYear(d.getFullYear() + 1);
  else if (p === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setMonth(d.getMonth() + 1);
  return d;
};

// Hieraquia dos planos conforme solicitado pelo usuário
export const PLAN_HIERARCHY: Record<string, number> = {
  "starter": 1,
  "professional": 2,
  "enterprise": 3
};

export type ChangeType = "cycle_change" | "plan_upgrade" | "plan_downgrade";

export interface ProrationInput {
  currentPlanId: string;
  currentPeriod: BillingPeriod;
  /** Início do ciclo atual (starts_at da assinatura). */
  cycleStart: Date;
  /** Fim do ciclo atual (next_billing_date). */
  cycleEnd: Date;
  newPlanId: string;
  newPeriod: BillingPeriod;
  /** Data de referência (default: agora). */
  now?: Date;
}

export interface ProrationResult {
  /** Quantos dias restam da assinatura atual. */
  remainingDays: number;
  /** Próxima data de cobrança após a mudança (mantendo os dias restantes). */
  nextBillingDate: Date;
  /** Tipo da alteração baseada na hierarquia. */
  changeType: ChangeType;
  /** Detalhamento para exibir ao usuário. */
  details: {
    cycleDays: number;
    currentPlanName: string;
    newPlanName: string;
  };
}

export function calculateTemporalProration(input: ProrationInput): ProrationResult {
  const now = input.now ?? new Date();
  
  // Calcular dias totais do ciclo atual (aproximado pelo banco ou real entre datas)
  const totalDays = Math.max(1, Math.round((input.cycleEnd.getTime() - input.cycleStart.getTime()) / 86400000));
  
  // Calcular dias restantes
  const remainingDays = Math.max(0, Math.ceil((input.cycleEnd.getTime() - now.getTime()) / 86400000));

  // Determinar tipo de mudança pela hierarquia
  const currentRank = PLAN_HIERARCHY[input.currentPlanId.toLowerCase()] || 0;
  const newRank = PLAN_HIERARCHY[input.newPlanId.toLowerCase()] || 0;

  let changeType: ChangeType = "cycle_change";
  if (newRank > currentRank) {
    changeType = "plan_upgrade";
  } else if (newRank < currentRank) {
    changeType = "plan_downgrade";
  } else if (input.currentPeriod !== input.newPeriod) {
    changeType = "cycle_change";
  }

  // No novo modelo, mantemos os dias restantes.
  // A próxima cobrança ocorre após o término desses dias + o novo período? 
  // O usuário disse: "Cliente mantém 180 dias de acesso já pagos. Próxima cobrança ocorrerá somente após os 180 dias terminarem."
  // E também disse: "Apenas a próxima cobrança utilizará o novo ciclo."
  // Portanto, next_billing_date = now + remainingDays.
  const nextBillingDate = new Date(now.getTime() + remainingDays * 86400000);

  return {
    remainingDays,
    nextBillingDate,
    changeType,
    details: {
      cycleDays: totalDays,
      currentPlanName: input.currentPlanId,
      newPlanName: input.newPlanId,
    },
  };
}

export function formatBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export function periodLabel(p: BillingPeriod) {
  return p === "annual" ? "Anual" : p === "quarterly" ? "Trimestral" : "Mensal";
}

// Deprecated functions kept for compatibility during transition if needed
export function calculateProration(_: any): any {
  return null;
}

