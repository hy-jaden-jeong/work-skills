#!/usr/bin/env python3
"""Validate sequential card PNGs and make grouped, readable visual QA previews."""
import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw


def positive(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--width", type=positive, default=1080)
    parser.add_argument("--height", type=positive, default=1350)
    parser.add_argument("--expected-cards", type=positive)
    parser.add_argument("--mobile-widths", default="360,390")
    parser.add_argument("--group-size", type=positive, default=4)
    args = parser.parse_args()
    if args.group_size > 6:
        parser.error("--group-size must be 1–6 to keep sheets readable")
    try:
        widths = sorted(set(positive(v) for v in args.mobile_widths.split(",")))
    except (ValueError, argparse.ArgumentTypeError):
        parser.error("--mobile-widths must be comma-separated positive integers")
    if not args.input.is_dir():
        parser.error("input must be a PNG directory")
    files = sorted(args.input.glob("card-*.png"))
    issues = []
    expected_names = [f"card-{i:03d}.png" for i in range(1, len(files) + 1)]
    if not files or [p.name for p in files] != expected_names:
        issues.append("missing cards or nonsequential card-NNN.png names")
    if args.expected_cards is not None and len(files) != args.expected_cards:
        issues.append(f"expected {args.expected_cards} cards, got {len(files)}")
    cards = []
    for file in files:
        try:
            with Image.open(file) as image:
                image.load()
                if image.format != "PNG" or image.size != (args.width, args.height):
                    issues.append(f"{file.name}: expected PNG {args.width}×{args.height}, got {image.format} {image.size}")
                cards.append({"file": file.name, "width": image.width, "height": image.height})
        except (OSError, ValueError) as error:
            issues.append(f"{file.name}: {error}")
    args.out.mkdir(parents=True, exist_ok=True)
    report = {"cards": cards, "issues": issues, "mobileWidths": widths, "groupSize": args.group_size}
    report_path = args.out / "qa.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    if issues:
        raise SystemExit(f"PNG QA failed; inspect {report_path}")
    if list(args.out.glob("contact-sheet-*.png")) or list((args.out / "mobile").glob("card-*.png")):
        raise SystemExit("Preview output already contains images; use a fresh directory or explicitly remove the old preview set.")
    mobile = args.out / "mobile"
    mobile.mkdir(exist_ok=True)
    for file in files:
        with Image.open(file) as image:
            for width in widths:
                resized = image.convert("RGB").resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
                resized.save(mobile / f"{file.stem}-{width}.png")
    # At most two columns, keeping each card at mobile reading size.
    tile_width, gap, label_height = max(widths), 24, 28
    tile_height = round(args.height * tile_width / args.width)
    sheets = []
    for start in range(0, len(files), args.group_size):
        group = files[start:start + args.group_size]
        columns = min(2, len(group))
        rows = math.ceil(len(group) / columns)
        sheet = Image.new("RGB", (columns * (tile_width + gap) + gap, rows * (tile_height + label_height + gap) + gap), "#24282C")
        draw = ImageDraw.Draw(sheet)
        for index, file in enumerate(group):
            x = gap + (index % columns) * (tile_width + gap)
            y = gap + (index // columns) * (tile_height + label_height + gap)
            draw.text((x, y), file.stem, fill="#F0ECE3")
            with Image.open(mobile / f"{file.stem}-{tile_width}.png") as image:
                sheet.paste(image, (x, y + label_height))
        target = args.out / f"contact-sheet-{len(sheets) + 1:03d}.png"
        sheet.save(target)
        sheets.append(str(target))
    report["contactSheets"] = sheets
    report["mobile"] = str(mobile)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"cards": len(files), "contactSheets": sheets, "qa": str(report_path)}))


if __name__ == "__main__":
    main()
