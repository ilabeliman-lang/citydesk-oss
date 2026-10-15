/**
 * NDU-UPG hud (#453, #485): needs summary chips for the persistent mini-status bar.
 * Evaluates the player's six needs and picks the most urgent action.
 */

export type NeedKey = "hunger" | "energy" | "hygiene" | "social" | "comfort" | "health";

export type NeedStatus = {
  key: NeedKey;
  value: number;
  critical: boolean;
  warning: boolean;
  label: string;
};

export type NeedsSummary = {
  chips: NeedStatus[];
  lowestNeed: NeedStatus | null;
  urgentActionRequired: boolean;
};

const LABELS: Record<NeedKey, string> = {
  hunger: "Hunger",
  energy: "Energy",
  hygiene: "Hygiene",
  social: "Social",
  comfort: "Comfort",
  health: "Health",
};

const NEED_ORDER: NeedKey[] = ["hunger", "energy", "hygiene", "social", "comfort", "health"];

const CRITICAL_THRESHOLD = 25;
const WARNING_THRESHOLD = 45;

/** Evaluate a needs record into a summary with chip states and the lowest need. */
export function evaluateNeeds(needs: Record<string, number>): NeedsSummary {
  const chips: NeedStatus[] = [];
  let lowest: NeedStatus | null = null;
  let urgent = false;

  for (const key of NEED_ORDER) {
    const raw = needs[key];
    const value = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 100;
    const critical = value < CRITICAL_THRESHOLD;
    const warning = !critical && value < WARNING_THRESHOLD;
    if (critical) urgent = true;
    const status: NeedStatus = { key, value, critical, warning, label: LABELS[key] };
    chips.push(status);
    if (lowest === null || value < lowest.value) lowest = status;
  }

  return { chips, lowestNeed: lowest, urgentActionRequired: urgent };
}

/** Pick the primary action for the lowest need. */
export function primaryNeedAction(lowest: NeedStatus | null): {
  actionLabel: string;
  targetKind: string;
  voucherCost: number;
} {
  if (!lowest) return { actionLabel: "All good", targetKind: "none", voucherCost: 0 };

  switch (lowest.key) {
    case "hunger":
      return { actionLabel: "Eat · 10 · Food stall", targetKind: "stall", voucherCost: 10 };
    case "energy":
      return { actionLabel: "Rest on bench", targetKind: "bench", voucherCost: 0 };
    case "hygiene":
      return { actionLabel: "Wash at standpipe", targetKind: "standpipe", voucherCost: 0 };
    case "social":
      return { actionLabel: "Greet a neighbour", targetKind: "walker", voucherCost: 0 };
    case "comfort":
      return { actionLabel: "Sit and rest", targetKind: "bench", voucherCost: 0 };
    case "health":
      return { actionLabel: "Visit chemist · 10", targetKind: "chemist", voucherCost: 10 };
    default:
      return { actionLabel: "All good", targetKind: "none", voucherCost: 0 };
  }
}
