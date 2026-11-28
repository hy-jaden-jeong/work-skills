#!/usr/bin/env python3
"""Report candidate holds and sampled changes from existing PNG frames.

Advisory measurements only: no browser render, automatic cuts, or quality verdict.
"""
import argparse
import json
import math
from pathlib import Path
import re
import sys
from PIL import Image, ImageChops


def audit_frames(folder, fps=30, step=0.1, min_still=1.0):
    # Natural ordering keeps 10000.png after 9999.png and also handles frame-10000.png.
    def frame_order(path):
        return [int(part) if part.isdecimal() else part.casefold()
                for part in re.split(r"(\d+)", path.stem)]
    paths = sorted(folder.glob("*.png"), key=lambda path: (frame_order(path), path.name))
    if not paths:
        raise ValueError("No PNG frames found")
    stride = max(1, round(fps * step))
    indices = sorted(set(range(0, len(paths), stride)) | {len(paths) - 1})
    pixel_threshold, quiet_ratio = 16, 0.0005
    previous = None
    previous_time = 0
    run_start = None
    holds, changes = [], []
    dimensions = None

    def record_hold(end):
        if run_start is not None and end - run_start >= min_still - 1e-9:
            holds.append({"start": round(run_start, 6), "end": round(end, 6),
                          "duration": round(end - run_start, 6)})

    for index in indices:
        with Image.open(paths[index]) as frame:
            if dimensions is None:
                dimensions = frame.size
            elif dimensions != frame.size:
                raise ValueError("Frames have inconsistent dimensions")
            width = min(160, frame.width)
            current = frame.convert("RGB").resize((width, max(1, round(width * frame.height / frame.width))), Image.Resampling.LANCZOS)
        time = index / fps
        if previous is not None:
            pixels = list(ImageChops.difference(current, previous).get_flattened_data())
            ratio = sum(max(pixel) >= pixel_threshold for pixel in pixels) / len(pixels)
            if ratio <= quiet_ratio:
                if run_start is None:
                    run_start = previous_time
            else:
                record_hold(previous_time)
                run_start = None
                changes.append({"time": round(time, 6), "fromTime": round(previous_time, 6),
                                "changedRatio": round(ratio, 6)})
        previous, previous_time = current, time
    record_hold(previous_time)
    return {"sourceFrames": len(paths), "sampledFrames": len(indices), "fps": fps,
            "sourceDuration": len(paths) / fps, "sampleStepRequested": step,
            "parameters": {"maxSampleWidth": 160, "pixelThreshold": pixel_threshold,
                           "quietChangedRatio": quiet_ratio, "minStill": min_still},
            "stillCandidates": holds, "changes": changes, "automaticallyCut": False,
            "note": "Sampled pixel stability is a review candidate, not proof of a useless pause or viewer comprehension. Small or low-contrast changes can be missed; camera motion can hide semantic inactivity."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("frames", type=Path, help="Existing render PNG directory")
    parser.add_argument("--fps", type=float, default=30)
    parser.add_argument("--step", type=float, default=0.1)
    parser.add_argument("--min-still", type=float, default=1.0)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not all(math.isfinite(value) for value in (args.fps, args.step, args.min_still)) or args.fps <= 0 or args.step <= 0 or args.min_still < 0:
        parser.error("fps and step must be positive finite numbers; min-still must be nonnegative")
    try:
        result = audit_frames(args.frames, args.fps, args.step, args.min_still)
    except (OSError, ValueError) as error:
        print(f"Audit failed: {error}", file=sys.stderr)
        return 2
    rendered = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
