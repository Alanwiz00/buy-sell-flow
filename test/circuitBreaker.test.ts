import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "../src/safety/circuitBreaker.js";

describe("CircuitBreaker", () => {
  it("trips after three consecutive failures", () => {
    const breaker = new CircuitBreaker(3);
    breaker.recordFailure();
    expect(breaker.isTripped()).toBe(false);
    breaker.recordFailure();
    expect(breaker.isTripped()).toBe(false);
    breaker.recordFailure();
    expect(breaker.isTripped()).toBe(true);
    expect(breaker.getState().reason).toBe("consecutive_failures");
  });

  it("resets the failure count after a success", () => {
    const breaker = new CircuitBreaker(3);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    expect(breaker.getState().consecutiveFailures).toBe(0);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isTripped()).toBe(false);
  });

  it("can be tripped directly for non-failure-count reasons", () => {
    const breaker = new CircuitBreaker(3);
    breaker.trip("gas_reserve_violated", "wallet fell below gas reserve");
    expect(breaker.isTripped()).toBe(true);
    expect(breaker.getState().reason).toBe("gas_reserve_violated");
  });

  it("stays tripped until reset() is called", () => {
    const breaker = new CircuitBreaker(1);
    breaker.recordFailure();
    expect(breaker.isTripped()).toBe(true);
    breaker.reset();
    expect(breaker.isTripped()).toBe(false);
    expect(breaker.getState().consecutiveFailures).toBe(0);
  });
});
