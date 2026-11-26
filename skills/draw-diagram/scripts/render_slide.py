#!/usr/bin/env python3
"""장표(HTML)를 단독 장표 또는 본문 삽화 PNG로 굽는다.

사용법
    python3 render_slide.py <장표.html> [<출력.png>]   출력을 생략하면 같은 이름의 .png
    python3 render_slide.py --check                    설치 확인: 견본 장표를 구워 본다

장표 파일에는 body 안쪽만 쓴다(assets/slide-*.html 견본). 스타일(assets/slide.css)과
Mermaid 설정·값 그림(sankey·timebar·cells·tree·quadrant·line·bar) 그리기·검사(assets/slide.js)는 굽는 순간에 이 스크립트가 넣는다.

종료 코드
    0  PNG를 만들었다
    1  굽지 못했다: Chrome 없음, 입력 오류, Mermaid를 못 불러옴·문법 오류, 값 그림 문법 오류.
       장표를 그려 본 뒤 실패했으면 예전에 구운 PNG를 지운다
    2  장표가 규칙을 어겼다: 넘침, 작은 글자, 팔레트 밖 색, 강조 수, 값 그림의 줄·칸 수 상한,
       빠진 구조, 채우지 않은 자리.
       PNG를 만들지 않는다. 글을 줄이거나 장표를 나눠 다시 굽는다

필요한 것: python3, Chrome(또는 Chromium·Edge), Mermaid를 쓰는 장표는 인터넷(CDN).
Chrome이 기본 위치에 없으면 CHROME_PATH 환경 변수에 실행 파일 경로를 넣는다.
"""
import base64
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote

ASSETS = Path(__file__).resolve().parent.parent / "assets"
MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"
WIDTH, HEIGHT, SCALE = 1600, 900, 2  # CSS 캔버스 1600x900을 2배로 찍어 3200x1800 PNG
CHROME_APPS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]
CHROME_COMMANDS = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]


class RenderFailed(Exception):
    """굽지 못했다(종료 코드 1)."""


class SlideProblems(Exception):
    """장표가 규칙을 어겼다(종료 코드 2). args[0]은 문제 목록."""


def find_chrome():
    custom = os.environ.get("CHROME_PATH")
    if custom:
        if Path(custom).expanduser().is_file():
            return str(Path(custom).expanduser())
        raise RenderFailed(f"CHROME_PATH가 가리키는 파일이 없다: {custom}")
    for app in CHROME_APPS:
        if Path(app).expanduser().is_file():
            return str(Path(app).expanduser())
    for command in CHROME_COMMANDS:
        found = shutil.which(command)
        if found:
            return found
    raise RenderFailed(
        "Chrome을 찾지 못했다. Google Chrome을 설치하거나, "
        "CHROME_PATH 환경 변수에 Chrome·Chromium·Edge 실행 파일 경로를 넣는다."
    )


def unfilled_slots(fragment):
    """견본의 {{…}} 자리 중 채우지 않은 것. Mermaid 블록(육각형 node 문법)과 주석은 보지 않는다."""
    text = re.sub(r"<!--.*?-->", "", fragment, flags=re.S)
    text = re.sub(r"<pre\b[^>]*\bmermaid\b.*?</pre>", "", text, flags=re.S)
    return re.findall(r"\{\{[^{}\n]*\}\}", text)


def build_page(fragment, base_dir):
    """장표 조각에 스타일과 스크립트를 붙여 Chrome이 열 완성된 문서를 만든다."""
    if re.search(r"<\s*(html|head|body)\b", fragment, flags=re.I):
        raise RenderFailed("장표 파일에는 body 안쪽만 쓴다. <html>, <head>, <body> 태그를 지운다(견본 참고).")
    css = (ASSETS / "slide.css").read_text(encoding="utf-8")
    js = (ASSETS / "slide.js").read_text(encoding="utf-8")
    mermaid = f'<script src="{MERMAID_URL}"></script>\n' if re.search(r"<pre\b[^>]*\bmermaid\b", fragment) else ""
    return (
        '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><title>slide</title>\n'
        f'<base href="{base_dir.as_uri()}/">\n<style>\n{css}</style>\n</head><body>\n'
        f"{fragment}\n{mermaid}<script>\n{js}</script>\n</body></html>\n"
    )


def run_chrome(chrome, profile, *args, height=HEIGHT):
    command = [
        chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
        "--use-mock-keychain",  # macOS 키체인을 건드리지 않는다(키체인 대화상자 방지)
        "--no-default-browser-check", f"--user-data-dir={profile}", f"--window-size={WIDTH},{height}",
        "--virtual-time-budget=6000", *args,
    ]
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=90).stdout
    except subprocess.TimeoutExpired:
        raise RenderFailed("Chrome이 90초 안에 끝나지 않았다.")
    except OSError as e:
        raise RenderFailed(f"Chrome을 실행하지 못했다: {e}")


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    return struct.unpack(">II", head[16:24]) if head[:8] == b"\x89PNG\r\n\x1a\n" else (0, 0)


def render(source, output, allow_slots=False):
    """source(장표 HTML 조각)를 output(PNG)으로 굽는다. 실패하면 RenderFailed, 규칙 위반이면 SlideProblems."""
    source, output = Path(source).resolve(), Path(output).resolve()
    if not source.is_file():
        raise RenderFailed(f"장표 파일이 없다: {source}")
    fragment = source.read_text(encoding="utf-8")
    page = build_page(fragment, source.parent)
    chrome = find_chrome()
    problems = [] if allow_slots else [f"채우지 않은 자리가 남았다: {slot}" for slot in unfilled_slots(fragment)[:5]]

    with tempfile.TemporaryDirectory(prefix="render-slide-") as work:
        page_file = Path(work) / "slide.html"
        page_file.write_text(page, encoding="utf-8")
        profile = Path(work) / "chrome-profile"

        # 1차: 그려 보고 slide.js가 남긴 보고를 읽는다
        dom = run_chrome(chrome, profile, "--dump-dom", page_file.as_uri())
        found = re.search(r"SLIDE-REPORT:([^<\"]*)", dom)
        if not found:
            raise RenderFailed("Chrome이 장표를 끝까지 그리지 못했다. 장표 HTML이 깨졌는지 확인한다.")
        report = json.loads(unquote(found.group(1)))
        if report["failure"] or report["problems"] or problems:
            if output.exists():
                output.unlink()  # 예전에 구운 PNG가 지금 내용인 것처럼 남지 않게 한다
        if report["failure"]:
            raise RenderFailed(report["failure"])
        problems += report["problems"]
        if problems:
            raise SlideProblems(problems)

        # 2차: 찍는다
        height = report["captureHeight"]
        output.parent.mkdir(parents=True, exist_ok=True)
        screenshot = Path(work) / "capture.png"
        run_chrome(chrome, profile, f"--force-device-scale-factor={SCALE}", f"--screenshot={screenshot}", page_file.as_uri(), height=height)
        if not screenshot.is_file() or png_size(screenshot) != (WIDTH * SCALE, height * SCALE):
            raise RenderFailed("Chrome이 캔버스 크기의 PNG를 만들지 못했다.")
        data = screenshot.read_bytes()
        if report["inlineDiagram"]:
            crop_page = Path(work) / "crop.html"
            template = (ASSETS / "crop-inline.html").read_text(encoding="utf-8")
            crop_page.write_text(template.replace("SCREENSHOT_DATA", base64.b64encode(data).decode("ascii")), encoding="utf-8")
            dom = run_chrome(chrome, profile, "--dump-dom", crop_page.as_uri())
            match = re.search(r"<title>data:image/png;base64,([A-Za-z0-9+/=]+)</title>", dom)
            if not match:
                raise RenderFailed("본문 삽화에서 그림을 추출하지 못했다.")
            data = base64.b64decode(match.group(1))
        output.write_bytes(data)


def render_and_report(source, output, allow_slots=False):
    try:
        render(source, output, allow_slots)
    except SlideProblems as e:
        print(f"장표가 규칙을 어겨 PNG를 만들지 않았다: {source}", file=sys.stderr)
        for problem in e.args[0]:
            print(f"  - {problem}", file=sys.stderr)
        print("고친 뒤 다시 굽는다. 넘침은 글자 크기를 줄이지 말고 글을 줄이거나 장표를 나눠서 고친다.", file=sys.stderr)
        return 2
    except RenderFailed as e:
        print(f"굽지 못했다: {e}", file=sys.stderr)
        return 1
    width, height = png_size(Path(output))
    print(f"구웠다: {output} ({width}x{height})")
    return 0


def check():
    """설치 확인. 견본을 모두 구워 보고, 열어 볼 수 있게 PNG 위치를 알려 준다."""
    out_dir = Path(tempfile.mkdtemp(prefix="draw-diagram-check-"))
    templates = sorted(ASSETS.glob("slide-*.html"))
    codes = [render_and_report(t, out_dir / f"{t.stem}.png", allow_slots=True) for t in templates]
    if not templates or any(codes):
        print("설치 확인 실패. 위 메시지를 보고 고친 뒤 다시 실행한다.", file=sys.stderr)
        return 1
    print(f"설치 확인 완료: 견본 {len(templates)}장을 구웠다. 장표 모양은 위 PNG를 열어 본다.")
    return 0


def main(argv):
    if argv == ["--check"]:
        return check()
    if not 1 <= len(argv) <= 2 or argv[0].startswith("-"):
        print(__doc__.strip(), file=sys.stderr)
        return 1
    source = Path(argv[0])
    output = Path(argv[1]) if len(argv) == 2 else source.with_suffix(".png")
    return render_and_report(source, output)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
