import type { TradeExecutorDeps } from "../execution/tradeExecutor.js";
import { runTradeCycle } from "../execution/tradeExecutor.js";
import { logger } from "../utils/logger.js";
import { randomDelaySeconds } from "./randomStrategy.js";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/**
 * Owns the trade loop's cross-cycle state: MAX_TRADE_COUNT, the random
 * inter-trade delay (§11), and the wallet-health stop condition (§1.17).
 * A single cycle's decision logic lives in tradeExecutor.runTradeCycle.
 */
export async function runScheduler(
  deps: TradeExecutorDeps,
  tokenAddress: string,
  signal?: AbortSignal,
): Promise<void> {
  const { config, circuitBreaker, walletManager, walletId } = deps;
  let tradeCount = 0;

  for (;;) {
    if (signal?.aborted) {
      logger.info({ walletId }, "Scheduler stopped (abort requested)");
      return;
    }

    if (circuitBreaker.isTripped()) {
      const state = circuitBreaker.getState();
      logger.error(
        { walletId, reason: state.reason, message: state.message },
        "[CIRCUIT BREAKER] Trading paused. Manual restart required.",
      );
      return;
    }

    if (config.maxTradeCount > 0 && tradeCount >= config.maxTradeCount) {
      logger.info({ walletId, tradeCount, maxTradeCount: config.maxTradeCount }, "MAX_TRADE_COUNT reached, stopping.");
      return;
    }

    const result = await runTradeCycle(deps, tokenAddress);
    if (result.status === "SUCCESS" || result.status === "FAILED" || result.status === "DRY_RUN") {
      tradeCount++;
    }

    const bnbBalanceWei = await walletManager.getBnbBalance();
    if (bnbBalanceWei < config.minBnbBalanceWei) {
      logger.error(
        { walletId, bnbBalanceWei: bnbBalanceWei.toString(), minBnbBalanceWei: config.minBnbBalanceWei.toString() },
        "Wallet BNB balance is below MIN_BNB_BALANCE — stopping safely (§1.17).",
      );
      return;
    }

    if (circuitBreaker.isTripped()) continue; // report the trip on the next loop iteration

    const delaySeconds = randomDelaySeconds(config);
    console.log(`\n[${walletId}] Trade completed. Next action in ${delaySeconds} seconds.\n`);
    await sleep(delaySeconds * 1000, signal);
  }
}
