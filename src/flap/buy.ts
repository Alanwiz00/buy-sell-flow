import type { ContractTransactionResponse } from "ethers";
import type { TradeQuote } from "../execution/dexAdapter.js";
import { applySlippage } from "../safety/slippageGuard.js";
import { NATIVE_ASSET, type ExactInputParams, type FlapPortal } from "./flapPortal.js";

/** Flap BUY preview (§15 steps 4-6): query the curve via quoteExactInput, apply slippage. */
export async function previewFlapBuy(
  portal: FlapPortal,
  tokenAddress: string,
  amountInWei: bigint,
  slippageBps: number,
): Promise<TradeQuote> {
  const expectedAmountOut = await portal.quote({
    inputToken: NATIVE_ASSET,
    outputToken: tokenAddress,
    inputAmount: amountInWei,
  });
  return {
    amountIn: amountInWei,
    expectedAmountOut,
    minimumAmountOut: applySlippage(expectedAmountOut, slippageBps),
  };
}

/** Flap BUY execution (§15 steps 9-11): build and send the swap, paying amountInWei as msg.value. */
export async function sendFlapBuy(
  portal: FlapPortal,
  tokenAddress: string,
  amountInWei: bigint,
  minimumAmountOut: bigint,
): Promise<ContractTransactionResponse> {
  const params: ExactInputParams = {
    inputToken: NATIVE_ASSET,
    outputToken: tokenAddress,
    inputAmount: amountInWei,
    minOutputAmount: minimumAmountOut,
    permitData: "0x",
  };
  return portal.swap(params, amountInWei);
}
