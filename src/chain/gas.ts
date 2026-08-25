import type { Provider } from "ethers";
import { logger } from "../utils/logger.js";

/**
 * Forward-looking interface for multi-wallet gas top-ups (§9). Only a
 * single-wallet, no-refill implementation exists in v1 — `requestRefill`
 * just logs. AUTO_GAS_REFILL is rejected at config load time until a real
 * implementation exists.
 */
export interface GasManager {
  getGasReserve(wallet: string): Promise<bigint>;
  hasEnoughGas(wallet: string, estimatedGasCostWei: bigint): Promise<boolean>;
  requestRefill(wallet: string, amountWei: bigint): Promise<void>;
}

export class StaticGasManager implements GasManager {
  constructor(
    private readonly reserveWei: bigint,
    private readonly provider: Provider,
  ) {}

  async getGasReserve(_wallet: string): Promise<bigint> {
    return this.reserveWei;
  }

  async hasEnoughGas(wallet: string, estimatedGasCostWei: bigint): Promise<boolean> {
    const balance = await this.provider.getBalance(wallet);
    return balance - estimatedGasCostWei >= this.reserveWei;
  }

  async requestRefill(wallet: string, amountWei: bigint): Promise<void> {
    logger.warn({ wallet, amountWei: amountWei.toString() }, "Wallet requires gas refill.");
  }
}

export interface GasCeilingCheck {
  ok: boolean;
  reason?: string;
  gasPriceWei: bigint;
  estimatedCostWei: bigint;
}

/**
 * Checks a prospective transaction's gas price/cost against the operator's
 * configured ceilings (MAX_GAS_PRICE_GWEI / MAX_GAS_COST_BNB), if set.
 */
export async function checkGasCeiling(
  provider: Provider,
  gasLimit: bigint,
  maxGasPriceWei?: bigint,
  maxGasCostBnbWei?: bigint,
): Promise<GasCeilingCheck> {
  const feeData = await provider.getFeeData();
  const gasPriceWei = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
  const estimatedCostWei = gasPriceWei * gasLimit;

  if (maxGasPriceWei !== undefined && gasPriceWei > maxGasPriceWei) {
    return { ok: false, reason: "gas price exceeds MAX_GAS_PRICE_GWEI", gasPriceWei, estimatedCostWei };
  }
  if (maxGasCostBnbWei !== undefined && estimatedCostWei > maxGasCostBnbWei) {
    return { ok: false, reason: "estimated gas cost exceeds MAX_GAS_COST_BNB", gasPriceWei, estimatedCostWei };
  }
  return { ok: true, gasPriceWei, estimatedCostWei };
}
