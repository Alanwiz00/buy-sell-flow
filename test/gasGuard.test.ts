import { describe, expect, it } from "vitest";
import {
  computeMaxSpendableWei,
  decideBuyAmount,
  willPreserveGasReserve,
} from "../src/safety/gasGuard.js";

describe("computeMaxSpendableWei", () => {
  it("subtracts gas reserve and estimated gas cost from balance", () => {
    const result = computeMaxSpendableWei({
      walletBalanceWei: 100n,
      gasReserveWei: 20n,
      estimatedGasCostWei: 5n,
    });
    expect(result).toBe(75n);
  });

  it("clamps to 0 rather than going negative", () => {
    const result = computeMaxSpendableWei({
      walletBalanceWei: 10n,
      gasReserveWei: 20n,
      estimatedGasCostWei: 5n,
    });
    expect(result).toBe(0n);
  });
});

describe("decideBuyAmount", () => {
  const input = { walletBalanceWei: 100n, gasReserveWei: 20n, estimatedGasCostWei: 5n };

  it("proceeds when the requested amount fits within the reserve (trade allowed when reserve remains)", () => {
    const decision = decideBuyAmount(50n, input, true, 1n);
    expect(decision).toEqual({ action: "proceed", amountWei: 50n });
  });

  it("rejects a trade that would violate the reserve when reduceInsteadOfSkip is false", () => {
    const decision = decideBuyAmount(1000n, input, false, 1n);
    expect(decision.action).toBe("skip");
  });

  it("reduces to the max spendable amount when reduceInsteadOfSkip is true", () => {
    const decision = decideBuyAmount(1000n, input, true, 1n);
    expect(decision).toEqual({ action: "reduce", amountWei: 75n });
  });

  it("skips when the reserve already consumes the whole balance", () => {
    const decision = decideBuyAmount(10n, { walletBalanceWei: 20n, gasReserveWei: 20n, estimatedGasCostWei: 5n }, true, 1n);
    expect(decision.action).toBe("skip");
  });

  it("skips a reduced amount that would be dust", () => {
    const decision = decideBuyAmount(1000n, input, true, 100n);
    expect(decision.action).toBe("skip");
  });
});

describe("willPreserveGasReserve", () => {
  it("returns true when remaining balance stays at/above the reserve", () => {
    expect(willPreserveGasReserve(100n, 50n, 5n, 20n)).toBe(true);
    expect(willPreserveGasReserve(100n, 75n, 5n, 20n)).toBe(true);
  });

  it("returns false when a transaction would violate the reserve", () => {
    expect(willPreserveGasReserve(100n, 76n, 5n, 20n)).toBe(false);
  });
});
