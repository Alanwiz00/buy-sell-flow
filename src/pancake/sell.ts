import type { ContractTransactionResponse, Signer } from "ethers";
import { getErc20Contract } from "../chain/erc20.js";
import type { TradeQuote } from "../execution/dexAdapter.js";
import { applySlippage } from "../safety/slippageGuard.js";
import type { PancakeRouter } from "./pancakeClient.js";

const DEADLINE_BUFFER_SECONDS = 300;

export async function previewPancakeSell(
  router: PancakeRouter,
  wbnbAddress: string,
  tokenAddress: string,
  amountIn: bigint,
  slippageBps: number,
): Promise<TradeQuote> {
  const amounts = await router.getAmountsOut(amountIn, [tokenAddress, wbnbAddress]);
  const expectedAmountOut = amounts[amounts.length - 1] ?? 0n;
  return {
    amountIn,
    expectedAmountOut,
    minimumAmountOut: applySlippage(expectedAmountOut, slippageBps),
  };
}

/** Ensures the router is approved to pull `amountIn` tokens, sending an approve tx first if needed. */
export async function ensurePancakeSellAllowance(
  tokenAddress: string,
  ownerAddress: string,
  routerAddress: string,
  amountIn: bigint,
  signer: Signer,
): Promise<ContractTransactionResponse | undefined> {
  const token = getErc20Contract(tokenAddress, signer);
  const allowance = await token.allowance(ownerAddress, routerAddress);
  if (allowance >= amountIn) return undefined;
  const tx = await token.approve(routerAddress, amountIn);
  await tx.wait();
  return tx;
}

export async function sendPancakeSell(
  router: PancakeRouter,
  wbnbAddress: string,
  tokenAddress: string,
  amountIn: bigint,
  minimumAmountOut: bigint,
  toAddress: string,
): Promise<ContractTransactionResponse> {
  const deadline = Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS;
  return router.swapExactTokensForETHSupportingFeeOnTransferTokens(
    amountIn,
    minimumAmountOut,
    [tokenAddress, wbnbAddress],
    toAddress,
    deadline,
  );
}
