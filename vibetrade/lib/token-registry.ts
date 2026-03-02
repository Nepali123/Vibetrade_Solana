import { isValidAddress, getConnection } from "@/lib/solana";
import { PublicKey } from "@solana/web3.js";

export interface JupiterTokenRecord {
  address: string; // mint
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
  extensions?: Record<string, unknown> & { coingeckoId?: string };
}

type TokenIndex = {
  byMint: Map<string, JupiterTokenRecord>;
  bySymbol: Map<string, JupiterTokenRecord[]>;
  byName: Map<string, JupiterTokenRecord[]>;
  fetchedAt: number;
};

const ONE_HOUR_MS = 60 * 60 * 1000;

let cache: TokenIndex | null = null;
let inflight: Promise<TokenIndex> | null = null;

function normalizeSymbol(sym: string): string {
  return sym.trim().replace(/^\$/, "").toUpperCase();
}

function normalizeMint(mint: string): string {
  return mint.trim();
}

function normalizeName(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function fetchJson<T>(url: string, headers?: HeadersInit): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return (await res.json()) as T;
}

function getJupiterHeaders(): HeadersInit | undefined {
  const key = process.env.JUPITER_API_KEY;
  if (!key) return undefined;
  return { "x-api-key": key };
}

async function fetchFromJupTokenApiV2(): Promise<JupiterTokenRecord[]> {
  // Token API v2. Some deployments require x-api-key; we support both.
  return await fetchJson<JupiterTokenRecord[]>(
    "https://api.jup.ag/tokens/v2/all",
    getJupiterHeaders()
  );
}

async function fetchFromLegacyTokenList(): Promise<JupiterTokenRecord[]> {
  // Legacy public endpoint (kept as fallback).
  return await fetchJson<JupiterTokenRecord[]>("https://token.jup.ag/all");
}

function indexTokens(tokens: JupiterTokenRecord[]): TokenIndex {
  const byMint = new Map<string, JupiterTokenRecord>();
  const bySymbol = new Map<string, JupiterTokenRecord[]>();
  const byName = new Map<string, JupiterTokenRecord[]>();

  for (const t of tokens) {
    const mint = normalizeMint(t.address);
    if (!mint) continue;
    if (!isValidAddress(mint)) continue;

    byMint.set(mint, t);

    const sym = normalizeSymbol(t.symbol ?? "");
    if (!sym) continue;
    const arr = bySymbol.get(sym) ?? [];
    arr.push(t);
    bySymbol.set(sym, arr);

    const nm = normalizeName(t.name ?? "");
    if (nm) {
      const na = byName.get(nm) ?? [];
      na.push(t);
      byName.set(nm, na);
    }
  }

  // Prefer stable ordering for ambiguous symbols.
  for (const [sym, arr] of bySymbol.entries()) {
    arr.sort((a, b) => (a.address ?? "").localeCompare(b.address ?? ""));
    bySymbol.set(sym, arr);
  }

  for (const [nm, arr] of byName.entries()) {
    arr.sort((a, b) => (a.address ?? "").localeCompare(b.address ?? ""));
    byName.set(nm, arr);
  }

  return { byMint, bySymbol, byName, fetchedAt: Date.now() };
}

export async function getTokenIndex(opts?: { forceRefresh?: boolean }): Promise<TokenIndex> {
  const forceRefresh = opts?.forceRefresh ?? false;
  const freshEnough = cache && Date.now() - cache.fetchedAt < ONE_HOUR_MS;
  if (!forceRefresh && freshEnough) return cache!;

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      try {
        const tokens = await fetchFromJupTokenApiV2().catch(async () => {
          return await fetchFromLegacyTokenList();
        });
        cache = indexTokens(tokens);
      } catch {
        // If Jupiter token APIs are unreachable, fall back to an empty index
        // so the app still works for static tokens and raw mint addresses.
        cache = {
          byMint: new Map(),
          bySymbol: new Map(),
          byName: new Map(),
          fetchedAt: Date.now(),
        };
      }
      return cache!;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export async function getTokenByMintFromRegistry(mint: string): Promise<JupiterTokenRecord | null> {
  const idx = await getTokenIndex();
  return idx.byMint.get(normalizeMint(mint)) ?? null;
}

export async function getTokenCandidatesBySymbolFromRegistry(symbol: string): Promise<JupiterTokenRecord[]> {
  const idx = await getTokenIndex();
  return idx.bySymbol.get(normalizeSymbol(symbol)) ?? [];
}

export async function getTokenCandidatesByNameFromRegistry(name: string): Promise<JupiterTokenRecord[]> {
  const idx = await getTokenIndex();
  return idx.byName.get(normalizeName(name)) ?? [];
}

export async function getSplMintDecimals(mint: string): Promise<number> {
  if (!isValidAddress(mint)) throw new Error("Invalid mint address");
  const conn = getConnection();
  const pk = new PublicKey(mint);
  const info = await conn.getAccountInfo(pk);
  if (!info?.data) throw new Error("Mint account not found");
  const data = Buffer.from(info.data);
  // SPL Mint layout: decimals at byte offset 44
  if (data.length < 45) throw new Error("Invalid mint account data");
  const decimals = data.readUInt8(44);
  if (decimals > 18) {
    // Most SPL tokens are <= 9; allow up to 18, but reject nonsense.
    throw new Error(`Unexpected decimals (${decimals}) for mint`);
  }
  return decimals;
}

