import argparse
import json
import sys
from pathlib import Path

from .assemble import build_short, whisper_transcriber
from .clip import render, transcribe
from .qa import DEFAULT_SPEC, Spec, check, probe

# streams have natural pauses; a clip may hold a longer quiet beat than a scored Short
CLIP_SPEC = Spec(max_silence_s=3.0)

# Exit codes the runner relies on: 1 = QA failed, 2 = bad input (both permanent), 75 = transient (retry).
EXIT_QA_FAILED = 1
EXIT_BAD_INPUT = 2
EXIT_TEMPFAIL = 75


def main() -> int:
    ap = argparse.ArgumentParser(prog="feista-media")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("assemble")
    b.add_argument("episode_dir", type=Path)
    b.add_argument("--work", type=Path, required=True)
    b.add_argument("--out", type=Path, required=True)
    q = sub.add_parser("qa")
    q.add_argument("video", type=Path)
    q.add_argument("--spec", choices=["story", "clip"], default="story")
    t = sub.add_parser("clip-transcribe")
    t.add_argument("source", type=Path)
    t.add_argument("--out", type=Path, required=True)
    r = sub.add_parser("clip-render")
    r.add_argument("source", type=Path)
    r.add_argument("--start", type=float, required=True)
    r.add_argument("--end", type=float, required=True)
    r.add_argument("--transcript", type=Path, required=True)
    r.add_argument("--work", type=Path, required=True)
    r.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    if a.cmd in ("clip-transcribe", "clip-render"):
        try:
            if a.cmd == "clip-transcribe":
                res = transcribe(a.source, a.out, whisper_transcriber("small"))  # multilingual: streams are not only English
                print(json.dumps({"duration": res["duration"], "words": len(res["words"])}))  # type: ignore[arg-type]
            else:
                words = json.loads(a.transcript.read_text())["words"]
                print(json.dumps({"duration": render(a.source, a.start, a.end, words, a.work, a.out)}))
        except (ValueError, KeyError, FileNotFoundError, json.JSONDecodeError) as e:
            print(json.dumps({"error": f"bad clip input: {e!r}"}))
            return EXIT_BAD_INPUT
        except Exception as e:  # noqa: BLE001 - ffmpeg crash, model download, disk full: worth a retry
            print(json.dumps({"error": f"transient: {e!r}"}))
            return EXIT_TEMPFAIL
        return 0
    if a.cmd == "assemble":
        try:
            plan = build_short(a.episode_dir, a.work, a.out)
        except (ValueError, KeyError, FileNotFoundError, json.JSONDecodeError) as e:
            print(json.dumps({"error": f"bad episode input: {e!r}"}))
            return EXIT_BAD_INPUT
        except Exception as e:  # noqa: BLE001 - ffmpeg crash, OOM, disk full, model download: worth a retry
            print(json.dumps({"error": f"transient: {e!r}"}))
            return EXIT_TEMPFAIL
        print(json.dumps({"total": plan.total, "starts": plan.starts}))
        return 0
    try:
        rep = probe(a.video)
    except Exception as e:  # noqa: BLE001 - probe failures are not QA verdicts: retry
        print(json.dumps({"error": f"transient: {e!r}"}))
        return EXIT_TEMPFAIL
    fails = check(rep, CLIP_SPEC if a.spec == "clip" else DEFAULT_SPEC)
    print(json.dumps({"report": json.loads(rep.to_json()), "failures": fails}))
    return EXIT_QA_FAILED if fails else 0


if __name__ == "__main__":
    sys.exit(main())
