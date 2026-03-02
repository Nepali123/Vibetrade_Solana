"use client";

import { WalletConnect } from "@/components/WalletConnect";
import { Chat } from "@/components/Chat";
import { useWallet } from "@solana/wallet-adapter-react";

export default function Home() {
  const { connected } = useWallet();

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-zinc-50 via-white to-zinc-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white/70 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold tracking-tight">
          <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            VibeTrade
          </span>
        </h1>
        <WalletConnect />
      </header>
      <main className="flex flex-1 flex-col">
        {connected ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <Chat />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
            <h2 className="text-xl font-semibold text-zinc-900">
              Connect your wallet to start trading
            </h2>
            <p className="max-w-md text-center text-sm text-zinc-600">
              VibeTrade lets you trade Solana tokens using natural language.
              Connect Phantom or another Solana wallet to get started.
            </p>
            <WalletConnect />
          </div>
        )}
      </main>
    </div>
  );
}
