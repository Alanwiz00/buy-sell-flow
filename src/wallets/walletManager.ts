import { Wallet, type Provider, type TransactionRequest } from "ethers";
import { getErc20Contract } from "../chain/erc20.js";
import { logger } from "../utils/logger.js";
import type { WalletState } from "./walletState.js";

/**
 * Owns the single trading wallet: address, balances, gas estimation, and
 * signing. Never logs or exposes the private key, mnemonic, or seed phrase.
 */
export class WalletManager {
  readonly wallet: Wallet;
  readonly provider: Provider;

  constructor(privateKey: string, provider: Provider) {
    this.provider = provider;
    this.wallet = new Wallet(privateKey, provider);
  }

  getAddress(): string {
    return this.wallet.address;
  }

  async getBnbBalance(): Promise<bigint> {
    return this.provider.getBalance(this.wallet.address);
  }

  async getTokenBalance(tokenAddress: string): Promise<bigint> {
    const token = getErc20Contract(tokenAddress, this.provider);
    return token.balanceOf(this.wallet.address);
  }

  async getTokenDecimals(tokenAddress: string): Promise<number> {
    const token = getErc20Contract(tokenAddress, this.provider);
    return Number(await token.decimals());
  }

  async estimateGas(tx: TransactionRequest): Promise<bigint> {
    return this.provider.estimateGas({ ...tx, from: this.wallet.address });
  }

  async getState(tokenAddress?: string): Promise<WalletState> {
    const [bnbBalanceWei, tokenBalance, tokenDecimals] = await Promise.all([
      this.getBnbBalance(),
      tokenAddress ? this.getTokenBalance(tokenAddress) : Promise.resolve(undefined),
      tokenAddress ? this.getTokenDecimals(tokenAddress) : Promise.resolve(undefined),
    ]);

    return {
      address: this.wallet.address,
      bnbBalanceWei,
      tokenAddress,
      tokenBalance,
      tokenDecimals,
      fetchedAt: Date.now(),
    };
  }

  logSummary(state: WalletState): void {
    logger.info(
      {
        wallet: state.address,
        bnbBalance: state.bnbBalanceWei.toString(),
        tokenBalance: state.tokenBalance?.toString(),
      },
      "Wallet state",
    );
  }
}
