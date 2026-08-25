/**
 * Mirrors the Flap Portal's `TokenStatus` enum order exactly
 * (docs.flap.sh/flap/developers/wallet-and-terminal-and-bot-developers/inspect-a-token,
 * fetched 2026-08-24). Order matters: these are decoded from a raw uint8.
 */
export enum TokenStatus {
  Invalid = 0,
  Tradable = 1,
  InDuel = 2,
  Killed = 3,
  DEX = 4,
  Staged = 5,
}

export interface FlapTokenState {
  status: TokenStatus;
  reserve: bigint;
  circulatingSupply: bigint;
  price: bigint;
  tokenVersion: number;
  r: bigint;
  h: bigint;
  k: bigint;
  dexSupplyThresh: bigint;
  quoteTokenAddress: string;
  nativeToQuoteSwapEnabled: boolean;
  buyTaxRate: bigint;
  sellTaxRate: bigint;
  pool: string;
  progress: bigint;
  dexId: number;
}

/**
 * A token is only safe to trade through the bonding curve while status is
 * Tradable. Everything else (not yet created, mid-duel, killed, already
 * migrated to a DEX pool, or staged) must be skipped rather than blindly
 * sent as a transaction.
 */
export function isBondingCurveTradable(state: FlapTokenState): boolean {
  return state.status === TokenStatus.Tradable;
}

export function describeStatus(status: TokenStatus): string {
  return TokenStatus[status] ?? `UNKNOWN(${status})`;
}
