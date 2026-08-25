import "dotenv/config";
import { getAddress, parseEther, parseUnits } from "ethers";

export type TradingMode = "flap" | "pancake";

export interface Config {
  network: string;
  chainId: number;
  rpcUrl: string;

  /** One or more wallets. A single wallet is privateKeys.length === 1 — the rest of the bot treats both cases identically. */
  privateKeys: string[];

  flapPortalAddress?: string;
  flapTokenAddress?: string;
  pancakeRouterAddress?: string;

  tradingMode: TradingMode;

  minDelaySeconds: number;
  maxDelaySeconds: number;

  minBuyBnbWei: bigint;
  maxBuyBnbWei: bigint;

  minSellPercent: number;
  maxSellPercent: number;

  buyWeight: number;
  sellWeight: number;

  slippageBps: number;

  gasReserveBnbWei: bigint;
  minBnbBalanceWei: bigint;
  maxGasPriceWei?: bigint;
  maxGasCostBnbWei?: bigint;

  maxTradeCount: number;
  maxSingleTradeBnbWei: bigint;
  maxDailyBnbVolumeWei: bigint;

  autoGasRefill: boolean;
  gasBankPrivateKey?: string;

  dryRun: boolean;
}

const DEFAULT_MAINNET_RPC_URL = "https://bsc-dataseed.bnbchain.org";
const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;

class ConfigError extends Error {}

function collectErrors(errors: string[]): void {
  if (errors.length > 0) {
    throw new ConfigError(
      `Invalid configuration (${errors.length} problem${errors.length > 1 ? "s" : ""}):\n` +
        errors.map((e) => `  - ${e}`).join("\n"),
    );
  }
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

function parseInteger(name: string, raw: string | undefined, fallback: number, errors: string[]): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    errors.push(`${name} must be an integer, got "${raw}"`);
    return fallback;
  }
  return n;
}

function parseFloatValue(name: string, raw: string | undefined, fallback: number, errors: string[]): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    errors.push(`${name} must be a number, got "${raw}"`);
    return fallback;
  }
  return n;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw.trim().toLowerCase() === "true";
}

function parseBnb(name: string, raw: string | undefined, fallback: string, errors: string[]): bigint {
  const value = raw ?? fallback;
  try {
    return parseEther(value);
  } catch {
    errors.push(`${name} must be a decimal BNB amount, got "${value}"`);
    return 0n;
  }
}

function parseOptionalBnb(name: string, raw: string | undefined, errors: string[]): bigint | undefined {
  if (raw === undefined) return undefined;
  try {
    return parseEther(raw);
  } catch {
    errors.push(`${name} must be a decimal BNB amount, got "${raw}"`);
    return undefined;
  }
}

function parseOptionalGwei(name: string, raw: string | undefined, errors: string[]): bigint | undefined {
  if (raw === undefined) return undefined;
  try {
    return parseUnits(raw, "gwei");
  } catch {
    errors.push(`${name} must be a decimal gwei amount, got "${raw}"`);
    return undefined;
  }
}

function parseAddress(name: string, raw: string | undefined, errors: string[]): string | undefined {
  if (raw === undefined) return undefined;
  try {
    return getAddress(raw);
  } catch {
    errors.push(`${name} must be a valid address, got "${raw}"`);
    return undefined;
  }
}

export function loadConfig(): Config {
  const errors: string[] = [];

  const network = env("NETWORK") ?? "bsc-testnet";
  const chainId = parseInteger("CHAIN_ID", env("CHAIN_ID"), 56, errors);
  if (chainId !== 56) {
    errors.push(
      `CHAIN_ID must be 56 (BNB Mainnet) in this version, got ${chainId}. Testnet trading is not implemented.`,
    );
  }

  const rpcUrl = env("RPC_URL") ?? DEFAULT_MAINNET_RPC_URL;

  // PRIVATE_KEY accepts one key, or a comma-separated list for multi-wallet (§29/§9).
  const rawPrivateKey = env("PRIVATE_KEY");
  const privateKeys = (rawPrivateKey ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  if (privateKeys.length === 0) {
    errors.push("PRIVATE_KEY is required (0x-prefixed 64 hex characters, comma-separated for multiple wallets). Never commit it.");
  } else {
    privateKeys.forEach((key, i) => {
      if (!PRIVATE_KEY_RE.test(key)) {
        errors.push(`PRIVATE_KEY entry #${i + 1} looks invalid: expected 0x followed by 64 hex characters.`);
      }
    });
    const distinct = new Set(privateKeys.map((k) => k.toLowerCase()));
    if (distinct.size !== privateKeys.length) {
      errors.push("PRIVATE_KEY contains duplicate keys — each wallet must be unique.");
    }
  }

  const flapPortalAddress = parseAddress("FLAP_PORTAL_ADDRESS", env("FLAP_PORTAL_ADDRESS"), errors);
  // FLAP_TOKEN_ADDRESS is the historical name; TOKEN_ADDRESS is accepted as a
  // DEX-agnostic alias now that TRADING_MODE=pancake sees real use too.
  const flapTokenAddress = parseAddress("FLAP_TOKEN_ADDRESS", env("FLAP_TOKEN_ADDRESS") ?? env("TOKEN_ADDRESS"), errors);
  const pancakeRouterAddress = parseAddress("PANCAKE_ROUTER_ADDRESS", env("PANCAKE_ROUTER_ADDRESS"), errors);

  const rawTradingMode = env("TRADING_MODE") ?? "flap";
  if (rawTradingMode !== "flap" && rawTradingMode !== "pancake") {
    errors.push(`TRADING_MODE must be "flap" or "pancake", got "${rawTradingMode}"`);
  }
  const tradingMode = (rawTradingMode === "pancake" ? "pancake" : "flap") as TradingMode;

  const minDelaySeconds = parseInteger("MIN_DELAY_SECONDS", env("MIN_DELAY_SECONDS"), 30, errors);
  const maxDelaySeconds = parseInteger("MAX_DELAY_SECONDS", env("MAX_DELAY_SECONDS"), 300, errors);
  if (minDelaySeconds < 0) errors.push("MIN_DELAY_SECONDS must be >= 0");
  if (maxDelaySeconds < minDelaySeconds) errors.push("MAX_DELAY_SECONDS must be >= MIN_DELAY_SECONDS");

  const minBuyBnbWei = parseBnb("MIN_BUY_BNB", env("MIN_BUY_BNB"), "0.001", errors);
  const maxBuyBnbWei = parseBnb("MAX_BUY_BNB", env("MAX_BUY_BNB"), "0.01", errors);
  if (minBuyBnbWei <= 0n) errors.push("MIN_BUY_BNB must be > 0");
  if (maxBuyBnbWei < minBuyBnbWei) errors.push("MAX_BUY_BNB must be >= MIN_BUY_BNB");

  const minSellPercent = parseFloatValue("MIN_SELL_PERCENT", env("MIN_SELL_PERCENT"), 10, errors);
  const maxSellPercent = parseFloatValue("MAX_SELL_PERCENT", env("MAX_SELL_PERCENT"), 40, errors);
  if (minSellPercent <= 0 || minSellPercent > 100) errors.push("MIN_SELL_PERCENT must be within (0, 100]");
  if (maxSellPercent < minSellPercent || maxSellPercent > 100)
    errors.push("MAX_SELL_PERCENT must be within [MIN_SELL_PERCENT, 100]");

  const buyWeight = parseFloatValue("BUY_WEIGHT", env("BUY_WEIGHT"), 50, errors);
  const sellWeight = parseFloatValue("SELL_WEIGHT", env("SELL_WEIGHT"), 50, errors);
  if (buyWeight < 0) errors.push("BUY_WEIGHT must be >= 0");
  if (sellWeight < 0) errors.push("SELL_WEIGHT must be >= 0");
  if (buyWeight + sellWeight <= 0) errors.push("BUY_WEIGHT + SELL_WEIGHT must be > 0");

  const slippageBps = parseInteger("SLIPPAGE_BPS", env("SLIPPAGE_BPS"), 300, errors);
  if (slippageBps < 0 || slippageBps > 10000) errors.push("SLIPPAGE_BPS must be within [0, 10000]");

  const gasReserveBnbWei = parseBnb("GAS_RESERVE_BNB", env("GAS_RESERVE_BNB"), "0.01", errors);
  const minBnbBalanceWei = parseBnb("MIN_BNB_BALANCE", env("MIN_BNB_BALANCE"), "0.015", errors);
  const maxGasPriceWei = parseOptionalGwei("MAX_GAS_PRICE_GWEI", env("MAX_GAS_PRICE_GWEI"), errors);
  const maxGasCostBnbWei = parseOptionalBnb("MAX_GAS_COST_BNB", env("MAX_GAS_COST_BNB"), errors);

  const maxTradeCount = parseInteger("MAX_TRADE_COUNT", env("MAX_TRADE_COUNT"), 0, errors);
  if (maxTradeCount < 0) errors.push("MAX_TRADE_COUNT must be >= 0 (0 = unlimited)");
  const maxSingleTradeBnbWei = parseBnb("MAX_SINGLE_TRADE_BNB", env("MAX_SINGLE_TRADE_BNB"), "0.01", errors);
  const maxDailyBnbVolumeWei = parseBnb("MAX_DAILY_BNB_VOLUME", env("MAX_DAILY_BNB_VOLUME"), "0.1", errors);

  const autoGasRefill = parseBoolean(env("AUTO_GAS_REFILL"), false);
  if (autoGasRefill) {
    errors.push("AUTO_GAS_REFILL is not implemented in v1. Set it to false.");
  }
  const gasBankPrivateKey = env("GAS_BANK_PRIVATE_KEY");

  const dryRun = parseBoolean(env("DRY_RUN"), true);

  collectErrors(errors);

  return {
    network,
    chainId,
    rpcUrl,
    privateKeys,
    flapPortalAddress,
    flapTokenAddress,
    pancakeRouterAddress,
    tradingMode,
    minDelaySeconds,
    maxDelaySeconds,
    minBuyBnbWei,
    maxBuyBnbWei,
    minSellPercent,
    maxSellPercent,
    buyWeight,
    sellWeight,
    slippageBps,
    gasReserveBnbWei,
    minBnbBalanceWei,
    maxGasPriceWei,
    maxGasCostBnbWei,
    maxTradeCount,
    maxSingleTradeBnbWei,
    maxDailyBnbVolumeWei,
    autoGasRefill,
    gasBankPrivateKey,
    dryRun,
  };
}
