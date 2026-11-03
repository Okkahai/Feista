# Development progress

_Last updated 2026-11-03 (session 1)._ Status words: planned · implemented · mocked · tested locally · tested live · integrated · production-ready.

## Done (session 1)
- Phase A audit + provider research (`ARCHITECTURE.md` §1, `PROVIDER_INTEGRATIONS.md`).
- `@feista/core`: lifecycle, Story DAG, budget guard, provider contract — **implemented, tested locally**.
- `feista-media`: assembly port + media QA — **implemented, tested locally on real EP002 inputs**.
- `apps/mobile`: Expo foundation + design system — see PR / DESIGN_SYSTEM.md (fixture data, no backend yet).

## Next (in order)
1. Phase C locally (no paid services): docker-compose Postgres + MinIO; schema + migrations (users, projects, nodes, assets, ledger, credentials); Hono API with auth stub; pg-boss orchestrator driving `STORY_STAGES`; media worker consuming `assembly`/`media_qa` jobs.
2. Encrypted credential store + redacting logger.
3. Provider adapters (fal, ElevenLabs, Anthropic, Higgsfield) with contract tests on recorded fixtures — live smoke tests only after Gün approves a small budget.
4. Mobile ↔ API wiring, push notifications.
5. Clip Studio custom pipeline (faster-whisper, MediaPipe reframing).
6. YouTube OAuth app + publish adapter.

## Blocked on Gün (approval / accounts)
- Paid/hosted services: Supabase, Cloudflare R2, Vercel Pro (commercial use), Railway/Cloud Run, fal.ai, ElevenLabs paid plan, Higgsfield API balance, Anthropic API key.
- Google Cloud OAuth app (consent screen, verified domain, privacy policy) for YouTube.
- Apple/Google developer accounts for store builds.

## Known limitations
- Mobile screens run on fixture data.
- No provider has been called live.
- Real-episode regression is manual (media is private, not in the public repo).
