/**
 * Solana connection utilities
 */

import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://solana-rpc.publicnode.com";

export function getConnection(): Connection {
  return new Connection(RPC_URL);
}

export async function getSolBalance(publicKey: string): Promise<number> {
  const conn = getConnection();
  const balance = await conn.getBalance(new PublicKey(publicKey));
  return balance / 1e9; // lamports to SOL
}

export function isValidAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}
