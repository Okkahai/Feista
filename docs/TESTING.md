# Testing

| Area | How | Status |
|---|---|---|
| `packages/core` | vitest: lifecycle transitions, retry/backoff, idempotency keys, DAG expansion/scheduling/invalidation, budget decisions, provider registry | 13 tests, CI `ci-core` |
| `workers/media` | pytest with **real ffmpeg** on synthetic clips/VO/music: assembly meets delivery spec (1080×1920, 30 fps, ≥7 Mbps, −14±0.6 LUFS), inputs untouched, caption timing, config validation, QA catches bad size/no audio/freeze/black/silence | 5 tests, CI `ci-media` |
| Real-episode regression (manual, not in CI — episode media is private) | `feista-media assemble <copy of ep002> --work … --out …`, then `cmp` captions and `feista-media qa` | 2026-11-03: captions.ass byte-identical to production; new −14.0 LUFS vs original −14.4; 7.9 Mbps; 28.58 s; QA clean |
| Mobile | tsc, jest-expo tests, `expo export`, screenshots | see DESIGN_SYSTEM.md |
| Providers | mocked adapter tests only so far. **Nothing is tested against a live provider.** | — |
