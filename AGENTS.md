# Feista: agent instructions (provider-neutral)

Applies to every coding agent (Claude Code, Codex CLI, any T3 Code worker) and every human contributor.
Claude-specific notes live in `CLAUDE.md`; everything shared lives here and in `docs/agent/`.

## Start here
1. `docs/agent/HANDOFF.md` — what a new coordinator must know first.
2. `docs/agent/TASK_REGISTRY.md` — every open task with a stable ID. Pick work only from there.
3. `docs/agent/PROJECT_STATE.md`, `docs/agent/ARCHITECTURE.md`, `docs/agent/DECISIONS.md`, `docs/agent/VERIFICATION.md`.
4. Deeper reference: `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (ADR log), `docs/DEVELOPMENT_PROGRESS.md` (per-PR status log), `docs/SECURITY.md`, `docs/PROVIDER_INTEGRATIONS.md`, `docs/DESIGN_SYSTEM.md`.

## What this is
Feista is an AI content studio: an Expo mobile app (control surface) + a TypeScript API and job runner + Python FFmpeg workers.
Two engines: **Story Studio** (original AI animated Shorts from 16 format presets) and **Clip Studio** (the user's own or licensed stream recordings → ranked, captioned 9:16 clips).
Owner: Gün (GitHub `Okkahai`). Gün writes Turkish or English; answer in the language Gün used.

## Layout
- `packages/core` — job lifecycle, Story/Clip DAGs, budget guard, provider contract, format presets (`formats.ts`). Pure TS, vitest.
- `packages/vault` — AES-256-GCM envelope encryption for BYOK keys + log redaction.
- `packages/providers` — fal.ai, ElevenLabs, Anthropic adapters (mocked/contract-tested only).
- `apps/api` — Hono API (dev-token auth stub) + `stage_runs` job runner + stage handlers.
- `apps/mobile` — Expo SDK 58 app on **fixture data** (not wired to the API).
- `workers/media` — Python: Story assembly (port of `build_short.py`), clip render, media QA. pytest uses real ffmpeg.
- `db/` — SQL migrations, forced-RLS isolation tests, `with-temp-db.sh`.

## Commands
- Install: `corepack enable && pnpm install --frozen-lockfile` (pnpm 10.28.0, Node 22).
- TS: `pnpm -r typecheck`, `pnpm --filter './packages/*' test`, `pnpm --filter @feista/api test` (starts a throwaway Postgres 16 if `DATABASE_URL` is unset).
- DB: `db/tests/run.sh` (needs `DATABASE_URL` + `FEISTA_DISPOSABLE_DB=1`, or local Postgres binaries).
- Mobile: `cd apps/mobile && pnpm typecheck && pnpm lint && pnpm test --ci && npx expo export --platform android --output-dir /tmp/export`.
- Media: `cd workers/media && pip install -e ".[dev]" && ruff check . && mypy feista_media && pytest -q` (needs ffmpeg).
- Full procedure and expected counts: `docs/agent/VERIFICATION.md`.

## Git and review workflow
- Branch from `develop`; one task per branch (`feat/<topic>`, `fix/<topic>`, `docs/<topic>`); one Git worktree per agent.
- PRs target `develop`. `main` is release-only (still at the initial commit) and needs Gün's approval.
- Push to the exact remote URL `https://github.com/Okkahai/Feista.git`. A lowercase `okkahai/feista` remote has updated branches without triggering the PR sync/CI (seen on PR #7, 2026-11-04).
- Every PR: independent reviewer pass before merge, all five CI workflows green (`ci-core`, `ci-api`, `ci-db`, `ci-media`, `ci-mobile`), and `docs/DEVELOPMENT_PROGRESS.md` + `docs/agent/TASK_REGISTRY.md` updated in the same PR.
- Never rewrite history on shared branches; never skip, disable or quarantine a test to get green.

## Hard rules (owner decisions; see `docs/agent/DECISIONS.md`)
- **Strictly BYOK.** Every AI generation runs on the end user's own provider key and bills the user. Gün pays for no generations. No paid accounts or services on Gün's side (Supabase, R2, Vercel Pro, Railway, fal, ElevenLabs, Higgsfield API, Anthropic key, Google OAuth app, store accounts) without Gün's explicit OK. Infra = free tiers / local Docker.
- **No live provider calls** on Gün's account. Live smoke tests only with a key a user supplies and a budget Gün approved. Mock tests never count as "tested against provider".
- **Needs Gün's explicit approval:** production deploys, public releases, merging to `main`, spending money, destructive operations, access-control changes, any irreversible external action (publishing, emailing, posting).
- Status words, used honestly: planned · implemented · mocked · tested locally · tested live · integrated · production-ready. A thread or agent saying "done" is not verification.
- Provider keys are server-side only: never in the app bundle, logs, fixtures, or git. The repo is **public**.
- YouTube: always send `status.privacyStatus` explicitly (API default became `public` on 2026-11-02); never publish outside the user's configured policy.
- Clip Studio: only the user's own or licensed recordings (`config.rights` = `own` | `licensed`); no YouTube downloading.
- Format library: 16 presets + custom; **no channel-named format** ("Wobbi" is a channel name, never a format). Presets must force variety (YouTube 2026-07-16 inauthentic/repetitive-content policy; limit "animal in distress then rescued" plots).
- Preserve the proven production techniques (`docs/ARCHITECTURE.md` §1) unless a measured improvement replaces them.
- Out of scope for app work: the live Wobbi Tales YouTube channel and the scripts on Gün's PC. Do not touch them.
