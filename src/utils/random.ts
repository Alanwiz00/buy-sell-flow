import { randomBytes, randomInt } from "node:crypto";

/**
 * Unbiased integer in [min, max] inclusive, both ends. Backed by
 * node:crypto's randomInt, which uses rejection sampling internally to
 * avoid modulo bias.
 */
export function randomIntInRange(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new RangeError("randomIntInRange requires integer bounds");
  }
  if (min > max) {
    throw new RangeError(`randomIntInRange: min (${min}) > max (${max})`);
  }
  return randomInt(min, max + 1);
}

/**
 * Unbiased bigint in [min, max] inclusive. Generates exactly enough random
 * bytes to cover the range's bit length and rejects out-of-range draws,
 * rather than using modulo (which would bias small ranges over large
 * byte-aligned ones).
 */
export function randomBigIntInRange(min: bigint, max: bigint): bigint {
  if (min > max) {
    throw new RangeError(`randomBigIntInRange: min (${min}) > max (${max})`);
  }
  const range = max - min + 1n;
  if (range === 1n) return min;

  const bitLength = range.toString(2).length;
  const byteLength = Math.ceil(bitLength / 8);
  const mask = (1n << BigInt(bitLength)) - 1n;

  for (;;) {
    const buf = randomBytes(byteLength);
    let value = 0n;
    for (const byte of buf) value = (value << 8n) | BigInt(byte);
    value &= mask;
    if (value < range) return min + value;
  }
}

/** Unbiased two-way weighted pick. Weights may be any non-negative numbers. */
export function weightedPick<A extends string, B extends string>(
  labelA: A,
  weightA: number,
  labelB: B,
  weightB: number,
): A | B {
  const scale = 1000;
  const a = Math.max(0, Math.round(weightA * scale));
  const b = Math.max(0, Math.round(weightB * scale));
  const total = a + b;
  if (total <= 0) {
    throw new RangeError("weightedPick: combined weight must be > 0");
  }
  return randomInt(0, total) < a ? labelA : labelB;
}
