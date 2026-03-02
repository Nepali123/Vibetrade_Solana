import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { WalletProvider } from "@/components/WalletProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VibeTrade | Chat-to-Trade Solana",
  description: "Trade Solana tokens using natural language",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-50 text-zinc-900`}>
        <WalletProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: "!bg-white !text-zinc-900 !border !border-zinc-200 !shadow-lg",
            }}
          />
        </WalletProvider>
      </body>
    </html>
  );
}
