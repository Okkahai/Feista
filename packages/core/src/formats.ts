/**
 * Story format presets: what the concept and script stages write for each kind of animated Short.
 * Source: the format research of 2026-11-05 (16 animation formats; streamer clips are Clip Studio, not here).
 * A project picks one by id (`projects.config.format`) or sends a custom one built on a preset.
 */
export type VoiceMode = "narrator" | "dialogue" | "inner" | "none";
export type Range = readonly [number, number];

export interface FormatPreset {
  id: string;
  name: string;
  family: "story" | "explainer" | "dialogue" | "series" | "visual";
  /** narrator: one off-screen voice. dialogue: each character speaks in its own voice. inner: the hero's first-person voice. none: no speech. */
  voice: VoiceMode;
  cast: Range;
  seconds: Range;
  lines: Range;
  /** The beat order the script follows. */
  beats: readonly string[];
  /** Format-specific writing rules, including which retention techniques apply. */
  rules: string;
  style: string;
  /** Episodes of a series: end on a cliffhanger, keep the cast. */
  series?: boolean;
  /** Made for kids: gentle stakes, a clear lesson, no scares. */
  kids?: boolean;
}

export const FORMATS: readonly FormatPreset[] = [
  {
    id: "animal_story", name: "Animal stories", family: "story", voice: "narrator", cast: [1, 2], seconds: [20, 35], lines: [4, 6],
    beats: ["hook: shot 1 opens mid-action, something already going wrong", "want and visible cost of failing", "two or three escalating attempts", "a turn that flips the emotion", "payoff that solves the plot", "loop-back to the opening framing or object"],
    rules: "Animal characters, one location, a scene change every 3-6 s, reads without sound. Chain beats with therefore/but, never and-then. Witty third-person narrator who never addresses a character; leave gaps for the gags. Rotate story types (prank, rivalry, backfire, misunderstanding, heist, villain turns kind, race against time, physical comedy) and ending types (reversal, reveal, clever solution, comic backfire, discovery, loop gag). A rescue of an animal in distress must never be the premise.",
    style: "soft 3D animated film look, warm cinematic lighting",
  },
  {
    id: "kids_moral", name: "Kids moral story", family: "story", voice: "narrator", cast: [1, 3], seconds: [30, 60], lines: [5, 9], kids: true,
    beats: ["the hero and what they want", "a tempting wrong choice", "its consequence", "the hero realises and makes it right", "the lesson in one plain sentence"],
    rules: "For young children: gentle stakes, no peril, no scares, slow readable pacing, simple words, warm narrator. One clear lesson (sharing, honesty, patience, kindness) shown through action before it is said.",
    style: "bright rounded 3D cartoon, soft pastel colours",
  },
  {
    id: "horror_story", name: "Animated horror story", family: "story", voice: "inner", cast: [1, 3], seconds: [45, 90], lines: [8, 14],
    beats: ["an uncanny detail in the first shot", "a rule or warning", "signs that grow", "a ticking clock", "an open ending or a twist that recontextualises the opening"],
    rules: "First-person survivor voice, calm and specific. Dread over gore; no graphic violence. Re-hook at 15-20 s with a new wrong detail. Stress the countdown, not the monster.",
    style: "dark muted 2D illustration, heavy shadows, film grain",
  },
  {
    id: "history_pov", name: "Historical POV", family: "story", voice: "narrator", cast: [1, 2], seconds: [30, 60], lines: [6, 10],
    beats: ["\"POV: you wake up in <place, year>\"", "three sensory details of daily life", "a danger of the era", "how you survive it", "a surprising true fact to end"],
    rules: "Second-person narrator (you). Facts must be historically accurate and plausible for the era; no anachronisms. Period-correct clothes, buildings and tools in every image prompt.",
    style: "painterly cinematic realism, period-accurate detail",
  },
  {
    id: "myth_story", name: "Myth and scripture retelling", family: "story", voice: "narrator", cast: [1, 4], seconds: [30, 90], lines: [6, 12],
    beats: ["a recognisable moment, mid-action", "the stakes for the hero", "the dramatic retelling", "the supernatural climax", "the meaning in one sentence"],
    rules: "Respectful and faithful to the source; no mockery of beliefs. Epic, serious narrator. Name the source tradition in the concept.",
    style: "epic painterly 3D, golden light",
  },
  {
    id: "what_if", name: "\"What happens if\" 3D explainer", family: "explainer", voice: "narrator", cast: [0, 1], seconds: [30, 45], lines: [6, 9],
    beats: ["the question as a hook, shown not said", "setup", "zoom inside with extreme close-ups", "the twist", "the payoff", "a question back to the viewer"],
    rules: "Calm, factual narrator; every claim must be scientifically correct. Glossy 3D, extreme close-ups, a camera move per shot (pattern interrupt every 2-4 s). Big captions carry it without sound.",
    style: "glossy clean 3D render, macro close-ups, studio lighting",
  },
  {
    id: "whiteboard_explainer", name: "Stickman / whiteboard explainer", family: "explainer", voice: "narrator", cast: [0, 2], seconds: [30, 60], lines: [6, 10],
    beats: ["the problem", "a simple model", "three steps", "a concrete example", "a one-line summary"],
    rules: "Plain-language teacher voice; accurate facts; no financial, medical or legal advice. One idea per shot, drawn simply.",
    style: "black line stickman drawings on white, one accent colour",
  },
  {
    id: "story_narration", name: "Illustrated story narration", family: "explainer", voice: "narrator", cast: [1, 4], seconds: [45, 90], lines: [8, 14],
    beats: ["a title-card hook with the conflict", "what happened", "the conflict grows", "\"and then...\" turn", "comeuppance or update"],
    rules: "An original first-person-style story told by a narrator (never copied from a real post or person). Clear villain and payoff; open loop until the end.",
    style: "clean flat 2D illustration",
  },
  {
    id: "dialogue_sketch", name: "3D meme dialogue sketch", family: "dialogue", voice: "dialogue", cast: [2, 3], seconds: [20, 40], lines: [6, 14],
    beats: ["cold open: they are already arguing", "jabs trade back and forth", "escalation", "the punchline", "a reaction shot"],
    rules: "Short punchy lines, casual slang, each character with a distinct voice and attitude. Comedy from timing: a beat of silence before the punchline. No slurs, no punching down, no real people.",
    style: "stylised 3D meme animation, expressive faces, simple set",
  },
  {
    id: "talking_objects", name: "Talking objects and food", family: "dialogue", voice: "dialogue", cast: [2, 4], seconds: [20, 45], lines: [6, 12],
    beats: ["the objects meet", "a debate: who matters most", "a fact or a gag per object", "a surprise winner"],
    rules: "Everyday objects or foods with faces and personalities. Any fact must be true. Rule of three, then break it.",
    style: "Pixar-like 3D, glossy food and object characters with faces",
  },
  {
    id: "meme_animatic", name: "Meme animatic", family: "dialogue", voice: "dialogue", cast: [2, 3], seconds: [10, 30], lines: [2, 6],
    beats: ["a familiar situation", "the setup line", "the visual punchline"],
    rules: "Write original lines; never quote copyrighted songs, films or trending sounds. One joke, staged with exaggerated poses.",
    style: "loose 2D animatic, bold outlines",
  },
  {
    id: "micro_drama", name: "Fruit / pet micro-drama episode", family: "series", voice: "dialogue", cast: [2, 4], seconds: [60, 180], lines: [10, 24], series: true,
    beats: ["one-second recap of the last episode", "a new conflict", "a confession or betrayal", "a cliffhanger"],
    rules: "Soap-opera melodrama with fruit, food or pet characters. Same cast and looks every episode. End on an open question; each episode still makes sense alone.",
    style: "glossy 3D soap-opera lighting, fruit or pet characters",
  },
  {
    id: "action_series", name: "Recurring-cast action series", family: "series", voice: "none", cast: [2, 5], seconds: [30, 60], lines: [0, 0], series: true,
    beats: ["the familiar heroes", "a new threat", "the battle escalates", "a new power or a loss", "a cliffhanger"],
    rules: "Original characters only, never existing franchises or memes. Wordless; story told by action, sound effects and framing.",
    style: "cinematic 3D action, dynamic camera",
  },
  {
    id: "absurd_creature", name: "Absurd hybrid creature", family: "visual", voice: "narrator", cast: [1, 1], seconds: [10, 30], lines: [2, 4],
    beats: ["the creature's intro card", "its made-up name and sing-song rhyme", "an absurd action", "a repeat that loops"],
    rules: "An original animal-object hybrid with a made-up pseudo-foreign name. Silly, never hateful; no real places, people or existing brainrot characters.",
    style: "hyperreal 3D render, absurd hybrid creature",
  },
  {
    id: "asmr_loop", name: "Wordless satisfying loop", family: "visual", voice: "none", cast: [0, 1], seconds: [10, 30], lines: [0, 0],
    beats: ["a texture close-up", "one continuous satisfying action", "a clean finish", "the last frame matches the first"],
    rules: "No speech. Sound design carries it (crunch, pour, slice). A seamless loop: the last frame matches the first.",
    style: "macro photoreal 3D, shallow depth of field",
  },
  {
    id: "anime_story", name: "Anime-style story", family: "visual", voice: "inner", cast: [1, 3], seconds: [30, 60], lines: [5, 9],
    beats: ["an emotional opening frame", "inner voice", "the conflict", "a power-up or confession", "the final pose"],
    rules: "Original characters only. Inner first-person voice, emotional and short. Strong silhouettes and speed lines.",
    style: "2D anime style, cel shading, dramatic lighting",
  },
];

const byId = new Map(FORMATS.map((f) => [f.id, f]));
export const DEFAULT_FORMAT = "animal_story";

const text = (v: unknown, max: number, what: string) => {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new Error(`format ${what} must be 1-${max} chars`);
  return v.trim();
};
const range = (v: unknown, lo: number, hi: number, what: string): Range => {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isInteger) || v[0] < lo || v[1] > hi || v[0] > v[1]) throw new Error(`format ${what} must be [min, max] within ${lo}-${hi}`);
  return [v[0], v[1]];
};

/**
 * The project's format: a preset id, or a custom `{ base, ...overrides }` object. Absent = the animal-story preset.
 * Custom fields are user text that ends up in a prompt, so each is length-capped and type-checked here.
 */
export function resolveFormat(raw: unknown): FormatPreset {
  if (raw === undefined || raw === null) return byId.get(DEFAULT_FORMAT)!;
  if (typeof raw === "string") {
    const f = byId.get(raw);
    if (!f) throw new Error(`unknown format "${raw.slice(0, 40)}"`);
    return f;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("format must be a preset id or a custom object");
  const o = raw as Record<string, unknown>;
  const base = resolveFormat(o.base ?? DEFAULT_FORMAT);
  const voice = o.voice ?? base.voice;
  if (!["narrator", "dialogue", "inner", "none"].includes(voice as string)) throw new Error("format voice must be narrator, dialogue, inner or none");
  const out: FormatPreset = {
    ...base,
    id: "custom",
    name: o.name === undefined ? `${base.name} (custom)` : text(o.name, 60, "name"),
    voice: voice as VoiceMode,
    cast: o.cast === undefined ? base.cast : range(o.cast, 0, 5, "cast"),
    seconds: o.seconds === undefined ? base.seconds : range(o.seconds, 10, 180, "seconds"),
    lines: o.lines !== undefined ? range(o.lines, 0, 30, "lines") : voice === "none" ? [0, 0] : base.voice === "none" ? [1, 8] : base.lines,
    beats: o.beats === undefined ? base.beats : (Array.isArray(o.beats) && o.beats.length >= 2 && o.beats.length <= 10 ? o.beats.map((b, i) => text(b, 200, `beat ${i + 1}`)) : (() => { throw new Error("format beats must be 2-10 items"); })()),
    rules: o.rules === undefined ? base.rules : text(o.rules, 2000, "rules"),
    style: o.style === undefined ? base.style : text(o.style, 300, "style"),
  };
  if (out.voice === "none" ? out.lines[1] !== 0 : out.lines[0] < 1) throw new Error("format lines must be [0, 0] without speech and at least 1 with it");
  if (out.voice === "dialogue" && out.cast[0] < 2) throw new Error("a dialogue format needs at least 2 characters");
  return out;
}
