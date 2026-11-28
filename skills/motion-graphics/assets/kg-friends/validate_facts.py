"""Run SQLite against the exact facts used by scene.html (fictional example)."""
import argparse
import json
from pathlib import Path
import re
import sqlite3

ROOT = Path(__file__).resolve().parent
FACTS = json.loads(re.search(r"window\.GRAPH_FACTS\s*=\s*(\{.*\});", (ROOT / "facts.js").read_text(), re.S).group(1))
QUERY = """
WITH Edges(source, target) AS (
 SELECT source, target FROM Friendships
 UNION ALL
 SELECT target, source FROM Friendships
), TwoHop(via, target) AS (
 SELECT e1.target, e2.target
 FROM Edges e1 JOIN Edges e2 ON e1.target = e2.source
 WHERE e1.source = ? AND e2.target <> ?
)
SELECT DISTINCT target FROM TwoHop ORDER BY target
"""

def validate():
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE Persons(name TEXT PRIMARY KEY, type TEXT NOT NULL)")
    db.executemany("INSERT INTO Persons VALUES (?, ?)", [(p, FACTS["personType"]) for p in FACTS["people"]])
    db.execute("CREATE TABLE Friendships(source TEXT REFERENCES Persons(name), target TEXT REFERENCES Persons(name))")
    db.executemany("INSERT INTO Friendships VALUES (?, ?)", FACTS["friendships"])
    start = FACTS["query"]["start"]
    result = [r[0] for r in db.execute(QUERY, (start, start))]
    raw_sql = QUERY.replace("SELECT DISTINCT target FROM TwoHop ORDER BY target", "SELECT via, target FROM TwoHop ORDER BY via, target")
    raw = list(db.execute(raw_sql, (start, start)))
    assert result == ["Dan", "Eve", "Fay"], result
    assert raw == [("Bob", "Dan"), ("Bob", "Eve"), ("Claire", "Eve"), ("Claire", "Fay")], raw
    assert sum(target == "Eve" for _, target in raw) == 2
    assert start not in result
    assert FACTS["symmetric"] is True
    assert db.execute("SELECT count(*) FROM Friendships").fetchone()[0] == 6
    return {"passed": True, "database": "SQLite", "source": "facts.js", "rows": FACTS["friendships"], "rawPaths": raw, "answer": result, "query": QUERY}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene-report", type=Path)
    args = parser.parse_args()
    report = validate()
    if args.scene_report:
        scene = json.loads(args.scene_report.read_text())
        for frame in scene["records"]:
            state = frame["state"]
            assert state["friendships"] == report["rows"]
            assert state["answer"] == report["answer"]
            assert [(p["via"], p["target"]) for p in state["paths"]] == report["rawPaths"]
            if state["sqlAnswer"]:
                assert state["sqlAnswer"] == report["answer"]
            if state["visibleGraphAnswers"]:
                assert state["visibleGraphAnswers"] == report["answer"]
        report["actualSceneFramesChecked"] = len(scene["records"])
    print(json.dumps(report, indent=2))
