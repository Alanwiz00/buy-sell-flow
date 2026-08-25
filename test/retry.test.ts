import { describe, expect, it, vi } from "vitest";
import { classifyError, withRetry } from "../src/execution/retry.js";

describe("classifyError", () => {
  it("classifies RPC timeouts and rate limits as retryable", () => {
    expect(classifyError(new Error("RPC request timeout"))).toBe("retryable");
    expect(classifyError(new Error("429 Too Many Requests: rate limit exceeded"))).toBe("retryable");
    expect(classifyError(new Error("connect ECONNRESET"))).toBe("retryable");
  });

  it("classifies insufficient funds, slippage, and reverts as non-retryable", () => {
    expect(classifyError(new Error("insufficient funds for gas"))).toBe("non-retryable");
    expect(classifyError(new Error("slippage exceeded"))).toBe("non-retryable");
    expect(classifyError(new Error("execution reverted: INSUFFICIENT_OUTPUT_AMOUNT"))).toBe("non-retryable");
  });

  it("defaults unknown errors to non-retryable", () => {
    expect(classifyError(new Error("something completely unrecognized happened"))).toBe("non-retryable");
    expect(classifyError("a plain string error")).toBe("non-retryable");
  });
});

describe("withRetry", () => {
  it("returns the result immediately on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries retryable errors up to maxRetries, then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("RPC timeout"))
      .mockRejectedValueOnce(new Error("RPC timeout"))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on a non-retryable error without retrying", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("execution reverted"));
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toThrow("execution reverted");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting maxRetries on persistent retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("RPC timeout"));
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })).rejects.toThrow("RPC timeout");
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});
