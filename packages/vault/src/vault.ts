/**
 * Envelope encryption for BYOK provider keys (docs/SECURITY.md).
 * Each secret gets its own random data key (AES-256-GCM); the data key is wrapped by a
 * versioned key-encryption key (KEK) held only by the API host. Rotation re-wraps data
 * keys without touching ciphertext. AAD binds a secret to owner + provider + credential row,
 * and the wrapped key additionally to its KEK version, so rows cannot be swapped or replayed.
 * Buffer zeroing is best-effort: JS strings (the returned secret, the input) cannot be wiped.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { inspect } from "node:util";

export interface Sealed {
  ciphertext: Buffer; // iv(12) | tag(16) | ct
  wrappedKey: Buffer; // iv(12) | tag(16) | wrapped data key
  keyVersion: number;
  last4: string; // "" for keys shorter than 20 chars, where 4 chars would leak too much
}

/** Which credential row a secret belongs to. All three go into the AAD. */
export interface Binding {
  ownerId: string;
  provider: string;
  credentialId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export class KeyRing {
  readonly #keys: Map<number, Buffer>;

  private constructor(keys: Map<number, Buffer>, readonly current: number) {
    if (!keys.has(current)) throw new Error("current KEK version missing");
    this.#keys = keys;
  }

  /** `spec` = "1:<base64 32 bytes>,2:<base64>"; never logged. */
  static parse(spec: string, current: number): KeyRing {
    const keys = new Map<number, Buffer>();
    for (const part of spec.split(",")) {
      const m = /^(\d{1,6}):([A-Za-z0-9+/]{43}=)$/.exec(part.trim());
      if (!m) throw new Error("invalid KEK entry");
      const v = Number(m[1]);
      const k = Buffer.alloc(32);
      Buffer.from(m[2]!, "base64").copy(k);
      if (v < 1 || keys.has(v) || k.every((b) => b === 0)) throw new Error("invalid KEK entry");
      keys.set(v, k);
    }
    return new KeyRing(keys, current);
  }

  kek(version: number): Buffer {
    const k = this.#keys.get(version);
    if (!k) throw new Error(`KEK version ${version} not available`);
    return k;
  }

  [inspect.custom](): string {
    return `KeyRing { versions: [${[...this.#keys.keys()].join(", ")}], current: ${this.current} }`;
  }

  toJSON(): { versions: number[]; current: number } {
    return { versions: [...this.#keys.keys()], current: this.current };
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
  const d = createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12), { authTagLength: 16 });
  d.setAAD(aad);
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

function dataAad(b: Binding): Buffer {
  if (!UUID.test(b.ownerId) || !UUID.test(b.credentialId)) throw new Error("ownerId and credentialId must be UUIDs");
  if (!PROVIDER.test(b.provider)) throw new Error("invalid provider id");
  return Buffer.from(JSON.stringify(["feista:v1:data", b.ownerId.toLowerCase(), b.provider, b.credentialId.toLowerCase()]));
}
const wrapAad = (data: Buffer, version: number) => Buffer.concat([data, Buffer.from(`|kek:${version}`)]);

export function seal(ring: KeyRing, secret: string, bind: Binding): Sealed {
  const s = secret.trim();
  if (s.length < 8 || s.length > 4096) throw new Error("credential length out of range");
  const aad = dataAad(bind);
  const dataKey = randomBytes(32);
  const plain = Buffer.from(s, "utf8");
  try {
    return {
      ciphertext: enc(dataKey, plain, aad),
      wrappedKey: enc(ring.kek(ring.current), dataKey, wrapAad(aad, ring.current)),
      keyVersion: ring.current,
      last4: s.length >= 20 ? s.slice(-4) : "",
    };
  } finally {
    dataKey.fill(0);
    plain.fill(0);
  }
}

function unwrap(ring: KeyRing, sealed: Sealed, aad: Buffer): Buffer {
  return dec(ring.kek(sealed.keyVersion), sealed.wrappedKey, wrapAad(aad, sealed.keyVersion));
}

/** Server-side only, immediately before a provider call. Never return this to a client. */
export function open(ring: KeyRing, sealed: Sealed, bind: Binding): string {
  const aad = dataAad(bind);
  const dataKey = unwrap(ring, sealed, aad);
  let plain: Buffer | undefined;
  try {
    plain = dec(dataKey, sealed.ciphertext, aad);
    return plain.toString("utf8");
  } finally {
    dataKey.fill(0);
    plain?.fill(0);
  }
}

/** Rotation: re-wrap the data key under the current KEK; ciphertext is unchanged. */
export function rewrap(ring: KeyRing, sealed: Sealed, bind: Binding): Sealed {
  if (sealed.keyVersion === ring.current) return sealed;
  const aad = dataAad(bind);
  const dataKey = unwrap(ring, sealed, aad);
  try {
    return { ...sealed, wrappedKey: enc(ring.kek(ring.current), dataKey, wrapAad(aad, ring.current)), keyVersion: ring.current };
  } finally {
    dataKey.fill(0);
  }
}
