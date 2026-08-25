import type { TransactionResponse, Wallet } from "ethers";
import type { Config } from "../config.js";

/** DEX-agnostic view of a token's tradability, used by the strategy engine. */
export interface TokenState {
  tradable: boolean;
  reason?: string;
  priceWei: bigint;
  quoteTokenAddress: string;
}

export interface TradeQuote {
  amountIn: bigint;
  expectedAmountOut: bigint;
  minimumAmountOut: bigint;
}

export interface TradeOptions {
  slippageBps: number;
  gasLimit?: bigint;
  maxFeePerGasWei?: bigint;
}

/**
 * A DEX-agnostic trading surface. The strategy/execution layers depend only
 * on this interface (§17) — FlapAdapter and PancakeAdapter are interchangeable
 * behind it, selected at startup via TRADING_MODE.
 */
export interface DexAdapter {
  readonly name: string;
  getTokenState(token: string): Promise<TokenState>;
  previewBuy(token: string, amountInWei: bigint): Promise<TradeQuote>;
  previewSell(token: string, amountIn: bigint): Promise<TradeQuote>;
  /** Gas estimate for the exact BUY calldata, so the gas-reserve check (§8) runs before sending. */
  estimateBuyGas(token: string, amountInWei: bigint, minimumAmountOut: bigint): Promise<bigint>;
  estimateSellGas(token: string, amountIn: bigint, minimumAmountOut: bigint): Promise<bigint>;
  buy(token: string, amountInWei: bigint, options: TradeOptions): Promise<TransactionResponse>;
  sell(token: string, amountIn: bigint, options: TradeOptions): Promise<TransactionResponse>;
}

/** Selects FlapAdapter or PancakeAdapter per TRADING_MODE (§17) — the only place that imports both. */
export async function createDexAdapter(config: Config, wallet: Wallet): Promise<DexAdapter> {
  if (config.tradingMode === "pancake") {
    if (!config.pancakeRouterAddress) {
      throw new Error("PANCAKE_ROUTER_ADDRESS is required when TRADING_MODE=pancake");
    }
    const { PancakeAdapter } = await import("../pancake/pancakeClient.js");
    return new PancakeAdapter(config.pancakeRouterAddress, wallet, config.slippageBps);
  }

  if (!config.flapPortalAddress) {
    throw new Error("FLAP_PORTAL_ADDRESS is required when TRADING_MODE=flap");
  }
  const { FlapAdapter } = await import("../flap/flapClient.js");
  return new FlapAdapter(config.flapPortalAddress, wallet, config.slippageBps);
}
