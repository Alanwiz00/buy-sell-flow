import { formatEther, formatUnits } from "ethers";

export function formatBnb(wei: bigint, decimals = 4): string {
  return Number(formatEther(wei)).toFixed(decimals);
}

export function formatToken(amount: bigint, tokenDecimals: number, decimals = 4): string {
  return Number(formatUnits(amount, tokenDecimals)).toFixed(decimals);
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
