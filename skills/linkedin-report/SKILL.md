---
name: linkedin-report
description: 전문적인 LinkedIn용 PDF 리포트를 만들거나 고친다. "LinkedIn 리포트 만들어줘", "조사 내용을 PDF 리포트로", "이 보고서처럼 편집해줘" 요청에 쓴다. A4 세로형의 근거 중심 편집, 차트, 출처와 읽기 품질을 다루며 영상 제작이나 일반 발표 deck에는 쓰지 않는다.
---

# LinkedIn Report

독자가 근거를 확인하며 읽을 수 있는 PDF 리포트와 수정 가능한 source를 만든다. 한 page가 하나의 핵심 질문이나 주장을 맡고, **결론 headline → 근거 chart/diagram → 짧은 해설 → 출처**로 이어지게 편집한다. card 모음이나 발표 slide로 축약하지 않는다.

## 범위와 근거

- 언어는 현재 요청을 따른다. 지정이 없으면 한국어다. A4 세로를 기본으로 삼되 사용자 template, 판형, 목적에 맞춰 조정한다. page 수는 내용이 정한다.
- 조사 자료가 없으면 조사 보고서의 외형만 빌려 숫자·인용·조사 방법·발행인·브랜드를 지어내지 않는다. 설명용 수치와 예제는 가까이에 **가상**이라고 표시한다.
- 사용자 자료의 사실과 새로 조사한 사실을 구분한다. 새 내용은 원문과 날짜·모집단·단위·조건을 확인하고 출처를 붙인다. 자료의 한계가 결론을 제한하면 본문에서 함께 설명한다.
- reference는 편집 원리를 분석하는 데 쓴다. 허가 없는 원본 PDF, page image, logo, font 파일을 결과 source나 public repo에 복사하지 않는다.
- PDF 제작은 게시와 별개다. LinkedIn 업로드나 외부 전송을 자동으로 수행하지 않는다.

## 편집과 제작

1. 독자, 읽고 난 뒤의 판단, 자료와 요청 형식을 확인한다. 제공된 reference가 있으면 전체 흐름과 대표 page를 실제로 본다.
2. [편집 규칙](references/editorial-guide.md)을 읽고 page map을 잡는다. 주장마다 어떤 근거를 볼지 정한 다음 문장을 쓴다. 모든 보고서에 조사 방법이나 목차를 강제로 넣지 않는다.
3. 기본 색상은 [palette](assets/editorial-palette.json)를 사용한다. cover/section은 charcoal, 본문은 cream과 charcoal text, chart는 steel blue/sage를 중심으로 한다. 사용자가 다른 template나 palette를 지정하면 그 요청을 우선한다.
4. HTML로 만들 때 [starter](assets/starter/report.html)와 [CSS](assets/starter/report.css)를 output 폴더에 복사해 고친다. starter는 적법하게 확보한 한글 TTF/OTF를 연결한 뒤 출력한다. [font 준비와 재생성](references/editorial-guide.md#font-준비와-재생성)을 따른다. 함께 있는 [가상 data](assets/starter/sample-data.json)는 8쪽 실행 예제의 근거다. 실제 보고서에서는 전부 교체한다. sample의 page 수와 문구는 고정 규칙이 아니다.
5. 수정한 **같은 HTML**을 browser print로 PDF로 만든다. 다른 renderer로 재작성하면 HTML과 PDF가 어긋나므로, 대체 제작 경로를 택할 때도 editable source에서 동일 결과가 나오는지 검증한다.

## 실행과 검증

필요 도구: Node.js + `playwright`와 Chromium 계열 browser, Python 3 + `Pillow pypdf pdfplumber`, Poppler의 `pdftoppm`. 아래 명령은 skill 폴더 기준이다. 로컬 runtime을 쓰면 해당 Node/Python 실행 경로를 지정하고, Playwright package 경로가 별도이면 `NODE_PATH`를 설정한다.

```bash
node scripts/export_pdf.cjs --input /path/to/report.html --output /path/to/report.pdf
python3 scripts/qa_pdf.py /path/to/report.pdf --out /path/to/qa --expected-pages 8 --expect-text '주문 운영의 병목' --mobile-pages 1,5,6
```

browser가 자동 탐색되지 않으면 `--browser /path/to/chrome`을 준다. page marker `.page`를 쓰지 않는 custom HTML은 exporter에 `--expected-pages N`을 주고 최종 page 수를 QA에서 확인한다. Node package/browser는 필요할 때 `npm install playwright`와 `npx playwright install chromium`, Python package는 `python3 -m pip install Pillow pypdf pdfplumber`로 준비한다. 스크립트는 다른 skill에 의존하지 않는다.

exporter는 print CSS, font load, image load를 기다리고 HTML의 overflow/clipping을 점검한다. QA helper는 page 수·텍스트 추출·font embedding·link annotation을 점검하고 모든 page PNG, contact sheet, mobile preview를 만든다. JSON 결과는 자동 확인의 증거이며 시각 검토를 대신하지 않는다.

최종 PDF의 **모든 page** PNG를 열어 여백, 잘림, 겹침, chart 축·단위·라벨·source와 한글 glyph를 확인한다. cover와 대표 본문을 390px mobile preview로 보고 headline과 chart 비교를 읽을 수 있는지 확인한다. 세부 본문을 읽으려면 확대가 필요한 A4의 한계도 설명하고, 지나치게 작으면 글자를 키우거나 page를 나눈다. 원본의 작은 글씨를 그대로 복제하지 않는다.

마지막으로 headline·대표 한글 문구를 추출 text와 눈으로 함께 확인한다. 숫자의 분모·반올림·합계, source 연결, PDF text 선택 가능 여부와 font embedding을 확인하고, source와 최종 PDF 및 preview를 전달한다. 확인하지 못한 항목은 완료로 보고하지 않는다.
