# Decisions, preferences and corrections

Technical ADRs (1–13) live in `docs/DECISIONS.md`. This file holds the **owner's decisions, corrections and preferences** that previously existed only in cloud project memory and thread history. Source for each row: project memory notes and thread messages from Gün (dates in UTC unless noted).

## Standing owner decisions (in force)
| ID | Date | Decision | Source / rationale | Applies to |
|---|---|---|---|---|
| D-01 | 2026-11-03 | Autonomous engineering is authorized. Still needs Gün's approval: production deploy / public release, spending money, destructive operations, access-control changes, irreversible external actions. | Master brief "AI Content Studio" | all work |
| D-02 | 2026-11-04 | **Strictly BYOK.** Users connect their own provider APIs and pay their own generations. Gün pays for none and creates no paid accounts (Supabase, R2, fal, ElevenLabs, Vercel Pro, Railway, Higgsfield API, Anthropic). Free tiers / local Docker only. | Gün: "I don't want to use any paid creations on my side" (ADR 11) | infra, providers, tests |
| D-03 | 2026-11-04 | No live provider calls on Gün's account. Real-provider smoke tests only with a key a user supplies, after Gün approves a budget. | memory `feista-app` | tests |
| D-04 | 2026-11-05 | Feista must support **every animated-Short format** on the market via a template library (research: 16 formats in 5 families + streamer clips = 17, 14 named techniques). | thread "Build Feista AI content studio app", 02:01–02:04 | `formats.ts`, Create UI |
| D-05 | 2026-11-05 02:04 | **There is no "Wobbi" format.** Wobbi is Gün's channel name; "animal stories / hayvan hikâyeleri" is one generic preset among equals. | Gün: "wobbi diye bir format olmamali" | presets, copy, code names |
| D-06 | 2026-11-05 | Streamer clips (Clip Studio) are part of the automation, **only for the user's own or licensed streams**. Order agreed: presets first, then Clip Studio. | same thread | Clip Studio |
| D-07 | 2026-11-03 | PRs into `develop`; `main` = release; small reviewable PRs with independent review + CI. | ADR 1, CLAUDE.md | git |
| D-08 | 2026-11-03 | Honest status vocabulary (planned … production-ready); mocks never count as live tests. | brief, CLAUDE.md | reporting |
| D-09 | 2026-11-02 | YouTube uploads always send `privacyStatus` explicitly; uploads private/scheduled, never public without review. | API default changed to `public` 2026-11-02; channel rule since 2026-09-26 | publish adapter |
| D-10 | 2026-11-05 | Presets must force variety and limit "animal in distress then rescued" plots. | YouTube inauthentic-content / demonetization policy clarified 2026-07-16 (format research doc) | concept prompts |
| D-11 | 2026-11-03 | MediaPipe for reframing, not Ultralytics YOLO (AGPL). | ADR 8 | Clip Studio |
| D-12 | 2026-11-03 | Don't build narration on OpenAI TTS (speech TTS shuts down 2027-01-06); use ElevenLabs `/with-timestamps`. | ADR 7 | narration |

## Legacy channel (Wobbi Tales) decisions — out of app scope, but still binding if that pipeline resumes
| ID | Date | Decision |
|---|---|---|
| L-01 | 2026-09-27 | **New episodes (EP32+) need Gün's approval** before production resumes. EP1–31 exist; 30 were scheduled 2026-09-27 → 2026-10-26. |
| L-02 | 2026-09-27 | "Made for kids" repositioning **deferred** until 30 days–2 months of real data (i.e. review between ~2026-10-27 and ~2026-11-27). Existing 30 episodes stay made-for-kids; only EP32+ might change. Do not change the setting before then. |
| L-03 | 2026-09-26 | Uploads: private + scheduled `publishAt` 13:00 UTC (16:00 Turkey) on the folder date, made-for-kids Yes, altered/synthetic Yes, playlist "Tiny Animal Tales 🐾", `#shorts #animation #cuteanimals` line under the description, no URLs/domains in descriptions (unverified channel), music credit line without a bare domain. Thumbnail retry on 429. |
| L-04 | 2026-09-26 | No approval gates on story/keyframes/video for the channel pipeline; ask only before an unusually large credit spend; report remaining Higgsfield balance with every delivery. |
| L-05 | 2026-09-27 | Production Rules v4 (semantic originality vs last 10 episodes, hook = event + unanswered question, no filler, diagnose before reroll, channel-level QA, loop-back framing, single-scene prompt suffix). Full text in `/mnt/project-files/workflow/workflow.md` §9 — see HANDOFF §4 on preserving it. |
| L-06 | 2026-09-26 | Delivery to Gün's PC: `Downloads\Videolar\<yyyy-MM-dd>\` with `video.mp4`, `cover.jpg`, `upload.txt` (TITLE/DESCRIPTION/TAGS/COVER/SETTINGS sections). Never delete Gün's files. |
| L-07 | 2026-09-27 | Stats re-rank: when Gün says "istatistiklere bak", pull real view data and re-rank publish order. |

## User preferences
- Gün writes Turkish or English; reply in the language Gün used. Short, plain replies; lead with the result.
- When researching, check that information is current as of the message date.
- Gün does not want to be a bottleneck: decide reversible things yourself, ask only for irreversible/paid steps.
- Coordinator model choice is Gün's (switched to Sonnet 5 on 2026-09-26 to save tokens, back to Opus 5.5 on 2026-11-02).

## Rejected or superseded approaches
- pg-boss as the queue → replaced by `stage_runs` (ADR 13 supersedes ADR 3's queue half).
- Higgsfield as primary backend provider → its public API is separate from the web plan, prepaid, and lacks Nano Banana/TTS/Seedance Mini (ADR 6). Optional adapter only.
- Hard-coded "Wobbi RULES" in `apps/api/src/llm.ts` → replaced by per-project format presets (PR #14).
- A format named after the channel → rejected by Gün (D-05).
- Ultralytics YOLO → rejected (AGPL).
- Downloading YouTube videos for Clip Studio → rejected (rights).
- Operator-funded generations / live tests on Gün's account → rejected (D-02/D-03).

## Contradictions found during migration (need a decision; tracked as tasks)
- Target diagram (`docs/ARCHITECTURE.md` §2) names Supabase, Vercel, R2, Railway as if chosen; D-02 blocks all paid tiers. Free tiers may still fit; hosting is undecided → T-015.
- Duration ranges: mobile Create 30–90 s, API/repo 15–180 s, presets 10–180 s → T-014.
- `docs/PRODUCT_SPEC.md` mentions a Clip Studio "managed mode (Vizard/OpusClip APIs)"; never decided or built → Q in HANDOFF.
- Memory said the clone URL is lowercase `okkahai/feista`; pushes must go to `Okkahai/Feista` (AGENTS.md).
