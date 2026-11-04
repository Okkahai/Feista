# Feista: agent guide

AI Content Studio. Expo app (control surface) + TypeScript API + Python FFmpeg workers.
Owner: Gün (GitHub Okkahai). Product name: **Feista**.

## Layout
- `packages/core` — shared domain: job lifecycle, Story DAG, budget guard, provider adapter contract. Pure TS, vitest.
- `workers/media` — Python worker: Story assembly (port of the proven Wobbi `build_short.py`) + media QA. pytest runs real ffmpeg.
- `apps/mobile` — Expo Router app, Cinematic Analog × Editorial Brutalism design system (`docs/DESIGN_SYSTEM.md`).
- `db/` — SQL migrations + RLS isolation tests (`db/tests/run.sh`).
- `docs/` — architecture, decisions, provider research, security, testing, progress. **Read `docs/DEVELOPMENT_PROGRESS.md` first.**

## Commands
- `pnpm install && pnpm -r typecheck && pnpm -r test`
- `cd workers/media && pip install -e ".[dev]" && ruff check . && mypy feista_media && pytest -q`

## Rules
- PRs target `develop`. `main` = release; production deploys and public releases need Gün's approval.
- **Strictly BYOK**: generations run on users' own keys; Gün pays for none. No paid API calls, purchases or paid services without his explicit OK. Mock tests never count as "tested against provider".
- Track status honestly: planned / implemented / mocked / tested locally / tested live / integrated / production-ready.
- Preserve the Wobbi production techniques (docs/ARCHITECTURE.md §1) unless a measured improvement replaces them; the media worker has a real-episode regression check (docs/TESTING.md).
- YouTube: always send `status.privacyStatus` explicitly (API default became `public` on 2026-11-02). Never publish without the user's configured policy.
- Provider keys are server-side only; never in the app bundle, logs or git.
- The live Wobbi Tales channel and Gün's PC pipeline are out of scope: do not touch them.
