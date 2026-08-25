import { Wallet } from "ethers";
import { loadConfig } from "../src/config.js";
import { createProvider } from "../src/chain/provider.js";
import { createDexAdapter } from "../src/execution/dexAdapter.js";
import { FlapAdapter } from "../src/flap/flapClient.js";
import { describeStatus } from "../src/flap/tokenState.js";
import { formatBnb } from "../src/utils/formatting.js";
import { logger } from "../src/utils/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.flapTokenAddress) {
    throw new Error("FLAP_TOKEN_ADDRESS is not set — token:inspect needs a token to look up.");
  }

  const provider = await createProvider(config);
  const wallet = new Wallet(config.privateKeys[0]!, provider);
  const adapter = await createDexAdapter(config, wallet);

  const token = config.flapTokenAddress as string;
  const generic = await adapter.getTokenState(token);

  console.log(`\nDEX:   ${adapter.name}`);
  console.log(`Token: ${token}`);
  console.log(`Tradable: ${generic.tradable}${generic.reason ? ` (${generic.reason})` : ""}`);
  console.log(`Quote token: ${generic.quoteTokenAddress}`);

  if (adapter instanceof FlapAdapter) {
    try {
      const state = await adapter.getFlapTokenState(token);
      console.log(
        [
          "",
          "Flap bonding-curve state:",
          `  Status:              ${describeStatus(state.status)}`,
          `  Token version:       ${state.tokenVersion}`,
          `  Price:               ${formatBnb(state.price, 10)} BNB`,
          `  Reserve:             ${formatBnb(state.reserve)} BNB`,
          `  Circulating supply:  ${state.circulatingSupply.toString()}`,
          `  Buy tax:             ${(Number(state.buyTaxRate) / 100).toFixed(2)}%`,
          `  Sell tax:            ${(Number(state.sellTaxRate) / 100).toFixed(2)}%`,
          `  DEX migration progress: ${(Number(state.progress) / 1e16).toFixed(2)}%`,
          `  DEX pool:            ${state.pool}`,
        ].join("\n"),
      );
    } catch {
      console.log("\n  Could not read Flap curve state — this address is not a token the Flap Portal recognizes.");
    }
  } else {
    console.log(`  Indicative price for a small probe amount: ${generic.priceWei.toString()}`);
  }

  console.log("");
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "token:inspect failed");
  process.exitCode = 1;
});
