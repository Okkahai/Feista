import argparse
import json
import sys
from pathlib import Path

from .assemble import build_short
from .qa import check, probe


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
        plan = build_short(a.episode_dir, a.work, a.out)
        print(json.dumps({"total": plan.total, "starts": plan.starts}))
        return 0
    rep = probe(a.video)
    fails = check(rep)
    print(json.dumps({"report": json.loads(rep.to_json()), "failures": fails}))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
