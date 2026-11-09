# Verification

## CI (GitHub Actions, `.github/workflows/`)
| Workflow | Trigger | Runs |
|---|---|---|
| `ci-core` | every PR; push to develop/main | `pnpm --filter './packages/*'` typecheck + test (core, vault, providers) |
| `ci-api` | PR touching api/packages/db/media/lockfile; push | Postgres 16 service + ffmpeg + Python 3.12; `@feista/api` typecheck + test with `FEISTA_DISPOSABLE_DB=1` |
| `ci-db` | PR touching `db/**`; push touching db | `db/tests/run.sh` (forced-RLS isolation, mutation-checked) |
| `ci-media` | PR/push touching `workers/media/**` | ruff, mypy, pytest with real ffmpeg |
| `ci-mobile` | PR touching mobile/core/lockfile; push | typecheck, expo lint, jest, `expo export --platform android` |
No CI secrets, no deploy jobs. Last green run on develop: all four triggered workflows on `b19fa18` (2026-11-05 17:19–17:30 UTC; `ci-db` not triggered because `db/**` didn't change).

## Local run, 2026-11-06, clean checkout of `develop` @ `b19fa18` (Linux, Node 22, pnpm 10.28.0, Postgres 16, ffmpeg, Python 3.12)
| Suite | Command | Result |
|---|---|---|
| install | `corepack enable && pnpm install --frozen-lockfile` | ok |
| typecheck | `pnpm -r typecheck` | ok (packages, api, mobile) |
| core | `pnpm --filter @feista/core test` | 19 passed |
| vault | `pnpm --filter @feista/vault test` | 38 passed |
| providers | `pnpm --filter @feista/providers test` | 8 passed |
| api | `pnpm --filter @feista/api test` (temp Postgres started by `db/with-temp-db.sh`) | 56 passed (6 files) |
| db | `db/tests/run.sh` (temp cluster) | `RLS_TESTS_PASSED` |
| mobile | `pnpm lint && pnpm test --ci` in `apps/mobile` | lint clean, 15 passed (3 suites) |
| media | `ruff check . && mypy feista_media && pytest -q` in `workers/media` | clean, clean, 12 passed (~170 s) |
Not re-run in this snapshot: `expo export` (CI covers it), the manual EP002 regression (needs private episode media, see below).

## What "verified" means here
- **tested locally / CI**: the suites above. Provider code is exercised only against fakes (`fetch` stubs, fake Anthropic API, stubbed whisper). That is `mocked`, never `tested live`.
- **Manual real-episode regression** (media worker, not in CI because the media is private): copy an episode folder (e.g. `ep002-the-puddle` from the legacy archive, HANDOFF §4) → `feista-media assemble <copy> --work <tmp> --out <tmp>` → `cmp` the produced `captions.ass` with the production one and run `feista-media qa`. Last done 2026-11-03: captions byte-identical, −14.0 LUFS (original −14.4), 7.9 Mbps, 28.58 s, QA clean.
- **Delivery spec** enforced by `media_qa` / `clip_qa`: 1080×1920, 30 fps, ≥ 7 Mbps H.264, −14 ± 0.6 LUFS, no freeze/black/long silence (clips allow 3 s silence).

## Definition of done for a task (for T3 Code reviewers)
1. Code + tests in one PR into `develop`, pushed to `https://github.com/Okkahai/Feista.git`.
2. All triggered CI workflows green; reviewer re-ran the relevant local suite.
3. Independent reviewer pass (different agent than the implementer); blocking findings fixed and, for money/security logic, the fix mutation-checked (break it, see the test fail).
4. Status recorded with the honest vocabulary in `docs/DEVELOPMENT_PROGRESS.md` and the task's row in `docs/agent/TASK_REGISTRY.md` (`done-verified` only after 1–3).
5. Anything paid, deployed or published: Gün's explicit approval recorded in the PR.
