# feista-media

Python + FFmpeg worker for Story Studio assembly and media QA.

```
pip install -e ".[dev]"        # add [whisper] for word timings when vo/words.json is absent
feista-media assemble <episode_dir> --work <tmp> --out final.mp4
feista-media qa final.mp4      # exit 1 + JSON failures if outside the delivery spec
pytest -q                      # real ffmpeg on synthetic media (~1 min)
```

Episode dir layout and config.json are unchanged from the Wobbi `build_short.py`.
