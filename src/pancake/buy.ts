import type { ContractTransactionResponse } from "ethers";
import type { TradeQuote } from "../execution/dexAdapter.js";
import { applySlippage } from "../safety/slippageGuard.js";
import type { PancakeRouter } from "./pancakeClient.js";

const DEADLINE_BUFFER_SECONDS = 300;

export async function previewPancakeBuy(
  router: PancakeRouter,
  wbnbAddress: string,
  tokenAddress: string,
  amountInWei: bigint,
  slippageBps: number,
): Promise<TradeQuote> {
  const amounts = await router.getAmountsOut(amountInWei, [wbnbAddress, tokenAddress]);
  const expectedAmountOut = amounts[amounts.length - 1] ?? 0n;
  return {
    amountIn: amountInWei,
    expectedAmountOut,
    minimumAmountOut: applySlippage(expectedAmountOut, slippageBps),
  };
}

export async function sendPancakeBuy(
  router: PancakeRouter,
  wbnbAddress: string,
  tokenAddress: string,
  amountInWei: bigint,
  minimumAmountOut: bigint,
  toAddress: string,
): Promise<ContractTransactionResponse> {
  const deadline = Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS;
  return router.swapExactETHForTokensSupportingFeeOnTransferTokens(
    minimumAmountOut,
    [wbnbAddress, tokenAddress],
    toAddress,
    deadline,
    { value: amountInWei },
  );
}
