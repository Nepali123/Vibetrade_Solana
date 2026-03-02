import type { TokenInfo } from "@/lib/tokens";
import { resolveToken as resolveStaticToken, getTokenByMint } from "@/lib/tokens";
import { isValidAddress } from "@/lib/solana";
import {
  getTokenByMintFromRegistry,
  getTokenCandidatesBySymbolFromRegistry,
  getTokenCandidatesByNameFromRegistry,
  getSplMintDecimals,
} from "@/lib/token-registry";

export class AmbiguousTokenSymbolError extends Error {
  symbol: string;
  candidates: Array<{ symbol: string; name: string; mint: string }>;
  constructor(symbol: string, candidates: Array<{ symbol: string; name: string; mint: string }>) {
    super(`Ambiguous token symbol: ${symbol}`);
    this.name = "AmbiguousTokenSymbolError";
    this.symbol = symbol;
    this.candidates = candidates;
  }
}

export class UnknownTokenError extends Error {
  identifier: string;
  constructor(identifier: string) {
    super(`Unknown token: ${identifier}`);
    this.name = "UnknownTokenError";
    this.identifier = identifier;
  }
}

function normalizeIdentifier(id: string): string {
  let cleaned = id.trim().replace(/^\$/, "");
  const pumpMatch = cleaned.match(/^([1-9A-HJ-NP-Za-km-z]{32,44})pump$/i);
  if (pumpMatch) {
    cleaned = pumpMatch[1];
  }
  return cleaned;
}

function normalizeNameKey(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const ALIASES: Record<string, string> = {
  SOLANA: "SOL",
  RAYDIUM: "RAY",
  JUPITER: "JUP",
  USDCOIN: "USDC",
  TETHER: "USDT",
  DOGWIFHAT: "WIF",
};

function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function mapRegistryToTokenInfo(r: { address: string; symbol: string; name: string; decimals: number; logoURI?: string; extensions?: { coingeckoId?: string } }): TokenInfo {
  return {
    symbol: r.symbol,
    name: r.name,
    mint: r.address,
    decimals: r.decimals,
    coingeckoId: r.extensions?.coingeckoId,
    logoUri: r.logoURI,
  };
}

async function resolveByMint(mint: string): Promise<TokenInfo> {
  const staticByMint = getTokenByMint(mint);
  if (staticByMint) return staticByMint;

  let reg: Awaited<ReturnType<typeof getTokenByMintFromRegistry>> | null = null;
  try {
    reg = await getTokenByMintFromRegistry(mint);
  } catch {
    reg = null;
  }
  if (reg) return mapRegistryToTokenInfo(reg);

  // Fallback: on-chain decimals only; symbol/name are best-effort.
  const decimals = await getSplMintDecimals(mint);
  const sym = shortAddress(mint);
  return {
    symbol: sym,
    name: `Token ${sym}`,
    mint,
    decimals,
  };
}

async function resolveBySymbol(symbol: string): Promise<TokenInfo> {
  const staticTok = resolveStaticToken(symbol);
  if (staticTok) return staticTok;

  const key = normalizeNameKey(symbol);
  const alias = ALIASES[key];
  const symbolToTry = alias ?? symbol;

  const candidates = await getTokenCandidatesBySymbolFromRegistry(symbolToTry);
  if (candidates.length === 0) {
    // Try resolving by token "name" (e.g., "Raydium") as a convenience.
    const byName = await getTokenCandidatesByNameFromRegistry(symbolToTry);
    if (byName.length === 0) throw new UnknownTokenError(symbol);
    if (byName.length > 1) {
      throw new AmbiguousTokenSymbolError(
        symbol.toUpperCase(),
        byName.slice(0, 8).map((c) => ({ symbol: c.symbol, name: c.name, mint: c.address }))
      );
    }
    return mapRegistryToTokenInfo(byName[0]);
  }
  if (candidates.length > 1) {
    throw new AmbiguousTokenSymbolError(
      symbolToTry.toUpperCase(),
      candidates.slice(0, 8).map((c) => ({ symbol: c.symbol, name: c.name, mint: c.address }))
    );
  }
  return mapRegistryToTokenInfo(candidates[0]);
}

export async function resolveTokenAny(identifier: string): Promise<TokenInfo> {
  const id = normalizeIdentifier(identifier);
  if (!id) throw new UnknownTokenError(identifier);

  if (isValidAddress(id)) {
    return await resolveByMint(id);
  }

  return await resolveBySymbol(id);
}

