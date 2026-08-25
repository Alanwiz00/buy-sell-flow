import { describe, expect, it } from "vitest";
import {
  calculateSellAmount,
  generateBuyAmountWei,
  generateSellPercentBps,
} from "../src/strategy/amountGenerator.js";
import type { Config } from "../src/config.js";

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    network: "bsc-testnet",
    chainId: 97,
    rpcUrl: "http://localhost",
    privateKeys: ["0x" + "1".repeat(64)],
    tradingMode: "flap",
    minDelaySeconds: 30,
    maxDelaySeconds: 300,
    minBuyBnbWei: 10n ** 15n, // 0.001
    maxBuyBnbWei: 10n ** 16n, // 0.01
    minSellPercent: 10,
    maxSellPercent: 40,
    buyWeight: 50,
    sellWeight: 50,
    slippageBps: 300,
    gasReserveBnbWei: 10n ** 16n,
    minBnbBalanceWei: 15n * 10n ** 15n,
    maxTradeCount: 0,
    maxSingleTradeBnbWei: 10n ** 16n,
    maxDailyBnbVolumeWei: 10n ** 17n,
    autoGasRefill: false,
    dryRun: true,
    ...overrides,
  };
}

describe("generateBuyAmountWei", () => {
  it("never goes below MIN_BUY_BNB", () => {
    const config = baseConfig();
    for (let i = 0; i < 500; i++) {
      expect(generateBuyAmountWei(config)).toBeGreaterThanOrEqual(config.minBuyBnbWei);
    }
  });

  it("never exceeds MAX_BUY_BNB", () => {
    const config = baseConfig();
    for (let i = 0; i < 500; i++) {
      expect(generateBuyAmountWei(config)).toBeLessThanOrEqual(config.maxBuyBnbWei);
    }
  });

  it("returns the fixed amount when min equals max", () => {
    const config = baseConfig({ minBuyBnbWei: 10n ** 15n, maxBuyBnbWei: 10n ** 15n });
    expect(generateBuyAmountWei(config)).toBe(10n ** 15n);
  });
});

describe("generateSellPercentBps", () => {
  it("stays within [MIN_SELL_PERCENT, MAX_SELL_PERCENT] expressed in bps", () => {
    const config = baseConfig({ minSellPercent: 10, maxSellPercent: 40 });
    for (let i = 0; i < 500; i++) {
      const bps = generateSellPercentBps(config);
      expect(bps).toBeGreaterThanOrEqual(1000);
      expect(bps).toBeLessThanOrEqual(4000);
    }
  });
});

describe("calculateSellAmount", () => {
  it("computes exact bigint token amounts with no floating point", () => {
    // 10,000 TOKEN (18 decimals) at 27.00% (2700 bps) -> 2,700 TOKEN
    const balance = 10_000n * 10n ** 18n;
    expect(calculateSellAmount(balance, 2700)).toBe(2_700n * 10n ** 18n);
  });

  it("never exceeds the token balance for bps <= 10000", () => {
    const balance = 12_345n * 10n ** 18n;
    for (const bps of [0, 1, 100, 4000, 9999, 10000]) {
      expect(calculateSellAmount(balance, bps)).toBeLessThanOrEqual(balance);
    }
  });

  it("returns 0 for 0 bps and the full balance for 10000 bps", () => {
    const balance = 777n * 10n ** 18n;
    expect(calculateSellAmount(balance, 0)).toBe(0n);
    expect(calculateSellAmount(balance, 10000)).toBe(balance);
  });
});
