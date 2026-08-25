import type { Provider, TransactionReceipt, TransactionResponse } from "ethers";
import { logger, tradeLogger } from "../utils/logger.js";
import { formatBnb } from "../utils/formatting.js";

export class TransactionRevertedError extends Error {
  constructor(
    public readonly txHash: string,
    public readonly receipt: TransactionReceipt,
  ) {
    super(`Transaction ${txHash} reverted (execution reverted): status=${receipt.status}`);
    this.name = "TransactionRevertedError";
  }
}

export class TransactionConfirmationError extends Error {
  constructor(
    public readonly txHash: string,
    cause: unknown,
  ) {
    super(`Could not confirm transaction ${txHash}; it may already be mined. Do not resubmit it automatically.`, {
      cause,
    });
    this.name = "TransactionConfirmationError";
  }
}

const DEFAULT_CONFIRMATION_TIMEOUT_MS = 120_000;

/**
 * Sends a transaction and waits for its receipt (§18: send/wait/receipt/timeout).
 * On a wait timeout, checks the transaction's actual on-chain state before
 * giving up, rather than assuming failure and letting a caller resubmit
 * blindly (§19: "never repeatedly submit... because of uncertainty").
 */
export async function sendAndConfirm(
  send: () => Promise<TransactionResponse>,
  provider: Provider,
  timeoutMs: number = DEFAULT_CONFIRMATION_TIMEOUT_MS,
): Promise<{ tx: TransactionResponse; receipt: TransactionReceipt }> {
  const tx = await send();
  logger.info({ txHash: tx.hash }, "Transaction submitted, waiting for confirmation");

  let receipt: TransactionReceipt | null;
  try {
    receipt = await tx.wait(1, timeoutMs);
  } catch (waitError) {
    // Wait failed/timed out — check real chain state before concluding anything (§19).
    try {
      receipt = await provider.getTransactionReceipt(tx.hash);
    } catch (receiptError) {
      throw new TransactionConfirmationError(tx.hash, receiptError ?? waitError);
    }
  }

  if (!receipt) {
    throw new Error(`Transaction ${tx.hash} has no receipt after ${timeoutMs}ms (still pending on-chain)`);
  }
  if (receipt.status !== 1) {
    throw new TransactionRevertedError(tx.hash, receipt);
  }
  return { tx, receipt };
}

export interface TradeLogEntry {
  timestamp: string;
  walletId: string;
  wallet: string;
  chainId: number;
  dex: "FLAP" | "PANCAKE";
  token: string;
  action: "BUY" | "SELL";
  amountIn: string;
  expectedAmountOut: string;
  minimumAmountOut: string;
  gasLimit?: string;
  gasPrice?: string;
  txHash?: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED" | "DRY_RUN";
  error?: string;
}

/** Records the complete trade lifecycle (§18): machine-readable JSON to logs/trades.log, human-readable to the console. */
export function recordTrade(entry: TradeLogEntry): void {
  tradeLogger.info(entry);

  const gasCostLine =
    entry.gasLimit && entry.gasPrice
      ? formatBnb(BigInt(entry.gasLimit) * BigInt(entry.gasPrice))
      : undefined;

  logger.info(
    [
      `${entry.timestamp}`,
      `${entry.walletId}`,
      `${entry.action}`,
      `${entry.dex}`,
      `Token: ${entry.token}`,
      `Amount: ${entry.amountIn}`,
      `Expected: ${entry.expectedAmountOut}`,
      `Minimum: ${entry.minimumAmountOut}`,
      gasCostLine ? `Gas: ${gasCostLine} BNB` : undefined,
      entry.txHash ? `TX: ${entry.txHash}` : undefined,
      `Status: ${entry.status}`,
      entry.error ? `Error: ${entry.error}` : undefined,
    ]
      .filter(Boolean)
      .join(" | "),
  );
}
