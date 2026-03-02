import { NextRequest, NextResponse } from "next/server";
import { getSwapTransaction } from "@/lib/jupiter";

/**
 * Builds a serialized swap transaction from a Jupiter quote.
 * The client signs and sends it - we never execute.
 */
export async function POST(req: NextRequest) {
  try {
    const { quoteResponse, userPublicKey } = await req.json();

    if (!quoteResponse || !userPublicKey) {
      return NextResponse.json({ error: "quoteResponse and userPublicKey required" }, { status: 400 });
    }

    const result = await getSwapTransaction({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
    });

    if (!result) {
      return NextResponse.json({ error: "Failed to build swap transaction" }, { status: 502 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Swap build error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Swap build failed" },
      { status: 500 }
    );
  }
}
