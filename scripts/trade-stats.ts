import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { formatBnb } from "../src/utils/formatting.js";
import type { TradeLogEntry } from "../src/execution/transactionManager.js";

/**
 * Reads logs/trades.log (JSON lines written by transactionManager.recordTrade)
 * and prints buy/sell counts and BNB volume per wallet, plus totals. Every
 * line here is a real attempted trade cycle (SUCCESS/FAILED/DRY_RUN) —
 * SKIPPED cycles are never written to trades.log, so they don't appear.
 *
 *   npm run stats            # summary table
 *   npm run stats -- --chain-id 97  # testnet only
 *   npm run stats -- --all          # all chains combined
 *   npm run stats -- --json  # machine-readable
 */

interface WalletStats {
  walletId: string;
  wallet: string;
  buyCount: number;
  sellCount: number;
  successCount: number;
  failedCount: number;
  dryRunCount: number;
  realBuyVolumeWei: bigint; // BNB actually spent on SUCCESS buys
  realSellVolumeWei: bigint; // BNB actually received from SUCCESS sells (expectedAmountOut of the executed tx)
  dryRunBuyVolumeWei: bigint;
  dryRunSellVolumeWei: bigint;
  gasSpentWei: bigint;
  firstTradeAt?: string;
  lastTradeAt?: string;
}

function emptyStats(walletId: string, wallet: string): WalletStats {
  return {
    walletId,
    wallet,
    buyCount: 0,
    sellCount: 0,
    successCount: 0,
    failedCount: 0,
    dryRunCount: 0,
    realBuyVolumeWei: 0n,
    realSellVolumeWei: 0n,
    dryRunBuyVolumeWei: 0n,
    dryRunSellVolumeWei: 0n,
    gasSpentWei: 0n,
  };
}

function readEntries(logPath: string): TradeLogEntry[] {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as TradeLogEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is TradeLogEntry => entry !== null);
}

function readChainFilter(): number | undefined {
  if (process.argv.includes("--all")) return undefined;

  const flagIndex = process.argv.indexOf("--chain-id");
  const raw = flagIndex >= 0 ? process.argv[flagIndex + 1] : process.env.CHAIN_ID;
  const chainId = Number(raw);
  if (!raw || !Number.isInteger(chainId) || chainId <= 0) {
    throw new Error("Set CHAIN_ID in .env, pass --chain-id <number>, or use --all.");
  }
  return chainId;
}

function main(): void {
  const logPath = path.resolve(process.cwd(), "logs", "trades.log");
  const chainId = readChainFilter();
  const entries = readEntries(logPath).filter((entry) => chainId === undefined || entry.chainId === chainId);
  const asJson = process.argv.includes("--json");

  const byWallet = new Map<string, WalletStats>();

  for (const entry of entries) {
    const key = entry.walletId ?? entry.wallet;
    let stats = byWallet.get(key);
    if (!stats) {
      stats = emptyStats(entry.walletId ?? "(pre-multi-wallet)", entry.wallet);
      byWallet.set(key, stats);
    }

    if (entry.action === "BUY") stats.buyCount++;
    if (entry.action === "SELL") stats.sellCount++;
    if (entry.status === "SUCCESS") stats.successCount++;
    if (entry.status === "FAILED") stats.failedCount++;
    if (entry.status === "DRY_RUN") stats.dryRunCount++;

    if (entry.status === "SUCCESS") {
      if (entry.action === "BUY") stats.realBuyVolumeWei += BigInt(entry.amountIn);
      if (entry.action === "SELL") stats.realSellVolumeWei += BigInt(entry.expectedAmountOut);
      if (entry.gasLimit && entry.gasPrice) {
        stats.gasSpentWei += BigInt(entry.gasLimit) * BigInt(entry.gasPrice);
      }
    } else if (entry.status === "DRY_RUN") {
      if (entry.action === "BUY") stats.dryRunBuyVolumeWei += BigInt(entry.amountIn);
      if (entry.action === "SELL") stats.dryRunSellVolumeWei += BigInt(entry.expectedAmountOut);
    }

    if (!stats.firstTradeAt) stats.firstTradeAt = entry.timestamp;
    stats.lastTradeAt = entry.timestamp;
  }

  const wallets = [...byWallet.values()];

  if (asJson) {
    console.log(
      JSON.stringify(
        wallets,
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ),
    );
    return;
  }

  if (wallets.length === 0) {
    const scope = chainId === undefined ? "any chain" : `chain ${chainId}`;
    console.log(`\nNo trades recorded for ${scope} in logs/trades.log.\n`);
    return;
  }

  const total = wallets.reduce((acc, w) => {
    acc.buyCount += w.buyCount;
    acc.sellCount += w.sellCount;
    acc.successCount += w.successCount;
    acc.failedCount += w.failedCount;
    acc.dryRunCount += w.dryRunCount;
    acc.realBuyVolumeWei += w.realBuyVolumeWei;
    acc.realSellVolumeWei += w.realSellVolumeWei;
    acc.dryRunBuyVolumeWei += w.dryRunBuyVolumeWei;
    acc.dryRunSellVolumeWei += w.dryRunSellVolumeWei;
    acc.gasSpentWei += w.gasSpentWei;
    return acc;
  }, emptyStats("TOTAL", ""));

  console.log(`\nStats scope: ${chainId === undefined ? "all chains" : `chain ${chainId}`}`);
  for (const w of wallets) {
    console.log(`── ${w.walletId} (${w.wallet}) ${"─".repeat(Math.max(0, 10))}`);
    console.log(`  Buys:  ${w.buyCount}   Sells: ${w.sellCount}`);
    console.log(`  Success: ${w.successCount}   Failed: ${w.failedCount}   Dry-run: ${w.dryRunCount}`);
    console.log(`  Real BNB volume  — bought: ${formatBnb(w.realBuyVolumeWei)}   sold (est): ${formatBnb(w.realSellVolumeWei)}`);
    console.log(`  Dry-run volume   — bought: ${formatBnb(w.dryRunBuyVolumeWei)}   sold (est): ${formatBnb(w.dryRunSellVolumeWei)}`);
    console.log(`  Gas spent (real): ${formatBnb(w.gasSpentWei)} BNB`);
    console.log(`  First: ${w.firstTradeAt}   Last: ${w.lastTradeAt}`);
    console.log("");
  }

  console.log("── TOTAL ──────────────────────────────────");
  console.log(`  Wallets: ${wallets.length}`);
  console.log(`  Buys:  ${total.buyCount}   Sells: ${total.sellCount}`);
  console.log(`  Success: ${total.successCount}   Failed: ${total.failedCount}   Dry-run: ${total.dryRunCount}`);
  console.log(`  Real BNB volume  — bought: ${formatBnb(total.realBuyVolumeWei)}   sold (est): ${formatBnb(total.realSellVolumeWei)}`);
  console.log(`  Dry-run volume   — bought: ${formatBnb(total.dryRunBuyVolumeWei)}   sold (est): ${formatBnb(total.dryRunSellVolumeWei)}`);
  console.log(`  Gas spent (real): ${formatBnb(total.gasSpentWei)} BNB`);
  console.log("");
  console.log("Note: SELL volume is the expected/preview amount from the executed transaction, not a receipt-parsed exact fill.");
  console.log("");
}

main();
