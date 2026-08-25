/**
 * Failure classification and retry policy (§19). Unknown errors default to
 * non-retryable: blindly retrying a transaction whose failure mode we don't
 * recognize risks double-submission, which is worse than stopping.
 */
export type FailureClass = "retryable" | "non-retryable";

const RETRYABLE_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /rate limit/i,
  /too many requests/i,
  /SERVER_ERROR/i,
  /NETWORK_ERROR/i,
  /temporarily unavailable/i,
  /-32603/, // generic JSON-RPC internal error, commonly transient on public RPCs
];

const NON_RETRYABLE_PATTERNS = [
  /insufficient funds/i,
  /insufficient .*balance/i,
  /slippage/i,
  /INSUFFICIENT_OUTPUT_AMOUNT/i,
  /not tradable/i,
  /execution reverted/i,
  /invalid token/i,
  /CALL_EXCEPTION/,
  /nonce/i,
];

export function classifyError(error: unknown): FailureClass {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);

  if (NON_RETRYABLE_PATTERNS.some((pattern) => pattern.test(message))) {
    return "non-retryable";
  }
  if (RETRYABLE_PATTERNS.some((pattern) => pattern.test(message))) {
    return "retryable";
  }
  return "non-retryable";
}

export interface RetryOptions {
  /** Maximum retry attempts after the first try (§19: "maximum 2-3 retries"). */
  maxRetries?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxRetries;
      if (classifyError(error) !== "retryable" || isLastAttempt) {
        throw error;
      }
      const delayMs = baseDelayMs * 2 ** attempt;
      options.onRetry?.(attempt + 1, error, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
