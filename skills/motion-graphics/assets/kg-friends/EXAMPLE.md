# 친구 관계와 SQL storage

영어·무음·4:5 모션그래픽의 가상 사례다. 1080×1350, 30fps, 23.5초로 만든다.

전체 설명의 일부인 친구 조회 vignette다. KG와 Graph DB의 구분, Graph DB가 유용한 조건과 저장 방식 선택까지 다루는 완성 영상이 아니다. 움직임과 데이터 대응을 참고하되, 새 영상의 장면 설명·도입 제목·길이는 현재 skill 규칙과 요청한 전체 내용에 맞춰 다시 구성한다.

`facts.js` 한 곳에서 Person 6명, 양방향 FRIENDS_WITH 관계 6개와 질의를 정한다. `scene.html`은 같은 facts를 읽고, 매 `renderAt(t)` 호출에서 전체 DOM과 의미 상태를 다시 만든다. graph의 identity·type·관계와 SQL row의 대응을 보여 주며, 물리 query plan이나 DB 성능 비교를 재현하지 않는다. Arial/Helvetica 계열 OS font를 사용하고 font 파일을 포함하지 않는다.

KG는 의미 모델과 저장 방식을 구분한다. 이 사례는 전용 Graph DB 없이 같은 관계를 SQL로 질의하는 한 가지 구성을 보여 준다. table이 자동으로 KG가 된다고 표현하거나, 전수 scan 카운터·DB 속도 경주로 저장소의 우열을 주장하지 않는다. Person/FRIENDS_WITH와 row의 mapping, 질문의 하강과 같은 답의 복귀로 의미를 전달한다.

`Friendships`는 양방향 관계를 unique pair 6개로 저장한다. SQLite 검사는 reverse edge를 더한 CTE에서 self join을 실행하고, Alice를 제외한 뒤 DISTINCT를 적용한다. 원본 경로는 Bob→Dan, Bob→Eve, Claire→Eve, Claire→Fay이며, 답은 Dan·Eve·Fay다.

이 skill 폴더에서 다음을 실행한다.

```sh
python3 assets/kg-friends/validate_facts.py
node assets/kg-friends/validate_scene.cjs /path/to/output
python3 assets/kg-friends/validate_facts.py --scene-report /path/to/output/semantic-validation.json
.venv/bin/python scripts/render_motion.py assets/kg-friends/composition.json --output /path/to/output
```

장면 검사는 실제 Chrome의 renderer state, 글자 ink의 안전 여백, Claire의 최소 45px 크기와 순서를 바꿔 호출한 PNG의 일치를 확인한다. SQLite 결과와 renderer state를 따로 계산해 대조한다. 이해도와 재생 리듬은 주요 프레임 및 실제 속도 무음 재생으로 별도 검토한다.

## 주요 시점

- 0–6.8초: 큰 graph에서 두 hop과 세 답을 본다.
- 6.8–8초: 같은 graph가 위로 이동하고 SQL row가 나타난다.
- 8–10.7초: Person 이름은 source/target으로, FRIENDS_WITH는 row로 대응한다.
- 10.7–17.9초: 질문이 SQL로 내려가고 Bob/Claire 값이 source에 맞는다. 네 target이 결과로 이동한다.
- 17.9–19.4초: 두 Eve 칩이 같은 위치에 모여 한 답으로 남는다.
- 19.4–21.5초: 세 답이 같은 graph의 Person으로 돌아간다.
- 21.5–23.5초: `Knowledge graph. SQL storage.`를 보여 주고 잠시 유지한다.
