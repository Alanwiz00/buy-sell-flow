import type { TransactionResponse, Wallet } from "ethers";
import type { DexAdapter, TokenState, TradeOptions, TradeQuote } from "../execution/dexAdapter.js";
import { previewFlapBuy, sendFlapBuy } from "./buy.js";
import { NATIVE_ASSET, FlapPortal, type ExactInputParams } from "./flapPortal.js";
import { ensureFlapSellAllowance, previewFlapSell, sendFlapSell } from "./sell.js";
import { describeStatus, isBondingCurveTradable, type FlapTokenState } from "./tokenState.js";

/**
 * FlapAdapter implements the DEX-agnostic DexAdapter interface (§17) over
 * the Flap bonding-curve Portal, so the strategy/execution layers can
 * trade Flap and PancakeSwap identically.
 */
export class FlapAdapter implements DexAdapter {
  readonly name = "FLAP";
  private readonly portal: FlapPortal;

  constructor(
    portalAddress: string,
    private readonly wallet: Wallet,
    private readonly slippageBps: number,
  ) {
    this.portal = new FlapPortal(portalAddress, wallet);
  }

  async getFlapTokenState(token: string): Promise<FlapTokenState> {
    return this.portal.getTokenState(token);
  }

  async getTokenState(token: string): Promise<TokenState> {
    let state: FlapTokenState;
    try {
      state = await this.portal.getTokenState(token);
    } catch {
      // The Portal reverts with a custom error for an address it doesn't recognize as
      // a Flap token, rather than returning a graceful "Invalid" status (verified
      // on-chain against BNB testnet). Never blindly send a transaction here — skip (§14).
      return { tradable: false, reason: "token not found on the Flap Portal (or RPC call reverted)", priceWei: 0n, quoteTokenAddress: NATIVE_ASSET };
    }
    const quoteIsNative = state.quoteTokenAddress.toLowerCase() === NATIVE_ASSET.toLowerCase();
    const tradable = isBondingCurveTradable(state) && (quoteIsNative || state.nativeToQuoteSwapEnabled);

    let reason: string | undefined;
    if (!isBondingCurveTradable(state)) {
      reason = `token status is ${describeStatus(state.status)}, not Tradable`;
    } else if (!quoteIsNative && !state.nativeToQuoteSwapEnabled) {
      reason = "token's quote asset is not BNB and native-to-quote swap is disabled";
    }

    return {
      tradable,
      reason,
      priceWei: state.price,
      quoteTokenAddress: state.quoteTokenAddress,
    };
  }

  async previewBuy(token: string, amountInWei: bigint): Promise<TradeQuote> {
    return previewFlapBuy(this.portal, token, amountInWei, this.slippageBps);
  }

  async previewSell(token: string, amountIn: bigint): Promise<TradeQuote> {
    return previewFlapSell(this.portal, token, amountIn, this.slippageBps);
  }

  /**
   * Estimating a SELL requires the Portal to already be able to pull the
   * tokens, so allowance is ensured here too (idempotent — ensure() is a
   * no-op if buy()/sell() already approved it).
   */
  async estimateBuyGas(token: string, amountInWei: bigint, minimumAmountOut: bigint): Promise<bigint> {
    const params: ExactInputParams = {
      inputToken: NATIVE_ASSET,
      outputToken: token,
      inputAmount: amountInWei,
      minOutputAmount: minimumAmountOut,
      permitData: "0x",
    };
    return this.portal.estimateSwapGas(params, amountInWei);
  }

  async estimateSellGas(token: string, amountIn: bigint, minimumAmountOut: bigint): Promise<bigint> {
    await ensureFlapSellAllowance(token, this.wallet.address, this.portal.address, amountIn, this.wallet);
    const params: ExactInputParams = {
      inputToken: token,
      outputToken: NATIVE_ASSET,
      inputAmount: amountIn,
      minOutputAmount: minimumAmountOut,
      permitData: "0x",
    };
    return this.portal.estimateSwapGas(params, 0n);
  }

  async buy(token: string, amountInWei: bigint, options: TradeOptions): Promise<TransactionResponse> {
    const quote = await previewFlapBuy(this.portal, token, amountInWei, options.slippageBps);
    return sendFlapBuy(this.portal, token, amountInWei, quote.minimumAmountOut);
  }

  async sell(token: string, amountIn: bigint, options: TradeOptions): Promise<TransactionResponse> {
    await ensureFlapSellAllowance(token, this.wallet.address, this.portal.address, amountIn, this.wallet);
    const quote = await previewFlapSell(this.portal, token, amountIn, options.slippageBps);
    return sendFlapSell(this.portal, token, amountIn, quote.minimumAmountOut);
  }
}
