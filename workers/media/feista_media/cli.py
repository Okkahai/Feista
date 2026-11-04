import argparse
import json
import sys
from pathlib import Path

from .assemble import build_short
from .qa import check, probe

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
    a = ap.parse_args()
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
    fails = check(rep)
    print(json.dumps({"report": json.loads(rep.to_json()), "failures": fails}))
    return EXIT_QA_FAILED if fails else 0


if __name__ == "__main__":
    sys.exit(main())
