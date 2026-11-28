#!/usr/bin/env python3
"""Export an absolute-time HTML/SVG composition; no imports from other skills."""
import argparse
from array import array
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import wave


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
    if not finite_number(duration) or not 10 <= duration <= 30:
        raise ValueError("duration must be 10~30 seconds")
    fps = metadata.get("fps", 30)
    if type(fps) is not int or not 10 <= fps <= 60:
        raise ValueError("fps must be an integer from 10 to 60 (default 30)")
    if metadata.get("version") != 1:
        raise ValueError("version must be 1")
    scene = metadata.get("scene", "scene.html")
    scene_path = local_asset(path.parent, scene)
    if not scene_path.is_file():
        raise ValueError(f"scene file is missing: {scene}")
    representative = metadata.get("representativeTime", duration - 2)
    if not finite_number(representative) or not 0 <= representative < duration:
        raise ValueError("representativeTime must be inside duration")
    keyframes = metadata.get("keyframes", [])
    if not isinstance(keyframes, list) or not keyframes:
        raise ValueError("keyframes must contain at least one review time")
    for key in keyframes:
        if not finite_number(key.get("time")) or not 0 <= key["time"] < duration:
            raise ValueError("keyframe time must be inside duration")
    audio = metadata.get("audio", {})
    for event in audio.get("events", []):
        if not finite_number(event.get("time")) or not finite_number(event.get("duration")) or not 0 <= event["time"] < duration or not 0 < event["duration"] <= 2:
            raise ValueError("audio event must have a valid time and duration")
        if not finite_number(event.get("frequency")) or not finite_number(event.get("gain")) or not 20 <= event["frequency"] <= 20000 or not 0 <= event["gain"] <= 0.5:
            raise ValueError("audio event frequency/gain is invalid")
    bed = audio.get("bed", {})
    if not finite_number(bed.get("gain", 0)) or not 0 <= bed.get("gain", 0) <= 0.1 or any(not finite_number(value) or not 20 <= value <= 20000 for value in bed.get("frequencies", [])):
        raise ValueError("audio bed frequency/gain is invalid")
    for asset in metadata.get("assets", []):
        if not local_asset(path.parent, asset).is_file():
            raise ValueError(f"asset is missing: {asset}")
    metadata.update(width=width, height=height, duration=duration, fps=fps, scene=scene,
                    representativeTime=representative, keyframes=keyframes, audio=audio,
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


def synth_audio(metadata, destination):
    """Quiet harmonic bed and short tone effects, with start/end envelopes."""
    rate = 48000
    count = round(metadata["duration"] * rate)
    samples = array("f", [0.0]) * count
    bed = metadata["audio"].get("bed", {})
    frequencies = bed.get("frequencies", [])
    gain = bed.get("gain", 0)
    if frequencies and gain:
        for i in range(count):
            t = i / rate
            envelope = min(1, t / 0.6, (metadata["duration"] - t) / 0.8)
            samples[i] = envelope * gain * sum(math.sin(math.tau * frequency * t) for frequency in frequencies) / len(frequencies)
    for event in metadata["audio"].get("events", []):
        start = round(event["time"] * rate)
        length = min(round(event["duration"] * rate), count - start)
        for j in range(length):
            t = j / rate
            envelope = min(1, t / 0.008, (length - j - 1) / (rate * 0.025))
            samples[start + j] += event["gain"] * max(0, envelope) * math.exp(-3 * t / event["duration"]) * math.sin(math.tau * event["frequency"] * t)
    # Enforce gentle global fades even when an effect is near an endpoint.
    for i in range(min(rate // 10, count)):
        samples[i] *= i / (rate // 10)
        samples[-i - 1] *= i / (rate // 10)
    peak = max(abs(value) for value in samples)
    if peak > 0.8:
        raise ValueError(f"audio mix peak {peak:.3f} exceeds the safe mix level")
    pcm = array("h", (round(value * 32767) for value in samples))
    if sys.byteorder != "little":
        pcm.byteswap()
    with wave.open(str(destination), "wb") as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(rate)
        output.writeframes(pcm.tobytes())
    return {"sourcePeak": peak, "sourceRms": math.sqrt(sum(value * value for value in samples) / count),
            "sampleRate": rate, "channels": 1, "sourceDuration": count / rate,
            "clippedSamples": 0, "endpointSamples": [float(samples[0]), float(samples[-1])],
            "events": metadata["audio"].get("events", [])}


def review_images(output, metadata, capture):
    from PIL import Image, ImageChops, ImageDraw, ImageFont
    candidates = [os.environ.get("MOTION_FONT_PATH"), "/System/Library/Fonts/AppleSDGothicNeo.ttc",
                  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]
    font_path = next((p for p in candidates if p and Path(p).is_file()), None)
    if not font_path:
        raise RuntimeError("A local Korean font is required for review labels. Set MOTION_FONT_PATH.")
    font = ImageFont.truetype(font_path, 24)
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
    capture["fontCondition"] = "Install Apple SD Gothic Neo or Noto Sans CJK KR; OS fonts are not redistributed."


def export_source(metadata_path, metadata, output):
    source = output / "source"
    source.mkdir(exist_ok=True)
    for name in [metadata["scene"], *metadata.get("assets", [])]:
        destination = source / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local_asset(metadata_path.parent, name), destination)
    (source / "composition.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    scripts = source / "scripts"
    scripts.mkdir(exist_ok=True)
    for name in ["render_motion.py", "capture.cjs"]:
        shutil.copy2(Path(__file__).resolve().parent / name, scripts / name)
    skill = Path(__file__).resolve().parent.parent
    for name in ["requirements.txt", "package.json", "package-lock.json"]:
        if (skill / name).is_file():
            shutil.copy2(skill / name, source / name)
    aspect_flag = " --allow-other-aspect" if metadata.get("exportOptions", {}).get("allowOtherAspect") else ""
    (source / "README.md").write_text("# 재생성 원본\n\nPython 3, Node.js, Chrome과 로컬 한글 폰트(Apple SD Gothic Neo 또는 Noto Sans CJK KR)가 필요하다. OS font는 포함하지 않는다.\n\n이 폴더에서 다음을 실행한다.\n\n```sh\npython3 -m venv .venv\n.venv/bin/python -m pip install -r requirements.txt\nnpm install\n.venv/bin/python scripts/render_motion.py composition.json --output ../regenerated" + aspect_flag + "\n```\n\nscene 이외에 CSS·이미지·script·font 파일을 쓰면 composition.json의 assets에 상대경로로 모두 등록한다. 등록되지 않거나 로드하지 못한 로컬 자산은 export가 실패한다. data URI와 설치된 OS font는 파일 등록이 필요 없다. OS font는 원본에 복사하지 않는다.\n\n명시 경로가 필요하면 NODE_BINARY, NODE_PATH, FFMPEG_PATH, CHROME_PATH, MOTION_FONT_PATH 환경 변수를 쓴다. 원래 worktree 경로에 의존하지 않는다.\n", encoding="utf-8")


def render(metadata_path, metadata, output):
    node = executable("node", "NODE_BINARY")
    ffmpeg = executable("ffmpeg", "FFMPEG_PATH")
    output.mkdir(parents=True, exist_ok=True)
    subprocess.run([node, str(Path(__file__).with_name("capture.cjs")), str(metadata_path), str(output)], check=True)
    capture = json.loads((output / "capture-validation.json").read_text())
    review_images(output, metadata, capture)
    audio = synth_audio(metadata, output / "audio.wav")
    video_path = output / "video.mp4"
    command = [ffmpeg, "-y", "-v", "error", "-framerate", str(metadata["fps"]), "-i", str(output / "frames/%04d.png"),
               "-i", str(output / "audio.wav"), "-t", str(metadata["duration"]), "-c:v", "libx264", "-preset", "medium", "-crf", "18",
               "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(video_path)]
    subprocess.run(command, check=True)
    probe = subprocess.run([ffmpeg, "-hide_banner", "-i", str(video_path)], capture_output=True, text=True).stderr
    video_line = next((line for line in probe.splitlines() if "Video:" in line), "")
    audio_line = next((line for line in probe.splitlines() if "Audio:" in line), "")
    dimensions = re.search(r"\b(\d{2,5})x(\d{2,5})\b", video_line)
    fps = re.search(r"([\d.]+) fps", video_line)
    duration = re.search(r"Duration: (\d+):(\d+):([\d.]+)", probe)
    if not ("Video: h264" in video_line and "yuv420p" in video_line and "Audio: aac" in audio_line and dimensions and fps and duration):
        raise RuntimeError(f"Expected H.264 yuv420p and AAC streams were not found: {probe}")
    actual_dimensions = list(map(int, dimensions.groups()))
    actual_duration = int(duration[1]) * 3600 + int(duration[2]) * 60 + float(duration[3])
    if actual_dimensions != [metadata["width"], metadata["height"]] or float(fps[1]) != metadata["fps"] or abs(actual_duration - metadata["duration"]) > 0.1:
        raise RuntimeError("Encoded video dimensions, fps, or duration differ from the composition")
    decoded = subprocess.run([ffmpeg, "-v", "error", "-i", str(video_path), "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"], capture_output=True, text=True)
    if decoded.returncode or decoded.stderr.strip():
        raise RuntimeError(f"Full MP4 decode failed: {decoded.stderr}")
    audio["codec"] = "aac"
    validation = {"duration": actual_duration, "bytes": video_path.stat().st_size, "fullDecodePassed": True,
                  "exportOptions": metadata["exportOptions"],
                  "video": {"codec": "h264", "pixelFormat": "yuv420p", "dimensions": actual_dimensions, "fps": float(fps[1])},
                  "audio": audio, "capture": capture,
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
