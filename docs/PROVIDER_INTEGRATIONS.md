# Feista: Provider Integrations Research

All checks done **2026-11-03** against official docs unless marked otherwise. Tags:
- **[V]** = verified (URL, 2026-11-03)
- **[U]** = unverified or unclear (third-party source, docs silent, or my inference)

No accounts created, no paid APIs called, no credentials used. The Higgsfield and ElevenLabs MCP connectors in this session were **not** used as evidence for their public APIs.

---

## 1. Higgsfield

| Item | Finding | Status |
|---|---|---|
| Public developer API | **Yes.** REST API at `https://api.higgsfield.ai`. Credentials are created in the Higgsfield Console (`console.higgsfield.ai`). It is separate from the web app and the MCP connector. | [V] https://docs.higgsfield.ai/docs/authentication.md |
| Auth | `Authorization: Key {KEY_ID}:{KEY_SECRET}`. Legacy `hf-api-key` / `hf-secret` headers still work. Server-side only: the docs explicitly say not to call it from mobile or browser code. Bad credentials return 401. A model the account can't use returns 404, 423 or 503. | [V] same |
| Job lifecycle | Async. A POST returns `request_id`, `status_url` and `cancel_url` with status `queued`. Then poll `GET /requests/{id}/status`, or pass `?hf_webhook=<urlencoded https>`. Terminal statuses: `completed`, `failed`, `nsfw`. Cancel works on **queued** requests only: `POST /requests/{id}/cancel`. `DELETE /requests/{id}` purges data. Send `Idempotency-Key` on submit. | [V] https://docs.higgsfield.ai/docs/llms.txt, https://docs.higgsfield.ai/docs/how-to/webhooks.md |
| Webhooks | Standard Webhooks spec (`webhook-id`, `webhook-timestamp`, `webhook-signature`). Secret is `whsec_...`, revealed in Console > Settings. **Deliveries are unsigned until an admin reveals the secret.** Your endpoint must respond within 10 s. 5xx and network failures are retried for up to 2 h; 4xx are not retried. Dedupe by `webhook-id`. | [V] webhooks.md |
| Queue / limits | Concurrency is set per account and per model. Requests over the limit queue. A full queue returns 429 with `Retry-After`, with nothing created or charged. There are no remaining-capacity headers. | [V] https://docs.higgsfield.ai/docs/concepts/rate-limits.md |
| Retention | Output files are deleted 7 days after completion. Set a shorter period with `Hf-Expires-After`. Download outputs to your own storage. | [V] https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md |
| Models | The catalog lists 84 entries: 67 video (Genjutsu, Seedance, Kling, Wan, MiniMax, LTX, PixVerse, Grok...) and 17 image (SOUL, Recraft, Qwen, Ideogram, Z-Image...). **Seedance 2.0:** `POST /bytedance/seedance-2.0/reference-to-video`, 4–15 s, 480p–4k, 9:16 supported, `generate_audio` (default true). Seedance 2.5 is also listed. | [V] https://docs.higgsfield.ai/docs/models.md, https://docs.higgsfield.ai/docs/models/seedance-2/reference-to-video.md |
| Seedance Mini / Fast via API | Not found in the API docs. Mini and Fast appear in the web-app help center only. | [U] |
| Nano Banana 2 (image) via API | **Not listed** in the API model catalog. It exists in the web app. | [U] (absent from docs) |
| Text-to-speech via API | **Not listed.** The webhook payload schema has a `payload.audio` field, but no TTS model is documented. | [U] |
| Pricing unit | **USD from a prepaid account balance**, charged per successful generation. Failed, moderated and cancelled requests are free. Balance expires 1 year after top-up. An estimate endpoint returns `{"usd": ...}`. Enterprise customers can pay by invoice. No per-model price list is published in the docs. | [V] billing-and-retention.md, https://docs.higgsfield.ai/docs/help/faq.md, https://docs.higgsfield.ai/docs/enterprise/usage-and-billing.md |
| Does Plus ($49) include API access? | **Not documented.** The API docs describe only a pay-as-you-go balance and never mention web plans or credits. Assume the subscription does **not** fund API usage. | [U] |

---

## 2. Video and image alternatives

### fal.ai
- **Auth:** `Authorization: Key $FAL_KEY`. [V] https://fal.ai/docs/model-apis/model-endpoints/queue
- **Async pattern:**
  - Submit with `POST https://queue.fal.run/{model}`.
  - Check status with `GET .../requests/{id}/status` (`?logs=1`); there is also an SSE stream at `/status/stream`.
  - Fetch the result with `GET .../requests/{id}`.
  - Statuses are `IN_QUEUE`, `IN_PROGRESS` and `COMPLETED`.
  - The queue has no size limit. Failed runner attempts are auto-retried up to 10 times (disable with `X-Fal-No-Retry`).
  - Status and result URLs use only `owner/app`; including the full endpoint path returns 405. [V] same
- **Webhooks:**
  - Pass `?fal_webhook=` (REST) or `webhook_url` (SDK). The body's `status` is `OK` or `ERROR`.
  - Signatures are ED25519, sent in `X-Fal-Webhook-{Request-Id,User-Id,Timestamp,Signature}`. Public keys come from JWKS at `https://rest.fal.ai/.well-known/jwks.json`. Reject timestamps more than 300 s off.
  - Up to 31 retries until the stored result expires (about 1 h, or about 6 min for results of 10 KB or more).
  - 3xx responses are not followed. [V] https://fal.ai/docs/model-apis/model-endpoints/webhooks
- **Cancellation:** `PUT .../requests/{id}/cancel`. A queued request is removed (200). A running one only gets a cancel signal (202) and may still finish and bill. [V] queue page
- **Pricing per second:**

| Model | Endpoint | Price | Status |
|---|---|---|---|
| Seedance 2.0 | `bytedance/seedance-2.0/text-to-video` (fast: `/fast/`) | 720p+audio $0.3034/s; fast 720p $0.2419/s; 1080p $0.682/s. Token-based alternative: $0.014 per 1k tokens, tokens = h·w·dur·24/1024 | [V] https://fal.ai/models/bytedance/seedance-2.0/text-to-video |
| Seedance 2.0 Fast / Mini | (pricing page) | $0.0112 / $0.007 per 1k tokens | [V] https://fal.ai/pricing |
| Kling v2.5-turbo / v2.6 pro | | $0.07/s | [V] https://fal.ai/pricing |
| Kling v3 / O3 | | $0.14/s | [V] https://fal.ai/pricing |
| Veo 3.1 | `fal-ai/veo3.1` | $0.20/s ($0.40 with audio); fast $0.10/s ($0.15 with audio). Max 8 s per generation. **Page says the endpoint is deprecated on 2026-11-17.** | [V] https://fal.ai/models/fal-ai/veo3.1 |
| Nano Banana 2 (image) | `fal-ai/nano-banana-2` | $0.08/image (Pro $0.15) | [V] https://fal.ai/pricing |

### Runway API
- **Version header:** `X-Runway-Version: 2024-11-06` (the only version listed). [V] https://docs.dev.runwayml.com/api-details/versioning/
- **Auth:** `Authorization: Bearer <key>`. [U] Not shown on the pages I fetched; standard per their SDK.
- **Async pattern:** task-based. Create a task, then `GET /v1/tasks/{id}` (the SDK's `waitForTaskOutput()` polls). Cancel or delete with `DELETE /v1/tasks/{id}`. No webhooks found. [V] https://docs.dev.runwayml.com/api/ (nav), [U] webhooks
- **Pricing:** $0.01 per credit.

| Model | Price |
|---|---|
| gen4.5 | $0.12/s |
| gen4_turbo | $0.05/s |
| veo3.1 | $0.20/s ($0.40 with audio); fast $0.10/s ($0.15 with audio) |
| seedance2 | 480p $0.14/s, 720p $0.30/s, 1080p $0.40/s |
| seedance2_mini | 480p $0.07/s, 720p $0.15/s |
| seedance2_fast | 720p $0.24/s |
| kling3.0_pro | $0.12/s ($0.17 with audio) |

[V] https://docs.dev.runwayml.com/guides/pricing/

Runway is the only place I found **Seedance 2.0 Mini** with a documented API price.

### Luma (now "Luma Agents API")
- The old Dream Machine docs point to `docs.agents.lumalabs.ai`. [V] https://docs.lumalabs.ai/docs/api
- **Base URL and auth:** `https://agents.lumalabs.ai/v1`, `Authorization: Bearer` (env var `LUMA_AGENTS_API_KEY`).
- **Async pattern:** `POST /v1/generations`, then poll `GET /v1/generations/{id}` until `completed` or `failed`. The docs suggest polling video jobs for about 10 minutes before giving up.
- **Model:** Ray 3.2 for video; uni-1 for images. [V] https://docs.agents.lumalabs.ai
- **Webhooks / cancel:** the page metadata mentions them, but I could not see the details. [U]
- **Pricing:** in credits, but the **USD value of a credit depends on your plan**. Ray 3.2 SDR: 720p costs 100 credits per 5 s and 300 per 10 s; 1080p costs 400 per 5 s. Reframe is billed per second. [V] https://docs.agents.lumalabs.ai/guides/pricing/ ; the $ conversion is [U].

---

## 3. Audio

### ElevenLabs
- **TTS:** `POST /v1/text-to-speech/{voice_id}`. [V]
- **Timestamps:** `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps`.
  - Returns `audio_base64` plus `alignment` and `normalized_alignment`. Each has `characters[]`, `character_start_times_seconds[]` and `character_end_times_seconds[]`. These are character-level; group them into words yourself for captions.
  - Default `model_id` is `eleven_multilingual_v2`. Default output is `mp3_44100_128`. 192 kbps MP3 needs Creator or higher; 44.1 kHz PCM/WAV needs Pro or higher.
  - [V] https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
- **Auth:** `xi-api-key` header. [U] Not shown on that page; long-standing standard.
- **Models:**

| Model | Max characters per request |
|---|---|
| `eleven_v4` | 10k |
| `eleven_v4_turbo` | not stated |
| `eleven_v3` | 5k |
| `eleven_multilingual_v2` | 10k |
| `eleven_flash_v2_5` | 40k |

  `eleven_turbo_v2*` are deprecated. Which models support with-timestamps is not stated. [V] https://elevenlabs.io/docs/overview/models
- **Rate limits (concurrency):**

| Plan | Multilingual v2 | Flash |
|---|---|---|
| Free | 2 | 4 |
| Starter | 3 | 6 |
| Creator | 5 | 10 |
| Pro | 10 | 20 |
| Scale / Business | 15 | 30 |

  [V] models page
- **Plans:** Starter $6, Creator $22, Pro $99, Scale $299, Business $990 per month. [V] https://elevenlabs.io/pricing/api
- **Per-character rates:** Flash $0.04 per 1k characters; v2 and v3 $0.08 per 1k. [V] same. Whether these are overage rates is [U].
- **Commercial use:** the **Free plan has no commercial license** and requires attribution ("elevenlabs.io" in the title). Paid plans can be used commercially. Feista must be on Starter or higher in production. [V] https://help.elevenlabs.io/hc/en-us/articles/13313564601361 , https://elevenlabs.io/terms-of-use

### OpenAI TTS
- **Endpoint:** `/v1/audio/speech`, with models `gpt-4o-mini-tts`, `tts-1` and `tts-1-hd`.
- **All three are deprecated, with shutdown on 2027-01-06.** The named replacement is `gpt-realtime-2.1-mini`, which runs on the Realtime API, not the speech endpoint.
- **Voices:** 13 (marin and cedar recommended).
- **Disclosure:** usage policy requires telling end users that the voice is AI-generated.
- [V] https://developers.openai.com/api/docs/guides/text-to-speech
- **Implication:** don't build on OpenAI TTS for a 2027 product.

---

## 4. LLMs (auth and structured output)

| Provider | Auth | Current models | Structured output | Source |
|---|---|---|---|---|
| Anthropic | `x-api-key`, `anthropic-version: 2023-06-01` | `claude-opus-5-5` ($4/$20 per MTok), `claude-sonnet-5-5` ($2/$10), `claude-haiku-5-5` (from $0.10/$0.50), `claude-fable-5-1` ($10/$50) | **GA.** `output_config.format: {type:"json_schema", schema}` plus `strict: true` on tools. The old `output_format` needs a beta header. `additionalProperties:false` is required; min/max keywords are not supported. | [V] https://platform.claude.com/docs/en/about-claude/models/overview , https://platform.claude.com/docs/en/build-with-claude/structured-outputs |
| OpenAI | `Authorization: Bearer` [U, not on fetched page] | `gpt-6-astra` (top), `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna` (cheapest) | Responses API "Structured output" guide exists. Exact params [U]. | [V] https://developers.openai.com/api/docs/models |
| Gemini | `x-goog-api-key` header (also an `Api-Revision: 2026-05-20` header in examples) | `gemini-3.8-flash`, `gemini-4-argon` | `response_format {mime_type:"application/json", schema}` on `/v1beta/interactions`. Combining it with tools is preview. | [V] https://aistudio.google.com/docs/structured-output (ai.google.dev now redirects there) |

---

## 5. Clipping

### OpusClip API (exists, gated by plan)
- **Plans:** available on **Pro (Beta), Max and Business**.
- **Limits:**
  - 30 requests/min per key.
  - Concurrency: 4 projects (Pro and Max) or 50 (Business).
  - **15 h of API video per month** on Pro and Max; Business is set by contract.
  - Max 10 h and 30 GB per video. Projects expire after 30 days.
- **Pricing:** 1 credit = 1 min of video; **minimum 10 credits per API project**.
- **Endpoints:** Create Project, Query Clips, Share, Social Posting, Webhooks, Brand Templates, Edit Clips.
- [V] https://help.opus.pro/api-reference/overview.md
- **Input:** `POST /api/clip-projects` takes `videoUrl` (YouTube, Vimeo, Drive, public MP4/S3), with Bearer auth. A separate resumable upload flow supports local files. [U] Search-result snippets of https://help.opus.pro/api-reference/endpoints/create-project ; I did not fully open the page.
- **Restrictions:** clip list endpoints return preview URLs only; HD output comes from the export calls. [U]

### Vizard API (exists, included in paid plans)
- **Plans:** API is included with Creator and Business, at no extra cost. It consumes the same upload minutes as the web app. Over 10,000 min/month means contacting sales.
- **Limits:** max 600 min and 10 GB per video, up to 4K.
- [V] https://docs.vizard.ai/docs/pricing.md
- **Endpoint:** `POST https://elb-api.vizard.ai/hvizard-server-front/open-api/v1/project/create`, header `VIZARDAI_API_KEY`.
- **Input:** `videoUrl` plus `videoType`. Sources: remote file, YouTube, Drive, Vimeo, StreamYard. Parameters include `preferLength`.
- **Results:** poll the query endpoint, or receive a webhook POST.
- [U] Search snippets of https://docs.vizard.ai/docs/quickstart
- **Prices:** about $29–30/mo for Creator according to third-party sites. [U]
- **Rate limits:** not documented. [U]

### Custom pipeline components
- **faster-whisper:** MIT license.
  - GPU needs CUDA 12 + cuDNN 9 (the current ctranslate2 supports only these).
  - Runs on CPU with `compute_type="int8"`.
  - Models: `large-v3`, `turbo`, `distil-large-v3`. No FFmpeg needed (uses PyAV).
  - Benchmark: large-v2 on GPU with batch 8 transcribes 13 min of audio in about 17 s. On CPU, the small model takes about 1m42s.
  - [V] https://github.com/SYSTRAN/faster-whisper
- **WhisperX:** BSD-2-Clause. Uses a faster-whisper backend and adds word-level alignment.
  - **Diarization** uses pyannote `speaker-diarization-community-1`, licensed **CC-BY-4.0**.
  - It **requires an HF read token and accepting the model's user conditions on Hugging Face**.
  - Large-v2 needs under 8 GB of VRAM. GPU setups need CUDA 12.8.
  - [V] https://github.com/m-bain/whisperX
- **Reframing (9:16 auto-crop):**
  - **MediaPipe Face Detector** (BlazeFace short-range, VIDEO running mode, Python) is current. [V] https://developers.google.com/edge/mediapipe/solutions/vision/face_detector . Apache-2.0 license [U, standard for MediaPipe].
  - **Ultralytics YOLO is AGPL-3.0.** An Enterprise license is required for any closed-source or SaaS commercial use, even internal or backend-only. **Avoid it, or pick a permissively licensed detector.** [V] https://www.ultralytics.com/license
  - Approach: detect per frame (or every Nth frame), pick the active speaker (face plus diarization or VAD overlap), smooth the crop center with an EMA or One-Euro filter plus a dead-zone, cut hard on scene changes (PySceneDetect), then render with FFmpeg `crop`/`scale`. [U] Design suggestion, not from docs.

---

## 6. YouTube Data API v3 publishing

**Important: several long-standing facts changed recently, one of them yesterday.**

| Item | Current fact | Status |
|---|---|---|
| `videos.insert` quota | **1 unit per call in a separate "Video Uploads" bucket, capped at 100 calls/day** (`search.list` also has its own bucket). This replaces the old "1600 units from the 10,000 pool". Revision history: cost cut from about 1600 to about 100 units (doc update 2025-12-04), separate buckets from 2026-06-01. | [V] https://developers.google.com/youtube/v3/docs/videos/insert , https://developers.google.com/youtube/v3/determine_quota_cost , https://developers.google.com/youtube/v3/revision_history |
| Default daily quota | 10,000 units shared pool, plus the separate upload and search buckets | [V] determine_quota_cost |
| Scopes | `youtube.upload` is enough. `youtube`, `youtube.force-ssl` and `youtubepartner` also work. | [V] videos/insert |
| Unverified projects locked private | **Reversed on 2026-11-02.** "Videos uploaded from unverified API projects are not restricted to private viewing mode." Uploads without `privacyStatus` now default to `public`, though channel settings can still force some uploads to private. This undoes the 2020-07-28 rule. | [V] videos/insert, revision_history (2026-11-02 entry) |
| OAuth app verification | Sensitive and restricted scopes need brand verification (verified domain homepage, privacy policy, Search Console ownership) plus sensitive-scope review (demo video of the consent flow, narrowest-scope justification). Restricted scopes also need an annual security assessment. Classification of `youtube.upload` as sensitive is my assumption: it is standard, but the fetched pages don't name it. Review takes about 3–5 business days per a Google page mirror. | [V] https://support.google.com/cloud/answer/13464321 ; classification and timeline [U] |
| `status.publishAt` | ISO 8601. Only valid when `privacyStatus=private` and the video has never been published. A past date publishes immediately. `videos.update` must resend `privacyStatus: private`. | [V] https://developers.google.com/youtube/v3/docs/videos |
| `status.selfDeclaredMadeForKids` | Settable on insert and update. Required by COPPA flows; send it explicitly. | [V] videos |
| `status.containsSyntheticMedia` | **Exists.** Boolean; "allows the channel owner to disclose that a video contains realistic Altered or Synthetic content". Settable on insert and update; added 2024-10-30. Feista should set it `true` for realistic AI video. | [V] videos, revision_history |
| `thumbnails.set` | About 50 units from the shared pool. JPEG/PNG, max 50 MB. **As of 2026-11-03, custom thumbnails are supported for Shorts** after processing (new `shortsAspectRatio`). The account must have permission for custom thumbnails, otherwise 403. Whether this means phone verification is [U]. | [V] https://developers.google.com/youtube/v3/docs/thumbnails/set , revision_history |
| Shorts classification | Automatic. A square or vertical video **up to 3 minutes** is a Short (applies to music-linked content from 2025-12-08). The API has no "isShort" flag. Use 16:9 to avoid Shorts. | [V] https://support.google.com/youtube/answer/15424877 |
| Upload size | Max 256 GB; `video/*` or `application/octet-stream`; resumable upload | [V] videos/insert |
| Refresh tokens | Invalidated when the user revokes access, after 6 months unused, when the 100-tokens-per-account-per-client limit is exceeded (the oldest is silently invalidated), or when time-based access expires. **Testing-mode apps with external user type get refresh tokens that expire in 7 days** (unless only basic profile scopes are requested). Revoke via `https://oauth2.googleapis.com/revoke`. | [V] https://developers.google.com/identity/protocols/oauth2 ; revoke URL [U, standard] |

---

## 7. Infra inputs

### Durable workflows

| Option | Key facts | Status |
|---|---|---|
| Inngest | Free: 50k executions/mo (each run and each step counts), 5 concurrent steps, hard pause at quota, 30-day max run. Pro from $99/mo. Self-hostable. | [V] https://www.inngest.com/pricing |
| Trigger.dev | Free $0 with $5 compute credit and 20 concurrent runs. Hobby $10 (50 concurrent). Pro $50. Compute billed per second (Small 1x 0.5 vCPU ≈ $0.0000338/s) plus $0.25 per 10k runs. **No max run duration.** Python build extension. Apache-2.0, self-hostable. FFmpeg not confirmed on the pricing page (they have had an ffmpeg build extension) [U]. | [V] https://trigger.dev/pricing |
| Temporal Cloud | Pay-as-you-go, no base fee, $50 per 1M actions (down to $25). Business tier $500/mo minimum. $150 credit for 90 days. Operationally heavy for one developer. | [V] https://temporal.io/pricing |
| pg-boss | MIT. Postgres 13+, Node 22.12+ or Bun. Retries with backoff, cron, deferral, dead-letter queues with redrive. **$0 extra:** runs on Supabase Postgres. | [V] https://github.com/timgit/pg-boss |
| graphile-worker | Postgres-native alternative to pg-boss | [U] (not re-checked) |
| Vercel Functions | Fluid compute. Hobby: 300 s max. Pro/Enterprise: 300 s default, **800 s max GA**, 1800 s extended (Beta). 4.5 MB request/response body limit. 2 GB (Hobby) or 4 GB (Pro) memory. **Not suitable for FFmpeg jobs.** Hobby is for non-commercial use per Vercel terms [U, not re-checked]. | [V] https://vercel.com/docs/functions/limitations |
| Vercel Queues | **Beta**, all plans. Durable topics, at-least-once delivery, fan-out consumer groups, push or poll mode, 7-day TTL. JS and Python SDKs. | [V] https://vercel.com/docs/queues |
| Vercel Workflows | Exists, built on the open-source Workflow SDK (`'use workflow'`/`'use step'`). Sleep and hooks for minutes to months. JS/TS and Python. Usage-based pricing on events and data. Multi-region requires `workflow@5.0.0-beta.33` or later. GA status not explicitly stated. | [V] https://vercel.com/docs/workflows |
| Render Workflows | TS and Python SDK, runs up to 24 h, billed per second. No GPU mentioned. | [V] https://render.com/docs/workflows |

### Container hosts for Python + FFmpeg workers

| Host | Facts | Status |
|---|---|---|
| Railway | Hobby $5/mo (includes $5 usage); Pro $20. $20/vCPU-mo, $10/GB-RAM-mo, $0.05/GB egress. **No GPUs listed.** | [V] https://docs.railway.com/reference/pricing/plans |
| Fly.io Machines | GPU Machines are kept running but Fly is "scaling back our GPU ambitions" with no new investment. Don't depend on Fly GPUs. Stopped machines bill only rootfs [U, not re-checked]. | [V] https://fly.io/blog/wrong-about-gpu/ |
| Google Cloud Run jobs | **GPU on jobs is supported:** NVIDIA **L4 24 GB** (min 4 CPU / 16 GiB) or RTX PRO 6000 96 GB. L4 regions include us-central1, us-east4, europe-west1, europe-west4. 3 GPUs auto-granted per region on first deploy. Scales to zero, so it is the best fit for on-demand whisper. GA/preview status and max job task timeout were not stated on the page. | [V] https://docs.cloud.google.com/run/docs/configuring/jobs/gpu |
| Render | Background workers exist; no prices or GPU on the fetched page | [U] |

### Storage and auth

| Item | Facts | Status |
|---|---|---|
| Cloudflare R2 | $0.015/GB-mo. Class A ops $4.50/M, Class B $0.36/M. **Egress free.** Free tier: 10 GB, 1M Class A, 10M Class B. Infrequent Access: $0.01/GB-mo with a 30-day minimum. | [V] https://developers.cloudflare.com/r2/pricing/ |
| Supabase | Free: 1 GB storage, 5 GB egress, 50 MB max file, 50k MAU, 500 MB DB, **paused after 1 week of inactivity**. Pro $25: 100 GB storage, 250 GB egress then $0.09/GB, files up to 500 GB, 100k MAU, 8 GB disk. | [V] https://supabase.com/pricing |
| Supabase Auth + Expo | `@supabase/supabase-js` with a storage adapter: AES-encrypted session in AsyncStorage, key in expo-secure-store. Native Apple sign-in (expo-apple-authentication, iOS only, not in Simulator). Google via `signInWithOAuth` on mobile. Deep links needed for email confirmation. | [V] https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth |
| Clerk + Expo | Package **`@clerk/expo`** with `tokenCache` from `@clerk/expo/token-cache` (expo-secure-store). Native SwiftUI / Compose components are in beta and need a dev build. Free up to 50k MRU; Pro $25/mo, then $0.02/MRU. | [V] https://clerk.com/docs/quickstarts/expo , https://clerk.com/pricing |

### Recommended stack (single developer, low fixed cost)

1. **App:** Expo SDK 58 + expo-router 58.
2. **API:** TypeScript (Hono or Fastify) as one always-on Railway service, about $5–20/mo. Every provider key stays server-side, as Higgsfield's docs explicitly require. Vercel is usable for the API, but production commercial use needs Pro at $20/mo, and functions can't host FFmpeg.
3. **Database, auth, queue:** **Supabase Pro ($25).** Postgres plus Auth (one vendor, no Clerk bill), and **pg-boss on the same Postgres** as the job queue and state machine. One `jobs` table is the source of truth.
   - Provider webhooks (fal, Higgsfield) hit the API, get signature-verified, update the job and enqueue the next step.
   - A polling sweeper is the fallback for missed webhooks.
   - Move to Trigger.dev (Hobby $10) only if orchestration gets complex.
4. **Media storage:** **Cloudflare R2** for all media (free egress matters for video previews and the YouTube upload streaming). Use Supabase Storage only for small private assets.
5. **Workers:**
   - CPU FFmpeg workers on Railway, pulling from pg-boss.
   - Transcription: run faster-whisper or WhisperX as a **Cloud Run job with an L4 GPU** that scales to zero. Or start on CPU with int8 `turbo` until volume justifies the GPU.
6. **Generation providers:**
   - **fal.ai as primary:** one key; Seedance 2.0 / Fast, Kling, Nano Banana 2; queue plus signed webhooks.
   - **Runway as secondary**, with transparent per-second pricing and the only documented Seedance Mini price.
   - **Higgsfield** optional, behind the same provider interface. Its API lacks documented Nano Banana and TTS, and bills a separate prepaid balance.
7. **Voice:** ElevenLabs Creator ($22), for commercial rights, 10 concurrent Flash requests and 192 kbps output. Use `/with-timestamps` to drive captions.
8. **LLM:** Anthropic `claude-sonnet-5-5` (or `claude-haiku-5-5` for cheap passes) with GA structured outputs, for scripts, hooks and titles.
9. **Clipping:** build in-house (WhisperX + MediaPipe + FFmpeg). Use Vizard's API as a quick-start option if needed: it is included in paid plans, while OpusClip has a 15 h/mo cap and a 10-credit minimum per project.

**Rough fixed cost:** about $50–75/mo (Supabase $25, Railway about $5–20, ElevenLabs $22, R2 about $0 at start), plus usage. [U] Estimate.

---

## 8. Expo and the React Native skills

- **Expo SDK 58.0.0** with React Native 0.88 and React 19.3.0. [V] https://docs.expo.dev/versions/latest/
- **npm latest:** `expo@58.0.23`, `expo-router@58.0.30` (expo-router now follows the SDK version number), `react-native@0.88.1`. [V] registry.npmjs.org, 2026-11-03

**vercel-labs/agent-skills → `skills/react-native-skills`** (MIT, v1.0.0). Checked at commit `1a2c79d`, 2026-10-27. [V] https://github.com/vercel-labs/agent-skills/tree/main/skills/react-native-skills

**Lists** (CRITICAL)
- Use a virtualizer (**LegendList or FlashList**) for *any* list, never ScrollView + map.
- Pass primitives to memoized items.
- Hoist callbacks to the list root.
- No inline objects in `renderItem`.
- Keep references stable.
- Keep items lightweight; move expensive work out of them.
- Use item types for mixed lists.
- Use compressed, thumbnail-sized images in lists.

**Animation**
- Animate only `transform` and `opacity` (HIGH).
- Prefer `useDerivedValue` over `useAnimatedReaction`.
- Use `GestureDetector` / `Gesture.Tap` for animated press states.
- With React Compiler, use `.get()` / `.set()` on shared values, not `.value`.

**Navigation**
- Native stack (expo-router default).
- Native tabs (`react-native-bottom-tabs` or expo-router native tabs).
- Avoid the JS `stack` and `bottom-tabs` navigators.

**UI**
- Use `expo-image` for all images.
- Use `@nandorojo/galeria` for lightboxes.
- Use `Pressable`, not Touchable*.
- Use `contentInsetAdjustmentBehavior` for safe areas in scroll views.
- Use `contentInset` for dynamic header spacing.
- Use native menus via **zeego**.
- Use native `<Modal presentationStyle="formSheet">` instead of JS bottom sheets.
- Measure with `useLayoutEffect` + `onLayout`, not `measure()`.
- Styling: `StyleSheet.create` or Nativewind; `borderCurve:'continuous'` with radius; `gap` instead of margins; `experimental_backgroundImage` for gradients.

**State**
- Minimize state and derive values.
- State must be ground truth.
- Use functional dispatch updaters.
- Use a fallback value instead of syncing `initialState`.
- Never keep scroll position in `useState`.
- Destructure functions early for React Compiler.

**Rendering** (CRITICAL; these prevent crashes)
- Never `{maybeFalsy && <X/>}`.
- Always wrap strings in `<Text>`.

**Monorepo**
- Native dependencies go in the app package (autolinking).
- Use a single version of each dependency.

**Config**
- Embed fonts with the `expo-font` config plugin, not `useFonts`.
- Import from a design-system folder.
- Hoist `Intl` formatters.
- Prefer compound components over polymorphic children.

---

## Open risks

1. **YouTube policy churn:** the private-lock rule was removed on 2026-11-02, the quota buckets changed on 2026-06-01, and Shorts thumbnails were added on 2026-11-03. Re-verify right before launch. The new **100 uploads/day per project** cap is a hard ceiling across *all* users: plan to request a quota increase, which needs the API Services compliance audit [U].
2. **OAuth verification:** while the app is in Testing mode, users must re-auth every 7 days. Production needs a verified domain, a privacy policy and a demo video before public users can connect YouTube.
3. **Higgsfield API gaps:** there is no documented Nano Banana, TTS or Seedance Mini; the per-model price list is not public; and a web subscription likely doesn't fund the API. Don't make Higgsfield the only provider.
4. **Model deprecation:** fal's `veo3.1` endpoint is deprecated on 2026-11-17, and OpenAI's speech-endpoint TTS shuts down on 2027-01-06. Keep model ids in config behind a provider interface.
5. **Cost spikes:** Seedance 2.0 at 1080p is about $0.40–0.68/s. A 15 s clip costs about $4.50–10, so the app needs hard per-user credit budgets. On fal, cancelling a running request may still bill.
6. **Licensing:** avoid Ultralytics YOLO (AGPL). pyannote community-1 is CC-BY-4.0 and needs attribution plus HF gating. The ElevenLabs Free plan is non-commercial.
7. **Output retention:** Higgsfield deletes outputs after 7 days, and fal webhook results expire in about 1 h (about 6 min for large ones). Copy outputs to R2 immediately in the webhook handler.
8. **Webhook security:** Higgsfield doesn't sign deliveries until an admin reveals the secret. Reveal it on day one and verify every delivery (Standard Webhooks for Higgsfield, ED25519 JWKS for fal).
9. **GPU availability:** Railway has no GPUs and Fly's GPU future is uncertain. Cloud Run L4 quota is only 3 per region by default.
10. **Unverified items:** the Luma credit-to-USD rate, Runway webhooks, Vizard pricing and rate limits, the OpusClip create-project schema, and whether ElevenLabs v4 works with `/with-timestamps`.
