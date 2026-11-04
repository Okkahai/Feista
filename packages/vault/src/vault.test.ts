import { randomBytes, randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { KeyRing, open, redact, rewrap, seal, type Binding } from "./index";

const k = () => randomBytes(32).toString("base64");
const k1 = k(), k2 = k();
const ring1 = KeyRing.parse(`1:${k1}`, 1);
const ring2 = KeyRing.parse(`1:${k1},2:${k2}`, 2);
const SECRET = "fal_live_0123456789abcdefWXYZ";
const A: Binding = { ownerId: randomUUID(), provider: "fal", credentialId: randomUUID() };

describe("vault", () => {
  it("round-trips and never stores the plaintext", () => {
    const s = seal(ring1, SECRET, A);
    expect(s.last4).toBe("WXYZ");
    expect(s.ciphertext.includes(Buffer.from(SECRET))).toBe(false);
    expect(open(ring1, s, A)).toBe(SECRET);
  });
  it("same secret encrypts differently each time", () => {
    expect(seal(ring1, SECRET, A).ciphertext.equals(seal(ring1, SECRET, A).ciphertext)).toBe(false);
  });
  it("is bound to owner, provider and credential row", () => {
    const s = seal(ring1, SECRET, A);
    expect(() => open(ring1, s, { ...A, ownerId: randomUUID() })).toThrow();
    expect(() => open(ring1, s, { ...A, provider: "elevenlabs" })).toThrow();
    expect(() => open(ring1, s, { ...A, credentialId: randomUUID() })).toThrow(); // revoked row's blob swapped into a live row
  });
  it("binds the wrapped key to its KEK version", () => {
    const s = seal(ring2, SECRET, A);
    const both = KeyRing.parse(`1:${k2},2:${k2}`, 2); // same key bytes under two versions
    expect(open(both, s, A)).toBe(SECRET);
    expect(() => open(both, { ...s, keyVersion: 1 }, A)).toThrow();
  });
  it("rejects malformed bindings", () => {
    expect(() => seal(ring1, SECRET, { ...A, ownerId: "user-a" })).toThrow(/UUID/);
    expect(() => seal(ring1, SECRET, { ...A, provider: 'fal","x' })).toThrow(/provider/);
  });
  it("detects tampering", () => {
    const s = seal(ring1, SECRET, A);
    const ct = Buffer.from(s.ciphertext);
    ct[ct.length - 1]! ^= 1;
    expect(() => open(ring1, { ...s, ciphertext: ct }, A)).toThrow();
    expect(() => open(ring1, { ...s, ciphertext: s.ciphertext.subarray(0, 20) }, A)).toThrow();
  });
  it("rotates by re-wrapping only; old KEK can then be retired", () => {
    const s1 = seal(ring1, SECRET, A);
    const s2 = rewrap(ring2, s1, A);
    expect(s2.keyVersion).toBe(2);
    expect(s2.ciphertext.equals(s1.ciphertext)).toBe(true);
    const only2 = KeyRing.parse(`2:${k2}`, 2);
    expect(open(only2, s2, A)).toBe(SECRET);
    expect(() => open(only2, s1, A)).toThrow(/not available/);
  });
  it("rejects bad key material and bad secrets", () => {
    for (const spec of [
      `1:${randomBytes(16).toString("base64")}`,
      `1:${k1},1:${k2}`,
      `1.5:${k1}`,
      `0x1:${k1}`,
      `1:${k1}junk`,
      `1:${Buffer.alloc(32).toString("base64")}`,
      `1:${k1},`,
      "",
    ]) expect(() => KeyRing.parse(spec, 1), spec).toThrow();
    expect(() => KeyRing.parse(`1:${k1}`, 2)).toThrow();
    expect(() => seal(ring1, "short", A)).toThrow();
  });
  it("exposes no KEK accessor", () => {
    expect((ring2 as unknown as Record<string, unknown>).kek).toBeUndefined();
  });
  it("never prints KEKs", () => {
    const raw = Buffer.from(k1, "base64").toString("hex");
    for (const s of [inspect(ring2, { showHidden: true, depth: 5 }), JSON.stringify(ring2), String(ring2)]) {
      expect(s).not.toContain(k1);
      expect(s).not.toContain(raw);
    }
  });
  it("hides last4 for short keys", () => {
    expect(seal(ring1, "abcd1234efgh", A).last4).toBe("");
  });
});

describe("redact", () => {
  it("removes known secrets and common key shapes", () => {
    const line = `POST failed key=${SECRET} Authorization: Bearer abc.def.ghi123 Authorization: Key 1234abcd:efgh5678ijkl sk-ant-api03-AAAAAAAAAAAAAAAAAAAA https://r2.example/x.mp4?X-Amz-Signature=deadbeef&X-Amz-Expires=60 ya29.a0AfH6SMBxxxxxxxxxxxxxxxxxxxxxx`;
    const out = redact(line, [SECRET]);
    for (const leak of [SECRET, "abc.def.ghi123", "efgh5678ijkl", "sk-ant-api03", "deadbeef", "ya29.a0"]) expect(out).not.toContain(leak);
    expect(out).toContain("X-Amz-Signature=[REDACTED]");
    expect(out).toContain("X-Amz-Expires=60");
    expect(out).toContain("POST failed");
  });
  it.each([
    ["google api key", "AIzaSyA1234567890abcdefghijklmnopqrstuv"],
    ["google client secret", "GOCSPX-abcdefghijklmnopqrstuvwx"],
    ["aws key id", "AKIAIOSFODNN7EXAMPLE"],
    ["jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"],
    ["replicate", "r8_abcdefghijklmnopqrstuvwxyz0123"],
    ["fal id:secret", "0b5f2c3e-1111-4222-8333-944455556666:0123456789abcdef0123456789abcdef"],
    ["pem", "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----"],
  ])("pattern: %s", (_, secret) => {
    expect(redact(`before ${secret} after`)).toBe("before [REDACTED] after");
  });
  it.each([
    ['{"api_key":"q9w8e7r6t5y4"}', "q9w8e7r6t5y4"],
    ['{"client_secret": "GSecretValue99"}', "GSecretValue99"],
    ["xi-api-key: 0123456789abcdef0123456789abcdef", "0123456789abcdef"],
    ["x-api-key=zzzzyyyyxxxx", "zzzzyyyyxxxx"],
    ["https://storage.googleapis.com/b/o?X-Goog-Signature=abc123def&X-Goog-Credential=svc%40x", "abc123def"],
    ["https://r2/x?X-Amz-Security-Token=FQoGZXIvYXdzEJr", "FQoGZXIvYXdzEJr"],
    ["authorization: basic dXNlcjpwYXNzd29yZA==", "dXNlcjpwYXNzd29yZA"],
  ])("named field: %s", (line, leak) => {
    expect(redact(line)).not.toContain(leak);
  });
  it("redacts encoded forms of known secrets", () => {
    const s = "my/secret+key=value&x";
    expect(redact(`u?k=${encodeURIComponent(s)} j=${JSON.stringify({ s: 'a"b\\c' + s })}`, [s, 'a"b\\c' + s])).not.toMatch(/secret/);
  });
  it.each([
    ["AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "wJalrXUtnFEMI"],
    ['{"secretAccessKey":"wJalrXUtnFEMI"}', "wJalrXUtnFEMI"],
    ["Authorization: AWS4-HMAC-SHA256 Credential=AKIA/x, Signature=fe5f80f77d5fa3beca038a248ff027d0445342fe2855ddc963176630326f1024", "fe5f80f77d5f"],
    ["postgresql://feista:hunter2pass@db.local:5432/x", "hunter2pass"],
    ['{"api_key":"abc\\"defghij123"}', "defghij123"],
    ["ghp_abcdefghijklmnopqrstuvwxyz0123456789", "ghp_abcdef"],
    ["hf_abcdefghijklmnopqrstuvwxyz012345", "hf_abcdef"],
  ])("also: %s", (line, leak) => {
    expect(redact(line)).not.toContain(leak);
  });
  it("does not over-match look-alike names", () => {
    for (const line of ['"max_token":4096000', "nonsecret=visible1", "mysecret:visible2"]) expect(redact(line)).toBe(line);
  });
  it("stays linear on hostile input (unterminated PEM)", () => {
    const t0 = performance.now();
    redact("-----BEGIN PRIVATE KEY-----".repeat(20000));
    expect(performance.now() - t0).toBeLessThan(1000);
  });
  it("leaves ordinary prose alone", () => {
    const prose = "Key results from the Basic plan: Key moments were great. Token budget remaining 4000.";
    expect(redact(prose)).toBe(prose);
  });
});
