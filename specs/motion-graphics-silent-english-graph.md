# 무음·영어 모션그래픽과 Graph DB 영상

상태: 전체 영상 범위 수정·구현 대기, 기존 친구 사례의 파일·사실 검증 완료 (2026-11-28)

## 사용자 요청과 확정 조건

- 소리를 아예 제거한다. 오디오 트랙 없는 MP4를 납품하는 것으로 해석한다.
- 대상은 영어를 이해하는 사람이며 영상의 제목·라벨·짧은 설명을 영어로 만든다. 기존의 어느 정도 기술을 아는 독자 조건은 유지한다.
- 움직임과 짧은 영어 설명이 함께 내용을 전달한다. 각 장면의 무엇·왜를 설명하는 문구가 계속 보이고 장면에 맞춰 바뀐다. 이름·값·질문을 대상 곁에서 짚고 긴 문단은 피한다.
- 가로:세로4:5, 1080×1350·30fps를 유지한다. 내용 전체를 담는 데 필요한 길이로 구성하며 몇 분도 허용한다. 기존 10~30초 상한과 20~25초 목표는 최신 요청으로 폐기됐다.
- Graph DB가 유용한 때와 기존 방식으로 충분한 때를 설명하는 영상을 만든다. 영어 제목 몇 가지를 먼저 사용자와 맞춘 뒤 진행한다.

## 변경 전 구조와 변경 범위

변경 전 motion-graphics는 audio.bed/events를 합성해 AAC로 MP4에 넣었다. 지침과 예제는 한글이며, 사용자 피드백으로 cache 견본을10.5초로 줄이고 정렬을 수정한 상태였다.

무음·영어 정책에 맞춰 지침·exporter·검사·예제의 일관성을 바꾸고, 새 Graph DB 사례를 만든다. 영상별 자유composition과 공통exporter 경계는 유지한다.

## 제목 후보

- A: Do You Need a Graph Database? — 짧고 중립적인 질문형, 추천.
- B: When to Use a Graph Database—and When Not To — 주제를 가장 직접 설명하며 화면 제목은 길어진다.
- C: Not Every Relationship Needs a Graph Database — 관계가 있다는 이유만으로 Graph DB를 고르는 오해를 짚는 관점형.

## 열린 결정

| ID | 결정 | 상태 |
| --- | --- | --- |
| D1 | Knowledge Graphs Don’t Require Graph Databases | 사용자 최종 제작 승인 |
| D2 | 친구의 친구, 같은 SQL 관계로 같은 답을 반환 | 사용자 최종 제작 승인 |
| D3 | Knowledge graph. SQL storage. | 사용자 최종 제작 승인 |
| A1 | MP4에 오디오 트랙 자체를 넣지 않음 | 사용자 요청에 따른 agent 결정 |
| A2 | 기술 조건·영어·정렬·속도 검증 | 확정 방향, 세부 구현은 제목/장면 확인 후 |

## 정확성 기준

관계형 DB도 join과recursive CTE로 관계·경로를 다룰 수 있다. 관계가 많거나join이 있다는 사실만으로Graph DB가 필수라고 말하지 않는다. 데이터 모양만 아니라 질의 패턴·반복 탐색·구현 복잡도·운영 비용을 보고 선택한다. 성능 수치를 측정하지 않고 우열을 암시하는 경주 연출은 쓰지 않는다.

## 제목 방향에 대한 추가 요청

사용자는 “날리지 그래프에 그래프 데이터베이스가 필요한 것은 아니라는 제목”을 제안했고, Graph DB가 항상 필요하거나 항상 최선인지 최근 논문으로 조사해 달라고 요청했다. 기존 Direct lookup vs path 탐색 장면은 아직 채택되지 않았다. 무음·영어 전환과 영상 구현은 제목·내용을 맞춘 뒤 진행한다.

추천 제목 초안: Knowledge Graphs Don’t Require Graph Databases. 엄밀한 설명에서는 전용 graph-native 저장소와 relational/hybrid 기반 구현을 구분한다.

## 최근 연구 근거 (2026-11-28 원문 확인)

### QuaQue — DBKDA 2026

[논문 원문](https://arxiv.org/html/2603.18654v1), [학회 게재 기록](https://www.thinkmind.org/library/DBKDA/DBKDA_2026/dbkda_2026_1_60_50023.html).

버전 있는 RDF KG를 PostgreSQL15에 저장하고 SPARQL을 SQL로 변환한다. BEAR-B-day의3종 query에서 JenaTDB2보다 약6~14% 짧은 질의 시간을 보고했으나 저장 공간은4,707.63MB vs694.39MB로 약6.8배다. 12vCPU/64GB, 각200회 실행에서 warm-up50회 제외한150회 평균. KG의 관계형 구현과 특정 작업의 성능 이점은 입증하지만 PostgreSQL 일반 우위는 아니다.

### Information-Needs-Guided Virtual Knowledge Graph Enrichment via Large Language Models — IJCAI2026 main track

[공식 proceedings](https://ijcai.org/proceedings/2026/448), DOI10.24963/ijcai.2026/448.

기존 relational source를 복사하지 않는 VKG 위에서 ontology/mapping을 보강하는 연구다. 두 실제 VKG에서 평가했다. 전용 graph 저장소가 KG의 필수 전제는 아니라는 사례이며, 이 논문의 실험을 DB 성능 비교라고 부르지 않는다.

### RelGo — PACMMOD2024 / SIGMOD2025

[원문](https://arxiv.org/html/2408.13480v3), DOI10.1145/3698828.

관계형과 graph 최적화를 결합한다. LDBC 및 IMDB의 일부 query에서 개선을 보고하지만 graph index와 추가 optimizer를 쓴다. KG ontology 추론 실험이 아니며, 일반 DuckDB가 모든 graph DB보다 빠르다는 근거로 쓰지 않는다.

### Chimera — PVLDB18(2),2024

[원문 PDF](https://www.vldb.org/pvldb/vol18/p279-lee.pdf), DOI10.14778/3705829.3705845.

PostgreSQL과 graph topology 저장소를 결합한 hybrid다. LDBC SNB 및 microbenchmark에서 traversal/join 결합의 이점을 보여주며, property filtering의 선택도가 높은 조건에서는 join이 유리한 결과도 있다. 순수 relational 구현이나 KG 전체의 비교로 해석하지 않는다.

### GRBench — 2026-08-31 arXiv preprint

[원문](https://arxiv.org/html/2608.31027v1).

SciSciNet-v2의 graph-relational workload를 비교한다. 조건과 query 유형에 따라 OrientDB/DuckPGQ/Kùzu 등의 우위가 달라진다. ontology reasoning이 아닌 property graph 실험이다. 기본 thread 설정이 달라 동등 CPU 비용 비교로 보지 않으며, 학회 게재 확정 논문이라고 소개하지 않는다.

## 증거 해석

- 지지되는 주장: KG에 전용 Graph DB는 필수가 아니다. 질의·변경·운영·저장 비용을 포함하면 항상 최선인 한 저장 방식도 없다.
- 지지하지 않는 주장: Graph DB가 최선인 경우가 없다, relational DB가 전반적으로 더 낫다, 관계형 테이블만 만들면 자동으로 KG가 된다.
- 영상에서는 ID·type·관계 의미·mapping을 보여 줘야 한다. 데이터 이동·복제 없이 같은 원본을 KG로 접근할 수 있다는 VKG 예시가 제목에 직접 부합한다.
- 연구에 보고된 benchmark를 검토했으며 직접 재실행하지 않았다. GraphRAG 답변 품질을 DB 성능 근거로 사용하지 않았다.

## 장면 제안 — KG-STORY-03

사용자에게 설명할 약15~18초의 영어·무음 구성. 이 제품 사례는 검토 후 친구의 친구 사례로 교체됐다.

1. 기존 SQL의 Products(A,part=P), Parts(P,supplier=S), Suppliers(S,name=North)가 화면에 나타난다. 가상 데이터다.
2. 미리 정의한 semantic mapping을 통해 같은 ID와 값이 위쪽 typed knowledge model로 표현된다: Product A —INCLUDES→ Part P —SUPPLIED_BY→ Supplier North. 아래 SQL rows는 사라지지 않는다. field→predicate 대응도 움직임으로 짚는다.
3. `Who supplies A’s parts?`를 묻고 query가 mapping을 통해 SQL로 내려간다. P와 S의 일치 칸이 각각 연결·선택되고 North가 결과로 올라와 model의 공급사와 함께 강조된다. graph 그림만 만든 게 아니라 질의에 답했음을 보여 준다.
4. 두 표현을 함께 유지하며 `Knowledge graph. SQL storage.`로 끝낸다. 별도 Graph DB는 등장시키거나 빨간 X를 붙이지 않는다.

독립 검토에서 `Who supplies Product A?`는 완제품 공급사를 묻는 반면 데이터는 부품 공급사이므로 의미 불일치를 지적했다. 질문을 `Who supplies A’s parts?`로 바꿔 수용했다. table이 저절로KG가 된다는 오해를 막도록 명시적 mapping 대응을 보여 준다.

짧은 영상에서는 이 한 가지 증명에 집중하는 안을 추천한다. Graph DB가 유리해지는 조건까지 같은 영상에 넣을지는 사용자 선택으로 남긴다.

## 최종 확정 — 친구의 친구

사용자는 쉬운 친구의 친구 사례를 선택하고, 영어·완전 무음·4:5·약20~25초로 같은 관계와 답을 SQL에서 얻는 구성을 “이 구성으로 제작해줘”라고 승인했다. 후속으로 첨부한 reference skill은 참고용이며 전체 이식 요구가 아니다.

- 제목: Knowledge Graphs Don’t Require Graph Databases.
- Person: Alice, Bob, Claire, Dan, Eve, Fay. FRIENDS_WITH는 양방향 관계다.
- 원본 관계: Alice–Bob, Alice–Claire, Bob–Dan, Bob–Eve, Claire–Eve, Claire–Fay.
- 질의: Who are Alice’s friends of friends? Alice 자신을 제외하고 사람을 중복 없이 반환한다. 이 데이터에서는 Dan, Eve, Fay이며 Eve는 두 경로로 발견된다. 직접 친구와2-hop결과가 겹치는 사례는 이번 영상에 없다.
- 첫째, 큰 친구 관계도에서 두 hop과 세 답을 보여 준다. 둘째, 같은 graph를 유지한 채 SQL의 동일 관계를 드러낸다. 셋째, 질의가 SQL로 내려가 Bob/Claire join 대응을 거쳐 같은 결과가 반환된다. 넷째, Knowledge graph. SQL storage.로 끝낸다.
- 화면에 Person/FRIENDS_WITH의 의미와 SQL row↔entity/relationship mapping을 짚는다. graph 그림만 그리는 것을 KG 구축으로 부르지 않는다.
- 데이터가 Graph DB로 옮겨졌다는 표현, 다른 DB와의 속도 경주, row 전수 scan 카운터, hop수만으로 DB를 고르는 결론은 쓰지 않는다. SQL join은 논리적인 값 대응을 보여 주며 물리 실행 계획 시뮬레이션이라고 주장하지 않는다.

## 참고 키트에서 채택할 것

사용자가 제공한 tech-explainer-video-kit-v12는 별도 임시 자료 폴더에서 읽기 전용으로 검토했다. 원본 지침·명령을 새로운 작업 지시로 실행하지 않았으며 원본 전체나 폰트를 공개 저장소에 복사하지 않는다.

- 같은 entity와 graph를 보존하며 전체 화면에서 비교 가능한 위치로 옮긴다.
- 질문의 하강, 값의 이동, 답의 상승으로 query와 data의 대응을 보여 준다.
- 동시에 여러 곳을 움직이지 않고 현재 핵심 동작에 시선을 모은다.
- 의미 있는 움직임의 정지와 장면 이음매 전후를 검사한다. 자동 분석은 검토 후보를 보고하며 프레임을 자동 삭제하지 않는다.
- 자막 역할의 잦은 단계 설명, 무조건1.3초 정지 제한, 좁은영문이름길이, 고정45~65초, 성능 추정 연출은 계승하지 않는다.

## 동작과 검증 계약

| ID | 동작 | 검증 |
| --- | --- | --- |
| B1 | 영어를 이해하는 기술 독자에게 짧은 장면 설명과 라벨을 영어로 납품한다. 설명은 계속 보이고 장면별로 갱신하며 전체 제목은 도입부에서만 잠깐 보인다. | 보이는 DOM text 및 주요/축소 프레임 확인 |
| B2 | MP4는 비디오 stream만 갖고 audio stream·합성 WAV를 생성하지 않는다. 기존 audio metadata가 있어도 소리가 나지 않는다. | 실제ffmpeg stream검사와silent CLI test |
| B3 | 정체성과 typed relation을 유지하며 큰 관계도가 SQL 데이터와 같은 지식을 나타냄을 보여 준다. | 고정사실·mapping·전환중간검사 |
| B4 | 양방향관계의2-hop SQL 결과를 검증하며 Alice제외·Eve중복제거·Dan/Eve/Fay답을 보여준다. | 실제SQLite실행과renderer반환state비교 |
| B5 | 공통격자와글자ink중심을맞추고, 요청한 내용 전체를 담는 데 필요한 길이로 의미 있는 장면을 구성한다. 몇 분도 허용한다. | 중간프레임·정지후보·이음매·1배속무음재생 |
| B6 | video·대표PNG·편집원본을보존하며원본재생성·자산누락검사를유지한다. | 전체decode·source독립재생성·기존CLI테스트 |

## 구현 판단

기존 absolute-time renderAt(t)와 공통 exporter는 유지한다. 음원 합성/결합 경로는 제거하고 -an으로 video-only 인코딩한다. 이전 audio 설정은 출력 원본에서 제거하고 silent 정책을 우회하지 못하게 한다. 영어 검수에 한글 폰트가 필수이지 않도록 font 선택 조건을 바꾼다. pacing 분석은 기존 렌더 프레임을 이용한 가벼운 보고이며 자동컷 엔진·다중 렌더러를 추가하지 않는다.

## slice

| ID | 범위 | 증명 | 상태 |
| --- | --- | --- | --- |
| S1 | silent exporter·영어 지침·영어 예제 | 기존 audio metadata를 포함한 실제 CLI에서 비디오 only 확인 | 구현·자동 검증 완료 |
| S2 | 친구KG/SQL영상 | 실제SQL정답과장면값대응·중복제거·최종MP4 | 구현·파일·사실 검증 완료 |
| S3 | 정렬·속도·재생성·독립 검토·설치 | 1배속재생·수정범위재검토·PR와로컬설치동기화 | 독립 검토·통합 대기, 실시간 재생 미확인 |

기존 cache 원본은 사용자 요청에 따라 영어·무음으로 새로 렌더한다. 공통 runtime 동작 변경에는 실제 end-to-end 검사를 적용한다. 다른 skill 파일은 변경하지 않는다.

## 후속 범위 확정 — MP4 기본 납품 (2026-11-28)

사용자 “스킬도 gif 만드는 스킬 필요없어. mp4 로 만들어주는 스킬로 가면 될듯 해.”를 적용한다. `motion-graphics`의 기본 산출물은 무음 MP4다. GIF는 기본 생성하지 않으며, 명시적으로 요청한 경우 완성 MP4를 일회성 변환한다. 별도 GIF skill을 만들지 않고, 앞선 명시적 요청으로 만든 GIF도 삭제하지 않는다.

KG 사례의 정확성 설명은 `assets/kg-friends/EXAMPLE.md`에 두고, 공통 skill에는 객체·관계의 연속성, 정렬, 관찰 시간과 실제 재생 검수 기준을 유지한다. 오디오 합성 module은 현재 skill에 없으며 exporter에서 음원을 생성하거나 결합하는 호출도 없다. 이전 `audio` metadata는 무시하고 내보낸 원본에서 제거한다.

## 실제 검증 기록 (2026-11-28)

- `MOTION_RENDER_SMOKE=1 skills/motion-graphics/.venv/bin/python specs/motion-graphics-redesign-tests/test_cli.py -v`: 7개 test 통과, 22.629초. 실제 Chrome/ffmpeg export와 내보낸 source의 별도 process 재생성을 포함한다. 기존 audio metadata가 있어도 MP4 audio stream은 0개이며, 내보낸 composition에서 audio를 제거한다. exporter가 전에 만든 `audio.wav`만 정리하고 다른 녹음 파일은 보존한다. 자산 등록·load 실패, 비율·시간·숫자 제약과 advisory pacing report도 검증했다.
- `uv run --with pyyaml python <skill-creator>/scripts/quick_validate.py skills/motion-graphics`: `Skill is valid!`.
- cache, counterparts, kg-friends, order-entry의 composition을 실제 CLI `--check-only`로 검사해 모두 통과했다. 별도 Chrome process로 45개 keyframe의 DOM text를 읽었다. 제목·라벨·문구는 영어이며 한글 출력과 audio metadata가 없었다. source의 주석과 작업 보고는 한국어를 유지한다.
- `node skills/motion-graphics/assets/kg-friends/validate_scene.cjs <검수 폴더>`: 16개 keyframe, ink 안전 여백, Claire 최소 45.88px, 순서를 바꾼 state/PNG 일치를 확인했다. `validate_facts.py --scene-report <검수 폴더>/semantic-validation.json`에서 SQLite의 Bob→Dan/Eve, Claire→Eve/Fay 경로와 renderer state를 대조했다. Alice 제외와 DISTINCT 적용 후 답은 Dan·Eve·Fay다.
- 앞선 최종 KG MP4를 다시 전체 decode하고 audio stream 0개, H.264/yuv420p, 1080×1350, 30fps, 23.5초를 확인했다. 현재 scene/facts/composition은 해당 MP4의 재생성 source와 일치한다. MP4 SHA-256은 `e298d40b838528a5c46f0e8e152fb72d24eeab7332f6cfb7c735f7aeb8b5ab4b`다. 앞선 독립 source 재생성 기록은 MP4 bytes·대표 PNG·705프레임 일치를 보고하며, 이번 확인에서는 그 기록의 hash와 현재 파일을 대조했다. 이번에 KG 전체 영상을 다시 렌더한 것은 아니다.
- cache composition을 기본 해상도로 실제 export했다: H.264/yuv420p, 1080×1350, 30fps, 10.5초, 315프레임, 259,564 bytes, audio stream 0개, 전체 decode 통과. 390px 대표 프레임에서 영어와 key/value 정렬을 확인했다. 20개 호출 순서 비교에서 의미 상태는 같았다. PNG는 7개 비교에서 panel 가장자리의 18~36픽셀이 최대 channel 차이 5를 보였다(일치 비율 99.9975% 이상). 눈에 보이는 내용·위치 변화는 관찰하지 못했으며 이 미세 raster 차이의 원인은 확정하지 않았다. exact PNG 일치로 보고하지 않는다.
- `git diff --check`: 통과. 생성 MP4·PNG·검수 JSON은 ignored `.venv/validation-run-2026-11-28/`와 기존 납품 폴더에만 두고 공개 source에 추가하지 않았다.

## 남은 검수와 통합

실시간 1배속 재생 검수는 완료하지 못했다. 로컬 미리보기의 browser URL policy로 재생을 열 수 없었으며, 이를 다른 경로로 우회하지 않았다. 자동 decode·시점·정지 후보 검사와 축소 프레임 검토를 재생 리듬 또는 시청자 이해도 검증으로 보고하지 않는다. 원본의 11.25초 질문/Fay, 20.2초 질문/Eve 이동 중 겹침은 확인됐고, 정착한 장면은 읽힌다.

독립 reviewer의 검토, PR·merge와 설치된 skill 동기화는 메인이 진행한다. 여기서는 다른 checkout이나 설치 경로를 바꾸거나 commit·push하지 않았다.

## 최신 범위 수정 — 전체 내용과 장면별 설명 (2026-11-28)

사용자 “지금은 그 일부만 제작한거지? 23초가아니라 몇 분 되어도 상관없어 내용이 다 담겨야하니까. 그리고 글 설명은 영상에 짧게 계속 떠야지, 맨 상단에 knowledge graphs don't require graph databases 저거 계속 떠잇을 이유가 전혀 없어보임”을 적용한다.

기존 23.5초 영상은 친구의 친구를 SQL로 질의하는 일부 사례다. 전체 요청의 완료로 보고하지 않는다. 새 전체 영상은 KG와 Graph DB의 구분, Graph DB가 유용한 조건, 기존 SQL로 충분한 조건과 저장 방식 선택을 담는다. 기존 10~30초 검증 상한과 20~25초 구성 목표, 라벨 위주로 제한한 설명 정책은 현재 범위에 적용하지 않는다.

skill은 내용에 따라 길이를 정하며 몇 분도 허용한다. exporter는 최소 한 프레임을 만드는 양의 유한 duration을 받아들이며 30초 상한을 제거한다. 짧은 clip의 기본 representativeTime도 0 이상으로 유지한다. 짧은 영어 설명은 각 장면에서 무엇을 보여 주고 왜 중요한지 안내하며, 장면에 따라 계속 갱신한다. 큰 전체 제목은 도입부에만 잠깐 보인다. 움직임·짧은 설명·정렬·무음 MP4·4:5 조건은 유지한다.

이 수정에서는 기존 예제와 납품 영상을 다시 구성하거나 렌더하지 않는다. 전체 영상의 장면 설계와 제작은 메인이 별도 작업으로 진행한다. 앞선 파일·사실 검증 기록은 당시 사례와 source에 대한 증거로 보존하며 최신 전체 영상의 검수 결과로 사용하지 않는다.

최신 exporter 수정 후 `MOTION_RENDER_SMOKE=1 skills/motion-graphics/.venv/bin/python specs/motion-graphics-redesign-tests/test_cli.py -v`를 다시 실행해 7개 test가 22.882초에 통과했다. 120초 composition과 기본 대표 시점을 사용하는 1초 composition은 `--check-only`로 승인되며, 0·음수 duration과 한 프레임 미만의 입력은 거절된다. Boolean/nonfinite 입력과 실제 무음 MP4 export·source 재생성 검증도 통과했다. 몇 분짜리 영상 자체를 이 정책 수정에서 새로 인코딩한 것은 아니다. `quick_validate.py`와 `git diff --check`도 통과했다.

## 독립 검토 후 수정·재검증 (2026-11-28)

- R1: representativeTime을 생략한 1초 composition에서 Python은 0초를 기록했지만 Chrome capture는 -1초를 렌더했다. 새 실제 CLI test로 수정 전 실패를 재현하고, capture의 기본값을 `Math.max(0, duration - 2)`로 맞췄다. 수정 후 40×50·10fps·1초의 작은 MP4와 source 재생성을 실행했다. 두 representative state가 모두 `{t: 0}`이며 대표 PNG hash, 무음 stream 검사와 전체 decode가 통과했다.
- R2: frame 파일의 사전순 정렬이 `10000.png`를 `9999.png` 앞에 놓았다. 숫자 구간을 자연순으로 정렬해 숫자 stem과 `frame-10000` 같은 이름을 모두 처리한다. 네 개의 1px PNG로 자릿수 경계를 넘는 회귀 test를 만들고, 수정 전 잘못된 변화 시점을 재현했다. 수정 후 test가 통과했다. reviewer의 10,002프레임 fixture도 다시 분석해 30fps에서 변화 시점 하나를 333.333333초로 확인했다(수정 전 33.366667·33.433333초). 이 분석은 기존 PNG를 읽었으며 영상을 새로 렌더하지 않았다.
- R3: 기존 예제는 움직임·데이터 대응 참고용이며 고정 제목·배치·길이를 그대로 복사하지 않도록 core에 명시했다. KG 예제 문서는 전체 설명의 일부인 vignette라고 표시했다. 역사적인 scene과 납품 영상은 변경하지 않았다.
- 수정 후 `MOTION_RENDER_SMOKE=1 skills/motion-graphics/.venv/bin/python specs/motion-graphics-redesign-tests/test_cli.py -v`: 9개 test 통과, 26.608초. `quick_validate.py`와 `git diff --check`도 통과했다. 새 snapshot과 hash를 메인에게 전달해 독립 재검토를 요청한다.

## 독립 재검토와 최신 영상 방향 (2026-11-28)

수정 snapshot `56335d3397f4c9bb83a2257a31afc85d9a737533113ed6a5ea00eb8fb2492cef`의 18개 파일 hash를 reviewer가 대조했다. 대표 시점 회귀 test와 다섯 자리 frame 정렬 회귀 test를 독립 실행해 통과했고, 10,002개 frame에서 변화 시점 333.333333초 하나를 확인했다. 메인은 R1·R2 해결과 기존 예제의 참고 범위 설명을 수용해 skill 통합을 진행한다. 이 판정은 별도로 제작 중인 장편 영상의 검수 완료를 뜻하지 않는다.

사용자는 지식 그래프와 Graph DB를 구분하고, 기존 시스템 위의 virtual graph·semantic layer를 중심으로 통합·관리 및 조건부 성능 이점을 설명하도록 전체 영상 재제작을 요청했다. 전용 Graph DB의 필요 조건은 별도 구간으로 분리한다. 성능의 보편적 우위를 주장하지 않고 source-side 처리와 실제 workload 측정을 구분한다. 이 방향은 이번 영상의 내용이며 재사용 skill의 모든 주제에 강제하지 않는다. 전체 영상은 별도 납품 폴더에서 제작·검증한다.
