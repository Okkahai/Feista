# Architecture: as built (2026-11-06, develop @ b19fa18)

This is the map of what exists. The target design and the audit of the legacy pipeline stay authoritative in `docs/ARCHITECTURE.md`; where they differ, this file says what is real today.

## Runtime pieces
```
apps/mobile (Expo, fixture data only) ── not wired ──►  apps/api  server.ts  (Hono, 127.0.0.1:8787, dev-token auth stub)
                                                            │  every request: SET ROLE feista_app + SET LOCAL app.user_id
                                                            ▼
                                                     Postgres 16 (forced RLS)
                                                     users · credentials(enc) · projects · stage_runs (= queue) · assets · ledger
                                                            ▲  claim FOR UPDATE SKIP LOCKED, ms lease = fencing token
                                                            │
                                         apps/api  runner-main.ts  (login feista_runner → role feista_worker)
                                           ├─ llm handlers: concept, script, highlights      → owner's Anthropic key
                                           ├─ generate handlers: characters, keyframe,       → owner's fal key
                                           │                     scene_video, narration      → owner's ElevenLabs key
                                           ├─ media handlers: assembly, media_qa              → python -m feista_media.cli
                                           └─ clip handlers: source, transcribe, clip_render, clip_qa
                                                            │
                                                  local directory storage (FEISTA_STORAGE_DIR)  ← shortcut; S3/MinIO planned
```
No hosting, no deploy, no webhooks, no object storage, no real auth yet.

## Pipelines (`packages/core/src/pipeline.ts`)
- **Story:** concept → script → characters → keyframe×N → scene_video×N; narration (after script); music (after script) → assembly → media_qa → metadata → review (human gate) → publish. Paid stages: concept, script, characters, keyframe, scene_video, narration, metadata.
  Handlers missing: **music, metadata, publish** (nodes wait in the queue).
- **Clip:** source (human gate: upload + rights) → transcribe (faster-whisper `small`, local) → highlights (paid, LLM) → clip_render×N → clip_qa×N → review → publish. Handler missing: **publish**; upload endpoint missing.
- `expand(stages, sceneCount)` turns stages into nodes (`keyframe:2`); per-scene deps link scene-to-scene. `invalidated()` exists in core but has no API endpoint.

## Money and safety invariants (do not break)
- Budget gate before every paid node (`decideSpend`): deny over cap, park for approval above threshold, fail closed without an estimate. Ledger reservation first, reported cost later, integer cents (ADR 9).
- Provider job id is written to `stage_runs.external_id` **before** waiting; crash/lease loss/timeout re-attaches instead of paying twice. Only a new take clears it.
- A paid answer that cannot be stored parks the node; it is never re-bought.
- BYOK keys: envelope-encrypted per row (AAD = owner + provider + credential row + KEK version); opened per job as the owner; runner drops `ANTHROPIC_*` env vars; Anthropic host pinned and key sent per request.
- Downloads only from `data:` or `https://*.fal.media`, no redirects, ≤ 300 MB.
- Media worker child processes get an allowlisted env and a process-group timeout.

## Data model (`db/migrations/0001`–`0004`)
`users`, `credentials`, `projects` (with `config` JSON: `format`, `brief`, `style`, `voice_id`, `voices[]`, `rights`, `tts_cents_per_1k_chars`, …), `stage_runs` (status, attempt, generation, lease, `external_id`, blocked reason), `assets` (storage keys must start with `<project_id>/`, `source_url`), `ledger`. Roles: `feista_api` (login, no privileges), `feista_app` (RLS-bound request role), `feista_runner`/`feista_worker` (queue access, no credentials/users tables).

## API surface (`apps/api/src/app.ts`)
`GET /health` · `GET/POST /v1/projects` · `GET /v1/projects/:id` · `GET /v1/projects/:id/runs` · `POST /v1/projects/:id/runs/:node/approve` · `GET/POST /v1/credentials` · `DELETE /v1/credentials/:id`.

## Format presets (`packages/core/src/formats.ts`)
16 ids: `animal_story` (default), `kids_moral`, `horror_story`, `history_pov`, `myth_story`, `what_if`, `whiteboard_explainer`, `story_narration`, `dialogue_sketch`, `talking_objects`, `meme_animatic`, `micro_drama`, `action_series`, `absurd_creature`, `asmr_loop`, `anime_story`, plus `custom`. Voice modes: narrator, dialogue (per-character voices), inner, none. Clip Studio is the 17th "format".

## Mobile (`apps/mobile`)
Expo Router tabs: Studio, Create, Projects, Connections, Settings + project detail. Data from `src/data` fixtures. Screenshots: `docs/design/screens/` (also copied to the cloud project's `app/screens/`).

## Differences from the target design in `docs/ARCHITECTURE.md` §2 and `docs/DECISIONS.md`
- Queue is `stage_runs` (ADR 13), not pg-boss (ADR 3's queue half is superseded).
- Supabase / Vercel / R2 / Railway in the target diagram are **plans blocked on Gün** (ADR 10/11), not chosen hosting. Local stack = Docker Postgres + MinIO.
- Higgsfield adapter is not built.
