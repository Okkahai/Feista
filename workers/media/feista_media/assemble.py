"""Story Studio assembly. Port of the proven Shorts pipeline's `workflow/tools/build_short.py`.

Same config.json schema, same filter graph, captions and mix levels; the differences are
operational: no chdir, inputs are never written to (all intermediates go to `work_dir`),
word timings are injectable, and ffmpeg errors carry stderr.

config.json: {"cuts":[["S1",in,dur],...], "script":{"1":"line",...},
  "vo_offset":{"1":sec_into_its_shot}, "vo_shot":{"1":shot_index_0based},
  "music":"music.mp3", "silence":[shot_index, sec_into_shot, dur], "upscale_sharpen": bool}
Inputs: clips/S*.mp4, vo/L*.mp3, music file; optional vo/words.json.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .ff import run

Word = tuple[str, float, float]  # (text, start, end) relative to the line's audio
Transcriber = Callable[[Path], list[Word]]

CAPTION_STYLE = (
    "Style: Cap,Luckiest Guy,120,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,2,0,1,7,3,2,60,60,560,1"
)


@dataclass(frozen=True)
class Plan:
    cuts: list[tuple[str, float, float]]
    starts: list[float]
    total: float
    script: dict[int, str]
    vo_at: dict[int, float]
    silence: tuple[int, float, float]
    music: str
    upscale_sharpen: bool


def load_plan(cfg: dict[str, Any]) -> Plan:
    cuts = [(str(c[0]), float(c[1]), float(c[2])) for c in cfg["cuts"]]
    if not cuts:
        raise ValueError("config has no cuts")
    for name, ss, d in cuts:
        if not re.fullmatch(r"[A-Za-z0-9_-]+", name) or ss < 0 or d <= 0:
            raise ValueError(f"bad cut {name!r} {ss} {d}")
    starts: list[float] = []
    t = 0.0
    for c in cuts:
        starts.append(t)
        t += c[2]
    script = {int(k): str(v) for k, v in cfg["script"].items()}
    vo_at: dict[int, float] = {}
    for i in script:
        shot = int(cfg["vo_shot"][str(i)])
        if not 0 <= shot < len(cuts):
            raise ValueError(f"line {i}: vo_shot {shot} out of range")
        vo_at[i] = starts[shot] + float(cfg["vo_offset"][str(i)])
    for i in script:
        if float(cfg["vo_offset"][str(i)]) < 0:
            raise ValueError(f"line {i}: negative vo_offset")
    if t < 2:
        raise ValueError("total duration under 2 s")
    sil = cfg.get("silence", [0, 0, 0])
    silence = (int(sil[0]), float(sil[1]), float(sil[2]))
    if not 0 <= silence[0] < len(cuts) or silence[1] < 0 or silence[2] < 0:
        raise ValueError(f"bad silence {sil}")
    music = str(cfg.get("music", "music.mp3"))
    # a bare file name inside the episode dir: no paths, no ffmpeg protocol prefixes
    if not re.fullmatch(r"[A-Za-z0-9_-][A-Za-z0-9_.-]*", music):
        raise ValueError(f"bad music file name {music!r}")
    return Plan(cuts, starts, t, script, vo_at, silence, music, bool(cfg.get("upscale_sharpen")))


def _ts(x: float) -> str:
    h = int(x // 3600)
    m = int(x % 3600 // 60)
    s = x % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def caption_ass(plan: Plan, words: dict[str, list[Word]]) -> str:
    """Two-word burned captions, current word yellow, pop-in on each chunk's first word."""
    ass = ["[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "", "[V4+ Styles]",
           ("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, "
            "Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, "
            "MarginL, MarginR, MarginV, Encoding"),
           CAPTION_STYLE, "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    for i in sorted(plan.script):
        mine = plan.script[i].split()
        w = words[str(i)]
        if not w:
            raise ValueError(f"line {i}: no word timings")
        # align timings from the end (whisper may add/merge words at the start)
        tim = [(x[1], x[2]) for x in w]
        if len(tim) >= len(mine):
            tim = tim[len(tim) - len(mine):]
        else:
            tim = [tim[0]] * (len(mine) - len(tim)) + tim
        base = plan.vo_at[i]
        chunks = [mine[k:k + 2] for k in range(0, len(mine), 2)]
        idx = 0
        for ch in chunks:
            for j, _ in enumerate(ch):
                st = base + tim[idx + j][0]
                en = base + (tim[idx + j + 1][0] if idx + j + 1 < len(tim) else tim[idx + j][1] + 0.35)
                txt = " ".join(("{\\c&H00D7FF&}" + x.upper() + "{\\c&HFFFFFF&}") if k == j else x.upper()
                               for k, x in enumerate(ch))
                pop = "{\\fscx112\\fscy112\\t(0,90,\\fscx100\\fscy100)}" if j == 0 else ""
                ass.append(f"Dialogue: 0,{_ts(st)},{_ts(en)},Cap,,0,0,0,,{pop}{txt}")
            idx += len(ch)
    return "\n".join(ass) + "\n"


def whisper_transcriber(model: str = "base.en") -> Transcriber:
    from faster_whisper import WhisperModel  # optional dependency

    m = WhisperModel(model, compute_type="int8")

    def t(p: Path) -> list[Word]:
        segs, _ = m.transcribe(str(p), word_timestamps=True)
        return [(w.word.strip(), w.start, w.end) for s in segs for w in (s.words or [])]

    return t


def mix_graph(plan: Plan) -> list[str]:
    """Audio graph up to [premix] plus the video chain. Levels are the tuned production values."""
    total = plan.total
    sh, off, dd = plan.silence
    drop_s = plan.starts[sh] + off
    drop_e = drop_s + dd  # comic music drop-out
    f: list[str] = []
    labels = []
    lines = sorted(plan.script)
    for n, i in enumerate(lines):
        ms = int(plan.vo_at[i] * 1000)
        f.append(f"[{n + 2}:a]aresample=48000,aformat=channel_layouts=stereo,volume=2.2,adelay={ms}|{ms}[v{i}]")
        labels.append(f"[v{i}]")
    if lines:
        f.append("".join(labels) + f"amix=inputs={len(lines)}:normalize=0,apad,atrim=0:{total}[vo]")
    else:  # wordless formats: a silent voice bus keeps the ducking and mix graph unchanged
        f.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{total}[vo]")
    f.append("[vo]asplit=2[vomix][vokey]")
    f.append(f"[1:a]aresample=48000,atrim=0:{total},volume=0.30,volume=enable='between(t,{drop_s},{drop_e})':volume=0,"
             f"afade=t=out:st={total - 1.2}:d=1.2[mu]")
    f.append("[mu][vokey]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[mud]")
    f.append("[0:a]volume=0.8,apad,atrim=0:" + str(total) + "[sfx]")
    f.append("[sfx][mud][vomix]amix=inputs=3:normalize=0[premix]")
    return f


def build_short(episode_dir: Path, work_dir: Path, out_file: Path,
                transcribe: Transcriber | None = None) -> Plan:
    ep = Path(episode_dir).resolve()  # absolute, so no input can be read as an ffmpeg protocol
    work = Path(work_dir).resolve()
    out_file = Path(out_file).resolve()
    work.mkdir(parents=True, exist_ok=True)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    plan = load_plan(json.loads((ep / "config.json").read_text()))

    words_path = ep / "vo" / "words.json"
    # whisper result from an earlier attempt, reused only if the script text and every VO file are unchanged
    key = hashlib.sha256(json.dumps(plan.script, sort_keys=True).encode()
                         + b"".join(hashlib.sha256((ep / "vo" / f"L{i}.mp3").read_bytes()).digest()
                                    for i in sorted(plan.script))).hexdigest()
    cached = work / f"words-{key[:16]}.json"
    if words_path.exists():
        words = json.loads(words_path.read_text())
    elif cached.exists():
        words = json.loads(cached.read_text())
    else:
        tr = transcribe or whisper_transcriber()
        words = {str(i): tr(ep / "vo" / f"L{i}.mp3") for i in plan.script}
        cached.write_text(json.dumps(words))
    captions = work / "captions.ass"
    captions.write_text(caption_ass(plan, words))

    # 1) normalize clips (keep native audio)
    vf = ("scale=1080:1920:force_original_aspect_ratio=increase" + (":flags=lanczos" if plan.upscale_sharpen else "")
          + ",crop=1080:1920" + (",unsharp=5:5:0.6" if plan.upscale_sharpen else "") + ",fps=30,setsar=1,format=yuv420p")
    lst = []
    for n, (name, ss, d) in enumerate(plan.cuts):
        run(["-loglevel", "error", "-y", "-ss", str(ss), "-t", str(d), "-i", str(ep / "clips" / f"{name}.mp4"),
             "-vf", vf, "-af", "aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=0.05",
             "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", str(work / f"{n}.mp4")])
        lst.append(f"file '{n}.mp4'")
    (work / "list.txt").write_text("\n".join(lst) + "\n")
    video = work / "video.mp4"
    run(["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(work / "list.txt"), "-c", "copy", str(video)])

    # 2) audio: native sfx + music (ducked under voice, drops out at the gag) + voice
    inputs = ["-i", str(video), "-i", str(ep / plan.music)]
    for i in sorted(plan.script):
        inputs += ["-i", str(ep / "vo" / f"L{i}.mp3")]
    f = mix_graph(plan)
    # two-pass loudnorm: single-pass dynamic mode landed ~1 LU quiet (EP27/EP28), so measure then correct linearly.
    meas = run(["-loglevel", "info", "-y", *inputs, "-filter_complex",
                ";".join(f + ["[premix]loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json[a]"]),
                "-map", "[a]", "-f", "null", "-"])
    found = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", meas.stderr, re.DOTALL)
    if not found:
        raise RuntimeError("loudnorm measurement missing from ffmpeg output")
    mj = json.loads(found.group())
    loud2 = (f"[premix]loudnorm=I=-14:TP=-1.5:LRA=11:linear=true:measured_I={mj['input_i']}:"
             f"measured_TP={mj['input_tp']}:measured_LRA={mj['input_lra']}:measured_thresh={mj['input_thresh']}:"
             f"offset={mj['target_offset']},aresample=48000[a]")
    # run in work/ with a relative captions path, as the original did: no filtergraph escaping needed
    vchain = f"[0:v]ass=captions.ass,fade=t=out:st={plan.total - 0.4}:d=0.4[v]"
    run(["-loglevel", "error", "-y", *inputs, "-filter_complex", ";".join(f + [vchain, loud2]),
         "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "slow", "-b:v", "8000k", "-minrate", "7000k",
         "-maxrate", "9000k", "-bufsize", "12000k", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
         str(out_file)], cwd=work)
    return plan
