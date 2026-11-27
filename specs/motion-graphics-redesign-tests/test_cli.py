"""Public CLI checks for composition constraints; no renderer internals imported."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / "skills/motion-graphics/scripts/render_motion.py"


class CompositionCLI(unittest.TestCase):
    def test_other_aspect_requires_explicit_override(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "scene.html").write_text("<script>window.renderAt=t=>({t})</script>")
            metadata = root / "composition.json"
            metadata.write_text(json.dumps({"version": 1, "title": "Square requested", "scene": "scene.html",
                "width": 200, "height": 200, "fps": 30, "duration": 20, "representativeTime": 18,
                "keyframes": [{"time": 0, "label": "start"}], "audio": {}}))
            base = [sys.executable, str(SCRIPT), str(metadata), "--check-only"]
            default = subprocess.run(base, capture_output=True, text=True)
            explicit = subprocess.run([*base, "--allow-other-aspect"], capture_output=True, text=True)
            self.assertEqual(default.returncode, 2, default.stderr)
            self.assertEqual(explicit.returncode, 0, explicit.stderr)

    @unittest.skipUnless(os.environ.get("MOTION_RENDER_SMOKE"), "Set MOTION_RENDER_SMOKE=1 for real Chrome asset checks")
    def test_unregistered_browser_asset_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "style.css").write_text("svg{background:rgb(255,0,0)}")
            (root / "late.json").write_text('{"value":42}')
            metadata = root / "composition.json"
            variants = [
                ("initial CSS", '<link rel="stylesheet" href="style.css">', "", []),
                ("runtime unregistered fetch", "", "if(t>=5)fetch('late.json').catch(()=>{});", []),
                ("registered but failed fetch", "", "if(t>=5)fetch('late.json').catch(()=>{});", ["late.json"]),
            ]
            for name, head, action, assets in variants:
                with self.subTest(name=name):
                    (root / "scene.html").write_text(f'''<!doctype html>{head}<style>html,body{{margin:0}}</style><svg id="canvas" width="40" height="50"></svg><script>window.renderAt=t=>{{{action}return {{id:'A'}};}};</script>''')
                    metadata.write_text(json.dumps({"version": 1, "title": name, "scene": "scene.html",
                        "width": 40, "height": 50, "fps": 10, "duration": 10, "representativeTime": 8,
                        "keyframes": [{"time": 0, "label": "start"}], "audio": {}, "assets": assets}))
                    result = subprocess.run([sys.executable, str(SCRIPT), str(metadata), "--output", str(root / "output")], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                    self.assertIn("assets", result.stderr)
                    self.assertFalse((root / "output/video.mp4").exists())

    def test_rejects_boolean_and_nonfinite_timeline_numbers(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "scene.html").write_text("<script>window.renderAt=t=>({t})</script>")
            valid = {"version": 1, "title": "Invalid numeric input", "scene": "scene.html", "width": 1080,
                     "height": 1350, "fps": 30, "duration": 20, "representativeTime": 18,
                     "keyframes": [{"time": 0, "label": "start"}], "audio": {}}
            cases = [{"representativeTime": True}, {"duration": float("nan")}, {"fps": True},
                     {"keyframes": [{"time": True, "label": "invalid"}]}]
            for replacement in cases:
                with self.subTest(replacement=replacement):
                    metadata = root / "composition.json"
                    metadata.write_text(json.dumps({**valid, **replacement}))
                    result = subprocess.run([sys.executable, str(SCRIPT), str(metadata), "--check-only"], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 2, result.stdout + result.stderr)

    @unittest.skipUnless(os.environ.get("MOTION_RENDER_SMOKE"), "Set MOTION_RENDER_SMOKE=1 for real Chrome/ffmpeg export")
    def test_export_produces_playable_mp4_and_preserves_result(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "style.css").write_text("svg{background:rgb(255,0,0)}")
            (root / "scene.html").write_text('''<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="style.css"><style>html,body{margin:0;width:200px;height:200px}text{font:40px sans-serif;fill:#f4f6f9}</style><svg id="canvas" width="200" height="200"><text id="value" x="40" y="140"></text></svg><script>window.renderAt=t=>{const value=t<3?null:42;document.getElementById('value').textContent=value===null?'A':String(value);return {id:'A',value};};renderAt(0);</script>''')
            metadata = root / "composition.json"
            metadata.write_text(json.dumps({"version": 1, "title": "Render smoke", "scene": "scene.html",
                "width": 200, "height": 200, "duration": 10, "fps": 10, "representativeTime": 8, "assets": ["style.css"],
                "keyframes": [{"time": 0, "label": "A"}, {"time": 8, "label": "42"}],
                "audio": {"bed": {"frequencies": [110], "gain": 0.02}, "events": [{"time": 3, "frequency": 880, "duration": 0.1, "gain": 0.1}]}}))
            output = root / "exported"
            result = subprocess.run([sys.executable, str(SCRIPT), str(metadata), "--output", str(output), "--allow-other-aspect"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            evidence = json.loads((output / "validation.json").read_text())
            self.assertEqual(evidence["video"]["codec"], "h264")
            self.assertEqual(evidence["video"]["pixelFormat"], "yuv420p")
            self.assertEqual(evidence["video"]["dimensions"], [200, 200])
            self.assertEqual(evidence["video"]["fps"], 10)
            self.assertEqual(evidence["audio"]["codec"], "aac")
            self.assertAlmostEqual(evidence["duration"], 10, places=1)
            self.assertTrue(evidence["fullDecodePassed"])
            self.assertEqual(evidence["capture"]["representativeState"], {"id": "A", "value": 42})
            self.assertTrue(evidence["capture"]["stateCallOrderIndependent"])
            self.assertGreater(evidence["audio"]["sourcePeak"], 0)
            self.assertLess(evidence["audio"]["sourcePeak"], 0.8)
            self.assertTrue((output / "source/composition.json").is_file())
            self.assertTrue((output / "source/style.css").is_file())
            self.assertIn("--allow-other-aspect", (output / "source/README.md").read_text())
            regenerated = root / "regenerated"
            source_environment = dict(os.environ)
            # Reuse the installed dependency via the documented NODE_PATH seam;
            # the source package itself owns and executes its copied exporter.
            source_environment.setdefault("NODE_PATH", str(SCRIPT.parent.parent / "node_modules"))
            source_result = subprocess.run([sys.executable, str(output / "source/scripts/render_motion.py"),
                str(output / "source/composition.json"), "--output", str(regenerated), "--allow-other-aspect"], capture_output=True, text=True, cwd=output / "source", env=source_environment)
            self.assertEqual(source_result.returncode, 0, source_result.stderr)
            from PIL import Image
            with Image.open(output / "representative.png") as first, Image.open(regenerated / "representative.png") as second:
                self.assertEqual(first.convert("RGB").getpixel((10, 10)), (255, 0, 0))
                self.assertEqual(second.convert("RGB").getpixel((10, 10)), (255, 0, 0))
                self.assertEqual(first.tobytes(), second.tobytes())

    def test_rejects_duration_outside_supported_publish_range(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "scene.html").write_text("<script>window.renderAt=t=>({t})</script>")
            for duration in [9, 31]:
                with self.subTest(duration=duration):
                    metadata = root / "composition.json"
                    metadata.write_text(json.dumps({"version": 1, "title": "Invalid", "scene": "scene.html",
                        "width": 1080, "height": 1350, "duration": duration, "fps": 30,
                        "representativeTime": 5, "keyframes": [{"time": 0, "label": "start"}], "audio": {}}))
                    result = subprocess.run([sys.executable, str(SCRIPT), str(metadata), "--check-only"], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 2, result.stdout)
                    self.assertIn("10~30", result.stderr)

    def test_rejects_non_four_by_five_before_rendering(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "scene.html").write_text("<script>window.renderAt=t=>({t})</script>")
            composition = {"version": 1, "title": "Invalid", "scene": "scene.html", "width": 1080,
                           "height": 1080, "fps": 30, "duration": 20, "representativeTime": 18,
                           "keyframes": [{"time": 0, "label": "start"}], "audio": {}}
            metadata = root / "composition.json"
            metadata.write_text(json.dumps(composition))
            result = subprocess.run([sys.executable, str(SCRIPT), str(metadata), "--check-only"],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertIn("4:5", result.stderr)


if __name__ == "__main__":
    unittest.main()
