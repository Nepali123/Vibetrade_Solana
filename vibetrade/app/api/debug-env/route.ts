import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    JUPITER_API_KEY: process.env.JUPITER_API_KEY ? "set" : "NOT SET",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "set" : "NOT SET",
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL ? "set" : "not set (using default)",
  });
}
