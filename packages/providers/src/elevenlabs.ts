/**
 * ElevenLabs narration with character timings (docs checked 2026-11-03, docs/PROVIDER_INTEGRATIONS.md §3).
 * POST /v1/text-to-speech/{voice_id}/with-timestamps → audio_base64 + alignment. Synchronous.
 * VERIFICATION: mocked. Contract-tested against the documented response shape; never called live.
 */
import type { ProviderAdapter } from "@feista/core";
import { type Fetch, httpError } from "./http";

export type Word = [text: string, start: number, end: number];

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** Character timings → word timings in the media worker's words.json format. */
export function wordsFromAlignment(a: Alignment): Word[] {
  const n = a.characters.length;
  if (a.character_start_times_seconds.length !== n || a.character_end_times_seconds.length !== n) throw new Error("alignment arrays differ in length");
  const words: Word[] = [];
  let cur: Word | undefined;
  for (let i = 0; i < n; i++) {
    const ch = a.characters[i]!;
    if (/\s/.test(ch)) {
      cur = undefined;
      continue;
    }
    if (!cur) words.push((cur = [ch, a.character_start_times_seconds[i]!, a.character_end_times_seconds[i]!]));
    else {
      cur[0] += ch;
      cur[2] = a.character_end_times_seconds[i]!;
    }
  }
  return words;
}

const VOICE = /^[A-Za-z0-9-]{1,64}$/;

/**
 * `centsPer1kChars` is the user's own plan rate: ElevenLabs bills per character against a subscription,
 * so there is no single list price. Without it there is no estimate, and the runner will not spend.
 */
export function elevenLabsAdapter(opts: { centsPer1kChars?: number } = {}, fetchImpl: Fetch = fetch): ProviderAdapter {
  return {
    manifest: {
      id: "elevenlabs",
      name: "ElevenLabs",
      capabilities: ["audio.tts"],
      models: [{ id: "eleven_multilingual_v2", capability: "audio.tts", label: "Multilingual v2" }],
      auth: "api_key",
      lifecycle: "sync",
      cancellation: false,
      docsUrl: "https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps",
      verification: "mocked",
    },

    estimateCents(req) {
      const text = req.input.text;
      if (opts.centsPer1kChars === undefined || typeof text !== "string") return undefined;
      return Math.ceil((text.length / 1000) * opts.centsPer1kChars);
    },

    async submit(req, ctx) {
      const { text, voice_id } = req.input as { text?: unknown; voice_id?: unknown };
      if (typeof text !== "string" || !text.trim() || text.length > 10_000) return { state: "error", retryable: false, message: "elevenlabs: text must be 1..10000 chars" };
      if (typeof voice_id !== "string" || !VOICE.test(voice_id)) return { state: "error", retryable: false, message: "elevenlabs: invalid voice_id" };
      const res = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/with-timestamps`, {
        method: "POST",
        headers: { "xi-api-key": ctx.credential, "content-type": "application/json" },
        body: JSON.stringify({ text, model_id: req.modelId }),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      });
      if (!res.ok) return httpError(res, "elevenlabs");
      const body = (await res.json()) as { audio_base64?: string; alignment?: Alignment };
      if (!body.audio_base64 || !body.alignment) return { state: "error", retryable: true, message: "elevenlabs: response missing audio or alignment" };
      const words = wordsFromAlignment(body.alignment);
      return {
        state: "done",
        outputs: [
          { url: `data:audio/mpeg;base64,${body.audio_base64}`, mime: "audio/mpeg" },
          { url: `data:application/json;base64,${Buffer.from(JSON.stringify(words)).toString("base64")}`, mime: "application/json" },
        ],
      };
    },
  };
}
