export interface WalletState {
  address: string;
  bnbBalanceWei: bigint;
  tokenAddress?: string;
  tokenBalance?: bigint;
  tokenDecimals?: number;
  fetchedAt: number;
}
