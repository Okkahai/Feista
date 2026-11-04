/**
 * Envelope encryption for BYOK provider keys (docs/SECURITY.md).
 * Each secret gets its own random data key (AES-256-GCM); the data key is wrapped by a
 * versioned key-encryption key (KEK) held only by the API host. Rotation re-wraps data
 * keys without touching ciphertext. AAD binds a secret to its owner+provider, so a row
 * copied to another user fails to decrypt.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface Sealed {
  ciphertext: Buffer; // iv(12) | tag(16) | ct
  wrappedKey: Buffer; // iv(12) | tag(16) | wrapped data key
  keyVersion: number;
  last4: string;
}

export class KeyRing {
  private constructor(private keys: Map<number, Buffer>, readonly current: number) {
    if (!keys.has(current)) throw new Error("current KEK version missing");
  }

  /** `spec` = "1:<base64 32 bytes>,2:<base64>"; never logged. */
  static parse(spec: string, current: number): KeyRing {
    const keys = new Map<number, Buffer>();
    for (const part of spec.split(",").filter(Boolean)) {
      const i = part.indexOf(":");
      const v = Number(part.slice(0, i));
      const k = Buffer.from(part.slice(i + 1), "base64");
      if (!Number.isInteger(v) || v < 1 || k.length !== 32 || keys.has(v)) throw new Error("invalid KEK entry");
      keys.set(v, k);
    }
    return new KeyRing(keys, current);
  }

  kek(version: number): Buffer {
    const k = this.keys.get(version);
    if (!k) throw new Error(`KEK version ${version} not available`);
    return k;
  }
}

function enc(key: Buffer, plain: Buffer, aad: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

function dec(key: Buffer, blob: Buffer, aad: Buffer): Buffer {
  if (blob.length < 28) throw new Error("ciphertext too short");
  const d = createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12));
  d.setAAD(aad);
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

const aadFor = (ownerId: string, provider: string) => Buffer.from(`feista:v1:${ownerId}:${provider}`);

export function seal(ring: KeyRing, secret: string, ownerId: string, provider: string): Sealed {
  const s = secret.trim();
  if (s.length < 8 || s.length > 4096) throw new Error("credential length out of range");
  const aad = aadFor(ownerId, provider);
  const dataKey = randomBytes(32);
  try {
    return {
      ciphertext: enc(dataKey, Buffer.from(s, "utf8"), aad),
      wrappedKey: enc(ring.kek(ring.current), dataKey, aad),
      keyVersion: ring.current,
      last4: s.slice(-4),
    };
  } finally {
    dataKey.fill(0);
  }
}

/** Server-side only, immediately before a provider call. Never return this to a client. */
export function open(ring: KeyRing, sealed: Sealed, ownerId: string, provider: string): string {
  const aad = aadFor(ownerId, provider);
  const dataKey = dec(ring.kek(sealed.keyVersion), sealed.wrappedKey, aad);
  try {
    return dec(dataKey, sealed.ciphertext, aad).toString("utf8");
  } finally {
    dataKey.fill(0);
  }
}

/** Rotation: re-wrap the data key under the current KEK; ciphertext is unchanged. */
export function rewrap(ring: KeyRing, sealed: Sealed, ownerId: string, provider: string): Sealed {
  if (sealed.keyVersion === ring.current) return sealed;
  const aad = aadFor(ownerId, provider);
  const dataKey = dec(ring.kek(sealed.keyVersion), sealed.wrappedKey, aad);
  try {
    return { ...sealed, wrappedKey: enc(ring.kek(ring.current), dataKey, aad), keyVersion: ring.current };
  } finally {
    dataKey.fill(0);
  }
}
