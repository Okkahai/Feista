# Feista: Claude Code guide

@AGENTS.md

All shared rules, commands and layout are in `AGENTS.md` (imported above) and `docs/agent/`. Do not duplicate them here.

## Claude-specific notes
- Read `docs/agent/HANDOFF.md` and `docs/agent/TASK_REGISTRY.md` before starting; update the registry in the same PR as the work.
- Default model for in-app text stages is set in code (`apps/api/src/llm.ts`, Anthropic SDK with server-side fallbacks); that is the product's choice, not an instruction about which model runs this agent.
- The runner strips every `ANTHROPIC_*` environment variable at start (`apps/api/src/runner-main.ts`) so a developer's own Claude Code / API credentials can never bill a user's job. Keep it that way.
- When you write user-facing replies to Gün, mirror Gün's language (Turkish or English).
- Prior project history from the Claude Code Cloud project (threads, memory) is summarized in `docs/agent/`; the cloud sessions are not reachable from a local setup.
