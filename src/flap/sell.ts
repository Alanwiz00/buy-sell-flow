import type { ContractTransactionResponse, Signer } from "ethers";
import { getErc20Contract } from "../chain/erc20.js";
import type { TradeQuote } from "../execution/dexAdapter.js";
import { applySlippage } from "../safety/slippageGuard.js";
import { NATIVE_ASSET, type ExactInputParams, type FlapPortal } from "./flapPortal.js";

/** Flap SELL preview (§16 steps 5-7): query the curve via quoteExactInput, apply slippage. */
export async function previewFlapSell(
  portal: FlapPortal,
  tokenAddress: string,
  amountIn: bigint,
  slippageBps: number,
): Promise<TradeQuote> {
  const expectedAmountOut = await portal.quote({
    inputToken: tokenAddress,
    outputToken: NATIVE_ASSET,
    inputAmount: amountIn,
  });
  return {
    amountIn,
    expectedAmountOut,
    minimumAmountOut: applySlippage(expectedAmountOut, slippageBps),
  };
}

/**
 * Selling requires the Portal to pull `amountIn` tokens from the wallet.
 * The Portal supports a gasless permitData path (§ trade-tokens docs), but
 * v1 keeps this simple and uses a plain ERC20 approve() when the existing
 * allowance is insufficient. Returns the approve tx if one was sent.
 */
export async function ensureFlapSellAllowance(
  tokenAddress: string,
  ownerAddress: string,
  portalAddress: string,
  amountIn: bigint,
  signer: Signer,
): Promise<ContractTransactionResponse | undefined> {
  const token = getErc20Contract(tokenAddress, signer);
  const allowance = await token.allowance(ownerAddress, portalAddress);
  if (allowance >= amountIn) return undefined;
  const tx = await token.approve(portalAddress, amountIn);
  await tx.wait();
  return tx;
}

/** Flap SELL execution (§16 steps 10-12): build and send the swap. No BNB is attached. */
export async function sendFlapSell(
  portal: FlapPortal,
  tokenAddress: string,
  amountIn: bigint,
  minimumAmountOut: bigint,
): Promise<ContractTransactionResponse> {
  const params: ExactInputParams = {
    inputToken: tokenAddress,
    outputToken: NATIVE_ASSET,
    inputAmount: amountIn,
    minOutputAmount: minimumAmountOut,
    permitData: "0x",
  };
  return portal.swap(params, 0n);
}
