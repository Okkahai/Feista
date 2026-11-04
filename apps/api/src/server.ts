/** Local dev server. Env: DATABASE_URL (as feista_api), FEISTA_KEKS ("1:<b64>"), FEISTA_KEK_CURRENT, FEISTA_DEV_AUTH_SECRET, FEISTA_DEV_AUTH=1. */
import { serve } from "@hono/node-server";
import pg from "pg";
import { KeyRing, redact } from "@feista/vault";
import { createApp } from "./app";
import { devTokens } from "./auth";

const env = (k: string) => process.env[k] ?? (() => { throw new Error(`${k} is required`); })();
if (process.env.NODE_ENV === "production" || process.env.FEISTA_DEV_AUTH !== "1")
  throw new Error("dev auth stub needs FEISTA_DEV_AUTH=1 and never runs with NODE_ENV=production");

const ring = KeyRing.parse(env("FEISTA_KEKS"), Number(env("FEISTA_KEK_CURRENT")));
const pool = new pg.Pool({ connectionString: env("DATABASE_URL"), max: 10 });
pool.on("error", (e) => console.error(redact(`idle db connection error: ${e.message}`))); // otherwise an idle drop crashes the process
const { authenticate } = devTokens(Buffer.from(env("FEISTA_DEV_AUTH_SECRET"), "base64"));
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp({ pool, ring, authenticate }).fetch, port, hostname: "127.0.0.1" });
console.log(`feista api on http://127.0.0.1:${port}`);
