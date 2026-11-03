/**
 * FIXTURE DATA — in-memory only, nothing here came from a backend or a provider.
 * Every screen reading through src/data/repo.ts is fixture-backed until the API
 * repo exists; the UI shows a "FIXTURE" mark from StudioState.source.
 */
import { STORY_STAGES, expand, type JobStatus, type StageRun } from "@feista/core";
import type { Project, ProviderConnection, Scene, Settings, StudioState } from "./types";

/** Warm, dim placeholder frames (generated blurhashes of synthetic gradients). */
export const FRAMES = [
  "U56*Bq0*EO}=~WEPNI-T5Y-TxYEO14=w$$9_",
  "U684C^~AE30h59Iqt6%00N9c%0?E^$-nNHE3",
  "U74.uQj[8_j[?^fkDifkx]fQRPfQRjfQtQfQ",
  "U570PoE#1c]-1c$i=KE#E#so$iNu}FJ8AW,@",
  "UA8zfE~U%1M|~U?GxaRkM|M|WBof9aD*NGt7",
  "U14V2Q01%L%f00_LMyIV%eMyofoy%fMyoyoy",
  "U36%sL=w0$1J={oLazj[0$Eg}r^4ofa|j@j@",
  "U58g:7of00oft7ayD%ay00fQ~pfQ4nfQ_2fQ",
] as const;

const frame = (i: number) => FRAMES[i % FRAMES.length] ?? FRAMES[0];

function scenes(beats: string[], totalSec: number, offset: number): Scene[] {
  const each = Math.round((totalSec * 1000) / beats.length);
  return beats.map((beat, index) => ({ index, beat, durationMs: each, blurhash: frame(index + offset) }));
}

/** Run records keyed by node id; `set` takes a node id or a stage id. Unlisted nodes stay absent (not started). */
function runs(
  sceneCount: number,
  at: string,
  set: Record<string, JobStatus | [JobStatus, Partial<StageRun>]>,
): Record<string, StageRun> {
  const out: Record<string, StageRun> = {};
  for (const n of expand(STORY_STAGES, sceneCount)) {
    const v = set[n.id] ?? set[n.stage];
    if (v === undefined) continue;
    const [status, extra] = Array.isArray(v) ? v : [v, {}];
    out[n.id] = { nodeId: n.id, status, generation: 1, attempt: 1, maxAttempts: 3, leaseLosses: 0, maxLeaseLosses: 2, updatedAt: at, ...extra };
  }
  return out;
}

const budget = (limitCents: number) => ({ limitCents, approvalThresholdCents: 1500, warnFraction: 0.8 });

const lighthouse: Project = {
  id: "p142",
  code: "FST-0142",
  kind: "story",
  title: "The Lighthouse Keeper's Cat",
  createdAt: "2026-11-02T18:20:00Z",
  aspect: "9:16",
  durationSec: 60,
  style: "16mm, tungsten interiors",
  voice: "Mara — low, dry",
  scenes: scenes(
    [
      "Wide: lighthouse at dusk, beam not yet lit",
      "Close: cat on the logbook, ink still wet",
      "Keeper climbs the spiral stair, lamp swinging",
      "POV through the lens: a ship with no lights",
      "Cat knocks the oil can — the beam stutters",
      "Dawn: the ship is gone, a gull on the rail",
    ],
    60,
    0,
  ),
  runs: runs(6, "2026-11-03T08:41:12Z", {
    concept: "completed",
    script: "completed",
    characters: "completed",
    keyframe: "completed",
    "scene_video:0": "awaiting_review",
    "scene_video:1": "awaiting_review",
    "scene_video:2": "completed",
    "scene_video:3": "running",
    "scene_video:4": ["failed", { error: "provider timed out after 300 s (no charge reported)" }],
    "scene_video:5": "awaiting_provider",
    narration: "completed",
    music: "completed",
  }),
  ledger: [
    { estimatedCents: 30, reportedCents: 27 },
    { estimatedCents: 36, reportedCents: 36 },
    { estimatedCents: 700, reportedCents: 688 },
    { estimatedCents: 350 },
    { estimatedCents: 120, reportedCents: 114 },
  ],
  budget: budget(3000),
};

const nightMarket: Project = {
  id: "p139",
  code: "FST-0139",
  kind: "story",
  title: "Night Market, Last Train",
  createdAt: "2026-10-30T21:05:00Z",
  aspect: "9:16",
  durationSec: 45,
  style: "Neon wet streets, anamorphic flare",
  voice: "Ilya — warm",
  scenes: scenes(
    [
      "Steam from a noodle stall, signage flickers",
      "Girl counts coins under a paper lantern",
      "Train doors close on her reflection",
      "Rear window: the market shrinks to one light",
      "Coin on the seat beside her, still warm",
    ],
    45,
    3,
  ),
  runs: runs(5, "2026-11-01T10:02:44Z", {
    concept: "completed",
    script: "completed",
    characters: "completed",
    keyframe: "completed",
    scene_video: "completed",
    narration: "completed",
    music: "completed",
    assembly: "completed",
    media_qa: "completed",
    metadata: "completed",
    review: "awaiting_review",
  }),
  ledger: [{ estimatedCents: 1650, reportedCents: 1592 }],
  budget: budget(2500),
};

const paperBoats: Project = {
  id: "p137",
  code: "FST-0137",
  kind: "story",
  title: "Paper Boats",
  createdAt: "2026-10-24T09:00:00Z",
  aspect: "9:16",
  durationSec: 30,
  style: "Overcast, macro, shallow focus",
  voice: "Mara — low, dry",
  scenes: scenes(
    ["Gutter stream after rain", "A boat folded from a bus ticket", "It snags on a drain grate", "A child's hand frees it"],
    30,
    2,
  ),
  runs: runs(4, "2026-10-25T14:30:00Z", {
    concept: "completed", script: "completed", characters: "completed", keyframe: "completed",
    scene_video: "completed", narration: "completed", music: "completed", assembly: "completed",
    media_qa: "completed", metadata: "completed", review: "completed", publish: "completed",
  }),
  ledger: [{ estimatedCents: 1100, reportedCents: 1043 }],
  budget: budget(2000),
};

const saltStatic: Project = {
  id: "p144",
  code: "FST-0144",
  kind: "story",
  title: "Salt & Static",
  createdAt: "2026-11-03T07:58:00Z",
  aspect: "1:1",
  durationSec: 40,
  style: "VHS, coastal radio station",
  voice: "Ilya — warm",
  scenes: scenes(["Antenna in the wind", "Night DJ alone", "A caller who isn't there", "Morning: tape still running"], 40, 5),
  runs: runs(4, "2026-11-03T07:58:30Z", { concept: "queued" }),
  ledger: [],
  budget: budget(2000),
};

const orchard: Project = {
  id: "p131",
  code: "FST-0131",
  kind: "story",
  title: "Hollow Orchard",
  createdAt: "2026-10-19T16:40:00Z",
  aspect: "9:16",
  durationSec: 60,
  style: "Folk horror, overcast",
  voice: "Mara — low, dry",
  scenes: scenes(["Rows of bare trees", "A ladder left standing", "One apple, still red"], 60, 6),
  runs: runs(3, "2026-10-19T17:02:10Z", {
    concept: "completed",
    script: ["failed", { attempt: 3, error: "originality check: too close to FST-0098 (story log)" }],
  }),
  ledger: [{ estimatedCents: 30, reportedCents: 31 }, { estimatedCents: 12, reportedCents: 12 }],
  budget: budget(2500),
};

const ferry: Project = {
  id: "p128",
  code: "FST-0128",
  kind: "story",
  title: "Ferry to Nowhere",
  createdAt: "2026-10-12T12:00:00Z",
  aspect: "16:9",
  durationSec: 90,
  style: "Kodachrome, harsh noon",
  voice: "Ilya — warm",
  scenes: scenes(["Ticket booth", "Gangway", "Open water", "No far shore"], 90, 1),
  runs: runs(4, "2026-10-12T12:20:00Z", { concept: "completed", script: "cancelled" }),
  ledger: [{ estimatedCents: 30, reportedCents: 29 }],
  budget: budget(3000),
};

const fog: Project = {
  id: "p140",
  code: "FST-0140",
  kind: "story",
  title: "Fog Signal",
  createdAt: "2026-11-01T06:10:00Z",
  aspect: "9:16",
  durationSec: 30,
  style: "Grey-on-grey, long lens",
  voice: "Mara — low, dry",
  scenes: scenes(["Horn on the breakwater", "Fisherman counts the blasts", "Silence"], 30, 7),
  runs: runs(3, "2026-11-03T08:50:00Z", {
    concept: "completed", script: "completed", characters: "completed",
    "keyframe:0": "completed", "keyframe:1": "running", "keyframe:2": "queued",
    narration: "awaiting_provider", music: "completed",
  }),
  ledger: [{ estimatedCents: 66, reportedCents: 61 }, { estimatedCents: 18 }],
  budget: budget(1500),
};

const providers: ProviderConnection[] = [
  {
    connected: true,
    health: "unchecked",
    manifest: {
      id: "elevenlabs", name: "ElevenLabs", capabilities: ["audio.tts"], models: [], auth: "api_key",
      lifecycle: "sync", cancellation: false, docsUrl: "https://elevenlabs.io/docs", verification: "mocked",
    },
  },
  {
    connected: false,
    health: "unchecked",
    manifest: {
      id: "openai", name: "OpenAI", capabilities: ["llm.text", "image.generate"], models: [], auth: "api_key",
      lifecycle: "sync", cancellation: false, docsUrl: "https://platform.openai.com/docs", verification: "planned",
    },
  },
  {
    connected: false,
    health: "unchecked",
    manifest: {
      id: "runway", name: "Runway", capabilities: ["video.image_to_video", "video.text_to_video"], models: [],
      auth: "api_key", lifecycle: "poll", cancellation: true, docsUrl: "https://docs.dev.runwayml.com", verification: "planned",
    },
  },
  {
    connected: false,
    health: "unchecked",
    manifest: {
      id: "fal", name: "fal.ai", capabilities: ["image.generate", "video.image_to_video"], models: [],
      auth: "api_key", lifecycle: "poll_or_webhook", cancellation: true, docsUrl: "https://docs.fal.ai", verification: "planned",
    },
  },
  {
    connected: false,
    health: "unchecked",
    manifest: {
      id: "youtube", name: "YouTube", capabilities: ["publish.youtube"], models: [], auth: "oauth2",
      lifecycle: "sync", cancellation: false, docsUrl: "https://developers.google.com/youtube/v3", verification: "planned",
    },
  },
];

const settings: Settings = {
  export: { aspect: "9:16", resolution: "1080p", burnCaptions: true, watermark: false },
  spending: { monthlyLimitCents: 10_000, approvalThresholdCents: 1500, warnFraction: 0.8 },
  notifications: { reviewReady: true, failed: true, budgetWarn: true },
  privacy: { analytics: false, keepSourceMedia: false },
  storage: { cacheBytes: 412_000_000, offlineProxies: false },
};

export function initialState(): StudioState {
  return {
    source: "fixture",
    projects: [saltStatic, lighthouse, fog, nightMarket, paperBoats, orchard, ferry],
    providers,
    settings,
  };
}

/** "Today" for fixture-derived figures (spend this month), kept fixed so screenshots are stable. */
export const FIXTURE_NOW = new Date("2026-11-03T09:00:00Z");
