import { describe, expect, it } from "vitest";
import { chooseAction, randomDelaySeconds } from "../src/strategy/randomStrategy.js";
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
    minBuyBnbWei: 10n ** 15n,
    maxBuyBnbWei: 10n ** 16n,
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

describe("chooseAction", () => {
  it("only ever returns BUY or SELL", () => {
    const config = baseConfig();
    for (let i = 0; i < 200; i++) {
      expect(["BUY", "SELL"]).toContain(chooseAction(config));
    }
  });

  it("always returns BUY when SELL_WEIGHT is 0", () => {
    const config = baseConfig({ buyWeight: 100, sellWeight: 0 });
    for (let i = 0; i < 100; i++) {
      expect(chooseAction(config)).toBe("BUY");
    }
  });

  it("always returns SELL when BUY_WEIGHT is 0", () => {
    const config = baseConfig({ buyWeight: 0, sellWeight: 100 });
    for (let i = 0; i < 100; i++) {
      expect(chooseAction(config)).toBe("SELL");
    }
  });

  it("roughly matches configured weights over many samples", () => {
    const config = baseConfig({ buyWeight: 90, sellWeight: 10 });
    let buys = 0;
    const samples = 5000;
    for (let i = 0; i < samples; i++) {
      if (chooseAction(config) === "BUY") buys++;
    }
    const ratio = buys / samples;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(0.98);
  });
});

describe("randomDelaySeconds", () => {
  it("stays within [MIN_DELAY_SECONDS, MAX_DELAY_SECONDS]", () => {
    const config = baseConfig({ minDelaySeconds: 30, maxDelaySeconds: 300 });
    for (let i = 0; i < 500; i++) {
      const delay = randomDelaySeconds(config);
      expect(delay).toBeGreaterThanOrEqual(30);
      expect(delay).toBeLessThanOrEqual(300);
    }
  });

  it("returns the fixed value when min equals max", () => {
    const config = baseConfig({ minDelaySeconds: 60, maxDelaySeconds: 60 });
    expect(randomDelaySeconds(config)).toBe(60);
  });
});
