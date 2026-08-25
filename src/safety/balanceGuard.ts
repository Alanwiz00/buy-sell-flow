export type BalanceCheck = { ok: true } | { ok: false; reason: string };

/** BUY is rejected outright if the wallet doesn't hold enough BNB to cover it plus gas. */
export function checkBuyBalance(
  walletBnbBalanceWei: bigint,
  requestedAmountWei: bigint,
  estimatedGasCostWei: bigint,
): BalanceCheck {
  if (requestedAmountWei <= 0n) {
    return { ok: false, reason: "BUY amount must be > 0" };
  }
  if (walletBnbBalanceWei < requestedAmountWei + estimatedGasCostWei) {
    return { ok: false, reason: "insufficient BNB balance for BUY + gas" };
  }
  return { ok: true };
}

/** SELL is rejected for a zero balance, and the amount is always clamped to the held balance. */
export function checkSellBalance(tokenBalance: bigint, requestedAmount: bigint): BalanceCheck {
  if (tokenBalance <= 0n) {
    return { ok: false, reason: "token balance is zero" };
  }
  if (requestedAmount <= 0n) {
    return { ok: false, reason: "SELL amount must be > 0" };
  }
  if (requestedAmount > tokenBalance) {
    return { ok: false, reason: "SELL amount exceeds wallet token balance" };
  }
  return { ok: true };
}

/** Clamp a requested SELL amount to never exceed the wallet's actual token balance (§13, §16). */
export function clampSellAmount(tokenBalance: bigint, requestedAmount: bigint): bigint {
  return requestedAmount > tokenBalance ? tokenBalance : requestedAmount;
}
