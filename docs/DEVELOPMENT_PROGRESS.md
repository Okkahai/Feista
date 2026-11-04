# Development progress

_Last updated 2026-11-04._ Status words: planned · implemented · mocked · tested locally · tested live · integrated · production-ready.

## Done (session 1, all merged into `develop` via PR + independent review + CI)
- PR #3 Phase A audit + provider research (`ARCHITECTURE.md` §1, `PROVIDER_INTEGRATIONS.md`).
- PR #1 `@feista/core`: lifecycle (generations, lease-loss cap, `blockedReason`), Story DAG, fail-closed budget guard, provider contract. **Tested locally** (17 tests).
- PR #2 `feista-media`: assembly port + media QA. Review found and fixed a music-path traversal. **Tested locally**, real EP002 regression identical captions, −14.0 LUFS.
- PR #4 `apps/mobile`: Expo SDK 58 app, design system, 5 tabs + project detail on **fixture data**. Review fixes: monthly cap enforcement, repo-level retry guard, inline errors, strict money parsing. tsc/lint/jest (15)/android export green. **Not run on a device.**

## Done (2026-11-04, BYOK backend foundation)
- PR #5 `db/`: schema with forced RLS keyed on `app.user_id`, `feista_api` login role with no privileges of its own, temp tables revoked. **Tested locally + CI** (`db/tests/rls_test.sql`, mutation-checked).
- PR #6 `@feista/vault`: AES-256-GCM envelope encryption bound to owner+provider+credential row, KEK rotation by re-wrap, log redaction (linear-time on hostile input). Two review rounds. **Tested locally + CI** (38 tests).
- `apps/api` (Hono + pg): dev-token auth **stub**, `/v1/projects` (list/get/create), `/v1/credentials` (write-only BYOK keys: add/replace, list last4, revoke + wipe), `loadSecret()` for the job runner, redacted error logs. **Tested locally** against real Postgres as `feista_api` (13 integration tests, incl. pooled-connection scoping and concurrent key adds). Not deployed.

- Story job runner (`apps/api/src/runner.ts`, migration 0002): `stage_runs` is the queue; DAG advance on completion (serialized per project), retries with backoff via core `transition`, lease reaping with fencing, budget gate before every paid stage (deny / park for approval / fail closed without an estimate, ledger reservation then reported cost), review + spend approval endpoint, handlers get the owner's own BYOK key. **Tested locally** with fake handlers (7 runner tests). No real stage handlers yet.

- Media stages on the runner (`apps/api/src/media.ts`, `runner-main.ts`): `assembly` gathers the current-generation outputs of completed nodes into the episode layout and runs the `feista_media` port; `media_qa` checks the final against the delivery spec and fails permanently on a miss. Local directory storage (shortcut until MinIO/R2). **Tested locally** with real FFmpeg on synthetic media through the queue (pass + QA-fail cases). Runner process exists (`pnpm --filter @feista/api runner`) but only media stages have handlers; paid stages wait for provider adapters.
- Known accepted gaps from the runner review: a retry replaces the node's unreported reservation, so a provider that still charged a failed attempt is undercounted by at most one estimate per lost attempt; a DB error inside the budget check rolls the claim back and re-queues the node.

## Review follow-ups (accepted, not done)
- Design pass items in `DESIGN_SYSTEM.md` → "Open critique".
- Create form duration range (30–90 s) vs repo (15–180 s): pick one source of truth when the API exists.
- Budget reservation entry must be released/replaced by reported costs in the API repo.
- Duplicate stage ids aren't detected by `expand()`.
- No automated parity test against the original `build_short.py` (manual regression only).

## Next (in order)
1. Provider adapters as runner handlers (fal, ElevenLabs, LLM) on recorded fixtures; S3 storage (MinIO locally) replacing the local-dir shortcut; new-take invalidation (`invalidated()`) endpoint.
2. Real auth (Supabase Auth JWT or self-hosted equivalent) replacing the dev-token stub; user provisioning path.
3. Provider adapters (fal, ElevenLabs, Anthropic, Higgsfield) with contract tests on recorded fixtures — live smoke tests only after Gün approves a small budget.
4. Mobile ↔ API wiring, push notifications.
5. Clip Studio custom pipeline (faster-whisper, MediaPipe reframing).
6. YouTube OAuth app + publish adapter.

## Rule (2026-11-04)
Strictly BYOK: users pay their own providers; Gün pays for no generations. Infra stays on free tiers / local until Gün approves otherwise.

## Blocked on Gün (approval / accounts)
- Paid/hosted services: Supabase, Cloudflare R2, Vercel Pro (commercial use), Railway/Cloud Run, fal.ai, ElevenLabs paid plan, Higgsfield API balance, Anthropic API key.
- Google Cloud OAuth app (consent screen, verified domain, privacy policy) for YouTube.
- Apple/Google developer accounts for store builds.

## Known limitations
- API auth is a dev-token stub; `server.ts` refuses to start with `NODE_ENV=production`.
- Mobile screens run on fixture data.
- No provider has been called live.
- Real-episode regression is manual (media is private, not in the public repo).
