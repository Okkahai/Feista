"""Objective media QA for delivered Shorts. Creative quality is NOT judged here."""
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .ff import FFPROBE, run


@dataclass(frozen=True)
class Spec:
    width: int = 1080
    height: int = 1920
    fps: float = 30.0
    min_duration: float = 15.0
    max_duration: float = 60.0
    min_video_kbps: int = 7000
    target_lufs: float = -14.0
    lufs_tolerance: float = 1.0
    max_true_peak: float = -1.0
    max_silence_s: float = 1.5  # longer than the comic drop-out
    max_freeze_s: float = 1.0
    max_black_s: float = 0.5  # end fade is 0.4 s


@dataclass
class Report:
    width: int
    height: int
    fps: float
    duration: float
    video_kbps: int
    video_codec: str
    audio_codec: str | None
    lufs: float | None
    true_peak: float | None
    silences: list[tuple[float, float]] = field(default_factory=list)
    freezes: list[tuple[float, float]] = field(default_factory=list)
    blacks: list[tuple[float, float]] = field(default_factory=list)

    def to_json(self) -> str:
        return json.dumps(asdict(self))


def _intervals(text: str, start_key: str, end_key: str) -> list[tuple[float, float]]:
    starts = [float(x) for x in re.findall(start_key + r":\s*(-?[\d.]+)", text)]
    ends = [float(x) for x in re.findall(end_key + r":\s*(-?[\d.]+)", text)]
    return [(s, ends[i] if i < len(ends) else float("inf")) for i, s in enumerate(starts)]


def probe(path: Path) -> Report:
    p = subprocess.run([FFPROBE, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
                       capture_output=True, text=True, check=True)
    info = json.loads(p.stdout)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    if v is None:
        raise ValueError(f"{path}: no video stream")
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    num, den = (int(x) for x in v["avg_frame_rate"].split("/"))
    duration = float(info["format"]["duration"])
    vbit = int(v.get("bit_rate") or 0) // 1000
    # one decode pass for all detectors
    af = "ebur128=peak=true,silencedetect=noise=-50dB:d=0.5" if a else None
    args = ["-v", "info", "-i", str(path), "-vf", "freezedetect=n=0.003:d=0.5,blackdetect=d=0.2:pix_th=0.10"]
    if af:
        args += ["-af", af]
    args += ["-f", "null", "-"]
    err = run(args).stderr
    lufs = tp = None
    summary = err[err.rfind("Summary:"):] if "Summary:" in err else ""
    if m := re.search(r"I:\s*(-?[\d.]+) LUFS", summary):
        lufs = float(m.group(1))
    if m := re.search(r"Peak:\s*(-?[\d.]+|-inf) dBFS", summary):
        tp = float(m.group(1)) if m.group(1) != "-inf" else float("-inf")
    return Report(
        width=int(v["width"]), height=int(v["height"]), fps=num / den if den else 0.0, duration=duration,
        video_kbps=vbit, video_codec=v["codec_name"], audio_codec=a["codec_name"] if a else None,
        lufs=lufs, true_peak=tp,
        silences=_intervals(err, "silence_start", "silence_end"),
        freezes=_intervals(err, "freeze_start", "freeze_end"),
        blacks=[(float(s), float(e)) for s, e in re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", err)],
    )


DEFAULT_SPEC = Spec()


def check(r: Report, spec: Spec = DEFAULT_SPEC) -> list[str]:
    """Return human-readable failures; empty list = passes the delivery spec."""
    fails: list[str] = []
    if (r.width, r.height) != (spec.width, spec.height):
        fails.append(f"resolution {r.width}x{r.height}, want {spec.width}x{spec.height}")
    if abs(r.fps - spec.fps) > 0.01:
        fails.append(f"frame rate {r.fps:.2f}, want {spec.fps}")
    if not spec.min_duration <= r.duration <= spec.max_duration:
        fails.append(f"duration {r.duration:.1f}s outside {spec.min_duration}-{spec.max_duration}s")
    if r.video_kbps < spec.min_video_kbps:
        fails.append(f"video bitrate {r.video_kbps} kbps < {spec.min_video_kbps}")
    if r.video_codec != "h264":
        fails.append(f"video codec {r.video_codec}, want h264")
    if r.audio_codec is None:
        fails.append("no audio stream")
    elif r.lufs is None or abs(r.lufs - spec.target_lufs) > spec.lufs_tolerance:
        fails.append(f"loudness {r.lufs} LUFS, want {spec.target_lufs}±{spec.lufs_tolerance}")
    if r.true_peak is not None and r.true_peak > spec.max_true_peak:
        fails.append(f"true peak {r.true_peak} dBFS > {spec.max_true_peak}")
    for s, e in r.silences:
        if min(e, r.duration) - s > spec.max_silence_s:
            fails.append(f"silence {s:.2f}-{min(e, r.duration):.2f}s")
    for s, e in r.freezes:
        if min(e, r.duration) - s > spec.max_freeze_s:
            fails.append(f"frozen video {s:.2f}-{min(e, r.duration):.2f}s")
    for s, e in r.blacks:
        if e - s > spec.max_black_s:
            fails.append(f"black frames {s:.2f}-{e:.2f}s")
    return fails
