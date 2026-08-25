import { FallbackProvider, JsonRpcProvider, type Provider } from "ethers";
import type { Config } from "../config.js";
import { logger } from "../utils/logger.js";

export class UnsupportedNetworkError extends Error {}

/**
 * Connects to the configured RPC and verifies the live chain ID matches
 * Config.chainId. Fails closed: throws rather than returning a provider
 * for the wrong network, so callers never accidentally submit transactions
 * to the wrong chain.
 */
const BSC_MAINNET_FALLBACK_RPCS = [
  "https://bsc-dataseed.defibit.io",
  "https://bsc-dataseed.nariox.org",
  "https://bsc-dataseed.ninicoin.io",
];

export async function createProvider(config: Config): Promise<Provider> {
  const urls = [config.rpcUrl, ...BSC_MAINNET_FALLBACK_RPCS].filter(
    (url, index, all) => all.indexOf(url) === index,
  );
  const providers = urls.map((url, index) => ({
    provider: new JsonRpcProvider(url, config.chainId, { staticNetwork: true }),
    priority: index + 1,
    stallTimeout: 750,
    weight: 1,
  }));
  const provider = new FallbackProvider(providers, config.chainId, { quorum: 1 });

  const network = await provider.getNetwork();
  const liveChainId = Number(network.chainId);

  if (liveChainId !== config.chainId) {
    throw new UnsupportedNetworkError(
      `Refusing to continue: connected chain ID ${liveChainId} does not match configured CHAIN_ID ${config.chainId}. ` +
        `This bot only supports BNB Mainnet (56) in this version.`,
    );
  }

  logger.info({ chainId: liveChainId, rpcUrl: config.rpcUrl, fallbackRpcCount: urls.length - 1 }, "Connected to network");
  return provider;
}
