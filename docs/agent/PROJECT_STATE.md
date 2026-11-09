# Project state

_Snapshot: 2026-11-06 14:00 UTC, `develop` @ `b19fa18` (merge of PR #15). Written for the migration from Claude Code Cloud Projects to a local T3 Code setup._
Evidence tags: **[V]** verified in this snapshot (git, GitHub API, local test run), **[H]** historical decision recorded by Gün or prior sessions (project memory / thread records), **[A]** assumption, **[Q]** unresolved question.

## 1. Goals, scope, non-goals
- **Origin [H].** The project began 2026-09-26 as a manual-but-automated pipeline producing original 20–35 s AI animal micro-story YouTube Shorts for Gün's channel *Wobbi Tales* (31 episodes made 2026-09-26/27; 30 scheduled one per day 2026-09-27 → 2026-10-26). That pipeline ran in Claude chat sessions with Higgsfield/ElevenLabs connectors and a Remote Control session on Gün's Windows PC. It is **not** in this repo.
- **Current goal [H] (master brief 2026-11-03).** Turn that pipeline into **Feista**, a production-grade mobile AI content studio:
  - Story Studio: idea → script → characters → keyframes → scene video → narration → music → assembly/captions → media QA → metadata → review → publish, with per-scene retries and budget gates.
  - Clip Studio: authorized recording → transcription → LLM highlight ranking → 9:16 clips with captions → QA → review → publish.
  - BYOK provider connections, YouTube OAuth publishing, design language "Cinematic Analog × Editorial Brutalism".
- **Format scope [H] (2026-11-05).** Support every animated-Short format on the market via a template library: 16 formats in 5 families + streamer clips = 17. "Wobbi" is a channel name, never a format; animal stories is one generic preset.
- **Non-goals [H].** Operator-paid generations; paid infrastructure without approval; touching the live Wobbi Tales channel or Gün's PC scripts from app work; downloading third-party YouTube content; copying specific channels' characters; auto-publishing anything public.

## 2. Architecture and technology [V]
See `docs/agent/ARCHITECTURE.md`. In short: pnpm monorepo (Node 22, pnpm 10.28.0, TS 5.9 / 6.0 in mobile), Hono + `pg` API, Postgres 16 with forced RLS, `stage_runs` table as the job queue, Python 3.12 media worker using FFmpeg and faster-whisper, Expo SDK 58 / React Native 0.88 / React 19.3 app.

## 3. Completed work [V: merged + CI green on develop; verification level per item]
| PR | Merged (UTC) | What | Verification level |
|---|---|---|---|
| #1 | 2026-11-03 21:54 | `@feista/core` lifecycle, DAG, budget guard, provider registry | tested locally + CI |
| #2 | 2026-11-03 21:56 | `feista-media` port of `build_short.py` + media QA | tested locally (real ffmpeg) + manual EP002 regression |
| #3 | 2026-11-03 21:43 | Docs: audit, architecture, ADRs, provider research, security | docs |
| #4 | 2026-11-04 02:01 | Expo app foundation + design system (fixture data) | tsc/lint/jest/android export; **never run on a device** |
| #5 | 2026-11-04 10:43 | DB schema + forced RLS + isolation tests | tested locally + CI |
| #6 | 2026-11-04 10:59 | BYOK vault + log redaction | tested locally + CI |
| #7 | 2026-11-04 15:33 | Hono API skeleton (projects, credentials) | tested locally against real Postgres |
| #8 | 2026-11-04 16:35 | Job runner: queue, retries, leases, budget gate, approvals | tested locally (fake handlers) |
| #9 | 2026-11-04 21:49 | Assembly + media QA as runner stages | tested locally (real ffmpeg, synthetic media) |
| #10 | 2026-11-04 21:57 | fal.ai + ElevenLabs adapters | **mocked** (contract tests on documented shapes) |
| #11 | 2026-11-04 22:16 | keyframe / scene_video / narration stages, job re-attach | **mocked** |
| #12 | 2026-11-05 01:58 | concept / script stages on owner's Anthropic key | **mocked** |
| #13 | 2026-11-05 02:09 | characters stage (reference sheet) | **mocked** |
| #14 | 2026-11-05 02:28 | 16 format presets + per-character voices | **mocked** (+1 real-ffmpeg test for wordless assembly) |
| #15 | 2026-11-05 17:19 | Clip Studio pipeline | tested locally (real ffmpeg, stubbed transcriber, fake Anthropic) |

Nothing is `tested live`, `integrated` or `production-ready`. No provider has ever been called live. Nothing is deployed.

## 4. Unfinished work
All of it is listed with IDs in `docs/agent/TASK_REGISTRY.md`. **No task is in progress** at snapshot time [V: app thread confirmed clean tree, no work started after PR #15].

## 5. Known bugs, debt and accepted gaps [V from `docs/DEVELOPMENT_PROGRESS.md`]
- Narration fails closed: estimates need `projects.config.tts_cents_per_1k_chars` and there is no API setter (T-006).
- `music`, `metadata`, `publish` stages have no handlers; Story projects stop there (T-004, T-005, T-012).
- Storage is a local directory shortcut (`apps/api/src/storage.ts`); no S3/MinIO, no upload endpoint (T-001).
- Polling runs hold a worker slot; no `awaiting_provider` parking/webhooks (T-007). scene_video depends on fal keeping the keyframe URL alive.
- Text stages: a lost lease mid-call can let a second runner pay again; a 16k-token cut-off fails after billing; fallback-model answers are not priced (ceiling estimate stands).
- Runner: a retry replaces an unreported reservation (undercount ≤ one estimate per lost attempt); DB error inside the budget check re-queues.
- `expand()` does not detect duplicate stage ids; duration ranges disagree (mobile Create 30–90 s vs repo 15–180 s vs presets 10–180 s); no automated parity test vs original `build_short.py` (T-014).
- Clip Studio: no face tracking, no diarization, raw transcript captions, faster-whisper not run in CI.
- API auth is a dev-token stub; `server.ts` refuses `NODE_ENV=production` (T-009).
- Docs drift: `docs/TESTING.md` test counts and `DEVELOPMENT_PROGRESS.md` "Next" list are stale (T-017).

## 6. Environment variables (names only; no values exist in the repo) [V: grep of source]
| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | API (`feista_api` login), runner (`feista_runner` login), tests | tests refuse a given URL unless `FEISTA_DISPOSABLE_DB=1` |
| `FEISTA_DISPOSABLE_DB` | `db/with-temp-db.sh`, `db/tests/run.sh` | `1` = the DB may be wiped |
| `FEISTA_KEKS`, `FEISTA_KEK_CURRENT` | API + runner | KEK ring `"1:<base64 32 bytes>"`; generate locally, never commit |
| `FEISTA_DEV_AUTH`, `FEISTA_DEV_AUTH_SECRET` | `server.ts` dev auth stub | must be `1`; base64 secret |
| `FEISTA_STORAGE_DIR` | runner | local storage root |
| `FEISTA_MEDIA_PYTHON` | runner | python with `feista_media` importable (default `python3`) |
| `PORT` | API | default 8787, binds 127.0.0.1 |
| `FFMPEG`, `FFPROBE` | media worker | optional binary overrides |
| `ANTHROPIC_*` | — | **deleted** by the runner at start on purpose (BYOK isolation) |
Local services: `docker-compose.yml` (Postgres 16 + MinIO, dev credentials only, not exercised in CI).

## 7. External services
- **App (BYOK, user's own keys):** fal.ai (Nano Banana 2, Seedance 2.0), ElevenLabs (`/with-timestamps`), Anthropic (text stages, highlights). Higgsfield adapter optional/planned. No account exists on Gün's side for the app [H].
- **Planned, blocked on Gün:** hosted Postgres (Supabase planned), object storage (R2 planned), API hosting (Vercel planned), worker hosting (Railway/Cloud Run), Google Cloud OAuth app for YouTube, Apple/Google developer accounts.
- **Legacy channel pipeline (outside repo, Gün's accounts):** Higgsfield Plus web plan ($49/mo, renews the 26th), ElevenLabs voice "Arthur" via Higgsfield, Incompetech CC-BY music, YouTube Data API uploader `yt.py` + `client_secret.json` on Gün's Windows PC (Google Cloud project "My First Project"), Remote Control session on that PC. Secrets there were never copied anywhere and must not be.
- **GitHub:** `Okkahai/Feista`, public. Actions only; no deploy targets, no secrets used by CI [V: workflows read].

## 8. Knowledge not recoverable from the repo
Captured in `docs/agent/DECISIONS.md` (owner decisions and corrections) and `docs/agent/HANDOFF.md` §4 (legacy channel pipeline, external files, cloud-only artifacts).
