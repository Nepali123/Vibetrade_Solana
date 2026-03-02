/**
 * Types for parsed trade intents from AI
 */

export type TradeAction = "swap" | "unsupported";

export type AmountType = "input" | "output" | "percentage";

export interface ParsedIntent {
  action: TradeAction;
  inputToken: string;
  outputToken: string;
  amount: number;
  amountType: AmountType;
  slippage?: number; // percentage, e.g. 1 = 1%
  percentage?: number; // for "50% of my BONK" style
}

export function validateIntent(intent: ParsedIntent): { valid: boolean; error?: string } {
  if (intent.action !== "swap") {
    return { valid: false, error: "Only swap actions are supported" };
  }
  if (!intent.inputToken || !intent.outputToken) {
    return { valid: false, error: "Missing input or output token" };
  }
  if (intent.inputToken === intent.outputToken) {
    return { valid: false, error: "Input and output tokens cannot be the same" };
  }
  if (intent.amountType === "percentage") {
    if (intent.percentage == null || intent.percentage <= 0 || intent.percentage > 100) {
      return { valid: false, error: "Invalid percentage" };
    }
  } else if (intent.amount <= 0) {
    return { valid: false, error: "Amount must be greater than 0" };
  }
  return { valid: true };
}
