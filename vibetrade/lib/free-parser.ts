/**
 * Free rule-based intent parser - no API key needed.
 * Handles common swap patterns: buy, sell, swap.
 */

import { resolveToken } from "./tokens";
import type { ParsedIntent } from "./parser";
import { isValidAddress } from "./solana";

const TOKEN_SYMBOLS = ["SOL", "USDC", "USDT", "BONK", "JUP", "RAY", "ORCA", "mSOL", "stSOL", "WIF", "POPCAT"];
const TOKEN_REGEX = new RegExp(`\\b(${TOKEN_SYMBOLS.join("|")})\\b`, "gi");
const BASE58_ADDR_REGEX = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

function normalizeToken(s: string): string {
  const t = TOKEN_SYMBOLS.find((sym) => sym.toLowerCase() === s.toLowerCase());
  return t ?? s.toUpperCase();
}

function extractTokens(text: string): string[] {
  const matches = text.match(TOKEN_REGEX) ?? [];
  return [...new Set(matches.map(normalizeToken))];
}

function extractNumber(text: string): number | null {
  const m = text.match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
}

function extractPercentage(text: string): number | null {
  const m = text.match(/(\d+\.?\d*)\s*%/);
  if (m) return parseFloat(m[1]);
  if (/\ball\b/i.test(text)) return 100;
  if (/\bhalf\b/i.test(text)) return 50;
  return null;
}

function extractSlippage(text: string): number | null {
  const m = text.match(/\bslippage\b(?:\s*(?:is|=|:|to|max)?\s*)?(\d+\.?\d*)\s*%?/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (isNaN(v) || v <= 0) return null;
  return Math.max(0.1, Math.min(10, v));
}

function extractMintAddresses(text: string): string[] {
  const matches = text.match(BASE58_ADDR_REGEX) ?? [];
  const uniq = new Set<string>();
  for (const m of matches) {
    if (isValidAddress(m)) uniq.add(m);
  }
  return [...uniq];
}

function normalizeMaybeAddress(s: string): string {
  let cleaned = s.trim().replace(/^(?:ca|mint)\s*[:=]\s*/i, "").replace(/^\$/, "");
  // Handle pump.fun-style suffixes like "<mint>pump"
  const pumpMatch = cleaned.match(/^([1-9A-HJ-NP-Za-km-z]{32,44})pump$/i);
  if (pumpMatch) {
    cleaned = pumpMatch[1];
  }
  if (isValidAddress(cleaned)) return cleaned;
  return normalizeToken(cleaned);
}

export function parseIntentFree(message: string): ParsedIntent | null {
  const msg = message.trim();
  if (!msg) return null;

  const tokens = extractTokens(msg);
  const mints = extractMintAddresses(msg);
  const lower = msg.toLowerCase();
  const slippage = extractSlippage(msg) ?? (lower.includes("low risk") ? 0.5 : lower.includes("high slippage") ? 5 : 1);

  // "sell 50% of my BONK" or "sell all my BONK"
  const sellPct = /(?:sell|dump)\s+(?:\d+\.?\d*\s*%|all|half)\s+(?:of\s+)?(?:my\s+)?([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)/i.exec(msg);
  if (sellPct) {
    const pct = extractPercentage(msg) ?? 100;
    const sym = normalizeMaybeAddress(sellPct[1]);
    if (isValidAddress(sym) || resolveToken(sym)) {
      return {
        action: "swap",
        inputToken: sym,
        outputToken: "SOL",
        amount: 0,
        amountType: "percentage",
        percentage: pct,
        slippage,
      };
    }
  }

  // "swap 20% of my SOL into ORCA"
  const swapPct = /(?:swap|convert|exchange|trade)\s+(\d+\.?\d*)\s*%\s+(?:of\s+)?(?:my\s+)?([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)\s+(?:to|into|for)\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)/i.exec(msg);
  if (swapPct) {
    const pct = parseFloat(swapPct[1]);
    const input = normalizeMaybeAddress(swapPct[2]);
    const output = normalizeMaybeAddress(swapPct[3]);
    if (
      pct > 0 &&
      pct <= 100 &&
      (isValidAddress(input) || resolveToken(input)) &&
      (isValidAddress(output) || resolveToken(output))
    ) {
      return {
        action: "swap",
        inputToken: input,
        outputToken: output,
        amount: 0,
        amountType: "percentage",
        percentage: pct,
        slippage,
      };
    }
  }

  // "swap my 10% SOL to BONK" / "swap my half SOL to BONK"
  const swapMyPctOrWord = /(?:swap|convert|exchange|trade)\s+(?:my\s+)?(\d+\.?\d*\s*%|half|all)\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)\s+(?:to|into|for)\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)/i.exec(msg);
  if (swapMyPctOrWord) {
    const pct = extractPercentage(String(swapMyPctOrWord[1])) ?? (/\bhalf\b/i.test(swapMyPctOrWord[1]) ? 50 : 100);
    const input = normalizeMaybeAddress(swapMyPctOrWord[2]);
    const output = normalizeMaybeAddress(swapMyPctOrWord[3]);
    if (
      pct > 0 &&
      pct <= 100 &&
      (isValidAddress(input) || resolveToken(input)) &&
      (isValidAddress(output) || resolveToken(output))
    ) {
      return {
        action: "swap",
        inputToken: input,
        outputToken: output,
        amount: 0,
        amountType: "percentage",
        percentage: pct,
        slippage,
      };
    }
  }

  // "buy half of my SOL to <token>" / "buy 10% of my SOL into <token>"
  const buyPctOfMy = /(?:buy|ape)\s+(\d+\.?\d*\s*%|half|all)\s+of\s+my\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)\s+(?:to|into|for)\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)/i.exec(msg);
  if (buyPctOfMy) {
    const pct = extractPercentage(String(buyPctOfMy[1])) ?? (/\bhalf\b/i.test(buyPctOfMy[1]) ? 50 : 100);
    const input = normalizeMaybeAddress(buyPctOfMy[2]);
    const output = normalizeMaybeAddress(buyPctOfMy[3]);
    if (
      pct > 0 &&
      pct <= 100 &&
      (isValidAddress(input) || resolveToken(input)) &&
      (isValidAddress(output) || resolveToken(output))
    ) {
      return {
        action: "swap",
        inputToken: input,
        outputToken: output,
        amount: 0,
        amountType: "percentage",
        percentage: pct,
        slippage,
      };
    }
  }

  // "swap all my USDC to SOL" / "swap all USDC to SOL"
  const swapAll = /(?:swap|convert|exchange|trade)\s+(?:all|100%|half)\s+(?:of\s+)?(?:my\s+)?([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)\s+(?:to|into|for)\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)/i.exec(msg);
  if (swapAll) {
    const input = normalizeMaybeAddress(swapAll[1]);
    const output = normalizeMaybeAddress(swapAll[2]);
    const pct = extractPercentage(msg) ?? (/\bhalf\b/i.test(msg) ? 50 : 100);
    if ((isValidAddress(input) || resolveToken(input)) && (isValidAddress(output) || resolveToken(output))) {
      return {
        action: "swap",
        inputToken: input,
        outputToken: output,
        amount: 0,
        amountType: "percentage",
        percentage: pct,
        slippage,
      };
    }
  }

  // "buy 0.5 SOL worth of BONK" / "buy X SOL worth of BONK"
  const buyWorth = /(?:buy|ape)\s+(\d+\.?\d*)\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)\s+worth\s+of\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)/i.exec(msg);
  if (buyWorth) {
    const amount = parseFloat(buyWorth[1]);
    const input = normalizeMaybeAddress(buyWorth[2]);
    const output = normalizeMaybeAddress(buyWorth[3]);
    if (amount > 0 && (isValidAddress(input) || resolveToken(input)) && (isValidAddress(output) || resolveToken(output))) {
      return {
        action: "swap",
        inputToken: input,
        outputToken: output,
        amount,
        amountType: "input",
        slippage,
      };
    }
  }

  // "buy 0.5 SOL of <token>" (interpret as input = SOL, output = token)
  const buyAmountSolOf = /(?:buy|ape)\s+(\d+\.?\d*)\s+SOL\s+of\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)/i.exec(msg);
  if (buyAmountSolOf) {
    const amount = parseFloat(buyAmountSolOf[1]);
    const input = "SOL";
    const output = normalizeMaybeAddress(buyAmountSolOf[2]);
    if (amount > 0 && (isValidAddress(output) || resolveToken(output))) {
      return {
        action: "swap",
        inputToken: input,
        outputToken: output,
        amount,
        amountType: "input",
        slippage,
      };
    }
  }

  // "buy BONK with 0.5 SOL"
  const buyWith = /(?:buy|ape)\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)\s+(?:with|using|for)\s+(\d+\.?\d*)\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)/i.exec(msg);
  if (buyWith) {
    const output = normalizeMaybeAddress(buyWith[1]);
    const amount = parseFloat(buyWith[2]);
    const input = normalizeMaybeAddress(buyWith[3]);
    if (amount > 0 && (isValidAddress(input) || resolveToken(input)) && (isValidAddress(output) || resolveToken(output))) {
      return {
        action: "swap",
        inputToken: input,
        outputToken: output,
        amount,
        amountType: "input",
        slippage,
      };
    }
  }

  // "swap 10 USDC to SOL" / "convert 0.5 SOL to BONK"
  const swapAmount = /(?:swap|convert|exchange|trade)\s+(\d+\.?\d*)\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)\s+(?:to|into|for)\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)/i.exec(msg);
  if (swapAmount) {
    const amount = parseFloat(swapAmount[1]);
    const input = normalizeMaybeAddress(swapAmount[2]);
    const output = normalizeMaybeAddress(swapAmount[3]);
    if (amount > 0 && (isValidAddress(input) || resolveToken(input)) && (isValidAddress(output) || resolveToken(output))) {
      return {
        action: "swap",
        inputToken: input,
        outputToken: output,
        amount,
        amountType: "input",
        slippage,
      };
    }
  }

  // "sell 1000 BONK" / "sell 0.5 SOL"
  const sellAmount = /(?:sell|dump)\s+(\d+\.?\d*)\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)/i.exec(msg);
  if (sellAmount) {
    const amount = parseFloat(sellAmount[1]);
    const input = normalizeMaybeAddress(sellAmount[2]);
    if (amount > 0 && (isValidAddress(input) || resolveToken(input))) {
      return {
        action: "swap",
        inputToken: input,
        outputToken: "SOL",
        amount,
        amountType: "input",
        slippage,
      };
    }
  }

  // "buy 100 BONK" - interpret as ExactOut (buy exactly 100 BONK) assuming input SOL unless otherwise specified.
  const buyExactOut = /(?:buy|get|receive)\s+(\d+\.?\d*)\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)\b/i.exec(msg);
  if (buyExactOut && !/\bworth\b/i.test(msg) && !/\bwith\b/i.test(msg) && !/\busing\b/i.test(msg)) {
    const amt = parseFloat(buyExactOut[1]);
    const out = normalizeMaybeAddress(buyExactOut[2]);
    if (amt > 0 && (isValidAddress(out) || resolveToken(out))) {
      return {
        action: "swap",
        inputToken: "SOL",
        outputToken: out,
        amount: amt,
        amountType: "output",
        slippage,
      };
    }
  }

  // Fallback: try to find 2 tokens + number
  if (tokens.length >= 2 || mints.length >= 2) {
    const num = extractNumber(msg);
    if (num && num > 0) {
      const first = mints[0] ?? tokens[0];
      const second = mints[1] ?? tokens[1];
      if (first && second && (isValidAddress(first) || resolveToken(first)) && (isValidAddress(second) || resolveToken(second))) {
        // Heuristic: "X A to B" or "A to B" with number somewhere
        const toMatch = msg.match(/\b(?:to|into|for)\b\s*([1-9A-HJ-NP-Za-km-z]{32,44}|\w+)/i);
        const output = toMatch ? normalizeMaybeAddress(toMatch[1]) : normalizeMaybeAddress(String(second));
        const input = output === second ? normalizeMaybeAddress(String(first)) : normalizeMaybeAddress(String(second));
        return {
          action: "swap",
          inputToken: input,
          outputToken: output,
          amount: num,
          amountType: "input",
          slippage,
        };
      }
    }
  }

  return null;
}
