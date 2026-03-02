import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { parseIntentFree } from "@/lib/free-parser";
import type { ParsedIntent } from "@/lib/parser";
import { validateIntent } from "@/lib/parser";
import { AmbiguousTokenSymbolError, resolveTokenAny, UnknownTokenError } from "@/lib/token-resolver";
import { generateJsonWithGemini } from "@/lib/gemini";

export const runtime = "nodejs";

const COMMON_SYMBOLS = ["SOL", "USDC", "USDT", "BONK", "JUP", "RAY", "ORCA", "mSOL", "stSOL", "WIF", "POPCAT"];

const SYSTEM_PROMPT = `You are a crypto trading assistant for Solana. Convert user messages into structured JSON for token swaps.

Only output valid JSON. No markdown, no explanation.

Output schema:
{
  "action": "swap" | "unsupported",
  "inputToken": "SYMBOL_OR_MINT_ADDRESS",
  "outputToken": "SYMBOL_OR_MINT_ADDRESS",
  "amount": number,
  "amountType": "input" | "output" | "percentage",
  "slippage": number (0.1-10, default 1),
  "percentage": number (only if amountType is "percentage", 1-100)
}

Rules:
- If the user provides a token mint address (base58), use it directly.
- Otherwise use a token symbol (case-insensitive). Prefer common symbols: ${COMMON_SYMBOLS.join(", ")}.
- amountType "input" = user specifies amount of input token (e.g. "buy 0.5 SOL worth of BONK")
- amountType "output" = user specifies desired output amount (e.g. "buy 1000 BONK", "receive 2 SOL")
- amountType "percentage" = "50% of my BONK" -> percentage: 50, inputToken: BONK, outputToken: SOL
- For "buy X SOL worth of BONK" -> inputToken: SOL, outputToken: BONK, amount: X, amountType: input
- For "sell 50% of my BONK" -> inputToken: BONK, outputToken: SOL, amountType: percentage, percentage: 50
- For "swap all my USDC to SOL" -> inputToken: USDC, outputToken: SOL, amountType: percentage, percentage: 100
- If token is unclear or missing, action: "unsupported"`;

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // 1. Try free rule-based parser first (no API key needed)
    const freeResult = parseIntentFree(message);
    const hasPercentLanguage = /%|\bpercent\b|\bpercentage\b|\bhalf\b|\bquarter\b/i.test(message);

    // Heuristic: if the user is clearly talking in percentages but the
    // rule-based parser interpreted it as a fixed input amount, prefer
    // the AI fallback (Gemini/OpenAI) for better understanding.
    const looksLikePercentButParsedAsFixed =
      !!freeResult &&
      hasPercentLanguage &&
      freeResult.amountType === "input" &&
      (freeResult.percentage == null || freeResult.percentage <= 0);

    if (freeResult && !looksLikePercentButParsedAsFixed) {
      const v = validateIntent(freeResult);
      if (!v.valid) {
        return NextResponse.json({ error: v.error ?? "Invalid intent" }, { status: 400 });
      }
      try {
        await resolveTokenAny(freeResult.inputToken);
        await resolveTokenAny(freeResult.outputToken);
      } catch (e) {
        if (e instanceof AmbiguousTokenSymbolError) {
          return NextResponse.json(
            {
              error: `Token symbol "${e.symbol}" is ambiguous. Paste the token mint address instead.`,
              candidates: e.candidates,
            },
            { status: 400 }
          );
        }
        if (e instanceof UnknownTokenError) {
          return NextResponse.json(
            { error: `Unknown token "${e.identifier}". Try SOL/USDC or paste the token mint address.` },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Invalid token" },
          { status: 400 }
        );
      }
      return NextResponse.json(freeResult);
    }

    // 2. Fallback to Gemini if key is configured (free-tier alternative)
    if (process.env.GEMINI_API_KEY) {
      const parsed = await generateJsonWithGemini<ParsedIntent>({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: message,
        temperature: 0.1,
      });

      if (parsed.action === "swap") {
        const v = validateIntent(parsed);
        if (!v.valid) {
          return NextResponse.json({ error: v.error ?? "Invalid intent" }, { status: 400 });
        }
        try {
          await resolveTokenAny(parsed.inputToken);
          await resolveTokenAny(parsed.outputToken);
        } catch (e) {
          if (e instanceof AmbiguousTokenSymbolError) {
            return NextResponse.json(
              {
                error: `Token symbol "${e.symbol}" is ambiguous. Paste the token mint address instead.`,
                candidates: e.candidates,
              },
              { status: 400 }
            );
          }
          if (e instanceof UnknownTokenError) {
            return NextResponse.json(
              { error: `Unknown token "${e.identifier}". Try SOL/USDC or paste the token mint address.` },
              { status: 400 }
            );
          }
          return NextResponse.json(
            { error: e instanceof Error ? e.message : "Invalid token" },
            { status: 400 }
          );
        }
      }
      return NextResponse.json(parsed);
    }

    // 3. Fallback to OpenAI if key is configured
    if (process.env.OPENAI_API_KEY) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
        temperature: 0.1,
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (content) {
        let jsonStr = content;
        const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlock) jsonStr = codeBlock[1].trim();
        const parsed = JSON.parse(jsonStr) as ParsedIntent;

        if (parsed.action === "swap") {
          const v = validateIntent(parsed);
          if (!v.valid) {
            return NextResponse.json({ error: v.error ?? "Invalid intent" }, { status: 400 });
          }
          try {
            await resolveTokenAny(parsed.inputToken);
            await resolveTokenAny(parsed.outputToken);
          } catch (e) {
            if (e instanceof AmbiguousTokenSymbolError) {
              return NextResponse.json(
                {
                  error: `Token symbol "${e.symbol}" is ambiguous. Paste the token mint address instead.`,
                  candidates: e.candidates,
                },
                { status: 400 }
              );
            }
            if (e instanceof UnknownTokenError) {
              return NextResponse.json(
                { error: `Unknown token "${e.identifier}". Try SOL/USDC or paste the token mint address.` },
                { status: 400 }
              );
            }
            return NextResponse.json(
              { error: e instanceof Error ? e.message : "Invalid token" },
              { status: 400 }
            );
          }
        }
        return NextResponse.json(parsed);
      }
    }

    // 4. Neither worked
    return NextResponse.json({
      error: "Could not understand. Try: 'Buy 0.5 SOL worth of BONK', 'Sell 50% of my BONK', 'Swap all my USDC to SOL', or paste a token mint address.",
      commonSymbols: COMMON_SYMBOLS,
    }, { status: 400 });
  } catch (err) {
    console.error("Parse intent error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse intent" },
      { status: 500 }
    );
  }
}
