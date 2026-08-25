import { Wallet } from "ethers";
import { createProvider } from "../src/chain/provider.js";
import { StaticGasManager } from "../src/chain/gas.js";
import { loadConfig } from "../src/config.js";
import { createDexAdapter } from "../src/execution/dexAdapter.js";
import { runTradeCycle } from "../src/execution/tradeExecutor.js";
import { CircuitBreaker } from "../src/safety/circuitBreaker.js";
import type { TradeAction } from "../src/strategy/randomStrategy.js";
import { formatBnb } from "../src/utils/formatting.js";
import { logger } from "../src/utils/logger.js";
import { WalletManager } from "../src/wallets/walletManager.js";

/**
 * Milestones 5-6: exactly ONE forced BUY or ONE forced SELL through the same
 * guarded pipeline the scheduler uses (balance/gas/slippage checks, preview,
 * dry-run gating) — never a loop. Usage:
 *
 *   npm run trade:test -- --action=buy
 *   npm run trade:test -- --action=sell
 *
 * When DRY_RUN=false, a real transaction requires BOTH DRY_RUN=false in
 * .env AND --confirm on the command line — a deliberate second gate before
 * this script is allowed to spend real (test) funds.
 *
 * --wallet=N picks which configured wallet (1-indexed) to trade with when
 * PRIVATE_KEY holds more than one; defaults to wallet 1.
 */
function parseArgs(argv: string[]): { action: TradeAction; confirm: boolean; walletIndex: number } {
  const actionArg = argv.find((arg) => arg.startsWith("--action="))?.split("=")[1];
  const walletArg = argv.find((arg) => arg.startsWith("--wallet="))?.split("=")[1];
  const confirm = argv.includes("--confirm");

  if (actionArg !== "buy" && actionArg !== "sell") {
    throw new Error("Usage: npm run trade:test -- --action=buy|sell [--wallet=N] [--confirm]");
  }
  const walletIndex = walletArg ? Number(walletArg) : 1;
  if (!Number.isInteger(walletIndex) || walletIndex < 1) {
    throw new Error(`--wallet must be a positive integer (1-indexed), got "${walletArg}"`);
  }
  return { action: actionArg.toUpperCase() as TradeAction, confirm, walletIndex };
}

async function main(): Promise<void> {
  const { action, confirm, walletIndex } = parseArgs(process.argv.slice(2));
  const config = loadConfig();

  if (!config.dryRun && !confirm) {
    throw new Error(
      "DRY_RUN=false but --confirm was not passed. Re-run with --confirm to actually submit a real transaction, " +
        "or leave DRY_RUN=true to preview only.",
    );
  }

  if (!config.flapTokenAddress) {
    throw new Error("FLAP_TOKEN_ADDRESS (or TOKEN_ADDRESS) is required.");
  }

  const privateKey = config.privateKeys[walletIndex - 1];
  if (!privateKey) {
    throw new Error(`--wallet=${walletIndex} but only ${config.privateKeys.length} wallet(s) are configured.`);
  }
  const walletId = `wallet-${walletIndex}`;

  const provider = await createProvider(config);
  const wallet = new Wallet(privateKey, provider);
  const walletManager = new WalletManager(privateKey, provider);
  const adapter = await createDexAdapter(config, wallet);
  const circuitBreaker = new CircuitBreaker(3);
  const gasManager = new StaticGasManager(config.gasReserveBnbWei, provider);

  const walletState = await walletManager.getState(config.flapTokenAddress);
  console.log(
    `\n${walletId}: ${walletState.address}\nBNB balance: ${formatBnb(walletState.bnbBalanceWei)}\nDRY_RUN: ${config.dryRun}\nAction: ${action}\n`,
  );

  const result = await runTradeCycle(
    { walletId, adapter, walletManager, provider, config, circuitBreaker, gasManager },
    config.flapTokenAddress,
    action,
  );

  console.log("\nResult:", result);
  if (result.status === "FAILED") process.exitCode = 1;
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "trade:test failed");
  process.exitCode = 1;
});
