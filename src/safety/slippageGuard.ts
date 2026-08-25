const BPS_DENOMINATOR = 10000n;

/**
 * minAmountOut = expectedAmountOut * (10000 - slippageBps) / 10000
 * Pure bigint arithmetic — never floating point for on-chain amounts (§15).
 */
export function applySlippage(expectedAmountOut: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || slippageBps > 10000) {
    throw new RangeError(`slippageBps must be within [0, 10000], got ${slippageBps}`);
  }
  const bps = BigInt(Math.trunc(slippageBps));
  return (expectedAmountOut * (BPS_DENOMINATOR - bps)) / BPS_DENOMINATOR;
}
