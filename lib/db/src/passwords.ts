import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;

/** Hashes a plaintext password into a `salt:derivedKey` string safe to store. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

/** Verifies a plaintext password against a hash produced by {@link hashPassword}. */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, derivedHex] = stored.split(":");
  if (!salt || !derivedHex) return false;

  const derived = Buffer.from(derivedHex, "hex");
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  if (derived.length !== candidate.length) return false;

  return timingSafeEqual(derived, candidate);
}
