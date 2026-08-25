import { describe, expect, it, vi } from "vitest";
import type { Provider, TransactionReceipt, TransactionResponse } from "ethers";
import {
  sendAndConfirm,
  TransactionConfirmationError,
} from "../src/execution/transactionManager.js";

const receipt = { status: 1 } as TransactionReceipt;

describe("sendAndConfirm", () => {
  it("returns a successful receipt without resending", async () => {
    const tx = { hash: "0xabc", wait: vi.fn().mockResolvedValue(receipt) } as unknown as TransactionResponse;
    const send = vi.fn().mockResolvedValue(tx);

    await expect(sendAndConfirm(send, {} as Provider, 1)).resolves.toEqual({ tx, receipt });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("falls back to a direct receipt lookup when wait fails", async () => {
    const tx = { hash: "0xabc", wait: vi.fn().mockRejectedValue(new Error("timeout")) } as unknown as TransactionResponse;
    const send = vi.fn().mockResolvedValue(tx);
    const provider = { getTransactionReceipt: vi.fn().mockResolvedValue(receipt) } as unknown as Provider;

    await expect(sendAndConfirm(send, provider, 1)).resolves.toEqual({ tx, receipt });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("preserves the hash and refuses implicit resubmission when receipt RPC fails", async () => {
    const tx = { hash: "0xabc", wait: vi.fn().mockRejectedValue(new Error("timeout")) } as unknown as TransactionResponse;
    const send = vi.fn().mockResolvedValue(tx);
    const provider = {
      getTransactionReceipt: vi.fn().mockRejectedValue(new Error("Archive requests require a personal token")),
    } as unknown as Provider;

    await expect(sendAndConfirm(send, provider, 1)).rejects.toBeInstanceOf(TransactionConfirmationError);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
