import type { Config } from "../config.js";
import { randomBigIntInRange, randomIntInRange } from "../utils/random.js";

/** Random BUY amount in wei, within [MIN_BUY_BNB, MAX_BUY_BNB] (§12). Bigint only. */
export function generateBuyAmountWei(config: Config): bigint {
  return randomBigIntInRange(config.minBuyBnbWei, config.maxBuyBnbWei);
}

/**
 * Random SELL percentage as basis points (1% = 100 bps), within
 * [MIN_SELL_PERCENT, MAX_SELL_PERCENT] (§13). Basis points let the config
 * carry fractional percentages (e.g. 12.5%) without floating-point token math.
 */
export function generateSellPercentBps(config: Config): number {
  const minBps = Math.round(config.minSellPercent * 100);
  const maxBps = Math.round(config.maxSellPercent * 100);
  return randomIntInRange(minBps, maxBps);
}

/** tokenBalance * percentBps / 10000, entirely in bigint (§13). */
export function calculateSellAmount(tokenBalance: bigint, percentBps: number): bigint {
  return (tokenBalance * BigInt(percentBps)) / 10000n;
}
