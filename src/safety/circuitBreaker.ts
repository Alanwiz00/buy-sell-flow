import { logger } from "../utils/logger.js";

export type CircuitBreakerReason =
  | "consecutive_failures"
  | "gas_reserve_violated"
  | "rpc_unreliable"
  | "unexpected_contract_state";

export interface CircuitBreakerState {
  tripped: boolean;
  reason?: CircuitBreakerReason;
  message?: string;
  consecutiveFailures: number;
}

/**
 * Safety circuit breaker (§20). Trips (and stays tripped until manually
 * reset) after 3 consecutive failed transactions, or immediately when the
 * executor observes a gas-reserve violation, unreliable RPC, or unexpected
 * contract state.
 */
export class CircuitBreaker {
  private consecutiveFailures = 0;
  private tripped = false;
  private reason?: CircuitBreakerReason;
  private message?: string;

  constructor(private readonly maxConsecutiveFailures = 3) {}

  /** A successful transaction resets the consecutive-failure count. */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  recordFailure(): CircuitBreakerState {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.maxConsecutiveFailures && !this.tripped) {
      this.trip("consecutive_failures", `${this.consecutiveFailures} consecutive transaction failures.`);
    }
    return this.getState();
  }

  trip(reason: CircuitBreakerReason, message: string): void {
    this.tripped = true;
    this.reason = reason;
    this.message = message;
    logger.error({ reason, message }, "[CIRCUIT BREAKER] Trading paused. Manual restart required.");
  }

  isTripped(): boolean {
    return this.tripped;
  }

  reset(): void {
    this.tripped = false;
    this.reason = undefined;
    this.message = undefined;
    this.consecutiveFailures = 0;
  }

  getState(): CircuitBreakerState {
    return {
      tripped: this.tripped,
      reason: this.reason,
      message: this.message,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}
