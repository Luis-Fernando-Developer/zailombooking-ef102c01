export type BillingPeriod = "monthly" | "quarterly" | "annual";

export const PLAN_LEVELS: Record<string, number> = {
  "starter": 1,
  "professional": 2,
  "enterprise": 3
};

export const PLAN_PRICES: Record<string, Record<BillingPeriod, number>> = {
  "starter": { monthly: 79.00, quarterly: 213.30, annual: 758.40 },
  "professional": { monthly: 149.00, quarterly: 402.30, annual: 1430.40 },
  "enterprise": { monthly: 249.00, quarterly: 672.30, annual: 2390.40 }
};

export type ChangeType = "plan_upgrade" | "plan_downgrade" | "cycle_change" | "upgrade_with_cycle_change";

export interface ProrationResult {
  remainingDays: number;
  upgradeAmount: number;
  changeType: ChangeType;
  effectiveDate: Date;
  isImmediate: boolean;
}

export function calculateSubscriptionChange(
  currentPlanId: string,
  currentPeriod: BillingPeriod,
  nextBillingDate: Date,
  newPlanId: string,
  newPeriod: BillingPeriod,
  now: Date = new Date()
): ProrationResult {
  const currentLevel = PLAN_LEVELS[currentPlanId.toLowerCase()] || 0;
  const newLevel = PLAN_LEVELS[newPlanId.toLowerCase()] || 0;
  
  const remainingTime = nextBillingDate.getTime() - now.getTime();
  const remainingDays = Math.max(0, Math.ceil(remainingTime / (1000 * 60 * 60 * 24)));

  let changeType: ChangeType;
  if (newLevel > currentLevel) {
    changeType = currentPeriod !== newPeriod ? "upgrade_with_cycle_change" : "plan_upgrade";
  } else if (newLevel < currentLevel) {
    changeType = "plan_downgrade";
  } else {
    changeType = "cycle_change";
  }

  const isImmediate = changeType === "plan_upgrade" || changeType === "upgrade_with_cycle_change";
  let upgradeAmount = 0;

  if (isImmediate) {
    const currentMonthlyPrice = PLAN_PRICES[currentPlanId.toLowerCase()]?.monthly || 0;
    const newMonthlyPrice = PLAN_PRICES[newPlanId.toLowerCase()]?.monthly || 0;
    
    const currentDaily = currentMonthlyPrice / 30;
    const newDaily = newMonthlyPrice / 30;
    const differenceDaily = newDaily - currentDaily;
    
    upgradeAmount = Math.max(0, differenceDaily * remainingDays);
  }

  return {
    remainingDays,
    upgradeAmount,
    changeType,
    effectiveDate: isImmediate ? now : nextBillingDate,
    isImmediate
  };
}

export function formatBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export function periodLabel(p: BillingPeriod | string) {
  switch (p) {
    case "annual": return "Anual";
    case "quarterly": return "Trimestral";
    default: return "Mensal";
  }
}


