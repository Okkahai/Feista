# Task registry

_Snapshot 2026-11-06, develop @ `b19fa18`. Stable IDs: never reuse or renumber. Update status in the same PR as the work._
Status: `todo` · `blocked` · `in-progress` · `done-unverified` · `done-verified` · `deferred`. Priority P0 (do first) … P3.
**No task was in progress at snapshot time.** Nothing below has a branch yet; create `feat/<id>-<slug>` from `develop`.
Cloud thread for all app work: "Build Feista AI content studio app" (`cmsg_01U7qerMcGzpwbbMezf8yt6QKQ3QKUY2nQgvwi4UBRAQTu`, session `cse_01EkSrumsWMYB69ABRqU7A74`). It is not reachable from T3 Code; its state is fully on GitHub (confirmed by that session 2026-11-06 13:51 UTC: clean tree, no local-only commits or stashes).

## Execution order (recommended)
1. T-006 → T-001 → T-004 → T-005 (unblock a full Story run end to end locally)
2. T-002, T-003 → T-010 (mobile)
3. T-008, T-007, T-014
4. T-009, T-011, T-022
5. Blocked on Gün: T-012, T-013, T-015, T-016; legacy: T-019, T-020

## Dependency graph
```
T-006 ─┐
T-001 ─┼─► (local end-to-end Story/Clip run) ─► T-010 mobile↔API ─► T-012 YouTube publish
T-004 ─┤                                      ▲
T-005 ─┘          T-002, T-003 (mobile UI) ───┘
T-009 real auth ─► T-010 (prod), T-015 hosting ─► any deploy
T-013 live smoke tests ◄─ Gün budget OK + user-supplied key
T-001 ─► T-011 MediaPipe crop (needs real uploads to test)
```

---

### T-001 · S3-compatible storage + presigned upload (Clip Studio source)
- **Status** todo · **P1** · Confidence high · Evidence: `docs/DEVELOPMENT_PROGRESS.md` "Clip Studio gaps", app thread 2026-11-05 17:19.
- **Objective** Replace the local-directory storage shortcut (`apps/api/src/storage.ts`) with an S3 API client (MinIO locally per `docker-compose.yml`, R2 later per ADR 5) and add a presigned upload endpoint so a user can upload a recording to `<project>/source/g1/source.mp4`.
- **Acceptance** storage interface unchanged for handlers; MinIO used in local dev; presigned PUT with size/type limits; ffprobe validation before `source` can be approved (`docs/SECURITY.md` media rules); keys stay `<project_id>/…`; tests with MinIO or a fake S3; no paid account.
- **Done so far** none. **Remaining** all.
- **Deps** none. Blocks T-011, T-010 (upload flow). **Files** `apps/api/src/storage.ts`, `media.ts` (clip handlers), `app.ts`, `docker-compose.yml`, CI (MinIO service needed in `ci-api`).
- **Tests** none yet. **Next action** design the storage interface swap + `POST /v1/projects/:id/uploads` returning a presigned URL; add a MinIO service to `ci-api.yml`.

### T-002 · Mobile Create: format picker + per-character voice picker
- **Status** todo · **P1** · Evidence: PROGRESS "Next" 1; app thread 2026-11-05 06:36 ("Uygulamada format seçme ekranı henüz yok").
- **Objective** Let the user pick one of 16 presets or a custom format, and (dialogue formats) a voice per character, in `apps/mobile` Create.
- **Acceptance** options come from `@feista/core` `formats.ts`; custom-format fields validated with the same limits as the API; duration range follows the chosen preset (resolves part of T-014); jest tests; design system tokens; screenshots updated in `docs/design/screens/`.
- **Deps** none (fixture data OK); full value after T-010. **Files** `apps/mobile/src/app/(tabs)/create*`, `src/components`, `src/data`.
- **Next action** read `formats.ts` exports and the existing Create screen; add a FormatPicker component.

### T-003 · Mobile clip review screen (Clip Studio)
- **Status** todo · **P2** · Evidence: PROGRESS "Next" 5; app thread checklist "Mobil format / ses / klip seçimi".
- **Objective** Review N ranked clips (preview, approve/reject) mapping to the `review` gate in `CLIP_STAGES`.
- **Deps** T-001 for real media; fixture first. **Next action** add fixture clip project + review UI.

### T-004 · `metadata` stage handler
- **Status** todo · **P1** · Evidence: `runner-main.ts` header ("music, metadata and publish have none yet").
- **Objective** Generate title/description/tags (owner's Anthropic key, budget-gated, structured output) following the legacy rules: title states the hook's question, no URLs/domains in description, music credit line, `#shorts` line, 8–12 tags (see `docs/agent/DECISIONS.md` L-03 and workflow.md §3.10).
- **Acceptance** mocked tests like `llm.test.ts`; reservation/ceiling logic reused; output stored as an asset; music credit taken from the music stage output.
- **Deps** T-005 (credit line). **Files** `apps/api/src/llm.ts`, `packages/core/src/formats.ts` (per-format metadata hints).

### T-005 · `music` stage handler (CC-BY library pick)
- **Status** todo · **P1** · Evidence: same as T-004; `pipeline.ts` comment "CC-BY library pick, credit carried to metadata".
- **Objective** Pick a track from a bundled/curated CC-BY catalog (legacy used Incompetech, Kevin MacLeod, CC BY 4.0) matching the format mood; produce `music.mp3` + credit string. Non-paid.
- **Open question** where the catalog lives (repo is public; check licence for redistribution, or store only metadata + fetch at run time). **Next action** decide catalog source, then implement.

### T-006 · API setter for project settings (incl. `tts_cents_per_1k_chars`)
- **Status** todo · **P0** · Evidence: PROGRESS "narration fails closed for now".
- **Objective** `PATCH /v1/projects/:id` (or settings endpoint) to update validated `config` fields: TTS plan rate, voices, format, brief, style, budget caps.
- **Acceptance** same validation as create; RLS-scoped; tests; a value of 0 for TTS rate either rejected or explicitly allowed with a warning (accepted gap noted in PROGRESS).
- **Deps** none. Unblocks a real narration estimate. **Files** `apps/api/src/app.ts`, `api.test.ts`.

### T-007 · `awaiting_provider` parking / provider webhooks
- **Status** todo · **P2** · Evidence: PROGRESS accepted gaps.
- **Objective** Stop holding a worker slot while polling; park nodes and resume via signed webhooks (fal ED25519/JWKS) or scheduled re-poll. Copy outputs to storage immediately (fal payloads expire ~1 h).
- **Deps** T-001 (storage), a reachable URL for webhooks (local: re-poll only).

### T-008 · New-take invalidation endpoint
- **Status** todo · **P2** · Evidence: PROGRESS "Next" 1.
- **Objective** Expose core `invalidated()` as an API action so regenerating one scene invalidates only it and downstream nodes, clearing `external_id` for the new take.

### T-009 · Real auth replacing dev-token stub
- **Status** todo · **P2** · Evidence: PROGRESS "Next" 2, `server.ts` refuses production.
- **Objective** JWT auth (Supabase Auth or self-hosted equivalent, free tier) + user provisioning via the privileged path only (`docs/SECURITY.md`).
- **Deps** T-015 hosting choice influences provider. **Needs Gün** if it requires any account.

### T-010 · Mobile ↔ API wiring + push notifications
- **Status** todo · **P2** · Evidence: PROGRESS "Next" 4, "Mobile screens run on fixture data".
- **Deps** T-006, T-001; T-009 for anything beyond local dev.

### T-011 · MediaPipe face-tracked 9:16 crop mode (Clip Studio)
- **Status** todo · **P3** · Evidence: PROGRESS Clip gaps; ADR 8. Current mode: fitted 16:9 over blurred copy.

### T-012 · YouTube OAuth + publish adapter
- **Status** blocked (Gün: Google Cloud OAuth app, consent screen, verified domain, privacy policy) · **P2**.
- **Acceptance** scopes `youtube.upload` (+`youtube.readonly`); tokens encrypted like BYOK keys; `privacyStatus` always explicit; publish only from approved review state and user policy; made-for-kids / synthetic flags configurable.
- **Next action** ask Gün whether to create the OAuth app (free, but it is an account/access change on Gün's side).

### T-013 · Live provider smoke tests
- **Status** blocked (Gün budget approval + a user-supplied key) · **P2**. Every provider path is mocked only (fal, ElevenLabs, Anthropic). faster-whisper not run in CI.

### T-014 · Review follow-ups backlog
- **Status** todo · **P3** · Evidence: PROGRESS "Review follow-ups".
- Items: (a) `expand()` duplicate stage id detection; (b) one source of truth for duration ranges (mobile 30–90, API 15–180, presets 10–180); (c) budget reservation release/replace by reported costs; (d) automated parity test vs original `build_short.py`; (e) design critique items in `docs/DESIGN_SYSTEM.md` "Open critique"; (f) text-stage gaps (lease loss double-pay, 16k cut-off, fallback pricing); (g) runner reservation undercount.

### T-015 · Hosting / deployment decision
- **Status** blocked (Gün) · **P2**. Planned stack (Supabase, Vercel, R2, Railway/Cloud Run) conflicts with D-02 unless free tiers suffice. Requires Gün's approval for any account and any production deploy.

### T-016 · Store developer accounts (Apple / Google)
- **Status** blocked (Gün, paid) · **P3**.

### T-017 · Fix docs drift
- **Status** done (2026-11-10, PR #16): TESTING.md counts updated; PROGRESS points to this registry.
- `docs/TESTING.md` counts are stale (says core 13, media 5; actual 2026-11-06: core 19, vault 38, providers 8, api 56, mobile 15, media 12). `docs/DEVELOPMENT_PROGRESS.md` "_Last updated 2026-11-04_" and "Next" item 3 (adapters, already done). Point both at this registry.

### T-018 · Preserve the format research doc in the repo
- **Status** done-verified (2026-11-10): exported to `docs/research/animation-short-formats-2026-11-05.md`, byte count checked against the source (17030 B, byline dropped).
- The research behind D-04/D-10 is a Claude Doc: "Animasyon Short formatları: yapı ve optimizasyon araştırması" (https://claude.ai/artifact/NejD3kCfmvFP7qr3Lcwzi2, Turkish, ~17 KB, rev 7). Now also in git (see status above). Its operative content is encoded in `formats.ts`, but the source table, 14 technique names and citations are not.
- **Next action (Gün or a cloud session before shutdown)** export it as Markdown and commit to `docs/research/animation-short-formats-2026-11-05.md` (drop the personal byline; repo is public).

### T-021 · Archive the legacy channel workspace off the cloud
- **Status** deferred — **Gün chose to skip it (2026-11-10)**. Accepted risk: the workspace below is lost if the cloud project is deleted. Do not reopen unless Gün asks.
- `/mnt/project-files/workflow/` (workflow.md v2 incl. Production Rules v4 §9, story-log.md, episode-log.md, episodes/ with keyframes, clips, VO, configs, outputs; tools/build_short.py, assemble.sh; assets/characters sheets), `app/screens/`, and `yt ctzx.txt` (original channel brief) exist only in the cloud project's shared folder. Media is private and large: **do not commit to the public repo.**

### T-022 · Clip Studio quality: diarization, caption cleanup
- **Status** todo · **P3** · captions are raw transcript words; no speaker labels.

### T-019 · Legacy: Wobbi Tales EP32+ production
- **Status** deferred — needs Gün's approval (L-01). Out of app scope; uses Higgsfield web credits (Gün's money). Do not restart without Gün.

### T-020 · Legacy: made-for-kids repositioning review
- **Status** deferred until ~2026-10-27 … 2026-11-27 data window (L-02). Due for Gün's review now; nothing to do without Gün.

### T-000 · Migration to T3 Code (this handoff)
- **Status** done (2026-11-10): handoff merged via PR #16 with Gün's approval. Remaining cut-over step is Gün's: clone locally and run VERIFICATION.md. See `docs/agent/HANDOFF.md` §6.

---

## Completed (for reference; all merged into develop, CI green on `b19fa18`)
| ID | PR | Branch | Level |
|---|---|---|---|
| C-01 | #1 | feat/core-domain | tested locally + CI |
| C-02 | #2 | feat/media-worker | tested locally + manual EP002 regression |
| C-03 | #3 | docs/foundation | docs |
| C-04 | #4 | feat/mobile-foundation | static checks + jest; not on device |
| C-05 | #5 | feat/db-foundation | tested locally + CI |
| C-06 | #6 | feat/vault | tested locally + CI |
| C-07 | #7 | feat/api | tested locally + CI |
| C-08 | #8 | feat/orchestrator | tested locally (fake handlers) |
| C-09 | #9 | feat/media-jobs | tested locally (real ffmpeg) |
| C-10 | #10 | feat/providers | mocked |
| C-11 | #11 | feat/stage-handlers | mocked |
| C-12 | #12 | feat/llm-stages | mocked |
| C-13 | #13 | feat/characters | mocked |
| C-14 | #14 | feat/format-presets | mocked |
| C-15 | #15 | feat/clip-studio | tested locally (stubs for whisper/LLM) |
Merged feature branches still exist on GitHub; deleting them is optional cleanup and needs Gün's OK (destructive).
