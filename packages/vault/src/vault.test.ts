import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { KeyRing, open, redact, rewrap, seal } from "./index";

const k = () => randomBytes(32).toString("base64");
const k1 = k(), k2 = k();
const ring1 = KeyRing.parse(`1:${k1}`, 1);
const ring2 = KeyRing.parse(`1:${k1},2:${k2}`, 2);
const SECRET = "fal_live_0123456789abcdefWXYZ";

describe("vault", () => {
  it("round-trips and never stores the plaintext", () => {
    const s = seal(ring1, SECRET, "user-a", "fal");
    expect(s.last4).toBe("WXYZ");
    expect(s.ciphertext.includes(Buffer.from(SECRET))).toBe(false);
    expect(open(ring1, s, "user-a", "fal")).toBe(SECRET);
  });
  it("same secret encrypts differently each time", () => {
    expect(seal(ring1, SECRET, "a", "fal").ciphertext.equals(seal(ring1, SECRET, "a", "fal").ciphertext)).toBe(false);
  });
  it("is bound to owner and provider (row copied to another user fails)", () => {
    const s = seal(ring1, SECRET, "user-a", "fal");
    expect(() => open(ring1, s, "user-b", "fal")).toThrow();
    expect(() => open(ring1, s, "user-a", "elevenlabs")).toThrow();
  });
  it("detects tampering", () => {
    const s = seal(ring1, SECRET, "a", "fal");
    const ct = Buffer.from(s.ciphertext);
    ct[ct.length - 1]! ^= 1;
    expect(() => open(ring1, { ...s, ciphertext: ct }, "a", "fal")).toThrow();
  });
  it("rotates by re-wrapping only; old KEK can then be retired", () => {
    const s1 = seal(ring1, SECRET, "a", "fal");
    const s2 = rewrap(ring2, s1, "a", "fal");
    expect(s2.keyVersion).toBe(2);
    expect(s2.ciphertext.equals(s1.ciphertext)).toBe(true);
    const only2 = KeyRing.parse(`2:${k2}`, 2);
    expect(open(only2, s2, "a", "fal")).toBe(SECRET);
    expect(() => open(only2, s1, "a", "fal")).toThrow(/not available/);
  });
  it("rejects bad key material and bad secrets", () => {
    expect(() => KeyRing.parse(`1:${randomBytes(16).toString("base64")}`, 1)).toThrow();
    expect(() => KeyRing.parse(`1:${k1}`, 2)).toThrow();
    expect(() => KeyRing.parse(`1:${k1},1:${k2}`, 1)).toThrow();
    expect(() => seal(ring1, "short", "a", "fal")).toThrow();
  });
});

describe("redact", () => {
  it("removes known secrets and common key shapes", () => {
    const line = `POST failed key=${SECRET} Authorization: Bearer abc.def.ghi123 Key 1234abcd:efgh5678ijkl sk-ant-api03-AAAAAAAAAAAAAAAAAAAA https://r2.example/x.mp4?X-Amz-Signature=deadbeef&X-Amz-Expires=60 ya29.a0AfH6SMBxxxxxxxxxxxxxxxxxxxxxx`;
    const out = redact(line, [SECRET]);
    for (const leak of [SECRET, "abc.def.ghi123", "efgh5678ijkl", "sk-ant-api03", "deadbeef", "ya29.a0"]) expect(out).not.toContain(leak);
    expect(out).toContain("X-Amz-Signature=[REDACTED]");
    expect(out).toContain("X-Amz-Expires=60");
    expect(out).toContain("POST failed");
  });
});
