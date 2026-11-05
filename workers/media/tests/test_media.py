"""Real FFmpeg runs on synthetic media. No providers, no network."""
import json
import subprocess
from pathlib import Path

import pytest

from feista_media.assemble import build_short, caption_ass, load_plan
from feista_media.clip import captions, render, transcribe
from feista_media.qa import Spec, check, probe

CFG = {
    "cuts": [["S1", 0.0, 5.0], ["S2", 0.5, 4.5], ["S3", 0.0, 5.0], ["S4", 0.0, 5.5]],
    "script": {"1": "Something fell.", "2": "It did not stop.", "3": "Then it bounced back."},
    "vo_shot": {"1": 0, "2": 1, "3": 3},
    "vo_offset": {"1": 0.3, "2": 0.4, "3": 0.5},
    "music": "music.mp3",
    "silence": [2, 1.0, 0.8],
}
WORDS = {
    "1": [["Something", 0.0, 0.5], ["fell.", 0.5, 0.9]],
    "2": [["It", 0.0, 0.2], ["did", 0.2, 0.4], ["not", 0.4, 0.6], ["stop.", 0.6, 1.0]],
    "3": [["Then", 0.0, 0.3], ["it", 0.3, 0.4], ["bounced", 0.4, 0.8], ["back.", 0.8, 1.2]],
}


def ff(*args: str) -> None:
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args], check=True)


@pytest.fixture(scope="module")
def episode(tmp_path_factory: pytest.TempPathFactory) -> Path:
    ep = tmp_path_factory.mktemp("ep")
    (ep / "clips").mkdir()
    (ep / "vo").mkdir()
    for n in range(1, 5):  # 720p model-like clips with native SFX
        ff("-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=24:duration=6",
           "-f", "lavfi", "-i", f"sine=frequency={300 + n * 50}:duration=6",
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(ep / "clips" / f"S{n}.mp4"))
    for i in range(1, 4):
        ff("-f", "lavfi", "-i", f"sine=frequency={500 + i * 100}:duration=1.3", str(ep / "vo" / f"L{i}.mp3"))
    ff("-f", "lavfi", "-i", "sine=frequency=220:duration=30", str(ep / "music.mp3"))
    (ep / "config.json").write_text(json.dumps(CFG))
    (ep / "vo" / "words.json").write_text(json.dumps(WORDS))
    return ep


def test_assembly_meets_delivery_spec(episode: Path, tmp_path: Path) -> None:
    before = sorted(p.name for p in episode.rglob("*"))
    out = tmp_path / "final.mp4"
    # quote, colon and comma in the work dir must not break (or inject into) the filtergraph
    plan = build_short(episode, tmp_path / "it's: a, work", out)
    assert plan.total == pytest.approx(20.0)
    rep = probe(out)
    assert (rep.width, rep.height) == (1080, 1920)
    assert rep.fps == pytest.approx(30)
    assert rep.duration == pytest.approx(20.0, abs=0.15)
    assert rep.lufs is not None and abs(rep.lufs + 14) <= 0.6  # two-pass loudnorm lands on target
    assert check(rep) == []
    # inputs are never modified (the old script wrote tmp/ and captions.ass into the episode)
    assert sorted(p.name for p in episode.rglob("*")) == before


def test_wordless_plan_assembles(episode: Path, tmp_path: Path) -> None:
    ep = tmp_path / "ep"
    (ep / "vo").mkdir(parents=True)
    (ep / "clips").symlink_to(episode / "clips")
    (ep / "music.mp3").symlink_to(episode / "music.mp3")
    (ep / "config.json").write_text(json.dumps({**CFG, "script": {}, "vo_shot": {}, "vo_offset": {}}))
    (ep / "vo" / "words.json").write_text("{}")
    out = tmp_path / "final.mp4"
    build_short(ep, tmp_path / "work", out)
    rep = probe(out)
    assert rep.duration == pytest.approx(20.0, abs=0.15)
    assert rep.lufs is not None and abs(rep.lufs + 14) <= 0.6


def test_captions_timing_and_highlight() -> None:
    plan = load_plan(CFG)
    ass = caption_ass(plan, {k: [tuple(w) for w in v] for k, v in WORDS.items()})  # type: ignore[misc]
    lines = [x for x in ass.splitlines() if x.startswith("Dialogue")]
    assert len(lines) == 2 + 4 + 4  # one event per word
    # line 2 sits on shot 1 (starts at 5.0) + 0.4 offset
    assert lines[2].startswith("Dialogue: 0,0:00:05.40,0:00:05.60,Cap")
    assert "{\\c&H00D7FF&}IT{\\c&HFFFFFF&} DID" in lines[2]
    # first caption appears at 0.3 s (captions from the start rule)
    assert lines[0].startswith("Dialogue: 0,0:00:00.30")


def test_plan_rejects_unsafe_or_broken_config() -> None:
    bad = dict(CFG, cuts=[["../etc/passwd", 0, 1]])
    with pytest.raises(ValueError):
        load_plan(bad)
    with pytest.raises(ValueError):
        load_plan(dict(CFG, vo_shot={"1": 9, "2": 1, "3": 3}))
    with pytest.raises(ValueError):
        load_plan(dict(CFG, cuts=[["S1", 0, 0]]))
    for music in ("../../secret.wav", "/etc/passwd", "concat:/etc/hosts|x", ".hidden"):
        with pytest.raises(ValueError):
            load_plan(dict(CFG, music=music))
    for silence in ([9, 0, 1], [-1, 0, 1], [0, -1, 1]):
        with pytest.raises(ValueError):
            load_plan(dict(CFG, silence=silence))
    with pytest.raises(ValueError):
        load_plan(dict(CFG, vo_offset={"1": -0.1, "2": 0.4, "3": 0.5}))


def test_qa_flags_bad_output(tmp_path: Path) -> None:
    bad = tmp_path / "bad.mp4"
    # wrong size, too short, no audio, 2 s of frozen black
    ff("-f", "lavfi", "-i", "color=black:size=720x1280:rate=24:duration=3", "-c:v", "libx264", "-b:v", "500k", str(bad))
    fails = check(probe(bad))
    joined = " | ".join(fails)
    for needle in ("resolution", "duration", "bitrate", "no audio", "frozen", "black", "frame rate"):
        assert needle in joined, joined


def test_qa_flags_long_silence(tmp_path: Path) -> None:
    f = tmp_path / "quiet.mp4"
    ff("-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=20",
       "-f", "lavfi", "-i", "sine=frequency=440:duration=8", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
       "-filter_complex", "[1:a][2:a]concat=n=2:v=0:a=1,atrim=0:20[a]", "-map", "0:v", "-map", "[a]",
       "-c:v", "libx264", "-b:v", "8000k", "-c:a", "aac", str(f))
    rep = probe(f)
    assert any("silence" in x for x in check(rep, Spec(min_video_kbps=0, lufs_tolerance=99)))


def test_qa_rejects_file_without_video(tmp_path: Path) -> None:
    f = tmp_path / "audio.m4a"
    ff("-f", "lavfi", "-i", "sine=duration=1", str(f))
    with pytest.raises(ValueError, match="no video"):
        probe(f)


def test_word_cache_invalidates_when_narration_changes(episode: Path, tmp_path: Path) -> None:
    ep = tmp_path / "ep"
    import shutil
    shutil.copytree(episode, ep)
    (ep / "vo" / "words.json").unlink()
    calls: list[str] = []

    def fake(p: Path) -> list[tuple[str, float, float]]:
        calls.append(p.name)
        return [("w", 0.0, 0.3)] * 6

    from feista_media import assemble
    real_run = assemble.run
    assemble.run = lambda *a, **k: subprocess.CompletedProcess([], 0, "", '{"input_i":"-20","input_tp":"-3","input_lra":"5","input_thresh":"-30","target_offset":"0"}')  # type: ignore[assignment]
    try:
        work = tmp_path / "work"
        build_short(ep, work, tmp_path / "o.mp4", transcribe=fake)
        build_short(ep, work, tmp_path / "o.mp4", transcribe=fake)
        assert len(calls) == 3  # second run reused the cache
        cfg = json.loads((ep / "config.json").read_text())
        cfg["script"]["1"] = "Something else fell."
        (ep / "config.json").write_text(json.dumps(cfg))
        build_short(ep, work, tmp_path / "o.mp4", transcribe=fake)
        assert len(calls) == 6  # changed script -> re-transcribed
    finally:
        assemble.run = real_run


def test_cli_exit_codes_tell_the_runner_what_to_retry(tmp_path: Path) -> None:
    import sys

    ep = tmp_path / "ep"
    ep.mkdir()
    (ep / "config.json").write_text(json.dumps({**CFG, "cuts": [["../x", 0, 5]]}))
    bad = subprocess.run([sys.executable, "-m", "feista_media.cli", "assemble", str(ep), "--work", str(tmp_path / "w"),
                          "--out", str(tmp_path / "o.mp4")], capture_output=True, text=True, check=False)
    assert bad.returncode == 2, bad.stdout  # bad input: permanent
    missing = subprocess.run([sys.executable, "-m", "feista_media.cli", "qa", str(tmp_path / "nope.mp4")],
                             capture_output=True, text=True, check=False)
    assert missing.returncode == 75, missing.stdout  # probe failure: transient, not a QA verdict


def test_clip_from_a_stream_recording(tmp_path: Path) -> None:
    src = tmp_path / "vod.mp4"  # 16:9 "stream" with speech-level audio
    ff("-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=40", "-f", "lavfi", "-i",
       "sine=frequency=440:duration=40", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(src))
    words = [(f"w{i}", i * 0.5, i * 0.5 + 0.4) for i in range(80)]
    t = transcribe(src, tmp_path / "t.json", lambda p: words + [(" ", 1.0, 1.1)])
    assert t["duration"] == pytest.approx(40, abs=0.1) and len(t["words"]) == 80  # type: ignore[arg-type]
    out = tmp_path / "c1.mp4"
    assert render(src, 5.0, 25.0, words, tmp_path / "w", out) == pytest.approx(20)
    rep = probe(out)
    assert (rep.width, rep.height, round(rep.fps)) == (1080, 1920, 30)
    assert rep.duration == pytest.approx(20, abs=0.15)
    assert check(rep, Spec(max_silence_s=3.0)) == []
    ass = captions(words, 5.0, 25.0)
    assert "W10" in ass and "W9 " not in ass and "W50" not in ass  # only the clip's own words, from 0 s
    assert "Dialogue: 0,0:00:00.00" in ass
    with pytest.raises(ValueError, match="15-60 s"):
        render(src, 30.0, 41.0, words, tmp_path / "w", out)
    with pytest.raises(ValueError, match="15-60 s"):
        render(src, 0.0, 10.0, words, tmp_path / "w", out)


def test_clip_captions_cannot_inject_ass_overrides() -> None:
    ass = captions([("{\\fs400}hi", 0.0, 0.5), ("ok", 0.5, 1.0)], 0.0, 20.0)
    assert "FS400HI" in ass and "\\fs400" not in ass.lower()  # braces and backslashes stripped, text kept
