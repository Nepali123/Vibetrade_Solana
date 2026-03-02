# VibeTrade

**Chat-to-Trade** Solana dApp — trade tokens using natural language. The AI parses your intent and executes swaps via Jupiter after you confirm.

## Features

- **Wallet connection** — Phantom and other Solana wallets
- **Chat interface** — Natural language trade commands
- **Intent parsing** — Free rule-based parser + optional Gemini fallback
- **Trade preview** — See quote, slippage, and min. received before confirming
- **Safety** — Never auto-executes; always requires user confirmation
- **Jupiter integration** — Best routing for Solana swaps

## Quick Start

### Prerequisites

- Node.js 20+ (required for Next.js 16)
- Phantom wallet (or other Solana wallet)

### Setup

1. **Clone and install**

   ```bash
   cd vibetrade
   npm install
   ```

2. **Environment variables**

   Copy `.env.example` to `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

   Then set:

   - `GEMINI_API_KEY` — Optional. Enables AI parsing (free-tier). Without it, the free rule-based parser handles common phrases
   - `GEMINI_MODEL` — Optional (defaults to `gemini-2.5-flash`)
   - `SOLANA_RPC_URL` — Optional (defaults to public mainnet)
   - `NEXT_PUBLIC_SOLANA_RPC_URL` — Optional (for wallet connection)

3. **Run**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

### Example prompts (work with free parser, no API key)

- "Buy 0.5 SOL worth of BONK"
- "Sell 50% of my BONK"
- "Swap all my USDC to SOL"
- "Sell 1000 BONK"
- "Swap 10 USDC to SOL"
- "Buy BONK with 0.5 SOL"

## Supported tokens

SOL, USDC, USDT, BONK, JUP, RAY, ORCA, mSOL, stSOL, WIF, POPCAT

## Tech stack

- **Frontend**: Next.js 14 (App Router), TailwindCSS, Solana Wallet Adapter
- **Backend**: Next.js API routes
- **AI**: Free rule parser + Gemini API (optional)
- **Swaps**: Jupiter API (Metis v6)

## Project structure

```
vibetrade/
├── app/
│   ├── api/
│   │   ├── parse-intent/   # AI intent parsing
│   │   ├── quote/          # Jupiter quote
│   │   ├── swap/           # Build swap tx
│   │   └── token-balance/  # Get user token balance
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── Chat.tsx
│   ├── TradePreview.tsx
│   ├── WalletConnect.tsx
│   └── WalletProvider.tsx
├── lib/
│   ├── jupiter.ts
│   ├── parser.ts
│   ├── solana.ts
│   └── tokens.ts
└── README.md
```

## Safety

- Trades are **never** auto-executed
- User must confirm every swap in the preview card
- Parsed intents are validated before quotes
- Balance checks before execution
