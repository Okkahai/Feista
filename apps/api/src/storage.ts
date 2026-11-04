import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

/** Object storage for project media. Keys are server-generated: `<project_id>/<node>/g<gen>/<relpath>`. */
export interface Storage {
  put(key: string, fromFile: string): Promise<void>;
  get(key: string, toFile: string): Promise<void>;
}

const KEY = /^[0-9a-f-]{36}\/[a-z_]+(:[0-9]+)?\/g[0-9]+\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;

export function assertKey(key: string): void {
  if (!KEY.test(key) || key.split("/").some((s) => s === "." || s === "..")) throw new Error(`invalid storage key ${key}`);
}

/** shortcut: local directory storage for dev/tests; swap for the S3 API (MinIO locally, R2 in prod) before any deploy. */
export function localStorage(root: string): Storage {
  const base = resolve(root);
  const at = (key: string) => {
    assertKey(key);
    const p = resolve(join(base, key));
    if (!p.startsWith(base + sep)) throw new Error("storage key escapes root");
    return p;
  };
  return {
    async put(key, fromFile) {
      const p = at(key);
      await mkdir(dirname(p), { recursive: true });
      await copyFile(fromFile, p);
    },
    async get(key, toFile) {
      await mkdir(dirname(toFile), { recursive: true });
      await copyFile(at(key), toFile);
    },
  };
}
