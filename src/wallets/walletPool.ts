import { Wallet, type Provider } from "ethers";
import { StaticGasManager, type GasManager } from "../chain/gas.js";
import type { Config } from "../config.js";
import { createDexAdapter, type DexAdapter } from "../execution/dexAdapter.js";
import { CircuitBreaker } from "../safety/circuitBreaker.js";
import { WalletManager } from "./walletManager.js";

export interface WalletContext {
  id: string;
  wallet: Wallet;
  walletManager: WalletManager;
  adapter: DexAdapter;
  circuitBreaker: CircuitBreaker;
  gasManager: GasManager;
}

/**
 * Builds one independent trading context per configured wallet (§29, §9).
 * Each wallet gets its own adapter (bound to its own signer) and its own
 * CircuitBreaker, so one wallet's failures don't halt the others. Gas
 * checks are inherently per-wallet already (StaticGasManager takes the
 * wallet address per call), so a single instance is shared safely.
 */
export async function createWalletPool(config: Config, provider: Provider): Promise<WalletContext[]> {
  const gasManager = new StaticGasManager(config.gasReserveBnbWei, provider);

  return Promise.all(
    config.privateKeys.map(async (privateKey, index) => {
      const wallet = new Wallet(privateKey, provider);
      const walletManager = new WalletManager(privateKey, provider);
      const adapter = await createDexAdapter(config, wallet);
      return {
        id: `wallet-${index + 1}`,
        wallet,
        walletManager,
        adapter,
        circuitBreaker: new CircuitBreaker(3),
        gasManager,
      } satisfies WalletContext;
    }),
  );
}
