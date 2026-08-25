import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BaseContract, Contract, type ContractTransactionResponse, type TransactionResponse, type Wallet } from "ethers";
import type { DexAdapter, TokenState, TradeOptions, TradeQuote } from "../execution/dexAdapter.js";
import { previewPancakeBuy, sendPancakeBuy } from "./buy.js";
import { ensurePancakeSellAllowance, previewPancakeSell, sendPancakeSell } from "./sell.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PANCAKE_ROUTER_ABI = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../abi/PancakeRouter.json"), "utf8"),
);

export interface PancakeRouter extends BaseContract {
  factory(): Promise<string>;
  WETH(): Promise<string>;
  getAmountsOut(amountIn: bigint, path: string[]): Promise<bigint[]>;
  swapExactETHForTokensSupportingFeeOnTransferTokens(
    amountOutMin: bigint,
    path: string[],
    to: string,
    deadline: number,
    overrides: { value: bigint },
  ): Promise<ContractTransactionResponse>;
  swapExactTokensForETHSupportingFeeOnTransferTokens(
    amountIn: bigint,
    amountOutMin: bigint,
    path: string[],
    to: string,
    deadline: number,
  ): Promise<ContractTransactionResponse>;
}

/**
 * PancakeAdapter implements the same DexAdapter interface as FlapAdapter
 * (§17, §8) over a standard Uniswap-V2-style Router. Kept entirely separate
 * from the Flap implementation per spec — no shared trading logic beyond
 * the DexAdapter contract and the slippage/ERC20 helpers.
 */
export class PancakeAdapter implements DexAdapter {
  readonly name = "PANCAKE";
  private readonly router: PancakeRouter;
  private wbnbAddress?: string;

  constructor(
    routerAddress: string,
    private readonly wallet: Wallet,
    private readonly slippageBps: number,
  ) {
    this.router = new Contract(routerAddress, PANCAKE_ROUTER_ABI, wallet) as unknown as PancakeRouter;
  }

  get address(): string {
    return this.router.target as string;
  }

  private async getWbnb(): Promise<string> {
    if (!this.wbnbAddress) {
      this.wbnbAddress = await this.router.WETH();
    }
    return this.wbnbAddress;
  }

  async getTokenState(token: string): Promise<TokenState> {
    const wbnb = await this.getWbnb();
    try {
      const probeAmount = 10n ** 12n; // negligible probe amount, just to test the path exists
      const amounts = await this.router.getAmountsOut(probeAmount, [wbnb, token]);
      const out = amounts[amounts.length - 1] ?? 0n;
      if (out <= 0n) {
        return { tradable: false, reason: "no liquidity for this token/WBNB pair", priceWei: 0n, quoteTokenAddress: wbnb };
      }
      return { tradable: true, priceWei: out, quoteTokenAddress: wbnb };
    } catch {
      return { tradable: false, reason: "no PancakeSwap pair found for this token", priceWei: 0n, quoteTokenAddress: wbnb };
    }
  }

  async previewBuy(token: string, amountInWei: bigint): Promise<TradeQuote> {
    const wbnb = await this.getWbnb();
    return previewPancakeBuy(this.router, wbnb, token, amountInWei, this.slippageBps);
  }

  async previewSell(token: string, amountIn: bigint): Promise<TradeQuote> {
    const wbnb = await this.getWbnb();
    return previewPancakeSell(this.router, wbnb, token, amountIn, this.slippageBps);
  }

  private deadline(): number {
    return Math.floor(Date.now() / 1000) + 300;
  }

  async estimateBuyGas(token: string, amountInWei: bigint, minimumAmountOut: bigint): Promise<bigint> {
    const wbnb = await this.getWbnb();
    const fn = this.router.getFunction("swapExactETHForTokensSupportingFeeOnTransferTokens");
    return (await fn.estimateGas(
      minimumAmountOut,
      [wbnb, token],
      this.wallet.address,
      this.deadline(),
      { value: amountInWei },
    )) as bigint;
  }

  /**
   * Estimating a SELL requires the router to already be able to pull the
   * tokens, so allowance is ensured here too (idempotent — ensure() is a
   * no-op if buy()/sell() already approved it).
   */
  async estimateSellGas(token: string, amountIn: bigint, minimumAmountOut: bigint): Promise<bigint> {
    const wbnb = await this.getWbnb();
    await ensurePancakeSellAllowance(token, this.wallet.address, this.address, amountIn, this.wallet);
    const fn = this.router.getFunction("swapExactTokensForETHSupportingFeeOnTransferTokens");
    return (await fn.estimateGas(
      amountIn,
      minimumAmountOut,
      [token, wbnb],
      this.wallet.address,
      this.deadline(),
    )) as bigint;
  }

  async buy(token: string, amountInWei: bigint, options: TradeOptions): Promise<TransactionResponse> {
    const wbnb = await this.getWbnb();
    const quote = await previewPancakeBuy(this.router, wbnb, token, amountInWei, options.slippageBps);
    return sendPancakeBuy(this.router, wbnb, token, amountInWei, quote.minimumAmountOut, this.wallet.address);
  }

  async sell(token: string, amountIn: bigint, options: TradeOptions): Promise<TransactionResponse> {
    const wbnb = await this.getWbnb();
    await ensurePancakeSellAllowance(token, this.wallet.address, this.address, amountIn, this.wallet);
    const quote = await previewPancakeSell(this.router, wbnb, token, amountIn, options.slippageBps);
    return sendPancakeSell(this.router, wbnb, token, amountIn, quote.minimumAmountOut, this.wallet.address);
  }
}
