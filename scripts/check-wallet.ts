import { loadConfig } from "../src/config.js";
import { createProvider } from "../src/chain/provider.js";
import { WalletManager } from "../src/wallets/walletManager.js";
import { logger } from "../src/utils/logger.js";
import { formatBnb, formatToken } from "../src/utils/formatting.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const provider = await createProvider(config);
  const network = await provider.getNetwork();

  console.log(`\nNetwork:  ${config.network}\nChain ID: ${network.chainId}\nWallets:  ${config.privateKeys.length}\n`);

  for (const [i, privateKey] of config.privateKeys.entries()) {
    const id = `wallet-${i + 1}`;
    const walletManager = new WalletManager(privateKey, provider);
    const state = await walletManager.getState(config.flapTokenAddress);
    const maxSpendableWei = state.bnbBalanceWei - config.gasReserveBnbWei;

    console.log(
      [
        `── ${id} ${"─".repeat(Math.max(0, 40 - id.length))}`,
        `Address:               ${state.address}`,
        `BNB balance:           ${formatBnb(state.bnbBalanceWei)}`,
        `Token address:         ${state.tokenAddress ?? "(not configured)"}`,
        `Token balance:         ${
          state.tokenBalance !== undefined && state.tokenDecimals !== undefined
            ? formatToken(state.tokenBalance, state.tokenDecimals)
            : "(not configured)"
        }`,
        `Gas reserve:           ${formatBnb(config.gasReserveBnbWei)}`,
        `Maximum spendable BNB: ${maxSpendableWei > 0n ? formatBnb(maxSpendableWei) : "0.0000 (below gas reserve)"}`,
        "",
      ].join("\n"),
    );
  }
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "wallet:check failed");
  process.exitCode = 1;
});
