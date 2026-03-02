"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useEffect, useState } from "react";

export function WalletConnect() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey || !connection) return;
    connection.getBalance(publicKey).then((lamports) => {
      setBalance(lamports / LAMPORTS_PER_SOL);
    });
  }, [publicKey, connection]);

  return (
    <div className="flex items-center gap-3">
      {connected && balance !== null && (
        <span className="text-sm text-zinc-600">
          {balance.toFixed(4)} SOL
        </span>
      )}
      <WalletMultiButton className="!bg-gradient-to-r !from-violet-600 !to-fuchsia-600 hover:!from-violet-500 hover:!to-fuchsia-500 !rounded-lg !h-9 !text-sm !text-white shadow-sm" />
    </div>
  );
}
