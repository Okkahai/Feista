# Feista design system — mobile

**Direction:** Cinematic Analog × Editorial Brutalism. Feista's app is a production instrument, closer to a slate, a camera report or a lab sheet than to an AI SaaS dashboard.

Code: `apps/mobile/src/theme/tokens.ts` and `apps/mobile/src/components/`. Screenshots (web export, 390×844 @2x): `docs/design/screens/`.

## Principles

1. **Label things the way a production does.** Use slates, reel numbers (`01 ── ON THE FLOOR`), edge-printed frame numbers, timecode (`00:00:12:04`) and take counts (`TAKE 2/3`). Use words and numbers rather than icons. The app has no sparkle or magic-wand iconography.
2. **Never use colour alone.** Every job status has a printed label, a distinct shape and a colour (see StatusMark). Colour is the third channel.
3. **Be honest about state.** Fixture data shows a `FIXTURE DATA` mark. Provider verification shows exactly what was recorded (`PLANNED`, `MOCKED`, ...). Spend keeps *estimated* and *reported* apart. A disabled control always prints its reason under itself.
4. **The grid shows through.** Corners are square (radius 0, 2 at most). Hairline rules carry the structure, and heavy rules open sections. The page gutter is purposefully asymmetric (20 left / 16 right), so type hangs off a wide left edge.
5. **Motion stays quiet.** The only loop is the REC-light opacity pulse on `RUNNING`. It animates opacity only, through Reanimated, and turns off under reduced motion. There is no parallax, no overshoot spring and no shimmer.

## Tokens (`src/theme/tokens.ts`)

### Colour (dark is the primary and only theme)

| token | hex | role | contrast on `bg` |
|---|---|---|---|
| `bg` | `#0E0D0C` | warm near-black, like film base, not blue-black | — |
| `surface` / `surfaceRaised` / `surfaceSunken` | `#151311` / `#1C1916` / `#090807` | pressed rows, film-strip carrier | — |
| `rule` / `ruleStrong` | `#2E2A26` / `#4A443D` | hairlines / cell borders | — |
| `text` | `#EFE8DC` | warm off-white | 15.9:1 |
| `textMuted` | `#A69D8F` | secondary copy, keys | 7.3:1 |
| `textFaint` | `#8A8175` | 10–11px metadata | 5.1:1 |
| `slate` | `#E8C547` | **clapper/slate yellow**: primary action, "needs you" (review) | 11.6:1 |
| `tape` | `#E5533D` | **camera-tape / REC red**: failed, destructive | 5.2:1 |
| `leader` | `#7FB069` | **leader green / "good take"**: complete, key on file, verified | 7.7:1 |
| `tungsten` | `#E0913A` | **3200K work light**: in progress (running, at provider) | 7.7:1 |

Why these accents: each one is a real marking on a film set, and each has one job. Yellow is the slate, the object everyone looks at before a take, so it marks the user's attention and primary actions. Red is the REC light and the tape on a failed mag. Green is leader and the "print it" good take. Tungsten amber stands for work in progress under lights. The app has no blue, no purple and no gradients.

### Type

Fonts are loaded at runtime with `useFonts` from `@expo-google-fonts/*`. All three fonts use the SIL Open Font License 1.1 (checked in each package's `LICENSE_FONT`).

| role | family | why |
|---|---|---|
| Display (`displayXL` 56 → `displayS` 20, uppercase, tight leading) | **Anton** (OFL 1.1, © The Anton Project Authors) | A condensed poster grotesque. It reads like one-sheet titling and slate chalk, and it fits long titles on a 390pt screen. |
| Body (`bodyL` 17, `body` 15, `bodyS` 13) | **IBM Plex Sans** 400/500/600 (OFL 1.1, © IBM, RFN "Plex") | An industrial, engineered humanist with high legibility at small sizes. It matches the mono face. |
| Mono (`mono` 13, `monoS` 11, `monoXS` 10, `label` 12) | **IBM Plex Mono** 400/500 (OFL 1.1, © IBM, RFN "Plex") | Used for timecode, IDs, keys and status labels. `fontVariant: tabular-nums` is set so columns don't jitter. |

### Spacing, borders, touch, motion

- `space`: a 4pt grid `{0,2,4,8,12,16,24,32,48,64}`. `gutter`: `{left: 20, right: 16}`.
- `border`: `hairline` (StyleSheet.hairlineWidth), `thin` 1, `heavy` 2, `radius` 0, `radiusMax` 2.
- `touch`: `min` 44 (iOS HIG) and `row` 48 (Android). Buttons are 48 high, and compact buttons, steppers, choice cells and back links are at least 44.
- `motion`: `fast` 120, `base` 200, `slow` 320, `pulse` 1200 ms. `fps` 24 drives timecode.

## Component inventory (`src/components`)

| component | what it is |
|---|---|
| `Slate` | A clapperboard header: skewed black/white stick band, eyebrow line, Anton title, ruled field grid (`DATE / ROLLING / REVIEW / QUEUE`). Takes an optional `FIXTURE DATA` mark. |
| `Timecode` | `HH:MM:SS:FF` at 24 fps (`lib/format.ts → toTimecode`), mono and tabular. The screen reader hears "12 seconds 4 frames". |
| `StatusMark` | Maps each core `JobStatus` to label, shape and colour (table below). `STATUS_MARKS` is exported and unit-tested for uniqueness. |
| `ContactSheet` | A virtualised two-up grid (FlashList). Each cell is a `Frame` with sprocket edges, an edge-printed frame number, the title, a mono caption and a StatusMark. |
| `Frame` | One film frame: sprocket hole rows, an expo-image gate (blurhash placeholder until real keyframes exist) and the edge number. |
| `StageTimeline` | A vertical rail through core `STORY_STAGES`. Per-scene stages fan out into SC01…SCnn sub-rows and collapse when every scene is complete. Each row shows `TAKE n/max` (with `GEN n ·` in front once a new take has been made), the UTC time and PAID / HUMAN GATE tags. Failed rows show the error in tape red and an inline **Retry** button, or a printed reason when max attempts is reached. |
| `DagStrip` | A compact horizontal read of the whole DAG (one cell per node) with a counts line. Used on Studio. |
| `Rule` | A hairline, thin or heavy rule, horizontal or vertical, in four tones. |
| `SectionHead` | Heavy rule plus reel index (`01`, in slate) plus Anton title plus right-aligned mono aside. Marked as a header for accessibility. |
| `Button` | `primary` (slate-yellow block), `secondary` (outline), `destructive` (tape outline that fills on press). Square. `disabledReason` turns it dashed and prints `⊘ reason` under it, which is also the a11y hint. |
| `MetaRow` | A camera-report row: mono key on the left, value on the right, hairline under it, with tones. |
| `Field`, `Choice`, `Toggle` | An underlined input whose rule turns slate on focus. A ruled segmented radio group. A full-row switch with a square ON/OFF box instead of a pill. |
| `Screen`, `TabBar` | The scroll container: safe-area top goes into the content inset, and keyboard screens use `KeyboardAwareScrollView`. The reel-index tab bar has numbered cells, and the active cell gets a slate-yellow flag. |

### StatusMark mapping

| JobStatus | label | shape | colour |
|---|---|---|---|
| queued | QUEUED | hollow square | textMuted |
| running | RUNNING | filled dot (pulses) | tungsten |
| awaiting_provider | AT PROVIDER | ring | tungsten |
| awaiting_review | REVIEW | diamond | slate |
| completed | COMPLETE | filled square | leader |
| failed | FAILED | cross | tape |
| cancelled | CANCELLED | slashed square | textFaint |

## Screens

All screens read through `src/data/repo.ts`, which is backed by fixtures for now. Every screen file carries a header comment saying so, and the UI shows `FIXTURE DATA`.

- **Studio** (`(tabs)/index.tsx`): sections for on the floor (active productions with DagStrips), the queue, recent prints (a film strip), spend for Nov (committed against the limit on a ruled meter with a red tick at the warn line, estimated vs reported vs not yet reported), and lines (backend `NOT CONNECTED — FIXTURE REPO`, keys on file, health probe `NOT BUILT`).
- **Create**: Entry A Story and Entry B Clips. Clips is honest that its worker isn't built, and its button is disabled with a reason. The story form has title, look, duration, aspect, voice, a scenes stepper and a budget cap with a decimal keyboard. The live estimate is checked with core `decideSpend` against the project cap and the month limit. Submit is blocked with a reason on deny, and relabelled "Approve $x & queue" on needs_approval. It creates a queued production in the repo and opens it.
- **Projects**: a contact sheet with a status filter.
- **Project detail** (`project/[id].tsx`): slate plus look, voice and budget. **Dailies** is shot-by-shot: in/out timecode, beat, status, and **Approve** or **Revise** (a note is required, then Send back) for scenes in review. Retry is inline for failed shots. Then the stage timeline.
- **Connections**: provider rows with the verification badge exactly as recorded, capabilities, and key / auth / health / mode facts. Add key is disabled because the server-side vault isn't built. A docs link opens the provider's docs.
- **Settings**: export defaults, spending limits, notifications (delivery not built, and labelled so), privacy (analytics off by default), and storage (clear cache works against the fixture).

Fixture actions run through `@feista/core`:
- approve: `awaiting_review → completed`
- revise: `→ queued`, then downstream resets via `invalidated()`
- retry: `failed → queued`, with core's `blockedReason()` guard
- create: `createStory` re-checks spend with `decideSpend` against the project cap and the month limit. It refuses deny, and refuses needs_approval unless the user pressed "Approve & queue" (`{ approved: true }`).

## Vercel React Native rules applied

- **Lists:** FlashList for the project library. Memoised cells, a stable `renderItem` and `keyExtractor`.
- **Styles:** `StyleSheet.create` everywhere. Variant styles are precomputed, so there are no per-render style objects in list cells.
- **Images:** expo-image with `recyclingKey`.
- **Animation:** Reanimated only, on opacity.
- **UI basics:** `Pressable` (no Touchable*). Safe area handled in scroll content insets. `Intl` formatters hoisted to module scope. Ternaries instead of `&&` for conditional rendering. All text inside `Text`.
- **Monorepo:** native deps live in `apps/mobile`, and `@feista/core` is `workspace:*`.

## Refined after the screenshot critique

The first round was distinctive, but these issues came out of a hard look:

1. **Toggle ON was leader green.** That collided with "complete" semantics. ON is now an inverted off-white block, so green means only done or verified.
2. **Placeholders read as filled values.** The working title placeholder looked like real data. Placeholders now start with "e.g.", and `textFaint` was raised from `#7A7266` (4.1:1, failing AA at 10px) to `#8A8175` (5.1:1).
3. **Contact sheet rows were ragged.** One- and two-line titles misaligned the columns, and the asymmetric gutter made the left and right frames different widths. Two title lines are now reserved, and column padding compensates for the gutter.
4. **The stage timeline was a wall of green.** Six identical COMPLETE keyframe rows buried the one failed scene. Per-scene groups now collapse when fully complete (`SC01–06 +`), so the exceptions stand out.
5. **Retry was only at the bottom.** A failed shot in Dailies now has its own Retry, and retry labels read `SCENE VIDEO · SC05` instead of `scene_video 4`.
6. **Section spacing was loose.** The section top margin went from 32 to 24.
7. **Back link was ambiguous.** "← Back" became "← Projects".

Honest verdict: none of the screens read as a generic dark SaaS dashboard. There are no cards with shadows, no gradients and no pills. The weakest point is repetition: every tab opens with the same large Slate, which is strong once and samey five times (see gaps).

## Known gaps

- **Fonts:** loaded with `useFonts` at runtime, not embedded via the `expo-font` config plugin (Vercel rule `fonts-config-plugin`). Embedding changes native family names, so it was left for the first dev build.
- **Tab bar:** a JS tab bar rather than native tabs (rule `navigation-native-navigators`). This was a deliberate choice: the native iOS tab bar brings system glass, which the identity rejects.
- **Light theme:** none.
- **Real keyframes:** frames are blurhash placeholders.
- **Testing on devices:** screenshots come from the **web** export. Native iOS/Android rendering was not checked on a device or simulator: the Android bundle compiled, but it never ran. Keyboard avoidance was likewise never exercised on a real keyboard.
- **Slate repetition:** every tab uses the full Slate. A compact slate variant for secondary tabs would add rhythm.
- **Spend this month:** derived from projects created this month, because ledger entries have no timestamps yet (`shortcut:` in `repo.ts`).
- **Persistence and connections:** settings and fixture mutations are not persisted. No backend, health probe, key vault, push notifications or Clip Studio exist, and the UI says so.

## Open critique (independent review, 2026-11-03)
Accepted, scheduled for the next design pass:
- The "cinematic analog" half is mostly typography. Add real material: subtle grain on frame thumbnails only, warm halation on the active frame, edge codes on the contact sheet.
- The DAG strip's green/yellow/orange/red reads as a traffic-light dashboard. Replace it with lab-sheet marks (punch holes / edge-code ticks), keeping StatusMark shapes as the source of meaning.
- Project detail: the two-line title plus the slate pushes the first Approve button to ~y=1400. Use a compact slate on secondary screens and keep the first review action above the fold.
- 10–11 pt letterspaced mono is used heavily; raise metadata to ≥12 pt and measure contrast rather than trusting token comments.
