# Architecture

## 1. Audit of the existing pipeline (Wobbi Tales, 2026-11-03)

Source: `/mnt/project-files/workflow/` (no git repo) + Gün's Windows PC (YouTube uploader, QA script). 31 episodes produced 2026-09-26 → 09-27, 30 scheduled through 2026-10-26.

**How it works end to end (today):**
1. Concept, story spine, shot list and narration lines written by Claude in chat, checked against `story-log.md` (semantic originality vs last 10 episodes) and Production Rules v4 (hook = event + unanswered question, no filler, loop-back, rotation of story/ending types).
2. Character sheet + keyframes: Higgsfield `nano_banana_2` via the Higgsfield **MCP connector** (not an API), sheet passed as `image_references`, previous keyframe as continuity reference, explicit "single full-frame image, no panels" instruction.
3. Clips: Higgsfield Seedance 2.0 Mini (480p/720p, native SFX, `declined_preset_id` workaround), keyframe as start image, optional end image to force failed states.
4. Narration: Higgsfield `text2speech_v2` ElevenLabs voice "Arthur", one request per line.
5. Music: Incompetech CC-BY tracks, credit without domain in the description.
6. Assembly: `tools/build_short.py` — trims/normalizes clips to 1080×1920@30, faster-whisper word timings, 2-word burned captions (Luckiest Guy, current word yellow), music ducked by sidechain, comic music drop-out, two-pass loudnorm to −14 LUFS, 8 Mbps H.264.
7. QA: Claude frame review + `qa.py` on Gün's PC (duration, bitrate, LUFS, silence, freeze, title similarity) → `qa_history.csv`.
8. Upload: `yt.py` on Gün's PC via Remote Control, private + `publishAt`, made-for-kids, playlist, thumbnail retry on 429.

**Reusable:** `build_short.py` logic (ported → `workers/media`, regression-verified), the prompt rules (workflow.md §3, §8, §9 → future prompt templates), the delivery spec, the QA checks, story-log originality method.

**Local / filesystem dependencies:** everything is path-based (`os.chdir(episode_dir)`, writes `tmp/` and `captions.ass` into the inputs), Windows paths for upload/QA, fonts expected in `~/.fonts`, ffmpeg via imageio symlink.

**Secrets / config risks:** YouTube `client_secret.json` + token on a personal PC; generation runs through Claude's MCP connectors with the owner's account, so there is no programmatic API key path at all. Nothing secret in the shared folder (checked).

**Bottlenecks:** human-in-chat orchestration (no durable state, no retry engine), MCP-only generation (not callable from a backend), single-machine upload, credits tracked by hand in memory notes.

**Migration requirements:** a real Higgsfield API key (Higgsfield's public API is separate from the web plan and prepaid in USD, and lacks Nano Banana/TTS/Seedance Mini — see PROVIDER_INTEGRATIONS §1), so the backend needs alternative providers (fal.ai / Runway / ElevenLabs) to reproduce the pipeline; YouTube OAuth app owned by Feista instead of a PC script.

## 2. Target system

```
 Expo app ──HTTPS──► API (TypeScript, Vercel functions: auth, CRUD, webhooks, enqueue only)
                         │
                         ▼
                 Postgres (Supabase): users, projects, nodes, ledger, credentials(enc)
                 pg-boss queue (same DB) ◄────────────── provider webhooks (signed)
                         │ jobs
          ┌──────────────┼───────────────────┐
          ▼              ▼                   ▼
   orchestrator    generation worker    media worker (Python + FFmpeg, container)
   (advances DAG)  (provider adapters)  assembly · QA · clip pipeline · transcription
                         │                   │
                         └──► Object storage (S3-compatible, R2) ◄─┘  signed URLs only
```

- **Durable state = Postgres rows**, not process memory. Every DAG node is a row with `status`, `attempt`, `idempotency_key`, inputs hash and output asset refs (`@feista/core` jobs.ts / pipeline.ts define the rules).
- **Long work never runs in a request.** API functions only validate, write rows and enqueue. Workers hold leases; a lost lease returns the node to `queued` (allowed transition `running → queued`).
- **Stage-level retry:** regenerating one scene invalidates only that scene and its downstream nodes (`invalidated()`), never the whole video.
- **Budget gate** before every `paid` node (`decideSpend`): deny over cap, park in `awaiting_review` above the approval threshold, warn near the limit. Estimates and provider-reported cost are stored separately.
- **Providers by capability**, not vendor (`ProviderRegistry.candidates`). Each adapter declares a manifest with an honest `verification` level.
- **Outputs copied to our storage immediately** on completion (Higgsfield deletes after 7 days, fal webhook payloads expire in ~1 h).

## 3. Phases and status
See `DEVELOPMENT_PROGRESS.md`.
