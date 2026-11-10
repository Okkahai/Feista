# Handoff: Claude Code Cloud Projects → local T3 Code

_Prepared 2026-11-06, finalized 2026-11-09. Repo state: `develop` @ `b19fa18`, no open PRs, no issues, CI green._

## 1. Read this first
- Feista is an Expo + TypeScript + Python content studio. Backend pipeline is built and tested locally with mocks; nothing is deployed and no provider was ever called live. Mobile runs on fixture data.
- **All app code is on GitHub.** The app session confirmed on 2026-11-06 13:51 UTC: clean tree, no local-only commits, no stashes, no work started after PR #15. Nothing in the cloud needs to be rescued for the code itself.
- What is **not** on GitHub is listed in §4. The research doc is now exported (T-018); the legacy channel workspace stays cloud-only by Gün's choice (T-021).
- Owner rules you must follow are in `AGENTS.md` "Hard rules". The short version: BYOK only, no spending, no deploys, no publishing, no destructive or access changes without Gün's explicit OK.
- Next work, in order: `docs/agent/TASK_REGISTRY.md` "Execution order".

## 2. Cloud project inventory (Claude Code Cloud project "Feista")
| Thread | State | Dates | Holds | Preserved? |
|---|---|---|---|---|
| Build Feista AI content studio app (`cmsg_01U7qerMcGzpwbbMezf8yt6QKQ3QKUY2nQgvwi4UBRAQTu`) | done, idle, not resolved | 2026-11-03 → 11-05 | All app work, PRs #1–#15 | Yes, fully on GitHub (session confirmed) |
| Prepare migration handoff to T3 Code (this) | working | 2026-11-06 → | These docs | Yes once branch `claude/project-thread-919fup` is pushed |
| Episodes 10 and up | resolved | 2026-09-26 → 09-29 | Wobbi Tales EP10–31 production, uploads | Media in shared folder only (§4); videos on YouTube |
| Episode 2 Short | resolved | 2026-09-26 | EP2–EP9 | same |
| Credit-efficient Shorts workflow | resolved | 2026-09-26 | EP1, workflow v1/v2 | same |
There are no queued, blocked or failed threads. No thread holds uncommitted code.
Project memory (cloud-only) has been folded into `docs/agent/DECISIONS.md` and this file; it is not reachable from T3 Code.

## 3. Git state
- Remote: `https://github.com/Okkahai/Feista.git` (public). Use this exact URL.
- `develop` @ `b19fa18` = merge of PR #15. `main` @ `9eafd85` (initial commit only; never released).
- PRs #1–#15: all merged into develop. Feature branches still exist remotely (`feat/*`, `docs/foundation`), all fully merged (docs/foundation's one extra commit `29ffc88` landed as squash `4eb248d`). Deleting them is optional and needs Gün's OK.
- `claude/project-thread-919fup`: this handoff (docs only). Based on `develop`.

## 4. State that lives outside the repo
| Item | Where | Risk if the cloud project is closed | Action |
|---|---|---|---|
| Format research doc "Animasyon Short formatları: yapı ve optimizasyon araştırması" (TR, 17 formats, 14 techniques, sources) | Claude Doc https://claude.ai/artifact/NejD3kCfmvFP7qr3Lcwzi2 | Survives in claude.ai while the account exists, but not in git; operative content already in `formats.ts` | Done: `docs/research/animation-short-formats-2026-11-05.md` |
| Legacy channel workspace: `workflow/workflow.md` (v2 + Production Rules v4 §9), `story-log.md`, `episode-log.md`, `episodes/ep001…ep031/` (episode.md, config.json, keyframes, clips, VO, music, outputs), `tools/build_short.py`, `tools/assemble.sh`, `assets/characters/*/sheet.png` | Cloud project shared folder `/mnt/project-files/workflow/` | **Lost if the project is deleted.** Only copy known. `build_short.py` logic is ported in `workers/media`; the EP002 regression needs these files | **T-021**: Gün chose to skip (accepted risk) |
| `app/screens/*.png` | shared folder | low (same images in `docs/design/screens/`) | none |
| `yt ctzx.txt` (original channel brief, no secrets) | shared folder | low | stays in the cloud (T-021) |
| YouTube uploader `yt.py`, `client_secret.json`, OAuth token, local `qa.py` + `qa_history.csv`, delivered episodes in `Downloads\Videolar\<date>\` | Gün's Windows PC | none from migration; contains **secrets: never copy into the repo or docs** | none |
| Remote Control sessions on Gün's PC | Claude cloud ↔ PC | ids in old memory (`env_0135…`, `cse_01Ruxd…`) may be stale; on 2026-11-06 the PC exposed a different RC environment (a `Codebase` folder) | not needed by T3 Code |
| YouTube channel Wobbi Tales (@wobbistories, `UC6Ya3q38w0fdQt5_p7NtyaQ`) | YouTube | none; 30 episodes were scheduled through 2026-10-26, nothing queued after | legacy only (T-019/T-020) |
| Higgsfield Plus web plan ($49/mo, renews the 26th) | Gün's account | keeps billing Gün whether or not the channel pipeline runs | Gün's call; mention only |
| PR description drafts | app session scratchpad | none (identical to PR bodies on GitHub) | none |

## 5. Open questions for Gün
1. T-015: is a free-tier hosted stack (e.g. Supabase free, R2 free tier) acceptable, or stay local-only until launch?
2. T-012: create the Google Cloud OAuth app for YouTube publishing (free, but an account/access change)?
3. Clip Studio "managed mode" (Vizard/OpusClip APIs) in `docs/PRODUCT_SPEC.md`: keep or drop?
4. Legacy channel: resume EP32+ (L-01)? Made-for-kids review window is open now (L-02).

## 6. Cut-over checklist (T-000)
- [x] Inventory threads, PRs, branches, CI, memory, shared folder.
- [x] Confirm no unpushed/uncommitted code in any cloud session.
- [x] Write `AGENTS.md`, `CLAUDE.md`, `docs/agent/*`; local test run green.
- [x] Gün approved push and merge (2026-11-10); PR #16 into `develop`.
- [x] T-018 research doc exported to `docs/research/`.
- [x] T-021 decided: Gün chose not to archive the legacy workspace (accepted risk).
- [ ] Clone in T3 Code from `https://github.com/Okkahai/Feista.git`, run `docs/agent/VERIFICATION.md` locally (needs Node 22, pnpm 10.28, Postgres 16 binaries, ffmpeg, Python 3.12).
- [ ] Then stop/close the cloud project. Note: deleting the project also deletes the legacy `workflow/` folder (T-021, accepted).

## 7. Do not restart / do not redo
- Do not rebuild anything from PRs #1–#15; it is merged and green.
- Do not re-run the format research; it is in `docs/research/` (T-018).
- Do not resume Wobbi Tales episode production, uploads, or channel setting changes (L-01, L-02).
- Do not create accounts, buy plans, or call providers live (D-02, D-03).
