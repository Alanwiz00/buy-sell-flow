# Flap Random Trading Bot

Experimental **BNB Testnet** trading bot. Randomly buys and sells a token through
the [Flap](https://flap.sh) bonding curve (default) or PancakeSwap, with layered
safety guards. Testnet only — mainnet trading is not implemented.

## Setup

```bash
npm install
cp .env.example .env
# edit .env: set PRIVATE_KEY (never commit it) and FLAP_TOKEN_ADDRESS
npm run wallet:check
```

`.env` is git-ignored. `PRIVATE_KEY` must be one or more funded BNB Testnet
wallets you control (comma-separated — see [Multi-wallet](#multi-wallet)
below) — get testnet BNB from a BNB Chain faucet. `FLAP_PORTAL_ADDRESS` and
`PANCAKE_ROUTER_ADDRESS` already default to real, on-chain-verified BNB
Testnet deployments (see [Contract sources](#contract-sources) below) — you
only need to set `FLAP_TOKEN_ADDRESS` (or its alias `TOKEN_ADDRESS`) to the
token you want to trade.

## Commands

| Command | Purpose |
|---|---|
| `npm run wallet:check` | Show network + every configured wallet's address, BNB/token balance, gas reserve, max spendable BNB |
| `npm run token:inspect` | Show the configured token's live bonding-curve state (or PancakeSwap pair state) |
| `npm run trade:test -- --action=buy\|sell [--wallet=N] [--confirm]` | Exactly one forced BUY or SELL through the full guarded pipeline, on wallet `N` (1-indexed, default 1). Real execution needs `DRY_RUN=false` **and** `--confirm`. |
| `npm run stats [-- --json]` | Buy/sell counts, BNB volume, and gas spent, from `logs/trades.log`, broken down per wallet and totalled |
| `npm run dev` | Run the random scheduler (one independent loop per wallet) with live reload |
| `npm run build` / `npm start` | Compile and run the scheduler |
| `npm test` | Run the unit test suite (vitest) |

## Multi-wallet

Set `PRIVATE_KEY` to a comma-separated list to trade with several wallets at
once — each becomes `wallet-1`, `wallet-2`, ... in logs and `--wallet=N`.
Every wallet:

- gets its **own** `DexAdapter` instance (bound to its own signer),
- runs its **own** scheduler loop with independently-randomized delays and
  actions (they don't lock-step),
- has its **own** `CircuitBreaker` — one wallet tripping doesn't halt the
  others,
- trades the **same** configured token and shares the gas-reserve/slippage/
  operational-limit settings (per-wallet *balances* are still checked
  individually — the shared `GasManager` reads each wallet's real on-chain
  balance per call).

`src/wallets/walletPool.ts` builds the per-wallet contexts; `src/index.ts`
runs them concurrently via `Promise.all`.

## Safety model

- **`DRY_RUN=true` by default.** In dry-run, every cycle runs the full
  decision pipeline (balance check, token-state check, preview, slippage,
  gas estimate, gas-reserve check) and logs what it *would* do — no
  transaction is ever sent.
- **Gas reserve.** `GAS_RESERVE_BNB` is never spent. Before every BUY the bot
  computes `walletBalance - gasReserve - estimatedGasCost` and reduces or
  skips the trade if it doesn't fit; it never lets post-trade balance fall
  below the reserve (`src/safety/gasGuard.ts`).
- **Slippage.** `minimumAmountOut = expectedAmountOut * (10000 - SLIPPAGE_BPS) / 10000`,
  computed entirely in `bigint` (`src/safety/slippageGuard.ts`).
- **Circuit breaker.** Trading pauses (manual restart required) after 3
  consecutive failed transactions, or immediately if a transaction would
  violate the gas reserve or the RPC looks unreliable (`src/safety/circuitBreaker.ts`).
- **Operational limits.** `MAX_TRADE_COUNT` (0 = unlimited), `MAX_SINGLE_TRADE_BNB`,
  and `MIN_BNB_BALANCE` (the bot stops itself once the wallet drops below this).
- **No mainnet.** `CHAIN_ID` must be `97`; if the connected RPC reports any
  other chain, the bot refuses to start (`src/chain/provider.ts`).
- **Retries.** Only errors classified as transient (RPC timeouts, rate
  limits) are retried, with exponential backoff, up to 3 times. Reverts,
  insufficient funds, and slippage failures are never retried
  (`src/execution/retry.ts`).

## Architecture

```
src/
  config.ts            # env loading + validation, fails closed on any bad value
  chain/                # provider (network fail-closed), gas ceiling checks
  wallets/              # wallet loading, balances — never logs the private key
  flap/                 # Flap Portal client + BUY/SELL flows
  pancake/              # PancakeSwap V2 Router client + BUY/SELL flows
  execution/
    dexAdapter.ts       # DEX-agnostic interface both Flap/Pancake implement
    tradeExecutor.ts    # the full per-cycle lifecycle (§25): the strategy
                         # layer never talks to Flap/Pancake directly
    transactionManager.ts, retry.ts
  strategy/              # random action/amount/delay, the scheduler loop
  safety/                 # balance/gas/slippage guards, circuit breaker
```

`TRADING_MODE=flap|pancake` selects the adapter; strategy and execution code
is identical either way.

## Contract sources

Flap has no mainnet-vs-testnet documentation split for its trading
interface, so these were pulled from the live docs and cross-checked
on-chain against BNB Testnet (chain 97) on 2026-08-24:

- **Flap Portal** `0x5bEacaF7ABCbB3aB280e80D007FD31fcE26510e9` — from
  [docs.flap.sh/flap/developers/deployed-contract-addresses](https://docs.flap.sh/flap/developers/deployed-contract-addresses).
  Verified on-chain: contract bytecode present, and the `getTokenV8Safe(address)`
  selector is recognized by the deployed contract (confirmed via a raw
  `eth_call` — an unrecognized token address returns a custom-error revert
  echoing the queried address back, not a generic "no such function" failure).
  Trading interface is `getTokenV8Safe` / `quoteExactInput` / `swapExactInput`
  — **not** the `previewBuy`/`buy`/`previewSell`/`sell` names guessed in the
  original build spec; the real docs take precedence.
- **PancakeSwap Router (testnet)** `0xD99D1c33F9fC3444f8101754aBC46c52416550D1` —
  a widely-referenced community/testing BSC Testnet deployment (PancakeSwap
  has no official testnet product). Verified on-chain: `router.WETH()`
  returns `0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd`, matching the WBNB
  testnet address independently found via search — strong evidence this is a
  real, correctly-wired V2-style router, not a dead or fake contract.

Re-verify both on [testnet.bscscan.com](https://testnet.bscscan.com) before
relying on them for anything beyond small testnet amounts — Flap especially
may redeploy the Portal as the bonding-curve implementation evolves (their
own docs note the curve parameters "may update before launching on mainnet").

A real, currently-tradable Flap testnet token discovered by decoding live
`TokenCreated` Portal events (as of 2026-08-24): `0x587b106de49cA4cC9e66D7a49819bb9a03377777`.
Useful for exercising `token:inspect`/`trade:test` without creating your own
token, but it belongs to someone else and its bonding-curve state (or
existence) will change over time — don't assume it's still tradable.

**BSC Testnet USDT** `0x66E972502A34A625828C544a1914E8D8cc2A9dE5` — a
community-issued "Tether USD" test token (no official testnet Tether
deployment exists on any chain). Verified independently on-chain
2026-08-25: real bytecode, `name()`/`symbol()`/`decimals()` return `Tether
USD`/`USDT`/`18`, and a live PancakeSwap V2 pair against WBNB — confirmed
tradable both directions via `getAmountsOut` (buy then sell round-trips to
~99.6% of the original BNB, consistent with normal AMM fees/slippage, not a
broken or fake pair). Configured as the default token with
`TRADING_MODE=pancake` in this project's `.env`.

## Status against the build spec's Definition of Done

Code-complete and verified against **live** BNB Testnet data (real Portal/router
calls, not mocks) using a disposable, unfunded key generated for this session only:

- [x] BNB Testnet connection (fails closed on wrong chain)
- [x] Wallet loads securely (private key never logged)
- [x] Wallet balance readable
- [x] Flap token state inspectable (`token:inspect`, live-verified)
- [x] Flap BUY preview (`previewBuy`, live-verified against a real token)
- [x] Flap SELL preview (`previewSell`, live-verified)
- [x] Random strategy (unit-tested: action weighting, delay range)
- [x] Gas reserve enforced (unit-tested + live-verified via the circuit breaker)
- [x] Slippage enforced (unit-tested)
- [x] Dry-run (full pipeline live-verified end-to-end against real preview data)
- [x] Random scheduler (implemented; MAX_TRADE_COUNT, wallet-health stop)
- [x] Failed transactions handled (retry classification, non-blind resubmission)
- [x] Circuit breaker (unit-tested + live-tripped during verification)
- [x] Unit tests pass (46/46 — `npm test`)
- [x] PancakeSwap adapter implemented and live-verified — real BUY preview,
      gas estimate, and dry-run cycle run against real funded wallets and a
      real USDT/WBNB pair (see above)
- [x] Multi-wallet: 3 configured wallets each ran an independent scheduler
      loop concurrently in dry-run, confirmed via `npm run stats`

**Not done — require your explicit go-ahead to spend real (test) funds:**

- [ ] One real testnet BUY — set `DRY_RUN=false` in `.env`, then run
      `npm run trade:test -- --action=buy --wallet=N --confirm`
- [ ] One real testnet SELL — same, `--action=sell`, after the BUY

Never share your private key; put it directly in your own `.env` (git-ignored).
