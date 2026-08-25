import { createProvider } from "./chain/provider.js";
import { loadConfig, type Config } from "./config.js";
import { runScheduler } from "./strategy/scheduler.js";
import { formatBnb, shortenAddress } from "./utils/formatting.js";
import { logger } from "./utils/logger.js";
import { createWalletPool, type WalletContext } from "./wallets/walletPool.js";

function printBanner(config: Config, wallets: { id: string; address: string; bnbBalanceWei: bigint }[], dexName: string): void {
  const pad = (label: string, value: string): string => {
    const line = ` ${label.padEnd(15)} ${value}`;
    return `║${line.padEnd(44)}║`;
  };

  const lines = [
    "",
    "╔══════════════════════════════════════════╗",
    "║       FLAP RANDOM TRADING BOT             ║",
    "╠══════════════════════════════════════════╣",
    pad("Network:", "BNB Testnet"),
    pad("Chain ID:", String(config.chainId)),
    pad("Mode:", dexName),
    pad("Dry Run:", String(config.dryRun).toUpperCase()),
    pad("Wallets:", String(wallets.length)),
    ...wallets.map((w) => pad(`  ${w.id}:`, `${shortenAddress(w.address)}  ${formatBnb(w.bnbBalanceWei)} BNB`)),
    pad("Gas Reserve:", formatBnb(config.gasReserveBnbWei)),
    pad("Token:", config.flapTokenAddress ? shortenAddress(config.flapTokenAddress) : "(none)"),
    "╚══════════════════════════════════════════╝",
    "",
  ];
  console.log(lines.join("\n"));
}

async function main(): Promise<void> {
  // Validate environment
  const config = loadConfig();

  // Validate network (fails closed if not BNB Testnet)
  const provider = await createProvider(config);

  // Validate contract addresses + token
  if (!config.flapTokenAddress) {
    throw new Error("FLAP_TOKEN_ADDRESS is required before trading can start.");
  }

  // Validate wallets + build one adapter per wallet
  const pool: WalletContext[] = await createWalletPool(config, provider);

  // Read token state (shared across wallets — same token, same adapter shape)
  const tokenState = await pool[0]!.adapter.getTokenState(config.flapTokenAddress);

  // Read balances + validate gas reserve, per wallet
  const walletSummaries = await Promise.all(
    pool.map(async (ctx) => {
      const state = await ctx.walletManager.getState(config.flapTokenAddress);
      if (state.bnbBalanceWei < config.minBnbBalanceWei) {
        throw new Error(
          `${ctx.id} (${state.address}) BNB balance (${formatBnb(state.bnbBalanceWei)}) is below MIN_BNB_BALANCE ` +
            `(${formatBnb(config.minBnbBalanceWei)}). Fund it before starting.`,
        );
      }
      return { id: ctx.id, address: state.address, bnbBalanceWei: state.bnbBalanceWei };
    }),
  );

  // Display configuration
  printBanner(config, walletSummaries, pool[0]!.adapter.name);
  console.log(`Token status: ${tokenState.tradable ? "TRADABLE" : `NOT TRADABLE (${tokenState.reason})`}\n`);

  // Require dry-run/test mode — real trading is only ever active because the
  // operator explicitly set DRY_RUN=false in their own .env (§21, §27).
  if (!config.dryRun) {
    console.log("*** DRY_RUN=false — this run WILL submit real transactions on BNB Testnet. ***\n");
  }

  console.log(`Scheduler started for ${pool.length} wallet(s).\n`);

  // Each wallet runs its own independent scheduler loop (own random timing,
  // own circuit breaker) so one wallet's failures don't stall the others (§29).
  await Promise.all(
    pool.map((ctx) =>
      runScheduler(
        {
          walletId: ctx.id,
          adapter: ctx.adapter,
          walletManager: ctx.walletManager,
          provider,
          config,
          circuitBreaker: ctx.circuitBreaker,
          gasManager: ctx.gasManager,
        },
        config.flapTokenAddress as string,
      ),
    ),
  );
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "Fatal startup error");
  process.exitCode = 1;
});
