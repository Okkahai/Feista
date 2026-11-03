import os
import subprocess

FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE", "ffprobe")


def run(args: list[str]) -> subprocess.CompletedProcess[str]:
    """Run ffmpeg; raise with stderr attached so job logs show the real cause."""
    p = subprocess.run([FFMPEG, "-hide_banner", "-nostdin", *args], check=False, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg failed ({p.returncode}): {p.stderr[-2000:]}")
    return p
