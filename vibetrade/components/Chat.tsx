"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import toast from "react-hot-toast";
import { VersionedTransaction } from "@solana/web3.js";
import { TradePreview } from "./TradePreview";
import type { ParsedIntent } from "@/lib/parser";
import type { JupiterQuote } from "@/lib/jupiter";
import type { TokenInfo } from "@/lib/tokens";
import { fromRawAmount } from "@/lib/tokens";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "trade-pending" | "trade-success" | "trade-error";
}

export function Chat() {
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingTrade, setPendingTrade] = useState<{
    intent: ParsedIntent;
    quote: JupiterQuote;
    inputToken: TokenInfo;
    outputToken: TokenInfo;
    slippagePct?: number;
    quoteFetchedAt?: number;
    priceUpdatedInfo?: { prevOut: number; newOut: number };
  } | null>(null);
  const [executing, setExecuting] = useState(false);
  const [refreshingQuote, setRefreshingQuote] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingTrade]);

  const addMessage = (role: "user" | "assistant", content: string, type?: ChatMessage["type"]) => {
    setMessages((m) => [...m, { id: crypto.randomUUID(), role, content, type }]);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    if (!connected || !publicKey) {
      toast.error("Connect your wallet first");
      return;
    }

    setInput("");
    addMessage("user", text);
    setLoading(true);

    try {
      // Handle balance questions without invoking the swap parser.
      const isBalanceQuery =
        /\bbalance\b/i.test(text) &&
        !/\b(swap|buy|sell|convert|trade|exchange)\b/i.test(text);
      if (isBalanceQuery) {
        // Default to SOL balance unless a token is mentioned.
        const tokenMatch =
          text.match(/\b(?:balance(?:\s+of)?|my)\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\$?[A-Za-z0-9]{2,10})\b/i) ??
          text.match(/\bhow\s+much\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\$?[A-Za-z0-9]{2,10})\b/i);
        const tokenId = tokenMatch?.[1]?.replace(/^\$/, "") ?? "SOL";
        if (tokenId.toUpperCase() === "SOL") {
          // Use client-side RPC for SOL balance (more robust than hitting API route).
          const lamports = await connection.getBalance(publicKey);
          const sol = lamports / 1e9;
          addMessage("assistant", `Your SOL balance is ${sol.toFixed(6)} SOL.`);
        } else {
          const balRes = await fetch(
            `/api/token-balance?wallet=${publicKey.toBase58()}&symbol=${encodeURIComponent(tokenId)}`
          );
          const balData = await balRes.json();
          if (!balRes.ok) {
            addMessage("assistant", `❌ ${balData.error || "Failed to fetch balance."}`, "trade-error");
          } else {
            const bal = Number(balData.balance) || 0;
            addMessage(
              "assistant",
              `Your ${tokenId.toUpperCase()} balance is ${bal.toFixed(6)} ${tokenId.toUpperCase()}.`
            );
          }
        }
        setLoading(false);
        return;
      }

      const parseRes = await fetch("/api/parse-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const parseData = await parseRes.json();
      if (!parseRes.ok) {
        type Candidate = { symbol?: string; name?: string; mint?: string; address?: string };
        const candidates: Candidate[] | null = Array.isArray(parseData?.candidates) ? (parseData.candidates as Candidate[]) : null;
        const hint =
          candidates && candidates.length
            ? `\n\nAmbiguous symbol. Paste the mint address instead. Candidates:\n${candidates
                .slice(0, 5)
                .map((c) => `- ${c.symbol ?? ""} ${c.name ?? ""} (${c.mint ?? c.address ?? ""})`)
                .join("\n")}`
            : "";
        addMessage(
          "assistant",
          `❌ ${parseData.error || "Failed to understand your request."}${hint}`,
          "trade-error"
        );
        setLoading(false);
        return;
      }

      const intent = parseData as ParsedIntent;
      if (intent.action === "unsupported") {
        addMessage("assistant", "I can only help with token swaps. Try something like \"Buy 0.5 SOL worth of BONK\" or \"Sell 50% of my BONK\".", "trade-error");
        setLoading(false);
        return;
      }

      let userTokenBalance: number | undefined;
      if (intent.amountType === "percentage") {
        const balRes = await fetch(`/api/token-balance?wallet=${publicKey.toBase58()}&symbol=${intent.inputToken}`);
        const balData = await balRes.json();
        const balance = Number(balData?.balance) || 0;
        userTokenBalance = balance;
        if (balance <= 0) {
          addMessage("assistant", `You don't have any ${intent.inputToken} to swap.`, "trade-error");
          setLoading(false);
          return;
        }
      }

      const quoteRes = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputToken: intent.inputToken,
          outputToken: intent.outputToken,
          amount: intent.amount,
          amountType: intent.amountType,
          slippage: intent.slippage ?? 1,
          percentage: intent.percentage,
          userWallet: publicKey.toBase58(),
          userTokenBalance,
        }),
      });

      const quoteData = await quoteRes.json();
      if (!quoteRes.ok) {
        addMessage(
          "assistant",
          `❌ ${quoteData.error || "Failed to get quote."}\n\nTip: You can paste a token mint address if a symbol isn’t recognized.`,
          "trade-error"
        );
        setLoading(false);
        return;
      }

      if (quoteData.balanceCheck && !quoteData.balanceCheck.sufficient) {
        addMessage("assistant", `❌ ${quoteData.balanceCheck.error}`, "trade-error");
        setLoading(false);
        return;
      }

      const { quote, inputToken, outputToken, slippagePct } = quoteData;
      const outAmount = fromRawAmount(quote.outAmount, outputToken.decimals);

      addMessage(
        "assistant",
        `I can swap ${quoteData.inputToken.symbol} → ${quoteData.outputToken.symbol}. You'll get approximately ${outAmount.toFixed(6)} ${outputToken.symbol}. Confirm below.`
      );
      setPendingTrade({
        intent,
        quote,
        inputToken,
        outputToken,
        slippagePct,
        quoteFetchedAt: Date.now(),
      });
    } catch (err) {
      addMessage("assistant", `❌ ${err instanceof Error ? err.message : "Something went wrong"}`, "trade-error");
      toast.error("Error processing request");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSwap = async () => {
    if (!pendingTrade || !publicKey || executing) return;

    setExecuting(true);
    try {
      // Requote before swap to get fresh price
      const quoteData = await fetchQuote();
      let quoteToUse = pendingTrade.quote;

      if (quoteData) {
        const prevOut = fromRawAmount(pendingTrade.quote.outAmount, pendingTrade.outputToken.decimals);
        const newOut = fromRawAmount(quoteData.quote.outAmount, quoteData.outputToken.decimals);
        const changePct = Math.abs(newOut - prevOut) / prevOut;

        if (changePct > 0.01) {
          // Price changed >1% - show updated info, require user to accept
          setPendingTrade({
            ...pendingTrade,
            quote: quoteData.quote,
            inputToken: quoteData.inputToken,
            outputToken: quoteData.outputToken,
            slippagePct: quoteData.slippagePct,
            quoteFetchedAt: Date.now(),
            priceUpdatedInfo: { prevOut, newOut },
          });
          toast("Price updated - please review and confirm again");
          setExecuting(false);
          return;
        }
        quoteToUse = quoteData.quote;
      }

      await doSwap(quoteToUse);
    } catch (err) {
      let msg = err instanceof Error ? err.message : "Transaction failed";
      if (msg.includes("Plugin Closed") || msg.includes("User rejected")) {
        msg = "Transaction cancelled. Approve the transaction in your wallet to complete the swap. Make sure Phantom is on Mainnet.";
      }
      addMessage("assistant", `❌ ${msg}`, "trade-error");
      toast.error(msg);
    } finally {
      setExecuting(false);
    }
  };

  const handleCancelTrade = () => {
    setPendingTrade(null);
  };

  const fetchQuote = useCallback(async () => {
    if (!pendingTrade || !publicKey) return null;
    const { intent } = pendingTrade;
    let userTokenBalance: number | undefined;
    if (intent.amountType === "percentage") {
      const balRes = await fetch(`/api/token-balance?wallet=${publicKey.toBase58()}&symbol=${intent.inputToken}`);
      const balData = await balRes.json();
      userTokenBalance = balData.balance ?? 0;
    }
    const quoteRes = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputToken: intent.inputToken,
        outputToken: intent.outputToken,
        amount: intent.amount,
        amountType: intent.amountType,
        slippage: intent.slippage ?? 1,
        percentage: intent.percentage,
        userWallet: publicKey.toBase58(),
        userTokenBalance,
      }),
    });
    if (!quoteRes.ok) return null;
    const data = await quoteRes.json();
    return data;
  }, [pendingTrade, publicKey]);

  const handleRefreshQuote = useCallback(async () => {
    if (!pendingTrade || refreshingQuote) return;
    setRefreshingQuote(true);
    try {
      const quoteData = await fetchQuote();
      if (!quoteData) {
        toast.error("Failed to refresh quote");
        return;
      }
      const prevOut = fromRawAmount(pendingTrade.quote.outAmount, pendingTrade.outputToken.decimals);
      const newOut = fromRawAmount(quoteData.quote.outAmount, quoteData.outputToken.decimals);
      const changePct = Math.abs(newOut - prevOut) / prevOut;
      setPendingTrade({
        ...pendingTrade,
        quote: quoteData.quote,
        inputToken: quoteData.inputToken,
        outputToken: quoteData.outputToken,
        slippagePct: quoteData.slippagePct,
        quoteFetchedAt: Date.now(),
        priceUpdatedInfo: changePct > 0.01 ? { prevOut, newOut } : undefined,
      });
      if (changePct > 0.01) toast("Price updated - please review");
    } finally {
      setRefreshingQuote(false);
    }
  }, [pendingTrade, refreshingQuote, fetchQuote]);

  // Auto-refresh pending quote periodically to keep price current.
  useEffect(() => {
    if (!pendingTrade || !publicKey) return;

    const interval = setInterval(() => {
      if (loading || executing || refreshingQuote) return;
      const fetchedAt = pendingTrade.quoteFetchedAt ?? 0;
      const ageS = fetchedAt ? (Date.now() - fetchedAt) / 1000 : 9999;
      if (ageS >= 12) {
        void handleRefreshQuote();
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [pendingTrade, publicKey, loading, executing, refreshingQuote, handleRefreshQuote]);

  const doSwap = async (quoteToUse: JupiterQuote) => {
    const swapRes = await fetch("/api/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quoteToUse,
        userPublicKey: publicKey!.toBase58(),
      }),
    });
    const swapData = await swapRes.json();
    if (!swapRes.ok) {
      addMessage("assistant", `❌ ${swapData.error || "Failed to build transaction"}`, "trade-error");
      toast.error("Transaction build failed");
      setPendingTrade(null);
      return;
    }
    const txBuf = Buffer.from(swapData.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    const sig = await sendTransaction!(tx, connection, { skipPreflight: false, preflightCommitment: "confirmed" });
    addMessage("assistant", `✅ Swap sent! View: https://solscan.io/tx/${sig}`, "trade-success");
    toast.success("Swap successful!");
    setPendingTrade(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <h2 className="mb-2 text-xl font-semibold text-zinc-900">VibeTrade</h2>
            <p className="mb-6 max-w-sm text-sm text-zinc-600">
              Trade Solana tokens with natural language. Examples:
            </p>
            <div className="space-y-2 text-left text-sm text-zinc-600">
              <p>&quot;Buy 0.5 SOL worth of BONK&quot;</p>
              <p>&quot;Sell 50% of my BONK&quot;</p>
              <p>&quot;Swap all my USDC to SOL&quot;</p>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                m.role === "user"
                  ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm"
                  : "bg-white text-zinc-900 shadow-sm border border-zinc-200"
              }`}
            >
              <p className="whitespace-pre-wrap text-sm">
                {m.content.split(/(https?:\/\/[^\s]+)/).map((part, i) =>
                  part.startsWith("http") ? (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-violet-700 underline hover:text-violet-800">
                      {part}
                    </a>
                  ) : (
                    part
                  )
                )}
              </p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-white px-4 py-2.5 shadow-sm border border-zinc-200">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
              <span className="ml-2 text-sm text-zinc-600">Thinking...</span>
            </div>
          </div>
        )}
        {pendingTrade && (
          <div className="flex justify-start">
            <TradePreview
              intent={pendingTrade.intent}
              quote={pendingTrade.quote}
              inputToken={pendingTrade.inputToken}
              outputToken={pendingTrade.outputToken}
              slippagePct={pendingTrade.slippagePct}
              quoteFetchedAt={pendingTrade.quoteFetchedAt}
              priceUpdatedInfo={pendingTrade.priceUpdatedInfo}
              onConfirm={handleConfirmSwap}
              onCancel={handleCancelTrade}
              onRefreshQuote={handleRefreshQuote}
              isRefreshing={refreshingQuote}
              isLoading={executing}
            />
          </div>
        )}
        <div ref={scrollRef} />
      </div>
      <div className="border-t border-zinc-200 bg-white/70 p-4 backdrop-blur">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Buy 0.5 SOL worth of BONK..."
            className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
            disabled={loading || !connected}
          />
          <button
            type="submit"
            disabled={loading || !connected || !input.trim()}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
