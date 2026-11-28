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
    def test_pace_audit_reports_still_candidates_without_editing_frames(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for i, color in enumerate(["black", "black", "black", "white", "white", "white"]):
                Image.new("RGB", (44, 55), color).save(root / f"{i:04}.png")
            before = {p.name: p.read_bytes() for p in root.glob("*.png")}
            result = subprocess.run([sys.executable, str(SCRIPT.with_name("audit_motion.py")), str(root),
                "--fps", "10", "--min-still", "0.15"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            audit = json.loads(result.stdout)
            self.assertEqual([(s["start"], s["end"]) for s in audit["stillCandidates"]], [(0.0, 0.2), (0.3, 0.5)])
            self.assertEqual([(c["time"], c["changedRatio"]) for c in audit["changes"]], [(0.3, 1.0)])
            self.assertEqual(before, {p.name: p.read_bytes() for p in root.glob("*.png")})
            self.assertFalse(audit["automaticallyCut"])

    def test_pace_audit_orders_five_digit_frame_names_numerically(self):
        from PIL import Image
        for prefix in ["", "frame-"]:
            with self.subTest(prefix=prefix), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                for number, color in [(9998, "black"), (9999, "black"),
                                      (10000, "white"), (10001, "black")]:
                    Image.new("RGB", (1, 1), color).save(root / f"{prefix}{number:04}.png")
                result = subprocess.run([sys.executable, str(SCRIPT.with_name("audit_motion.py")), str(root),
                    "--fps", "30", "--step", str(1 / 30)], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                audit = json.loads(result.stdout)
                self.assertEqual([c["time"] for c in audit["changes"]], [0.066667, 0.1])

    @unittest.skipUnless(os.environ.get("MOTION_RENDER_SMOKE"), "Set MOTION_RENDER_SMOKE=1 for short Chrome/ffmpeg export")
    def test_short_export_default_representative_matches_source_regeneration(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "scene.html").write_text('''<!doctype html><style>html,body{margin:0}</style><svg id="canvas" width="40" height="50"><rect id="panel" width="40" height="50"/></svg><script>window.renderAt=t=>{document.getElementById('panel').setAttribute('fill',t===0?'red':'blue');return {t};};renderAt(0);</script>''')
            metadata = root / "composition.json"
            metadata.write_text(json.dumps({"version": 1, "title": "Short default representative", "scene": "scene.html",
                "width": 40, "height": 50, "duration": 1, "fps": 10,
                "keyframes": [{"time": 0, "label": "Opening"}]}))
            output, regenerated = root / "exported", root / "regenerated"
            result = subprocess.run([sys.executable, str(SCRIPT), str(metadata), "--output", str(output)],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            first = json.loads((output / "validation.json").read_text())
            self.assertEqual(first["representativeTime"], 0)
            self.assertEqual(first["capture"]["representativeState"], {"t": 0})
            environment = dict(os.environ)
            environment.setdefault("NODE_PATH", str(SCRIPT.parent.parent / "node_modules"))
            result = subprocess.run([sys.executable, str(output / "source/scripts/render_motion.py"),
                str(output / "source/composition.json"), "--output", str(regenerated)],
                capture_output=True, text=True, cwd=output / "source", env=environment)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            second = json.loads((regenerated / "validation.json").read_text())
            self.assertEqual(second["capture"]["representativeState"], {"t": 0})
            self.assertEqual(first["representativeSha256"], second["representativeSha256"])
            self.assertTrue(first["fullDecodePassed"] and second["fullDecodePassed"])
            self.assertEqual(first["audioStreamCount"], 0)
            self.assertEqual(second["audioStreamCount"], 0)

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
            output.mkdir()
            (output / "audio.wav").write_bytes(b"old generated audio")
            (output / "recording.wav").write_bytes(b"user recording")
            result = subprocess.run([sys.executable, str(SCRIPT), str(metadata), "--output", str(output), "--allow-other-aspect"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            evidence = json.loads((output / "validation.json").read_text())
            self.assertEqual(evidence["video"]["codec"], "h264")
            self.assertEqual(evidence["video"]["pixelFormat"], "yuv420p")
            self.assertEqual(evidence["video"]["dimensions"], [200, 200])
            self.assertEqual(evidence["video"]["fps"], 10)
            probe = subprocess.run([evidence["encodeCommand"][0], "-hide_banner", "-i", str(output / "video.mp4")], capture_output=True, text=True)
            self.assertNotIn("Audio:", probe.stderr)
            self.assertEqual(evidence["audioStreamCount"], 0)
            self.assertFalse((output / "audio.wav").exists())
            self.assertEqual((output / "recording.wav").read_bytes(), b"user recording")
            self.assertAlmostEqual(evidence["duration"], 10, places=1)
            self.assertTrue(evidence["fullDecodePassed"])
            self.assertEqual(evidence["capture"]["representativeState"], {"id": "A", "value": 42})
            self.assertTrue(evidence["capture"]["stateCallOrderIndependent"])
            self.assertTrue((output / "source/composition.json").is_file())
            self.assertNotIn("audio", json.loads((output / "source/composition.json").read_text()))
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

    def test_accepts_minutes_and_rejects_nonpositive_duration(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "scene.html").write_text("<script>window.renderAt=t=>({t})</script>")
            for duration, error in [(0, "positive finite"), (-1, "positive finite"),
                                    (0.001, "at least one frame"), (1, None), (120, None)]:
                with self.subTest(duration=duration):
                    metadata = root / "composition.json"
                    metadata.write_text(json.dumps({"version": 1, "title": "Duration validation", "scene": "scene.html",
                        "width": 1080, "height": 1350, "duration": duration, "fps": 30,
                        "keyframes": [{"time": 0, "label": "start"}], "audio": {}}))
                    result = subprocess.run([sys.executable, str(SCRIPT), str(metadata), "--check-only"], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 2 if error else 0, result.stdout + result.stderr)
                    if error:
                        self.assertIn(error, result.stderr)

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
