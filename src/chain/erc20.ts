import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BaseContract, Contract, type ContractTransactionResponse, type Provider, type Signer } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ERC20_ABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../abi/ERC20.json"), "utf8"));

export interface Erc20Contract extends BaseContract {
  balanceOf(account: string): Promise<bigint>;
  decimals(): Promise<bigint>;
  symbol(): Promise<string>;
  allowance(owner: string, spender: string): Promise<bigint>;
  approve(spender: string, amount: bigint): Promise<ContractTransactionResponse>;
}

export function getErc20Contract(address: string, runner: Provider | Signer): Erc20Contract {
  return new Contract(address, ERC20_ABI, runner) as unknown as Erc20Contract;
}
