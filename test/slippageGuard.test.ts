import { describe, expect, it } from "vitest";
import { applySlippage } from "../src/safety/slippageGuard.js";

describe("applySlippage", () => {
  it("computes minimum output for a given expected output", () => {
    // 1000 expected, 300 bps (3%) slippage -> 970 minimum
    expect(applySlippage(1000n, 300)).toBe(970n);
  });

  it("returns the full expected output at 0 bps slippage", () => {
    expect(applySlippage(1000n, 0)).toBe(1000n);
  });

  it("returns 0 at 10000 bps (100%) slippage", () => {
    expect(applySlippage(1000n, 10000)).toBe(0n);
  });

  it("produces a smaller minimum output for higher slippage settings", () => {
    const tight = applySlippage(1_000_000n, 50);
    const loose = applySlippage(1_000_000n, 500);
    expect(loose).toBeLessThan(tight);
  });

  it("rejects out-of-range bps", () => {
    expect(() => applySlippage(1000n, -1)).toThrow();
    expect(() => applySlippage(1000n, 10001)).toThrow();
  });
});
