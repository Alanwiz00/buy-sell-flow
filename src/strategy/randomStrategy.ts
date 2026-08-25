import type { Config } from "../config.js";
import { randomIntInRange, weightedPick } from "../utils/random.js";

export type TradeAction = "BUY" | "SELL";

/**
 * Weighted BUY/SELL pick from BUY_WEIGHT/SELL_WEIGHT (§10). Weights only
 * bias the odds — they never guarantee an exact split.
 */
export function chooseAction(config: Config): TradeAction {
  return weightedPick("BUY", config.buyWeight, "SELL", config.sellWeight);
}

/** Unbiased random delay in [MIN_DELAY_SECONDS, MAX_DELAY_SECONDS] (§11). */
export function randomDelaySeconds(config: Config): number {
  return randomIntInRange(config.minDelaySeconds, config.maxDelaySeconds);
}
