#!/usr/bin/env python3
"""Export an absolute-time HTML/SVG composition; no imports from other skills."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys


def finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def load_composition(path, allow_other_aspect=False):
    metadata = json.loads(path.read_text(encoding="utf-8"))
    width, height = metadata.get("width", 1080), metadata.get("height", 1350)
    if type(width) is not int or type(height) is not int or width <= 0 or height <= 0:
        raise ValueError("width and height must be positive integers")
    if not allow_other_aspect and width * 5 != height * 4:
        raise ValueError("width:height must be 4:5")
    duration = metadata.get("duration", 20)
    if not finite_number(duration) or duration <= 0:
        raise ValueError("duration must be a positive finite number of seconds")
    fps = metadata.get("fps", 30)
    if type(fps) is not int or not 10 <= fps <= 60:
        raise ValueError("fps must be an integer from 10 to 60 (default 30)")
    if math.floor(duration * fps + 0.5) < 1:
        raise ValueError("duration and fps must produce at least one frame")
    if metadata.get("version") != 1:
        raise ValueError("version must be 1")
    scene = metadata.get("scene", "scene.html")
    scene_path = local_asset(path.parent, scene)
    if not scene_path.is_file():
        raise ValueError(f"scene file is missing: {scene}")
    representative = metadata.get("representativeTime", max(0, duration - 2))
    if not finite_number(representative) or not 0 <= representative < duration:
        raise ValueError("representativeTime must be inside duration")
    keyframes = metadata.get("keyframes", [])
    if not isinstance(keyframes, list) or not keyframes:
        raise ValueError("keyframes must contain at least one review time")
    for key in keyframes:
        if not finite_number(key.get("time")) or not 0 <= key["time"] < duration:
            raise ValueError("keyframe time must be inside duration")
    # Legacy audio settings never enable sound or survive source export.
    metadata.pop("audio", None)
    for asset in metadata.get("assets", []):
        if not local_asset(path.parent, asset).is_file():
            raise ValueError(f"asset is missing: {asset}")
    metadata.update(width=width, height=height, duration=duration, fps=fps, scene=scene,
                    representativeTime=representative, keyframes=keyframes,
                    exportOptions={"allowOtherAspect": bool(allow_other_aspect)})
    return metadata


def local_asset(root, name):
    candidate = (root / name).resolve()
    if not candidate.is_relative_to(root.resolve()):
        raise ValueError("assets must be local paths inside the composition folder")
    return candidate


def executable(name, environment):
    value = os.environ.get(environment) or shutil.which(name)
    if not value and name == "ffmpeg":
        try:
            import imageio_ffmpeg
            value = imageio_ffmpeg.get_ffmpeg_exe()
        except ImportError:
            pass
    if not value:
        raise RuntimeError(f"{name} is missing. Set {environment} or install the documented dependency.")
    return value


def review_images(output, metadata, capture):
    from PIL import Image, ImageChops, ImageDraw, ImageFont
    candidates = [os.environ.get("MOTION_FONT_PATH"), "/System/Library/Fonts/Supplemental/Arial.ttf",
                  "/Library/Fonts/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                  "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
                  str(Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts/arial.ttf")]
    font_path = next((p for p in candidates if p and Path(p).is_file()), None)
    font = ImageFont.truetype(font_path, 24) if font_path else ImageFont.load_default(size=24)
    def caption_lines(text):
        lines, current = [], ""
        for character in text:
            trial = current + character
            if font.getlength(trial) > 336 and current:
                lines.append(current.rstrip())
                current = character.lstrip()
            else:
                current = trial
        if current:
            lines.append(current.rstrip())
        return lines
    captions = [caption_lines(f"{key['time']:g}s · {key['label']}") for key in metadata["keyframes"]]
    with Image.open(output / "representative.png") as poster:
        poster.resize((390, round(390 * metadata["height"] / metadata["width"])), Image.Resampling.LANCZOS).save(output / "representative-390.png")
    tile_height = round(344 * metadata["height"] / metadata["width"])
    row_height = tile_height + 38 + 32 * max(map(len, captions))
    rows = math.ceil(len(metadata["keyframes"]) / 3)
    sheet = Image.new("RGB", (1080, rows * row_height), "#11151c")
    draw = ImageDraw.Draw(sheet)
    for i, key in enumerate(metadata["keyframes"]):
        x, y = i % 3 * 360, i // 3 * row_height
        with Image.open(output / f"keyframe-{i:02}.png") as image:
            sheet.paste(image.convert("RGB").resize((344, tile_height), Image.Resampling.LANCZOS), (x + 8, y + 8))
        for line_index, line in enumerate(captions[i]):
            draw.text((x + 12, y + tile_height + 22 + 32 * line_index), line, fill="#d4dbe5", font=font)
    sheet.save(output / "contact-sheet.png")
    for comparison in capture["rasterComparisons"]:
        with Image.open(output / "repro-check" / comparison["reference"]) as reference, Image.open(output / "repro-check" / comparison["compared"]) as compared:
            difference = ImageChops.difference(reference.convert("RGB"), compared.convert("RGB"))
            pixels = list(difference.get_flattened_data())
            changed = sum(pixel != (0, 0, 0) for pixel in pixels)
            comparison.update(changedPixels=changed, maxChannelDifference=max(max(pixel) for pixel in pixels),
                              matchingPixelRatio=1 - changed / (metadata["width"] * metadata["height"]),
                              differenceBounds=difference.getbbox())
    capture["fontCondition"] = "Use a readable local font such as Arial or DejaVu Sans. Non-Latin text needs matching glyph coverage; OS fonts are not redistributed."


def export_source(metadata_path, metadata, output):
    source = output / "source"
    source.mkdir(exist_ok=True)
    for name in [metadata["scene"], *metadata.get("assets", [])]:
        destination = source / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local_asset(metadata_path.parent, name), destination)
    source_metadata = dict(metadata)
    source_metadata.pop("audio", None)
    (source / "composition.json").write_text(json.dumps(source_metadata, ensure_ascii=False, indent=2) + "\n")
    scripts = source / "scripts"
    scripts.mkdir(exist_ok=True)
    for name in ["render_motion.py", "capture.cjs", "audit_motion.py"]:
        shutil.copy2(Path(__file__).resolve().parent / name, scripts / name)
    skill = Path(__file__).resolve().parent.parent
    for name in ["requirements.txt", "package.json", "package-lock.json"]:
        if (skill / name).is_file():
            shutil.copy2(skill / name, source / name)
    aspect_flag = " --allow-other-aspect" if metadata.get("exportOptions", {}).get("allowOtherAspect") else ""
    (source / "README.md").write_text("# 재생성 원본\n\n이 exporter는 오디오 stream 없는 무음 MP4를 만든다. 이전 audio 설정은 사용하거나 원본에 보존하지 않는다. Python 3, Node.js, Chrome과 읽기 쉬운 로컬 폰트(예: Arial 또는 DejaVu Sans)가 필요하다. 영어 이외 문자에는 해당 문자를 지원하는 폰트를 지정한다. OS font는 포함하지 않는다.\n\n이 폴더에서 다음을 실행한다.\n\n```sh\npython3 -m venv .venv\n.venv/bin/python -m pip install -r requirements.txt\nnpm install\n.venv/bin/python scripts/render_motion.py composition.json --output ../regenerated" + aspect_flag + "\n```\n\n생성된 PNG의 정지 후보와 프레임 간 변화량은 `.venv/bin/python scripts/audit_motion.py ../regenerated/frames --fps " + str(metadata["fps"]) + " --output ../regenerated/pace-audit.json`으로 확인한다. 이 도구는 후보를 보고하며 자동 컷이나 합격 판정을 하지 않는다.\n\nscene 이외에 CSS·이미지·script·font 파일을 쓰면 composition.json의 assets에 상대경로로 모두 등록한다. 등록되지 않거나 로드하지 못한 로컬 자산은 export가 실패한다. data URI와 설치된 OS font는 파일 등록이 필요 없다. OS font는 원본에 복사하지 않는다.\n\n명시 경로가 필요하면 NODE_BINARY, NODE_PATH, FFMPEG_PATH, CHROME_PATH, MOTION_FONT_PATH 환경 변수를 쓴다. 원래 worktree 경로에 의존하지 않는다.\n", encoding="utf-8")


def render(metadata_path, metadata, output):
    node = executable("node", "NODE_BINARY")
    ffmpeg = executable("ffmpeg", "FFMPEG_PATH")
    output.mkdir(parents=True, exist_ok=True)
    subprocess.run([node, str(Path(__file__).with_name("capture.cjs")), str(metadata_path), str(output)], check=True)
    capture = json.loads((output / "capture-validation.json").read_text())
    review_images(output, metadata, capture)
    video_path = output / "video.mp4"
    command = [ffmpeg, "-y", "-v", "error", "-framerate", str(metadata["fps"]), "-i", str(output / "frames/%04d.png"),
               "-t", str(metadata["duration"]), "-map", "0:v:0", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
               "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(video_path)]
    subprocess.run(command, check=True)
    probe = subprocess.run([ffmpeg, "-hide_banner", "-i", str(video_path)], capture_output=True, text=True).stderr
    video_line = next((line for line in probe.splitlines() if "Video:" in line), "")
    audio_lines = [line for line in probe.splitlines() if "Audio:" in line]
    dimensions = re.search(r"\b(\d{2,5})x(\d{2,5})\b", video_line)
    fps = re.search(r"([\d.]+) fps", video_line)
    duration = re.search(r"Duration: (\d+):(\d+):([\d.]+)", probe)
    if not ("Video: h264" in video_line and "yuv420p" in video_line and dimensions and fps and duration) or audio_lines:
        raise RuntimeError(f"Expected video-only H.264 yuv420p stream was not found: {probe}")
    actual_dimensions = list(map(int, dimensions.groups()))
    actual_duration = int(duration[1]) * 3600 + int(duration[2]) * 60 + float(duration[3])
    if actual_dimensions != [metadata["width"], metadata["height"]] or float(fps[1]) != metadata["fps"] or abs(actual_duration - metadata["duration"]) > 0.1:
        raise RuntimeError("Encoded video dimensions, fps, or duration differ from the composition")
    decoded = subprocess.run([ffmpeg, "-v", "error", "-i", str(video_path), "-map", "0:v:0", "-f", "null", "-"], capture_output=True, text=True)
    if decoded.returncode or decoded.stderr.strip():
        raise RuntimeError(f"Full MP4 decode failed: {decoded.stderr}")
    stale_audio = output / "audio.wav"
    if stale_audio.is_file() or stale_audio.is_symlink():
        stale_audio.unlink()  # Only the previous exporter-owned artifact.
    validation = {"duration": actual_duration, "bytes": video_path.stat().st_size, "fullDecodePassed": True,
                  "exportOptions": metadata["exportOptions"],
                  "video": {"codec": "h264", "pixelFormat": "yuv420p", "dimensions": actual_dimensions, "fps": float(fps[1])},
                  "silent": True, "audioStreamCount": len(audio_lines), "capture": capture,
                  "representativeTime": metadata["representativeTime"],
                  "representativeSha256": hashlib.sha256((output / "representative.png").read_bytes()).hexdigest(),
                  "encodeCommand": command, "ffmpegVersion": subprocess.run([ffmpeg, "-version"], capture_output=True, text=True).stdout.splitlines()[0]}
    (output / "validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    export_source(metadata_path, metadata, output)
    print(json.dumps({"video": str(video_path), "bytes": validation["bytes"], "duration": actual_duration, "fullDecodePassed": True}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("composition", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--allow-other-aspect", action="store_true", help="Allow an explicitly requested aspect ratio instead of the default 4:5")
    arguments = parser.parse_args()
    try:
        metadata_path = arguments.composition.resolve()
        metadata = load_composition(metadata_path, allow_other_aspect=arguments.allow_other_aspect)
    except (OSError, ValueError, TypeError) as error:
        print(f"Invalid composition: {error}", file=sys.stderr)
        return 2
    if arguments.check_only:
        print("Composition valid")
        return 0
    if not arguments.output:
        parser.error("--output is required for rendering")
    try:
        render(metadata_path, metadata, arguments.output.resolve())
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"Export failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
