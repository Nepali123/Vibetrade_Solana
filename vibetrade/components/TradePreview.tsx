"use client";

import { useState, useEffect } from "react";
import { fromRawAmount, getCoinGeckoUrl } from "@/lib/tokens";
import type { JupiterQuote } from "@/lib/jupiter";
import type { TokenInfo } from "@/lib/tokens";
import type { ParsedIntent } from "@/lib/parser";

function TokenBadge({ token, amount, prefix = "" }: { token: TokenInfo; amount: string; prefix?: string }) {
  const cgUrl = getCoinGeckoUrl(token);
  const content = (
    <>
      {token.logoUri && (
        <img src={token.logoUri} alt="" className="h-6 w-6 rounded-full shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      )}
      <span className="font-medium text-zinc-900">
        {prefix}{amount} {token.symbol}
      </span>
      {cgUrl && <span className="text-[10px] text-zinc-500">↗</span>}
    </>
  );
  if (cgUrl) {
    return (
      <a
        href={cgUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-2.5 py-1.5 transition hover:bg-zinc-200"
        title={`View ${token.name} on CoinGecko`}
      >
        {content}
      </a>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-2.5 py-1.5">
      {content}
    </span>
  );
}

interface TradePreviewProps {
  intent: ParsedIntent;
  quote: JupiterQuote;
  inputToken: TokenInfo;
  outputToken: TokenInfo;
  slippagePct?: number;
  quoteFetchedAt?: number;
  onConfirm: () => void;
  onCancel: () => void;
  onRefreshQuote?: () => void;
  isRefreshing?: boolean;
  isLoading?: boolean;
  priceUpdatedInfo?: { prevOut: number; newOut: number };
}

export function TradePreview({
  intent,
  quote,
  inputToken,
  outputToken,
  slippagePct,
  quoteFetchedAt,
  onConfirm,
  onCancel,
  onRefreshQuote,
  isRefreshing = false,
  isLoading = false,
  priceUpdatedInfo,
}: TradePreviewProps) {
  const [quoteAge, setQuoteAge] = useState(0);
  const inAmount = fromRawAmount(quote.inAmount, inputToken.decimals);
  const outAmount = fromRawAmount(quote.outAmount, outputToken.decimals);
  const minOut = fromRawAmount(quote.otherAmountThreshold, outputToken.decimals);
  const priceImpact = parseFloat(quote.priceImpactPct ?? "0");
  const displaySlippage = slippagePct ?? intent.slippage ?? 1;

  useEffect(() => {
    if (!quoteFetchedAt) return;
    const updateAge = () => setQuoteAge(Math.floor((Date.now() - quoteFetchedAt) / 1000));
    updateAge();
    const t = setInterval(updateAge, 1000);
    return () => clearInterval(t);
  }, [quoteFetchedAt]);

  const isStale = quoteAge > 15;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
      <h3 className="mb-3 text-sm font-semibold text-zinc-900">Trade Preview</h3>

      {priceUpdatedInfo && (
        <div className="mb-3 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm text-amber-900">
          <strong>Price updated.</strong> New estimate: ~{priceUpdatedInfo.newOut.toFixed(6)} {outputToken.symbol} (was ~{priceUpdatedInfo.prevOut.toFixed(6)}). Review below.
        </div>
      )}

      <div className="mb-4">
        <p className="mb-2 text-sm text-zinc-600">You&apos;re about to swap</p>
        <div className="flex flex-wrap items-center gap-2">
          <TokenBadge token={inputToken} amount={inAmount.toFixed(6)} />
          <span className="text-zinc-500">→</span>
          <TokenBadge token={outputToken} amount={`~${outAmount.toFixed(6)}`} />
        </div>
      </div>
      <div className="mb-4 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2 text-zinc-600">
          <span>Min. received ({displaySlippage}% slippage)</span>
          {getCoinGeckoUrl(outputToken) ? (
            <a
              href={getCoinGeckoUrl(outputToken)!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-zinc-900 hover:text-zinc-950"
            >
              {outputToken.logoUri && (
                <img src={outputToken.logoUri} alt="" className="h-4 w-4 rounded-full" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              )}
              {minOut.toFixed(6)} {outputToken.symbol}
              <span className="text-[10px]">↗</span>
            </a>
          ) : (
            <span className="flex items-center gap-1.5 text-zinc-900">
              {outputToken.logoUri && (
                <img src={outputToken.logoUri} alt="" className="h-4 w-4 rounded-full" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              )}
              {minOut.toFixed(6)} {outputToken.symbol}
            </span>
          )}
        </div>
        <div className="flex justify-between text-zinc-600">
          <span>Slippage</span>
          <span className="text-zinc-900">{displaySlippage}% (auto)</span>
        </div>
        {priceImpact !== 0 && (
          <div className="flex justify-between text-zinc-600">
            <span>Price impact</span>
            <span className={priceImpact > 1 ? "text-amber-700" : "text-zinc-900"}>{priceImpact.toFixed(2)}%</span>
          </div>
        )}
        {quoteFetchedAt && (
          <div className="flex items-center justify-between text-zinc-500">
            <span>Quote: {quoteAge}s ago {isStale && "(stale • auto-refreshing)"}</span>
            {onRefreshQuote && (
              <button
                onClick={onRefreshQuote}
                disabled={isRefreshing || isLoading}
                className="text-violet-700 hover:text-violet-800 disabled:opacity-50"
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading || isRefreshing}
          className="flex-1 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50"
        >
          {isLoading ? "Confirming..." : "Confirm Swap"}
        </button>
      </div>
    </div>
  );
}
