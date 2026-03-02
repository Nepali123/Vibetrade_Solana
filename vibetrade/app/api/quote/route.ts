import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/jupiter";
import { toRawAmount } from "@/lib/tokens";
import { getConnection, getSolBalance } from "@/lib/solana";
import { resolveTokenAny } from "@/lib/token-resolver";
import { PublicKey } from "@solana/web3.js";
import type { TokenInfo } from "@/lib/tokens";

export const runtime = "nodejs";

const WSOL_MINT = "So11111111111111111111111111111111111111112";

type ParsedTokenAccountData = {
  parsed?: {
    info?: {
      tokenAmount?: {
        uiAmount?: number | null;
      };
    };
  };
};

async function getSplTokenBalanceUiAmount(wallet: string, mint: string): Promise<number> {
  const conn = getConnection();
  const accounts = await conn.getParsedTokenAccountsByOwner(new PublicKey(wallet), {
    mint: new PublicKey(mint),
  });
  let sum = 0;
  for (const a of accounts.value) {
    const data = a.account.data as unknown as ParsedTokenAccountData;
    const uiAmount = data?.parsed?.info?.tokenAmount?.uiAmount;
    if (typeof uiAmount === "number") sum += uiAmount;
  }
  return sum;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      inputToken: inputSymbol,
      outputToken: outputSymbol,
      amount,
      amountType,
      slippage = 1,
      userWallet,
    } = body;

    if (!inputSymbol || !outputSymbol) {
      return NextResponse.json({ error: "Input and output tokens required" }, { status: 400 });
    }

    let inputToken: TokenInfo;
    let outputToken: TokenInfo;
    try {
      inputToken = await resolveTokenAny(String(inputSymbol));
      outputToken = await resolveTokenAny(String(outputSymbol));
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid token" },
        { status: 400 }
      );
    }

    let rawAmount: string;
    let swapMode: "ExactIn" | "ExactOut" | undefined;
    if (amountType === "percentage") {
      if (!userWallet) {
        return NextResponse.json({ error: "userWallet required for percentage trades" }, { status: 400 });
      }
      const pct = Math.max(0, Math.min(100, Number(body.percentage ?? 100))) / 100;

      const isSolLike = inputToken.mint === WSOL_MINT || String(inputSymbol).toUpperCase() === "SOL";
      const balanceUi = isSolLike
        ? await getSolBalance(userWallet)
        : await getSplTokenBalanceUiAmount(userWallet, inputToken.mint);

      // Keep a small SOL buffer for fees if swapping SOL.
      // This must be small enough to allow low-balance wallets to trade.
      if (isSolLike) {
        const feeBufferSol = Math.min(0.01, Math.max(0.002, balanceUi * 0.05)); // 0.002 - 0.01 SOL (or ~5%)
        const desiredSpend = balanceUi * pct;
        const maxSpend = Math.max(0, balanceUi - feeBufferSol);
        const spend = Math.min(desiredSpend, maxSpend);
        if (spend <= 0) {
          return NextResponse.json(
            { error: `Not enough SOL for fees. You have ${balanceUi.toFixed(4)} SOL.` },
            { status: 400 }
          );
        }
        rawAmount = toRawAmount(spend, inputToken.decimals);
      } else {
        rawAmount = toRawAmount(balanceUi * pct, inputToken.decimals);
      }
      swapMode = "ExactIn";
    } else {
      const amt = typeof amount === "number" ? amount : parseFloat(amount);
      if (isNaN(amt) || amt <= 0) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }
      if (amountType === "output") {
        rawAmount = toRawAmount(amt, outputToken.decimals);
        swapMode = "ExactOut";
      } else {
        rawAmount = toRawAmount(amt, inputToken.decimals);
        swapMode = "ExactIn";
      }
    }

    // Auto slippage: memecoins need more, stable pairs need less
    const MEMECOINS = new Set(["BONK", "WIF", "POPCAT"]);
    const STABLE = new Set(["USDC", "USDT"]);
    const isVolatile = (s: string) => MEMECOINS.has(s.toUpperCase());
    const isStable = (s: string) => STABLE.has(s.toUpperCase());
    const unknownA = inputToken.symbol.includes("…");
    const unknownB = outputToken.symbol.includes("…");
    const autoSlippage =
      unknownA || unknownB ? 2.5
      : isVolatile(inputToken.symbol) || isVolatile(outputToken.symbol) ? 2.5
      : isStable(inputToken.symbol) && isStable(outputToken.symbol) ? 0.5
      : 1.5;
    const effectiveSlippage = Math.max(slippage ?? 0, autoSlippage);
    const slippageBps = Math.min(1000, Math.max(10, Math.round(effectiveSlippage * 100))); // 0.1% - 10%

    const quote = await getQuote({
      inputMint: inputToken.mint,
      outputMint: outputToken.mint,
      amount: rawAmount,
      slippageBps,
      swapMode,
    });

    if (!quote) {
      const hint = !process.env.JUPITER_API_KEY
        ? " Add JUPITER_API_KEY to .env.local (free at https://portal.jup.ag)"
        : "";
      return NextResponse.json({ error: `Failed to get quote from Jupiter.${hint}` }, { status: 502 });
    }

    let balanceCheck: { sufficient: boolean; error?: string } | undefined;
    if (userWallet && swapMode === "ExactIn" && (String(inputSymbol).toUpperCase() === "SOL" || inputToken.mint === WSOL_MINT)) {
      const solBalance = await getSolBalance(userWallet);
      const requiredSol = parseInt(rawAmount, 10) / 1e9;
      if (solBalance < requiredSol) {
        balanceCheck = { sufficient: false, error: `Insufficient SOL. Need ~${requiredSol.toFixed(4)}, have ${solBalance.toFixed(4)}` };
      } else {
        balanceCheck = { sufficient: true };
      }
    }

    return NextResponse.json({
      quote,
      inputToken,
      outputToken,
      slippageBps,
      slippagePct: slippageBps / 100,
      balanceCheck,
    });
  } catch (err) {
    console.error("Quote error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quote failed" },
      { status: 500 }
    );
  }
}
