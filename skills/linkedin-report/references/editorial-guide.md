# 리포트 편집 규칙

## page map

독자가 이해할 순서로 주장을 묶는다. 아래 유형을 내용에 맞게 조합한다.

| 유형 | 맡는 일 | 편집 |
| --- | --- | --- |
| cover | 대상과 읽을 이유 | 짧은 제목, 범위, 날짜. 장식보다 타이포 위계 |
| 발행 글 / summary | 왜 읽어야 하는지, 핵심 발견 | 짧은 논리 단락과 근거 수치. 수치 묶음만 나열하지 않기 |
| 배경 / method | 무엇을 어떤 조건으로 봤는지 | 모집단·기간·분모·제외 조건·한계. 실제 수행한 것만 |
| section | 다음 질문으로 전환 | dark canvas, 질문과 의미 있는 요약. 과도한 divider는 생략 |
| 분석 본문 | 하나의 주장을 증명 | headline, chart, 인접 해설과 source |
| comparison | 같은 기준에서 차이 설명 | 같은 축·기간·분모, 직접 라벨, 차이의 해석 |
| 인용 | 관점의 맥락 | 원문 확인, attribution과 조건. 장식용 가짜 quote 금지 |
| conclusion | 독자의 다음 판단 | 발견에서 이어지는 행동, 우선순위와 남은 질문 |
| appendix / references | 검증과 재사용 | 상세 data·정의·출처. 본문 근처 source도 유지 |

요약과 결론은 같은 문장을 반복하지 않는다. 요약은 발견을, 결론은 발견이 바꾸는 판단을 설명한다. headline에는 결론을 쓰되 자료가 뒷받침하는 강도로만 말한다.

## page의 읽기 흐름

- 상단의 작은 section label과 선이 위치를 알려준다. headline은 본문보다 확실히 크게, 핵심 근거는 충분한 공간을 준다.
- 하나의 page에서 여러 질문이 경쟁하면 나눈다. 중요한 chart 옆에 정의나 해설을 붙여 독자가 본문과 범례 사이를 오가지 않게 한다.
- chart 아래에서 수치를 다시 읽어주기보다 왜 중요한지, 어떤 다른 설명이 가능한지 적는다. 원인 추론이 없는 관찰 자료는 인과로 쓰지 않는다.
- 넉넉한 여백과 가는 구분선을 기본으로 쓴다. card, 둥근 box, icon과 badge는 구조를 설명할 때만 쓴다. 기본 본문은 연속된 편집 지면이다.
- footer는 짧은 보고서명과 page 번호로 통일한다. 실제 작성자나 발행 정보가 없으면 가상의 조직으로 채우지 않는다.

## palette와 typography

`assets/editorial-palette.json`의 색상 값을 유지한다. 과거 영상의 화면 위/아래 red/blue 배치는 보고서의 기본 역할이 아니다.

| 색상 | 기본 용도 |
| --- | --- |
| charcoal `#141618` / band `#24282C` | cover, section, 본문 text, dark panel |
| cream `#F0ECE3` | 본문 canvas, dark page text |
| steel blue `#8CA0B8` / sage `#7DA89A` | chart 계열, 관계와 비교. 밝은 canvas의 작은 text에는 charcoal 사용 |
| amber `#E4B75B` / coral `#D98282` | 특정 행동·주의·변화의 의미를 추가할 때 |
| border `#686765` / muted `#A3A19C` | 구분선, dark page 보조 text. 밝은 면에서는 가독성을 확인 |

색상만으로 의미를 나누지 않는다. 직접 라벨, 값, 선 종류와 문장으로 보완한다. 밝은 accent 면에는 dark text를 사용한다.

A4 starter의 기본값은 제목 28–34pt, 본문 13pt, chart label 12pt, source 9.5pt다. 범용 최소 크기 규칙이 아니라 출발점이다. 한국어 줄바꿈, 긴 영문 이름, 긴 URL을 실제 출력에서 본다. 주요 정보가 mobile에서 읽히지 않으면 제목과 라벨을 키우거나 정보량을 줄인다. 전체 A4를 390px 폭으로 축소하면 본문은 확대가 필요하므로, PDF viewer의 확대 상태까지 함께 확인한다.

starter는 한국어를 지원하는 적법한 TTF/OTF를 작업 output의 `fonts/`에 넣고 `@font-face`로 연결한다. OS font만 사용하면 환경에 따라 Chromium이 Type3 glyph와 특수 공백으로 출력해 embedding·검색·추출 품질이 달라질 수 있다. 다른 문서에서 추출한 font를 재배포하지 않는다. browser의 `document.fonts.ready` 이후 PDF를 출력하고 embedding과 한글 glyph를 검증한다. custom template에 이미 검증된 font가 있으면 그 설정을 유지한다.

## font 준비와 재생성

starter CSS는 `fonts/report-sans-regular.ttf`와 `fonts/report-sans-bold.ttf`를 읽는다. font를 넣기 전 export가 실패하는 것은 의도된 load 검증이다. 직접 확보한 한글 font를 이 경로에 복사하거나 CSS의 font 경로·형식·weight를 바꾼다. sample은 Google Fonts의 Noto Sans KR variable TTF에서 regular/bold static face를 만들어 사용하며, 원본 보고서에서 추출한 font가 아니다. macOS Chromium에서는 OS font, variable TTF, CFF OTF가 Type3로 출력될 수 있어 검증된 static TrueType face를 권장한다.

아래는 skill 폴더에서 실행하는 전체 재생성 예다. output에는 source와 font license를 함께 보관하고 public skill에는 font 파일을 넣지 않는다. 다운로드 도구 `curl`과 네트워크, static 변환용 Python package `fonttools`가 필요하다 (`python3 -m pip install fonttools`). 이미 검증된 static TTF가 있으면 다운로드·변환 대신 복사한다.

```bash
REPORT_OUT=/path/to/output
mkdir -p "$REPORT_OUT/source/fonts"
cp assets/starter/report.html assets/starter/report.css assets/starter/sample-data.json "$REPORT_OUT/source/"
curl -fL 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf' -o "$REPORT_OUT/source/fonts/noto-variable.ttf"
curl -fL https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/OFL.txt -o "$REPORT_OUT/source/fonts/OFL.txt"
python3 -m fontTools.varLib.instancer "$REPORT_OUT/source/fonts/noto-variable.ttf" wght=400 --update-name-table --output "$REPORT_OUT/source/fonts/report-sans-regular.ttf"
python3 -m fontTools.varLib.instancer "$REPORT_OUT/source/fonts/noto-variable.ttf" wght=700 --update-name-table --output "$REPORT_OUT/source/fonts/report-sans-bold.ttf"
node scripts/export_pdf.cjs --input "$REPORT_OUT/source/report.html" --output "$REPORT_OUT/report.pdf"
python3 scripts/qa_pdf.py "$REPORT_OUT/report.pdf" --out "$REPORT_OUT/qa" --expected-pages 8 --expect-text '주문 운영의 병목' --mobile-pages 1,5,6
```

font 출처: [Google Fonts Noto Sans KR](https://github.com/google/fonts/tree/main/ofl/notosanskr). license: SIL Open Font License 1.1, 저장한 `OFL.txt` 확인. 다운로드 URL은 변경될 수 있으므로 실패하면 공식 배포 위치를 확인한다. PDF에 font를 embed하는 것과 font 파일을 재배포하는 조건은 구분한다. 변환 후 glyph를 새로 그리지 않고 같은 HTML/browser print를 사용한다.

## chart와 근거

- 비율 비교는 bar, 두 조건의 변화는 paired bar/dot, 구성비는 stacked bar, 관계·흐름은 diagram을 쓴다. 모양보다 질문이 chart를 정한다.
- bar는 원칙적으로 0부터 시작한다. 다른 축을 쓰면 이유와 범위를 드러낸다. 비교 panel의 축·정렬·단위·분모를 맞춘다.
- chart 제목 옆이나 아래에 기간, `n`, 단위와 다중 응답 여부를 적는다. 가능하면 legend보다 대상 옆의 직접 라벨을 쓴다.
- 흐름 폭과 면적이 양을 뜻하면 실제 값에 비례한다. 수치가 없는 conceptual diagram은 그렇게 표시하고 임의 수량처럼 보이지 않게 한다.
- 표본 수가 작은 비교를 모집단 전체로 일반화하지 않는다. 유의성 검정을 하지 않았으면 유의성을 주장하지 않는다. 누락과 반올림도 적는다.
- source는 해당 근거 가까이에 짧게 쓰고 references에 완전한 정보를 둔다. 실제 URL에는 clickable link를 넣는다. 내부 자료는 접근 가능한 범위에서 제목·작성일·위치로 식별한다.

## starter와 script 사용

starter는 디자인과 검증을 시험하는 **가상 주문 운영 data** 예제다. 각 page는 `<section class="page">`, 내부 본문은 `.page-body`, footer는 `.page-footer`를 쓴다. `.page`의 A4 크기와 `@page` 크기를 함께 조정한다. page 내용을 숨기는 `overflow:hidden`으로 잘림을 감추지 않는다.

`export_pdf.cjs`는 같은 HTML을 Chromium print로 출력하고 `report.export.json`에 DOM 측정 결과를 남긴다. 내용이 page 경계 밖으로 나가거나 scroll overflow가 있으면 종료한다. custom HTML에서는 측정 marker를 추가하거나 대응 방식으로 실제 PDF를 더 자세히 검토한다. 이 검사는 모든 유형의 가려짐·겹침을 찾지 못한다.

`qa_pdf.py`는 다음을 남긴다.

- `qa.json`: page 수·size·텍스트 추출·font embedding·link·page 경계 확인
- `extracted-text.txt`: PDF에서 추출한 text. 검색과 선택 가능 여부의 자동 증거
- `pages/page-NN.png`, `contact-sheet.png`: 전체 page 시각 검토
- `mobile/page-NN-390.png`: full-page mobile 크기
- `mobile/page-NN-detail-390.png`: 본문 중앙을 확대한 읽기 상태

`--expect-text`는 반복해서 줄 수 있다. 실제 headline과 한글 문구를 지정한다. link가 없는 보고서라면 `--allow-no-links`로 의도를 드러낸다. 자동 QA는 font와 link의 존재를 확인할 뿐 원문의 정확성, 의미, 시각 품질이나 외부 URL의 응답을 보장하지 않는다.
