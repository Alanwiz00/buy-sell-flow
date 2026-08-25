/**
 * Gas-reserve enforcement (§8). The bot must never spend its gas reserve:
 *
 *   maxSpendable = walletBalance - gasReserve - estimatedGasCost
 *
 * and must never let post-trade balance fall below the reserve.
 */

export interface MaxSpendableInput {
  walletBalanceWei: bigint;
  gasReserveWei: bigint;
  estimatedGasCostWei: bigint;
}

/** Never negative — clamps to 0 when the reserve already consumes the balance. */
export function computeMaxSpendableWei(input: MaxSpendableInput): bigint {
  const spendable = input.walletBalanceWei - input.gasReserveWei - input.estimatedGasCostWei;
  return spendable > 0n ? spendable : 0n;
}

export type BuyAmountDecision =
  | { action: "proceed"; amountWei: bigint }
  | { action: "reduce"; amountWei: bigint }
  | { action: "skip"; reason: string };

/**
 * A requested BUY that exceeds the spendable amount is reduced to fit, or
 * skipped if reducing it would leave nothing tradeable — per §8's "reduce
 * trade amount or skip trade" and never spend the gas reserve.
 */
export function decideBuyAmount(
  requestedAmountWei: bigint,
  input: MaxSpendableInput,
  reduceInsteadOfSkip: boolean,
  dustThresholdWei: bigint,
): BuyAmountDecision {
  const maxSpendableWei = computeMaxSpendableWei(input);

  if (maxSpendableWei <= 0n) {
    return { action: "skip", reason: "no BNB spendable above gas reserve" };
  }
  if (requestedAmountWei <= maxSpendableWei) {
    return { action: "proceed", amountWei: requestedAmountWei };
  }
  if (!reduceInsteadOfSkip) {
    return { action: "skip", reason: "requested BUY exceeds spendable amount above gas reserve" };
  }
  if (maxSpendableWei < dustThresholdWei) {
    return { action: "skip", reason: "reduced BUY amount would be dust" };
  }
  return { action: "reduce", amountWei: maxSpendableWei };
}

/** Never allow post-transaction balance to fall below the gas reserve (§8). */
export function willPreserveGasReserve(
  walletBalanceWei: bigint,
  amountSpentWei: bigint,
  gasCostWei: bigint,
  gasReserveWei: bigint,
): boolean {
  const remaining = walletBalanceWei - amountSpentWei - gasCostWei;
  return remaining >= gasReserveWei;
}
