import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BaseContract,
  Contract,
  type ContractTransactionResponse,
  type Provider,
  type Signer,
} from "ethers";
import type { FlapTokenState } from "./tokenState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FLAP_PORTAL_ABI = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../abi/FlapPortal.json"), "utf8"),
);

export interface QuoteExactInputParams {
  inputToken: string;
  outputToken: string;
  inputAmount: bigint;
}

export interface ExactInputParams extends QuoteExactInputParams {
  minOutputAmount: bigint;
  permitData: string;
}

interface RawTokenStateV8Safe {
  status: bigint;
  reserve: bigint;
  circulatingSupply: bigint;
  price: bigint;
  tokenVersion: bigint;
  r: bigint;
  h: bigint;
  k: bigint;
  dexSupplyThresh: bigint;
  quoteTokenAddress: string;
  nativeToQuoteSwapEnabled: boolean;
  extensionID: string;
  buyTaxRate: bigint;
  sellTaxRate: bigint;
  pool: string;
  progress: bigint;
  lpFeeProfile: bigint;
  dexId: bigint;
}

interface FlapPortalContract extends BaseContract {
  getTokenV8Safe(token: string): Promise<RawTokenStateV8Safe>;
  swapExactInput(
    params: ExactInputParams,
    overrides?: { value?: bigint },
  ): Promise<ContractTransactionResponse>;
}

/** address(0) represents the chain's native asset (BNB) throughout the Portal interface. */
export const NATIVE_ASSET = "0x0000000000000000000000000000000000000000";

/**
 * Thin wrapper around the Flap Portal contract. Interface confirmed against
 * docs.flap.sh (wallet/terminal/bot developer docs, fetched 2026-08-24):
 * getTokenV8Safe / quoteExactInput / swapExactInput — NOT the previewBuy /
 * buy / previewSell / sell names the original spec assumed. Real docs win
 * over spec assumptions per the spec's own rule #7.
 */
export class FlapPortal {
  private readonly portal: FlapPortalContract;

  constructor(portalAddress: string, runner: Provider | Signer) {
    this.portal = new Contract(portalAddress, FLAP_PORTAL_ABI, runner) as unknown as FlapPortalContract;
  }

  async getTokenState(tokenAddress: string): Promise<FlapTokenState> {
    const raw = await this.portal.getTokenV8Safe(tokenAddress);
    return {
      status: Number(raw.status),
      reserve: raw.reserve,
      circulatingSupply: raw.circulatingSupply,
      price: raw.price,
      tokenVersion: Number(raw.tokenVersion),
      r: raw.r,
      h: raw.h,
      k: raw.k,
      dexSupplyThresh: raw.dexSupplyThresh,
      quoteTokenAddress: raw.quoteTokenAddress,
      nativeToQuoteSwapEnabled: raw.nativeToQuoteSwapEnabled,
      buyTaxRate: raw.buyTaxRate,
      sellTaxRate: raw.sellTaxRate,
      pool: raw.pool,
      progress: raw.progress,
      dexId: Number(raw.dexId),
    };
  }

  /**
   * Read-only quote. `quoteExactInput` is declared `external` (not `view`)
   * on the Portal, so it must be invoked via staticCall/eth_call rather
   * than a normal contract call, or it would attempt to send a transaction.
   */
  async quote(params: QuoteExactInputParams): Promise<bigint> {
    const fn = this.portal.getFunction("quoteExactInput");
    return (await fn.staticCall(params)) as bigint;
  }

  async swap(params: ExactInputParams, valueWei: bigint): Promise<ContractTransactionResponse> {
    return this.portal.swapExactInput(params, { value: valueWei });
  }

  async estimateSwapGas(params: ExactInputParams, valueWei: bigint): Promise<bigint> {
    const fn = this.portal.getFunction("swapExactInput");
    return (await fn.estimateGas(params, { value: valueWei })) as bigint;
  }

  get address(): string {
    return this.portal.target as string;
  }
}
