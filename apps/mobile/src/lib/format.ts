import { fps as defaultFps } from "../theme/tokens";

/** HH:MM:SS:FF (non-drop-frame). Negative input clamps to zero. */
export function toTimecode(ms: number, fps: number = defaultFps): string {
  const totalFrames = Math.max(0, Math.round((ms / 1000) * fps));
  const ff = totalFrames % fps;
  const totalSec = Math.floor(totalFrames / fps);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(totalSec / 3600))}:${p(Math.floor(totalSec / 60) % 60)}:${p(totalSec % 60)}:${p(ff)}`;
}

// Hoisted per vercel rule js-hoist-intl.
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatCents = (cents: number) => usd.format(cents / 100);

const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
export const formatDay = (iso: string) => day.format(new Date(iso)).toUpperCase();

/** "scene_video:2" -> "SCENE VIDEO · SC03" */
export function nodeLabel(nodeId: string): string {
  const [stage = nodeId, scene] = nodeId.split(":");
  const name = stage.replace(/_/g, " ").toUpperCase();
  return scene === undefined ? name : `${name} · SC${String(Number(scene) + 1).padStart(2, "0")}`;
}
