import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getConnection } from "@/lib/solana";
import { resolveTokenAny } from "@/lib/token-resolver";
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

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  const symbol = req.nextUrl.searchParams.get("symbol"); // may be symbol or mint

  if (!wallet || !symbol) {
    return NextResponse.json({ error: "wallet and symbol required" }, { status: 400 });
  }

  let token: TokenInfo;
  try {
    token = await resolveTokenAny(symbol);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown token" },
      { status: 400 }
    );
  }

  const isSolLike = symbol.toUpperCase() === "SOL" || token.mint === WSOL_MINT;
  if (isSolLike) {
    const conn = getConnection();
    const balance = await conn.getBalance(new PublicKey(wallet));
    return NextResponse.json({ balance: balance / 1e9, decimals: 9 });
  }

  const conn = getConnection();
  const accounts = await conn.getParsedTokenAccountsByOwner(new PublicKey(wallet), {
    mint: new PublicKey(token.mint),
  });

  if (accounts.value.length === 0) {
    return NextResponse.json({ balance: 0, decimals: token.decimals });
  }

  let balance = 0;
  for (const a of accounts.value) {
    const data = a.account.data as unknown as ParsedTokenAccountData;
    const uiAmount = data?.parsed?.info?.tokenAmount?.uiAmount;
    if (typeof uiAmount === "number") balance += uiAmount;
  }
  return NextResponse.json({ balance, decimals: token.decimals });
}
