/**
 * Jupiter API client for swap quotes and transaction building
 * Uses Jupiter v6 (Metis) API
 */

const JUPITER_API = "https://api.jup.ag/swap/v1";

export interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string; // raw amount (lamports/atomic units)
  slippageBps?: number; // basis points, 100 = 1%
  swapMode?: "ExactIn" | "ExactOut";
}

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
    };
    percent: number;
  }>;
  contextSlot?: number;
  timeTaken?: number;
}

export interface JupiterSwapParams {
  quoteResponse: JupiterQuote;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
}

function getHeaders(): HeadersInit {
  const key = process.env.JUPITER_API_KEY;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (key) headers["x-api-key"] = key;
  return headers;
}

export async function getQuote(params: JupiterQuoteParams): Promise<JupiterQuote | null> {
  const url = new URL(`${JUPITER_API}/quote`);
  url.searchParams.set("inputMint", params.inputMint);
  url.searchParams.set("outputMint", params.outputMint);
  url.searchParams.set("amount", params.amount);
  url.searchParams.set("slippageBps", String(params.slippageBps ?? 100));
  if (params.swapMode) url.searchParams.set("swapMode", params.swapMode);
  url.searchParams.set("restrictIntermediateTokens", "true");

  const res = await fetch(url.toString(), { headers: getHeaders() });
  if (!res.ok) {
    const err = await res.text();
    console.error("Jupiter quote error:", res.status, err);
    return null;
  }
  return res.json();
}

export async function getSwapTransaction(params: JupiterSwapParams): Promise<{
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number | null;
} | null> {
  const res = await fetch(`${JUPITER_API}/swap`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
      wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Jupiter swap error:", res.status, err);
    return null;
  }
  return res.json();
}
