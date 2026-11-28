---
name: linkedin-cards
description: LinkedIn 카드뉴스를 핵심 도표와 다이어그램 중심의 4:5 PNG로 만들거나 고친다. "LinkedIn 카드뉴스 만들어줘", "이 리포트를 카드로", "조사 내용을 캐러셀로" 요청에 쓴다. 긴 해설은 카드 밖 별도 글로 분리하며, 상세 PDF 리포트나 영상 제작에는 쓰지 않는다.
---

# LinkedIn Cards

독자가 모바일에서 확대 없이 핵심을 읽고 판단할 수 있는 카드뉴스를 만든다. 기본은 **1080×1350(4:5) PNG**다. 한 카드에 한 메시지와 하나의 중심 chart/diagram을 두고, 짧은 결론 제목·인접 핵심 라벨·필요한 조건과 최소 출처를 남긴다. 자세한 설명은 별도 글로 쓴다.

## 편집

- 독자와 읽고 난 뒤의 판단을 먼저 정한다. 카드 수는 주장과 논리 흐름이 정하며, 고정 장수·목차·cover를 강제하지 않는다.
- 비교·순위·구성·관계·흐름 중 질문에 맞는 그림을 고른다. 긴 문단, 작은 여러 chart, 장식, 늘어나는 설명 box로 지면을 채우지 않는다. 상세 A4 지면의 축소나 스크린샷을 기본 카드로 쓰지 않는다.
- 긴 본문·각주·한계·해설은 `explanation.md` 등 별도 글로 옮긴다. 다만 주장을 제한하는 모집단·기간·단위·분모·다중 응답 등은 해당 카드에 남긴다. 숫자나 인용을 지어내지 않고, 설명용 가상 data는 가까이에 **가상**이라고 표시한다.
- 기본 [palette](assets/editorial-palette.json)의 7색과 neutral 값을 유지한다. charcoal/cream 기반, steel blue/sage 중심이며 amber/coral은 의미가 있을 때만 쓴다. 사용자 palette 지정은 우선한다.
- 제작 시 [제작 reference](references/card-guide.md)를 읽는다. 원문 chart를 재구성할 때는 그 안의 **원문 수치 대응** 절차를 적용한다. 수치 없는 개념도와 양을 담은 chart를 구분하고, 비교를 시간·인과로 오해시키는 화살표를 쓰지 않는다.

## 제작과 검증

[HTML starter](assets/starter/cards.html)와 [CSS](assets/starter/cards.css)를 output의 `source/`에 복사해 편집한다. 같은 `.card` 요소를 PNG로 캡처한다. [font 준비와 실행](references/card-guide.md#font-준비와-실행)에 따라 적법한 한글 font와 license를 source에 연결한다. 다른 문서에서 font를 추출하거나 public skill에 font 파일·사용자 자료·기존 산출물을 넣지 않는다.

필요 도구는 Node.js + `playwright`/Chromium, Python 3 + `Pillow`다. 아래는 skill 폴더 기준이며 실제 output 경로로 바꾼다.

```bash
node scripts/export_cards.cjs --input /path/to/output/source/cards.html --out /path/to/output/png
python3 scripts/qa_png.py /path/to/output/png --out /path/to/output/preview
```

exporter는 font/image load 완료, `.card` 크기, overflow/clipping, 안전 여백, 한글 font 적용과 핵심 글자 크기를 확인하고 `export.json`을 남긴다. helper는 PNG 크기·순서를 확인하고 모든 카드의 **360px/390px mobile preview**와 최대 4장씩 묶은 contact sheet를 만든다. 상세 옵션은 reference를 따른다. 자동 검사는 의미 정확성이나 모든 겹침을 증명하지 않는다.

모든 PNG와 mobile preview를 실제로 열어 제목·핵심 도표 라벨이 확대 없이 읽히는지, 한글 glyph·여백·겹침·잘림·축·단위·값·source가 맞는지 확인한다. 작으면 글자를 줄이지 말고 정보를 덜거나 카드를 나눈다. 숫자가 존재한다는 검사만으로 원문 재구성의 정확성을 합격시키지 않는다.

전달물은 순번 PNG, 한눈 미리보기 묶음, mobile preview, 편집 source, 별도 설명 글, 실행한 재생성 명령이다. PDF/MP4 생성이나 LinkedIn 게시·외부 전송은 기본 산출물에 포함하지 않는다. 확인하지 못한 항목은 완료로 보고하지 않는다.
