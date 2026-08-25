import type { Provider } from "ethers";
import { checkGasCeiling } from "../chain/gas.js";
import type { GasManager } from "../chain/gas.js";
import type { Config } from "../config.js";
import { generateBuyAmountWei, calculateSellAmount, generateSellPercentBps } from "../strategy/amountGenerator.js";
import { chooseAction, type TradeAction } from "../strategy/randomStrategy.js";
import { checkBuyBalance, checkSellBalance, clampSellAmount } from "../safety/balanceGuard.js";
import type { CircuitBreaker } from "../safety/circuitBreaker.js";
import { decideBuyAmount, willPreserveGasReserve } from "../safety/gasGuard.js";
import type { WalletManager } from "../wallets/walletManager.js";
import { logger } from "../utils/logger.js";
import { formatBnb } from "../utils/formatting.js";
import type { DexAdapter } from "./dexAdapter.js";
import { classifyError } from "./retry.js";
import {
  recordTrade,
  sendAndConfirm,
  TransactionConfirmationError,
  TransactionRevertedError,
  type TradeLogEntry,
} from "./transactionManager.js";

export interface TradeExecutorDeps {
  walletId: string;
  adapter: DexAdapter;
  walletManager: WalletManager;
  provider: Provider;
  config: Config;
  circuitBreaker: CircuitBreaker;
  gasManager: GasManager;
}

export type TradeCycleStatus = "SUCCESS" | "FAILED" | "SKIPPED" | "DRY_RUN";

export interface TradeCycleResult {
  action: TradeAction;
  status: TradeCycleStatus;
  reason?: string;
  txHash?: string;
  amountIn?: bigint;
  expectedAmountOut?: bigint;
  minimumAmountOut?: bigint;
}

function skip(action: TradeAction, reason: string): TradeCycleResult {
  logger.info({ action, reason }, "Trade cycle skipped");
  return { action, status: "SKIPPED", reason };
}

/**
 * Runs exactly one WAIT→...→LOG trade cycle (§25). The caller (scheduler)
 * owns the WAIT-AGAIN delay and the MAX_TRADE_COUNT loop.
 */
export async function runTradeCycle(
  deps: TradeExecutorDeps,
  tokenAddress: string,
  forcedAction?: TradeAction,
): Promise<TradeCycleResult> {
  const { adapter, walletManager, provider, config, circuitBreaker, gasManager } = deps;

  if (circuitBreaker.isTripped()) {
    return skip("BUY", `circuit breaker tripped: ${circuitBreaker.getState().message ?? circuitBreaker.getState().reason}`);
  }

  // forcedAction lets scripts/test-trade.ts (§ Milestones 5-6) request a specific
  // one-off BUY or SELL through this same guarded pipeline; the scheduler leaves
  // it undefined so the action is chosen randomly (§10) on every cycle.
  const action = forcedAction ?? chooseAction(config);

  // TOKEN STATE CHECK — never blindly send a transaction against an untradable token (§14).
  const tokenState = await adapter.getTokenState(tokenAddress);
  if (!tokenState.tradable) {
    return skip(action, tokenState.reason ?? "token not tradable");
  }

  return action === "BUY"
    ? runBuyCycle(deps, tokenAddress)
    : runSellCycle(deps, tokenAddress, forcedAction === undefined);

  async function runBuyCycle(deps: TradeExecutorDeps, tokenAddress: string): Promise<TradeCycleResult> {
    const walletState = await walletManager.getState();

    // GENERATE AMOUNT, clamped by the hard MAX_SINGLE_TRADE_BNB ceiling (§30).
    const requestedAmountWei = generateBuyAmountWei(config);
    const cappedAmountWei =
      requestedAmountWei > config.maxSingleTradeBnbWei ? config.maxSingleTradeBnbWei : requestedAmountWei;

    const balanceCheck = checkBuyBalance(walletState.bnbBalanceWei, cappedAmountWei, config.gasReserveBnbWei);
    if (!balanceCheck.ok) {
      return skip("BUY", balanceCheck.reason);
    }

    // PREVIEW + SLIPPAGE CHECK
    const quote = await adapter.previewBuy(tokenAddress, cappedAmountWei);
    if (quote.expectedAmountOut <= 0n) {
      return skip("BUY", "preview returned zero expected output");
    }

    // GAS ESTIMATION
    const gasLimit = await adapter.estimateBuyGas(tokenAddress, cappedAmountWei, quote.minimumAmountOut);
    const gasCeiling = await checkGasCeiling(provider, gasLimit, config.maxGasPriceWei, config.maxGasCostBnbWei);
    if (!gasCeiling.ok) {
      return skip("BUY", gasCeiling.reason ?? "gas ceiling exceeded");
    }

    // GAS RESERVE CHECK — reduce or skip a BUY that would eat into the reserve (§8).
    const decision = decideBuyAmount(
      cappedAmountWei,
      {
        walletBalanceWei: walletState.bnbBalanceWei,
        gasReserveWei: config.gasReserveBnbWei,
        estimatedGasCostWei: gasCeiling.estimatedCostWei,
      },
      true,
      config.minBuyBnbWei / 10n,
    );
    if (decision.action === "skip") {
      return skip("BUY", decision.reason);
    }
    const amountWei = decision.amountWei;
    const finalQuote = amountWei === cappedAmountWei ? quote : await adapter.previewBuy(tokenAddress, amountWei);

    if (!(await gasManager.hasEnoughGas(walletState.address, gasCeiling.estimatedCostWei))) {
      circuitBreaker.trip("gas_reserve_violated", "wallet balance would fall below the configured gas reserve");
      return skip("BUY", "gas reserve would be violated");
    }

    return executeOrDryRun(deps, {
      action: "BUY",
      tokenAddress,
      amountIn: amountWei,
      expectedAmountOut: finalQuote.expectedAmountOut,
      minimumAmountOut: finalQuote.minimumAmountOut,
      gasLimit,
      send: () => adapter.buy(tokenAddress, amountWei, { slippageBps: config.slippageBps }),
    });
  }

  async function runSellCycle(
    deps: TradeExecutorDeps,
    tokenAddress: string,
    allowBuyFallback: boolean,
  ): Promise<TradeCycleResult> {
    const walletState = await walletManager.getState(tokenAddress);
    const tokenBalance = walletState.tokenBalance ?? 0n;

    if (tokenBalance <= 0n) {
      if (allowBuyFallback) {
        // SELL was randomly chosen (§10) but there's nothing to sell yet — buy
        // instead of wasting the cycle, so the wallet builds a position to sell
        // later rather than repeatedly skipping. A --action=sell forced by
        // scripts/test-trade.ts is never silently swapped for a BUY (allowBuyFallback=false).
        logger.info({ walletId: deps.walletId }, "SELL chosen but token balance is zero — buying instead this cycle");
        return runBuyCycle(deps, tokenAddress);
      }
      return skip("SELL", "token balance is zero");
    }

    // GENERATE AMOUNT — random % of balance, clamped to never exceed it (§13, §16).
    const percentBps = generateSellPercentBps(config);
    const requestedAmount = clampSellAmount(tokenBalance, calculateSellAmount(tokenBalance, percentBps));

    const balanceCheck = checkSellBalance(tokenBalance, requestedAmount);
    if (!balanceCheck.ok) {
      return skip("SELL", balanceCheck.reason);
    }

    // PREVIEW + SLIPPAGE CHECK
    const quote = await adapter.previewSell(tokenAddress, requestedAmount);
    if (quote.expectedAmountOut <= 0n) {
      return skip("SELL", "preview returned zero expected output");
    }

    // GAS ESTIMATION (this may also send an approve() tx if allowance is insufficient)
    const gasLimit = await adapter.estimateSellGas(tokenAddress, requestedAmount, quote.minimumAmountOut);
    const gasCeiling = await checkGasCeiling(provider, gasLimit, config.maxGasPriceWei, config.maxGasCostBnbWei);
    if (!gasCeiling.ok) {
      return skip("SELL", gasCeiling.reason ?? "gas ceiling exceeded");
    }

    // GAS RESERVE CHECK — a SELL spends no BNB principal, but still burns gas (§8).
    const bnbBalanceWei = await walletManager.getBnbBalance();
    if (!willPreserveGasReserve(bnbBalanceWei, 0n, gasCeiling.estimatedCostWei, config.gasReserveBnbWei)) {
      circuitBreaker.trip("gas_reserve_violated", "wallet balance would fall below the configured gas reserve");
      return skip("SELL", "gas reserve would be violated by the SELL's gas cost");
    }

    return executeOrDryRun(deps, {
      action: "SELL",
      tokenAddress,
      amountIn: requestedAmount,
      expectedAmountOut: quote.expectedAmountOut,
      minimumAmountOut: quote.minimumAmountOut,
      gasLimit,
      send: () => adapter.sell(tokenAddress, requestedAmount, { slippageBps: config.slippageBps }),
    });
  }
}

interface ExecuteParams {
  action: TradeAction;
  tokenAddress: string;
  amountIn: bigint;
  expectedAmountOut: bigint;
  minimumAmountOut: bigint;
  gasLimit: bigint;
  send: () => ReturnType<DexAdapter["buy"]>;
}

async function executeOrDryRun(deps: TradeExecutorDeps, params: ExecuteParams): Promise<TradeCycleResult> {
  const { adapter, walletManager, provider, config, circuitBreaker, walletId } = deps;
  const baseLog: Omit<TradeLogEntry, "status" | "txHash" | "error" | "gasPrice"> = {
    timestamp: new Date().toISOString(),
    walletId,
    wallet: walletManager.getAddress(),
    chainId: config.chainId,
    dex: adapter.name as "FLAP" | "PANCAKE",
    token: params.tokenAddress,
    action: params.action,
    amountIn: params.amountIn.toString(),
    expectedAmountOut: params.expectedAmountOut.toString(),
    minimumAmountOut: params.minimumAmountOut.toString(),
    gasLimit: params.gasLimit.toString(),
  };

  if (config.dryRun) {
    const amountLine =
      params.action === "BUY"
        ? `${formatBnb(params.amountIn)} BNB`
        : `${params.amountIn.toString()} token units (raw, pre-decimals)`;
    console.log(
      [
        "",
        "[DRY RUN]",
        "",
        `Action: ${params.action}`,
        `Amount: ${amountLine}`,
        "",
        "Preview:",
        `Expected output: ${params.expectedAmountOut.toString()}`,
        `Minimum output:  ${params.minimumAmountOut.toString()}`,
        "",
        `Estimated gas: ${params.gasLimit.toString()} units`,
        "",
        "Would execute: YES",
        "",
      ].join("\n"),
    );
    recordTrade({ ...baseLog, status: "DRY_RUN" });
    return {
      action: params.action,
      status: "DRY_RUN",
      amountIn: params.amountIn,
      expectedAmountOut: params.expectedAmountOut,
      minimumAmountOut: params.minimumAmountOut,
    };
  }

  try {
    // Never wrap the send operation in a generic retry. Once a transaction may
    // have been broadcast, retrying can create a duplicate trade merely because
    // receipt polling failed on the RPC endpoint.
    const { tx, receipt } = await sendAndConfirm(params.send, provider);

    circuitBreaker.recordSuccess();
    recordTrade({
      ...baseLog,
      gasPrice: receipt.gasPrice?.toString(),
      txHash: tx.hash,
      status: "SUCCESS",
    });
    return {
      action: params.action,
      status: "SUCCESS",
      txHash: tx.hash,
      amountIn: params.amountIn,
      expectedAmountOut: params.expectedAmountOut,
      minimumAmountOut: params.minimumAmountOut,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const txHash =
      error instanceof TransactionRevertedError || error instanceof TransactionConfirmationError
        ? error.txHash
        : undefined;

    if (classifyError(error) === "retryable") {
      circuitBreaker.trip("rpc_unreliable", `repeated retryable failures: ${message}`);
    } else {
      circuitBreaker.recordFailure();
    }

    recordTrade({ ...baseLog, txHash, status: "FAILED", error: message });
    logger.error({ err: error, action: params.action, token: params.tokenAddress }, "Trade failed");
    return { action: params.action, status: "FAILED", reason: message, txHash };
  }
}
