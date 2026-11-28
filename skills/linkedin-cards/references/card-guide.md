# 카드 제작 reference

## 메시지와 그림

카드 map에는 `질문 → 결론 제목 → 하나의 근거 그림 → 카드에 필요한 조건 → 별도 글의 해설`을 적는다. 카드 자체로 읽을 수 있어야 하며 별도 글은 정의·방법·완전한 출처·한계와 해설을 맡는다. 모든 카드에 별도 해설 문단을 다시 붙이지 않는다.

핵심 문구와 값이 먼저 보이는 중심 위치를 정하고, 제목·그림·아래 설명에서 불필요하게 되풀이하지 않는다. 숫자가 결론을 바로 전달하면 제목에 쓸 수 있다. 같은 값의 반복은 이해에 필요한 만큼만 남기고, 아래 설명은 비교나 해석에 필요한 정보를 보탠다.

그림의 제작 방식에 관한 긴 설명은 별도 글로 옮긴다. 카드에는 독자의 해석에 필요한 `개념도` 같은 짧은 표지와 실제 주장을 제한하는 조건을 남긴다. 출처 footer와 중복되는 `원문 요약` 같은 메타 설명도 줄인다.

| 질문 | 그림 선택 | 남길 것 |
| --- | --- | --- |
| A와 B는 얼마나 다른가 | 같은 축의 paired bar/dot | 직접 집단 라벨, 값, 공통 단위·기간·분모 |
| 무엇이 가장 큰가 | 정렬된 horizontal bar | 핵심 범주와 값, 0 기준선 |
| 전체가 어떻게 나뉘나 | 100% stacked bar 또는 큰 비율 표시 | 전체 정의, 직접 범주 라벨, 합계·누락 조건 |
| 무엇이 어디에 속하나 | tree/그룹/대응 diagram | 사물과 관계의 짧은 라벨 |
| 어떤 순서로 이동하나 | 방향이 실제인 flow | 단계·전환 조건, 수치 없으면 개념도 표시 |

bar는 원칙적으로 0부터 시작한다. A/B는 같은 축·단위·분모를 쓴다. 범례보다 대상 옆 직접 라벨을 우선한다. 양을 담은 길이·면적·흐름 폭은 값에 비례시킨다. 수치 없는 diagram은 임의 크기를 수량처럼 해석시키지 않는다. 시간 투입 **비중**을 업무 **순서**라는 headline으로 바꾸지 않는다.

## 원문 수치 대응

PDF·image의 chart를 새 chart로 옮길 때만 적용하는 좁은 절차다.

1. 문항, 집단, 범주, 값, 단위·분모, 원문 위치(page/figure/행·색·위치)를 연결한 fact table을 만든다. 읽을 수 없는 값은 빈값/미확인으로 남긴다.
2. 원문의 색과 위치를 집단에 연결하고, 새 chart의 각 행·열을 fact table의 명시적 key에 대응시킨다. 배열의 순서나 추출 숫자의 나열만으로 범주를 붙이지 않는다. 생략된 숫자 슬롯 때문에 뒤 값이 다른 범주로 밀리지 않게 한다.
3. 완성 chart의 **범주–집단–값–분모**를 원문과 대조한다. 숫자의 존재·합계만으로 맞다고 판정하지 않는다. 원문에서 검증하지 못한 대응은 추측해 출판하지 않는다.

작업 source의 fact table 예:

| 문항 | 집단 | 범주 | 값 | 단위/분모 | 원문 위치 | 새 chart 위치 |
| --- | --- | --- | --- | --- | --- | --- |
| 이용 목적(가상) | A | 검색 | 60 | %, A 응답자 n=100 | p.2 fig.1, blue 첫 행 | card 2, 검색/A |
| 이용 목적(가상) | B | 검색 | 미확인 | %, B 응답자 n=100 | p.2 fig.1, sage 첫 행 | card 2, 검색/B 미표시 |
| 이용 목적(가상) | B | 결제 | 45 | %, B 응답자 n=100 | p.2 fig.1, sage 둘째 행 | card 2, 결제/B |

## 크기와 색

starter는 1080×1350, 안전 여백 72px, 제목 72px, 핵심 라벨 44px로 시작한다. 360px 축소에서는 각각 24px/약 15px다. source 28px처럼 보조 정보는 작게 둘 수 있지만 제목과 핵심 라벨은 축소본에서 읽어야 한다. 이 값은 출발점이며 문구·언어·요청 판형에 맞춰 조정하고 실제 mobile preview로 판단한다.

charcoal `#141618`, band `#24282C`, cream `#F0ECE3`, steel blue `#8CA0B8`, sage `#7DA89A`, amber `#E4B75B`, coral `#D98282`; neutral border `#686765`, muted `#A3A19C`를 유지한다. 밝은 canvas의 작은 text는 charcoal을 쓴다. 색에만 의미를 맡기지 않는다.

HTML의 각 카드에는 `.card`, 핵심 text에는 `data-readable`, 그림에는 `.chart`, 최소 출처에는 `.source`를 쓴다. CSS의 `--safe`와 카드의 `data-safe`를 함께 바꾼다. background/장식만 `data-bleed`로 여백 검사에서 제외할 수 있다. 설명을 숨기는 `overflow:hidden`으로 잘림을 감추지 않는다. SVG 안에 문자 대신 path로 그린 글자를 넣으면 자동 font/크기 검사가 되지 않으므로 시각 검토에서 확인한다.

## font 준비와 실행

skill 폴더에서 다음을 실행한다. font는 작업 output에만 저장한다. Google Fonts의 Noto Sans KR은 SIL Open Font License 1.1이며 함께 저장한 `OFL.txt`를 확인한다. font를 다른 PDF에서 추출하지 않는다. 아래 font URL이 변경되면 공식 배포 위치를 확인한다. 이미 적법하게 확보한 한글 font가 있으면 CSS의 경로·format·weight를 맞춰 연결해도 된다.

```bash
CARDS_OUT=/path/to/output
mkdir -p "$CARDS_OUT/source/fonts"
cp assets/starter/cards.html assets/starter/cards.css "$CARDS_OUT/source/"
curl -fL 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf' -o "$CARDS_OUT/source/fonts/card-sans.ttf"
curl -fL https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/OFL.txt -o "$CARDS_OUT/source/fonts/OFL.txt"
npm install --prefix "$CARDS_OUT/runtime" playwright
"$CARDS_OUT/runtime/node_modules/.bin/playwright" install chromium
python3 -m pip install Pillow
NODE_PATH="$CARDS_OUT/runtime/node_modules" node scripts/export_cards.cjs --input "$CARDS_OUT/source/cards.html" --out "$CARDS_OUT/png"
python3 scripts/qa_png.py "$CARDS_OUT/png" --out "$CARDS_OUT/preview"
```

font 출처: [Google Fonts Noto Sans KR](https://github.com/google/fonts/tree/main/ofl/notosanskr). source/CSS, font/license, fact table(원문 재구성 시), 설명 글과 재생성 명령을 output에 보관한다. starter의 가상 data·문구는 실제 제작 시 교체한다.

exporter 옵션: `--browser /path/to/chrome`으로 설치 browser 지정, `--expected-cards N`으로 장수 확인, `--width W --height H`로 사용자 판형 확인, `--min-readable PX`로 `data-readable` text의 실제 출력 글자 크기 기준 조정, `--font-family 'Card Sans'`로 연결한 font 지정, `--expect-text '한글 제목'`으로 실제 핵심 문구 확인(반복 가능). 한글이 있는 card는 지정 font가 해당 text node의 첫 font인지와 한글 sample을 load했는지 검사한다. 이 검사가 모든 glyph의 모양을 보장하지는 않는다.

`export.json`은 font 상태, text, 실제 크기와 문제를 기록한다. 실패 시 PNG를 만들기 전에 종료하므로 수정 후 다시 실행한다. output 폴더에 기존 `card-NNN.png`가 있으면 먼저 별도 폴더를 쓰거나 명시적으로 정리한다. 이전 세트와 섞지 않는다.

helper 옵션: `--expected-cards N`, `--width W --height H`, `--mobile-widths 360,390`, `--group-size 4`(1–6). 결과는 `qa.json`, `mobile/card-NNN-360.png`, `mobile/card-NNN-390.png`, `contact-sheet-001.png` 등이다. 긴 세트도 묶음별로 열어 보고 모든 원본 PNG와 mobile preview를 검토한다. 자동 검사는 픽셀 크기와 DOM 상태를 확인할 뿐 사실 대응이나 모바일 가독성을 대신하지 않는다.
