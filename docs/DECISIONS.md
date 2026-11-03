# Decisions (ADR log)

| # | Date | Decision | Why |
|---|---|---|---|
| 1 | 2026-11-03 | pnpm monorepo: `apps/mobile`, `packages/core`, `workers/media`; PRs into `develop` | One repo for shared types; small reviewable PRs |
| 2 | 2026-11-03 | Port `build_short.py` rather than rewrite | Proven output; port verified by rebuilding EP002 (captions byte-identical, −14.0 LUFS) |
| 3 | 2026-11-03 | Workflow state = Postgres rows + pg-boss queue (Supabase Postgres) | Durable, no extra vendor, transactional with app data. Revisit Trigger.dev/Inngest if orchestration outgrows it |
| 4 | 2026-11-03 | API on Vercel functions for request/response + webhooks only; FFmpeg/whisper in containers (Railway or Cloud Run) | Vercel function limit 300–800 s; media jobs are longer and CPU/GPU-heavy |
| 5 | 2026-11-03 | Object storage: S3 API (Cloudflare R2 in prod, MinIO locally) | Zero egress for previews and YouTube uploads |
| 6 | 2026-11-03 | Primary generation via fal.ai; Runway secondary; Higgsfield optional adapter | Higgsfield's API lacks Nano Banana/TTS/Seedance Mini and is billed separately from the web plan |
| 7 | 2026-11-03 | Narration via ElevenLabs API `/with-timestamps` (paid plan required for commercial use); don't build on OpenAI TTS | Gives word timings without whisper; OpenAI speech TTS shuts down 2027-01-06 |
| 8 | 2026-11-03 | Clip reframing with MediaPipe, not Ultralytics YOLO | YOLO is AGPL (commercial SaaS needs a paid licence) |
| 9 | 2026-11-03 | Money stored as integer cents; estimate vs reported kept separately | No float drift; never present an estimate as billed |
| 10 | 2026-11-03 | All cloud accounts (Supabase, R2, Vercel Pro, Railway, fal, ElevenLabs, Google OAuth app) are **blocked on Gün** | Spending money / creating paid services needs explicit approval. Local dev uses Docker Postgres + MinIO |
