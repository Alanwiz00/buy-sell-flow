import { describe, expect, it } from "vitest";
import { checkBuyBalance, checkSellBalance, clampSellAmount } from "../src/safety/balanceGuard.js";

describe("checkBuyBalance", () => {
  it("rejects BUY with insufficient BNB", () => {
    const result = checkBuyBalance(10n, 20n, 1n);
    expect(result.ok).toBe(false);
  });

  it("allows BUY when balance covers amount + gas", () => {
    const result = checkBuyBalance(100n, 20n, 1n);
    expect(result.ok).toBe(true);
  });

  it("rejects a zero or negative BUY amount", () => {
    expect(checkBuyBalance(100n, 0n, 1n).ok).toBe(false);
  });
});

describe("checkSellBalance", () => {
  it("rejects SELL with zero token balance", () => {
    const result = checkSellBalance(0n, 10n);
    expect(result.ok).toBe(false);
  });

  it("rejects a SELL amount exceeding the token balance", () => {
    const result = checkSellBalance(100n, 101n);
    expect(result.ok).toBe(false);
  });

  it("allows a SELL within the token balance", () => {
    const result = checkSellBalance(100n, 50n);
    expect(result.ok).toBe(true);
  });
});

describe("clampSellAmount", () => {
  it("never exceeds the wallet token balance", () => {
    expect(clampSellAmount(100n, 150n)).toBe(100n);
  });

  it("passes through amounts already within balance", () => {
    expect(clampSellAmount(100n, 50n)).toBe(50n);
  });
});
