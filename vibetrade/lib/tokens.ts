/**
 * Token list and resolver for Solana tokens
 * Maps symbols to mint addresses for Jupiter API
 */

export interface TokenInfo {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  coingeckoId?: string;
  logoUri?: string;
}

const CG = "https://www.coingecko.com/en/coins";
const CG_IMG = "https://assets.coingecko.com/coins/images";

// Predefined token list - common Solana tokens
export const TOKEN_LIST: TokenInfo[] = [
  { symbol: "SOL", name: "Wrapped SOL", mint: "So11111111111111111111111111111111111111112", decimals: 9, coingeckoId: "solana", logoUri: `${CG_IMG}/4128/small/solana.png` },
  { symbol: "USDC", name: "USD Coin", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, coingeckoId: "usd-coin", logoUri: `${CG_IMG}/6319/small/usdc.png` },
  { symbol: "USDT", name: "Tether USD", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6, coingeckoId: "tether", logoUri: `${CG_IMG}/325/small/Tether.png` },
  { symbol: "BONK", name: "Bonk", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5, coingeckoId: "bonk", logoUri: `${CG_IMG}/28600/small/bonk.jpg` },
  { symbol: "JUP", name: "Jupiter", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6, coingeckoId: "jupiter-exchange-solana", logoUri: `${CG_IMG}/34188/small/jup.png` },
  { symbol: "RAY", name: "Raydium", mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", decimals: 6, coingeckoId: "raydium", logoUri: `${CG_IMG}/13970/small/raydium.png` },
  { symbol: "ORCA", name: "Orca", mint: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE", decimals: 6, coingeckoId: "orca", logoUri: `${CG_IMG}/17438/small/orca_placeholder.png` },
  { symbol: "mSOL", name: "Marinade staked SOL", mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", decimals: 9, coingeckoId: "msol", logoUri: `${CG_IMG}/17752/small/msol.png` },
  { symbol: "stSOL", name: "Lido staked SOL", mint: "7dHbWXmni3pzSQq67H9sVdP9WRn8d36RLcQy666EQNGd", decimals: 9, coingeckoId: "lido-staked-sol", logoUri: `${CG_IMG}/18369/small/steth.png` }, // Lido uses stETH icon
  { symbol: "WIF", name: "dogwifhat", mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", decimals: 6, coingeckoId: "dogwifcoin", logoUri: `${CG_IMG}/33566/small/dogwifhat.jpg` },
  { symbol: "POPCAT", name: "Popcat", mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", decimals: 9, coingeckoId: "popcat", logoUri: `${CG_IMG}/33406/small/popcat.png` },
];

export function getCoinGeckoUrl(token: TokenInfo): string | null {
  return token.coingeckoId ? `${CG}/${token.coingeckoId}` : null;
}

const TOKEN_MAP = new Map<string, TokenInfo>(
  TOKEN_LIST.flatMap((t) => [
    [t.symbol.toUpperCase(), t],
    [t.symbol.toLowerCase(), t],
  ])
);

export function resolveToken(symbol: string): TokenInfo | null {
  return TOKEN_MAP.get(symbol.trim().toUpperCase()) ?? null;
}

export function getTokenByMint(mint: string): TokenInfo | null {
  return TOKEN_LIST.find((t) => t.mint === mint) ?? null;
}

export function toRawAmount(amount: number, decimals: number): string {
  return Math.floor(amount * Math.pow(10, decimals)).toString();
}

export function fromRawAmount(raw: string, decimals: number): number {
  return parseInt(raw, 10) / Math.pow(10, decimals);
}
