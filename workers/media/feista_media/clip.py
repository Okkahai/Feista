"""Clip Studio: transcribe a creator's own (or licensed) stream recording and render 9:16 highlight clips.

Layout: the 16:9 frame fitted to the width over a blurred, cropped copy of itself (keeps facecam and
gameplay both in view). shortcut: no face tracking yet; add a MediaPipe-driven crop mode (ADR 8) when a
creator wants full-height single-subject clips.
"""
import json
import re
import subprocess
from pathlib import Path

from .assemble import CAPTION_STYLE, Transcriber, Word, _ts
from .ff import FFPROBE, run


def duration(src: Path) -> float:
    p = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration:stream=codec_type,duration", "-of", "json", str(src)],
                       check=False, capture_output=True, text=True)
    if p.returncode != 0:
        raise ValueError(f"not a readable video: {p.stderr[-300:]}")
    info = json.loads(p.stdout)
    kinds = {s.get("codec_type") for s in info.get("streams", [])}
    if not {"video", "audio"} <= kinds:
        raise ValueError("source needs both a video and an audio stream")
    # the shortest stream: a clip cut to the longest one would lose its video tail and fade-out
    lens = [float(x["duration"]) for x in info.get("streams", []) if x.get("codec_type") in ("video", "audio") and x.get("duration")]
    return min(lens) if lens else float(info["format"]["duration"])


def transcribe(src: Path, out: Path, tr: Transcriber) -> dict[str, object]:
    """Word timings for the whole recording: {"duration": s, "words": [[word, start, end], ...]}."""
    d = duration(src)
    words = [[w[0], round(float(w[1]), 3), round(float(w[2]), 3)] for w in tr(src) if str(w[0]).strip()]
    result: dict[str, object] = {"duration": d, "words": words}
    out.write_text(json.dumps(result))
    return result


def captions(words: list[Word], start: float, end: float) -> str:
    """Two-word captions over the clip, current word yellow (same look as Story Studio)."""
    ass = ["[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "", "[V4+ Styles]",
           ("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, "
            "Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, "
            "MarginL, MarginR, MarginV, Encoding"),
           CAPTION_STYLE, "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    mine = [(re.sub(r"[{}\\\r\n]", " ", str(w[0])).strip(), float(w[1]) - start, float(w[2]) - start)
            for w in words if start <= float(w[1]) < end]
    mine = [w for w in mine if w[0]]
    for k in range(0, len(mine), 2):
        ch = mine[k:k + 2]
        for j, (_, st, en) in enumerate(ch):
            nxt = mine[k + j + 1][1] if k + j + 1 < len(mine) else en + 0.35
            txt = " ".join(("{\\c&H00D7FF&}" + x.upper() + "{\\c&HFFFFFF&}") if i == j else x.upper()
                           for i, (x, _, _) in enumerate(ch))
            pop = "{\\fscx112\\fscy112\\t(0,90,\\fscx100\\fscy100)}" if j == 0 else ""
            ass.append(f"Dialogue: 0,{_ts(max(st, 0))},{_ts(min(max(nxt, st + 0.1), end - start))},Cap,,0,0,0,,{pop}{txt}")
    return "\n".join(ass) + "\n"


def render(src: Path, start: float, end: float, words: list[Word], work: Path, out: Path) -> float:
    """Cut [start, end) of the source into a 1080x1920 clip with burned captions at -14 LUFS."""
    src, work, out = src.resolve(), work.resolve(), out.resolve()  # absolute: no input is read as an ffmpeg protocol
    total = duration(src)
    if not (0 <= start < end <= total + 0.05) or not 15 <= end - start <= 60:
        raise ValueError(f"clip {start}-{end}s must be 15-60 s inside the {total:.1f} s source")
    work.mkdir(parents=True, exist_ok=True)
    out.parent.mkdir(parents=True, exist_ok=True)
    (work / "captions.ass").write_text(captions(words, start, end))
    d = end - start
    cut = ["-ss", f"{start:.3f}", "-t", f"{d:.3f}", "-i", str(src)]
    video = ("[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:4[bg];"
             "[b]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30,setsar=1,ass=captions.ass,"
             f"fade=t=in:d=0.15,fade=t=out:st={d - 0.3:.3f}:d=0.3,format=yuv420p[v]")
    pre = "[0:a]aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=0.1"
    meas = run(["-loglevel", "info", "-y", *cut, "-filter_complex", f"{pre},loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json[a]",
                "-map", "[a]", "-f", "null", "-"])
    found = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", meas.stderr, re.DOTALL)
    if not found:
        raise RuntimeError("loudnorm measurement missing from ffmpeg output")
    m = json.loads(found.group())
    audio = (f"{pre},loudnorm=I=-14:TP=-1.5:LRA=11:linear=true:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
             f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']},aresample=48000[a]")
    run(["-loglevel", "error", "-y", *cut, "-filter_complex", f"{video};{audio}", "-map", "[v]", "-map", "[a]",
         "-c:v", "libx264", "-preset", "medium", "-b:v", "8000k", "-minrate", "7000k", "-maxrate", "9000k",
         "-bufsize", "12000k", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)], cwd=work)
    return d
