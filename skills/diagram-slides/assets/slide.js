// 장표 마무리 스크립트. render_slide.py가 굽는 순간에 장표 끝에 넣는다.
// 하는 일: (1) Mermaid를 slide.css 색으로 그린다 (2) 값 그림(sankey·timebar·cells·tree·quadrant·line·bar)을 SVG로 그린다
//          (3) 그림을 영역에 맞춘다 (4) 규칙을 어긴 곳을 찾는다.
// 결과는 document.title에 'SLIDE-REPORT:<JSON>'으로 남기고 render_slide.py가 읽는다.
(async () => {
  const MIN_FONT = 18;    // 그림 글자 최소 크기(px). 이보다 작아지면 장표를 나눠야 한다
  const MAX_SCALE = 1.4;  // 작은 그림을 키우는 한도
  const ACCENTS = ['hl', 'alt', 'bad'];  // slide.css의 강조 색
  const MAX_ACCENT_KINDS = 2;  // 한 장에 쓰는 강조 색 가짓수
  const MAX_ACCENTED = 4;      // 한 장에 칠하는 곳 수. 대응 장표가 짝 둘 × 위아래로 4곳을 쓴다
  const MAX_LABEL = 24;        // 그림 안 글 한 덩어리 글자 수(코드 이름·공백 빼고). 넘으면 문장이다
  const MAX_CAPTION = 90;      // 아래 "그래서" 글 글자 수(공백 빼고)
  // SKILL.md "모양 고르기" 표에 올린 Mermaid 종류. 나머지는 색·글자 크기를 맞추지 않았다
  const MERMAID_KINDS = { flowchart: 'flowchart', graph: 'flowchart', sequenceDiagram: 'sequence', timeline: 'timeline', 'stateDiagram-v2': 'state' };
  const report = { failure: '', problems: [] };
  const counted = [];  // DOM class로 셀 수 없는 강조(timeline 칸)
  const color = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const one = sel => document.querySelector(sel);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };
  const ctx = document.createElement('canvas').getContext('2d');
  const textWidth = (s, px, weight = 400) => { ctx.font = `${weight} ${px}px ${color('--font')}`; return ctx.measureText(s).width; };
  const hexRgb = hex => { const n = parseInt(hex.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgbText = hex => `rgb(${hexRgb(hex).join(',')})`;
  const fmt = v => Number(v).toLocaleString('ko-KR');

  // ── sankey: "보내는 곳, 받는 곳, 값[, hl|alt|bad]" 줄로 양이 갈라지고 모이는 모습을 그린다 ──
  function drawSankey(pre) {
    const unit = pre.dataset.unit || '';
    const rows = pre.textContent.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('%%') && !s.startsWith('#'));
    const nodes = new Map(), links = [];
    const node = name => { if (!nodes.has(name)) nodes.set(name, { name, ins: [], outs: [], order: nodes.size }); return nodes.get(name); };
    rows.forEach((row, i) => {
      const f = row.split(',').map(s => s.trim());
      const where = `sankey ${i + 1}번째 줄(${row})`;
      if (f.length < 3 || f.length > 4) throw new Error(`${where}: "보내는 곳, 받는 곳, 값" 또는 끝에 ", hl"을 더한 모양으로 쓴다.`);
      const v = Number(f[2].replace(/[_\s]/g, ''));
      if (!(v > 0)) throw new Error(`${where}: 값은 0보다 큰 숫자다.`);
      if (f[3] && !ACCENTS.includes(f[3])) throw new Error(`${where}: 넷째 칸은 hl, alt, bad 중 하나다.`);
      if (f[0] === f[1]) throw new Error(`${where}: 보내는 곳과 받는 곳이 같다.`);
      const l = { s: node(f[0]), t: node(f[1]), v, accent: f[3] || '' };
      links.push(l); l.s.outs.push(l); l.t.ins.push(l);
    });
    if (!links.length) throw new Error('sankey에 흐름이 한 줄도 없다.');
    if (nodes.size > 10) report.problems.push(`sankey node가 ${nodes.size}개다. 10개까지다. 작은 흐름은 "기타"로 묶거나 장표를 나눈다.`);

    // column: 출발점에서 가장 긴 경로의 길이
    const list = [...nodes.values()];
    list.forEach(n => { n.col = 0; });
    for (let k = 0; ; k++) {
      let changed = false;
      for (const l of links) if (l.t.col < l.s.col + 1) { l.t.col = l.s.col + 1; changed = true; }
      if (!changed) break;
      if (k >= list.length) throw new Error('sankey 흐름이 돌아서 제자리로 온다(순환). 같은 이름이 앞뒤에 다 나오는지 본다.');
    }
    const sum = ls => ls.reduce((a, l) => a + l.v, 0);
    list.forEach(n => { n.value = Math.max(sum(n.ins), sum(n.outs)); });
    const nCols = Math.max(...list.map(n => n.col)) + 1;
    const cols = Array.from({ length: nCols }, (_, c) => list.filter(n => n.col === c));

    const W = pre.clientWidth, H = Math.min(pre.clientHeight, 640);
    const NODE_W = 16, GAP = 30, PAD = 16, FONT = 20;
    const ky = Math.min(...cols.map(c => (H - 2 * PAD - GAP * (c.length - 1)) / sum(c.map(n => ({ v: n.value })))));
    // 라벨은 모두 node 오른쪽에 둔다. 마지막 column 라벨이 들어갈 폭을 오른쪽에 남긴다
    const labelOf = n => ({ name: n.name, value: `${fmt(n.value)}${unit}` });
    const labelWidth = n => { const l = labelOf(n); return textWidth(l.name, FONT, 600) + 8 + textWidth(l.value, FONT); };
    const right = Math.max(...cols[nCols - 1].map(labelWidth)) + 14;
    if (right > W * 0.35) report.problems.push('sankey 마지막 단계의 라벨이 너무 길다. 이름을 줄인다.');
    const xOf = c => c * (W - right - NODE_W) / (nCols - 1);
    cols.forEach((col, c) => {
      // 앞 column에서 들어오는 흐름의 무게중심 순서로 쌓아 엇갈림을 줄인다
      if (c > 0) for (const n of col) n.key = n.ins.length ? n.ins.reduce((a, l) => a + l.v * (l.s.y + l.s.h / 2), 0) / sum(n.ins) : 1e9 + n.order;
      if (c > 0) col.sort((a, b) => (Math.abs(a.key - b.key) > 0.5 ? a.key - b.key : 0) || a.order - b.order);
      const used = col.reduce((a, n) => a + n.value * ky, 0) + GAP * (col.length - 1);
      let y = PAD + (H - 2 * PAD - used) / 2;
      for (const n of col) { n.x = xOf(c); n.y = y; n.h = n.value * ky; y += n.h + GAP; }
    });
    for (const n of list) {
      let y = n.y;
      for (const l of [...n.outs].sort((a, b) => (a.t.y - b.t.y) || (a.t.order - b.t.order))) { l.sy = y; y += l.v * ky; }
      y = n.y;
      for (const l of [...n.ins].sort((a, b) => (a.s.y - b.s.y) || (a.s.order - b.s.order))) { l.ty = y; y += l.v * ky; }
    }

    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart' });
    const band = l => {
      const x0 = l.s.x + NODE_W, x1 = l.t.x, xm = (x0 + x1) / 2, w = l.v * ky;
      return `M${x0},${l.sy} C${xm},${l.sy} ${xm},${l.ty} ${x1},${l.ty} L${x1},${l.ty + w} C${xm},${l.ty + w} ${xm},${l.sy + w} ${x0},${l.sy + w} Z`;
    };
    for (const l of [...links].sort((a, b) => !!a.accent - !!b.accent)) {
      const p = el('path', { d: band(l) }, svg);
      if (l.accent) { p.setAttribute('class', l.accent); p.setAttribute('style', `fill:${color(`--${l.accent}`)};fill-opacity:.42`); }
      else p.setAttribute('style', `fill:${color('--line-strong')};fill-opacity:.45`);
    }
    for (const n of list) el('rect', { x: n.x, y: n.y, width: NODE_W, height: Math.max(n.h, 2), rx: 2, style: `fill:${color('--text-dim')}` }, svg);
    for (const [c, col] of cols.entries()) {
      const last = c === nCols - 1;
      const centers = [];
      for (const n of col) {
        const { name, value } = labelOf(n), w = labelWidth(n);
        const x = n.x + NODE_W + 10, cy = n.y + n.h / 2;
        const t = el('text', { x, y: cy, 'dominant-baseline': 'central', style: `font-size:${FONT}px` }, svg);
        el('tspan', { style: `font-weight:600;fill:${color('--text')}` }, t).textContent = name + ' ';
        el('tspan', { style: `fill:${color('--text-soft')}` }, t).textContent = value;
        if (!last && xOf(c + 1) - (x + w) < 6)
          report.problems.push(`sankey 라벨 "${name} ${value}"이 다음 column까지 닿는다. 이름을 줄이거나 column(단계)을 줄인다.`);
        centers.push(cy);
      }
      for (let i = 1; i < centers.length; i++)
        if (centers[i] - centers[i - 1] < FONT + 6)
          report.problems.push(`sankey ${c + 1}번째 column의 라벨 "${col[i - 1].name}"과 "${col[i].name}"이 겹친다. 작은 흐름을 "기타"로 묶거나 node를 줄인다.`);
    }
    pre.replaceChildren(svg);
  }

  // ── timebar: "이름, 시작, 끝[, hl|alt|bad]" 줄로 실제 시간에 비례한 막대를 그린다 ──
  function drawTimebar(pre) {
    const unit = pre.dataset.unit || '';
    const lines = pre.textContent.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('%%') && !s.startsWith('#'));
    let mode = '';
    const point = (s, where) => {
      let m = s.match(/^(\d{1,2}):(\d{2})$/), kind, v;
      if (m) { kind = 'time'; v = +m[1] * 60 + +m[2]; }
      else if (/^-?\d+(\.\d+)?$/.test(s)) { kind = 'num'; v = +s; }
      else throw new Error(`${where}: "${s}"는 시각(02:30)이나 숫자로 쓴다.`);
      if (mode && mode !== kind) throw new Error(`${where}: 시각(02:30)과 숫자를 섞어 쓸 수 없다.`);
      mode = kind;
      return v;
    };
    const bars = [], marks = [];
    lines.forEach((line, i) => {
      const where = `timebar ${i + 1}번째 줄(${line})`;
      if (line.startsWith('|')) {
        const [at, ...label] = line.slice(1).split(',').map(s => s.trim());
        marks.push({ at: point(at, where), label: label.join(', ') });
        return;
      }
      const f = line.split(',').map(s => s.trim());
      if (f.length < 3 || f.length > 4) throw new Error(`${where}: "이름, 시작, 끝" 또는 끝에 ", hl"을 더한 모양으로 쓴다. 끝은 +30m처럼 길이로 써도 된다.`);
      if (f[3] && !ACCENTS.includes(f[3])) throw new Error(`${where}: 넷째 칸은 hl, alt, bad 중 하나다.`);
      const start = point(f[1], where);
      let end;
      if (f[2].startsWith('+')) {
        const t = f[2].match(/^\+(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?$/), n = f[2].match(/^\+(\d+(?:\.\d+)?)$/);
        if (mode === 'time' && !(t && (t[1] || t[2]))) throw new Error(`${where}: 시각으로 쓴 막대의 길이는 +30m, +2h, +1h20m처럼 단위를 붙인다.`);
        if (mode === 'num' && !n) throw new Error(`${where}: 숫자로 쓴 막대의 길이는 +18처럼 숫자만 쓴다.`);
        end = start + (mode === 'time' ? (+(t[1] || 0)) * 60 + (+(t[2] || 0)) : +n[1]);
      } else {
        end = point(f[2], where);
        if (mode === 'time' && end < start) end += 1440;  // 자정을 넘긴다
      }
      if (!(end > start)) throw new Error(`${where}: 끝이 시작보다 뒤여야 한다.`);
      bars.push({ name: f[0], start, end, accent: f[3] || '' });
    });
    if (!bars.length) throw new Error('timebar에 막대가 한 줄도 없다.');
    if (bars.length > 9) report.problems.push(`timebar 막대가 ${bars.length}줄이다. 9줄까지다. 짧은 것을 묶거나 장표를 나눈다.`);
    let lo = Math.min(...bars.map(b => b.start)), hi = Math.max(...bars.map(b => b.end));
    for (const m of marks) { if (mode === 'time' && m.at < lo && m.at + 1440 <= hi) m.at += 1440; lo = Math.min(lo, m.at); hi = Math.max(hi, m.at); }

    // 눈금: 8칸 안에 드는 가장 촘촘한 간격
    const range = hi - lo;
    let steps = [5, 10, 15, 30, 60, 120, 180, 240, 360, 720, 1440];
    if (mode === 'num') { const p = 10 ** Math.floor(Math.log10(range / 8 || 1)); steps = [1, 2, 5, 10, 20, 50].map(k => k * p); }
    const step = steps.find(s => range / s <= 8) || steps[steps.length - 1];
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const tickText = t => mode === 'time'
      ? `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
      : `${fmt(+t.toFixed(6))}${unit}`;
    const span = v => {
      if (mode === 'num') return `${fmt(+v.toFixed(6))}${unit}`;
      const h = Math.floor(v / 60), m = Math.round(v % 60);
      return [h && `${h}시간`, m && `${m}분`].filter(Boolean).join(' ');
    };

    const W = pre.clientWidth, H = pre.clientHeight;
    const FONT = 20, TICK = 18, ROW = 50, BAR = 32;
    const labelW = Math.max(...bars.map(b => textWidth(b.name, FONT, 600))) + 22;
    if (labelW > W * 0.4) report.problems.push('timebar 이름 칸이 그림 폭의 40%를 넘는다. 막대 이름을 줄인다.');
    const ticks = [];
    for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(t);
    const tickW = Math.max(...ticks.map(t => textWidth(tickText(t), TICK)));
    const top = marks.length ? 34 : 6, x0 = labelW, x1 = W - tickW / 2 - 4;
    const height = top + bars.length * ROW + 34;
    if (height > H) report.problems.push(`timebar가 그림 영역보다 높다(${Math.round(height)}px > ${H}px). 막대를 줄이거나 장표를 나눈다.`);
    const X = t => x0 + (t - lo) / (hi - lo) * (x1 - x0);
    if ((x1 - x0) / (ticks.length - 1) < tickW + 10) report.problems.push('timebar 눈금 글자가 서로 겹친다. 시간 범위를 줄이거나 이름 칸을 줄인다.');

    const svg = el('svg', { width: W, height, viewBox: `0 0 ${W} ${height}`, class: 'chart' });
    const bottom = top + bars.length * ROW;
    for (const t of ticks) {
      el('line', { x1: X(t), x2: X(t), y1: top, y2: bottom, style: `stroke:${color('--line')};stroke-width:1` }, svg);
      const tx = el('text', { x: X(t), y: bottom + 26, 'text-anchor': 'middle', style: `font-size:${TICK}px;fill:${color('--text-dim')}` }, svg);
      tx.textContent = tickText(t);
    }
    for (const m of marks) {
      el('line', { x1: X(m.at), x2: X(m.at), y1: top - 6, y2: bottom, style: `stroke:${color('--text-soft')};stroke-width:2;stroke-dasharray:6 5` }, svg);
      const t = el('text', { x: X(m.at), y: top - 14, 'text-anchor': 'middle', style: `font-size:${TICK}px;font-weight:600;fill:${color('--text-soft')}` }, svg);
      t.textContent = m.label || tickText(m.at);
    }
    bars.forEach((b, i) => {
      const cy = top + i * ROW + ROW / 2;
      const name = el('text', { x: x0 - 14, y: cy, 'text-anchor': 'end', 'dominant-baseline': 'central', style: `font-size:${FONT}px;font-weight:600;fill:${color('--text')}` }, svg);
      name.textContent = b.name;
      const bx = X(b.start), bw = Math.max(X(b.end) - bx, 3);
      const fill = b.accent ? color(`--${b.accent}-fill`) : color('--box');
      const stroke = b.accent ? color(`--${b.accent}`) : color('--line-strong');
      const r = el('rect', { x: bx, y: cy - BAR / 2, width: bw, height: BAR, rx: 6, style: `fill:${fill};stroke:${stroke};stroke-width:${b.accent ? 2.5 : 1.5}` }, svg);
      if (b.accent) r.setAttribute('class', b.accent);
      const label = span(b.end - b.start), lw = textWidth(label, TICK);
      let lx, anchor;
      if (bw >= lw + 16) { lx = bx + bw / 2; anchor = 'middle'; }
      else if (bx + bw + 8 + lw <= W) { lx = bx + bw + 8; anchor = 'start'; }
      else if (bx - 8 - lw >= x0) { lx = bx - 8; anchor = 'end'; }
      else { report.problems.push(`timebar "${b.name}"의 길이 글자를 둘 곳이 없다. 시간 범위를 줄인다.`); return; }
      const t = el('text', { x: lx, y: cy, 'text-anchor': anchor, 'dominant-baseline': 'central',
        style: `font-size:${TICK}px;fill:${b.accent ? color(`--${b.accent}-text`) : color('--text-soft')}` }, svg);
      t.textContent = label;
    });
    pre.replaceChildren(svg);
  }

  // ── timeline: 칠할 칸(:::hl)을 떼어 내고, 칸 색을 회색으로 맞추는 설정을 붙인다 ──
  // 아래 두 함수는 innerHTML로 읽고 쓴다. textContent로 쓰면 줄바꿈 <br>이 사라진다(Mermaid도 innerHTML을 읽는다)
  function prepareTimeline(b) {
    // timeline은 공백에서만 확실히 줄을 바꾼다(<br>은 Mermaid가 <br/>로 바꿔 글자로 나온다). <br>을 공백으로 둔다
    const lines = b.innerHTML.replace(/<br\s*\/?>/gi, ' ').split('\n');
    const sections = lines.some(l => /^\s*section\b/.test(l));
    let index = -1;
    const paint = {};
    for (const [i, line] of lines.entries()) {
      const s = line.trim();
      if (!s || /^(timeline|title|%%|acc)/.test(s)) continue;
      const isSection = /^section\b/.test(s);
      if (sections ? isSection : !s.startsWith(':')) index++;
      const m = s.match(/:::(hl|alt|bad)\b/);
      if (m) { paint[index] = m[1]; counted.push(m[1]); lines[i] = line.replace(/\s*:::(hl|alt|bad)\b/, ''); }
    }
    const vars = {};
    for (let i = 0; i < 12; i++) {
      const a = paint[i] ?? paint[i - 12];
      vars[`cScale${i}`] = a ? color(`--${a}-fill`) : color('--box');
      vars[`cScaleLabel${i}`] = color('--text');
      vars[`cScaleInv${i}`] = a ? color(`--${a}`) : color('--line-strong');
    }
    b.innerHTML = `%%{init: ${JSON.stringify({ themeVariables: vars })}}%%\n` + lines.join('\n');
  }

  // ── sequence: "rect hl" 구간을 강조 채움으로 바꾼다. 테두리는 그린 뒤에 붙인다 ──
  function prepareSequence(b) {
    // Mermaid sequence는 전역 fontSize(기본 16)로 actor·message·note 글자 크기를 덮어쓴다. 이 블록에만 20을 준다
    b.innerHTML = '%%{init: {"fontSize": 20}}%%\n' + b.innerHTML.replace(/^(\s*)rect\s+(hl|alt|bad)\s*$/gm, (_, sp, a) => `${sp}rect ${rgbText(color(`--${a}-fill`))}`);
  }
  function finishSequence(svg) {
    for (const r of svg.querySelectorAll('rect.rect')) {
      const fill = (r.getAttribute('fill') || r.style.fill || '').replace(/\s/g, '');
      const a = ACCENTS.find(x => fill === rgbText(color(`--${x}-fill`)));
      if (a) { r.classList.add(a); r.style.stroke = color(`--${a}`); r.style.strokeWidth = '2px'; }
    }
  }

  // ── state: 전이 글자 뒤 바탕을 불투명하게 해 선이 글자를 지나가지 않게 한다. 시작 점은 회색으로 ──
  function finishState(svg) {
    for (const r of svg.querySelectorAll('.edgeLabel rect')) { r.style.opacity = 1; r.style.fill = color('--bg'); }
    for (const e of svg.querySelectorAll('.edgeLabel span, .edgeLabel div')) { e.style.backgroundColor = color('--bg'); e.style.color = color('--text-soft'); }
    for (const c of svg.querySelectorAll('circle.state-start')) { c.style.fill = color('--text-dim'); c.style.stroke = color('--text-dim'); }
  }

  // ── 값 그림 공통: "[a | b | c]" 칸 줄과 글 상자를 읽고, 재고, 그린다. cells·tree가 같이 쓴다 ──
  // 글자는 24·20·18px 중 폭에 맞는 가장 큰 것을 고른다
  const SIZES = [
    { font: 24, sub: 18, h: 54, pad: 16, ptr: 36, gap: 28 },
    { font: 20, sub: 18, h: 46, pad: 12, ptr: 30, gap: 22 },
    { font: 18, sub: 18, h: 42, pad: 9, ptr: 26, gap: 16 },
  ];
  const valueLines = pre => pre.textContent.split('\n').map((s, i) => ({ s, no: i + 1 }))
    .filter(({ s }) => s.trim() && !s.trim().startsWith('%%'));
  const takeAccent = (s, where) => {
    const m = s.match(/:::(\S*)\s*$/);
    if (!m) return [s.trim(), ''];
    if (!ACCENTS.includes(m[1])) throw new Error(`${where}: ":::" 뒤 색은 hl, alt, bad 중 하나다.`);
    return [s.slice(0, m.index).trim(), m[1]];
  };
  const takeNote = s => { const i = s.indexOf(' -- '); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 4).trim()]; };
  // 처리되지 않고 남은 문법 기호가 글자로 찍히지 않게 막는다
  // 줄 이름·메모·층 이름처럼 문법이 없는 자리에도 같은 검사를 한다
  const rejectLeftover = (t, where, semicolon = false) => {
    if (t.includes(':::')) throw new Error(`${where}: ":::"가 처리되지 않고 남았다("${t}"). 강조는 칸 끝·칸 줄 끝·node 끝에만 붙는다. 칸 하나는 "글 ; 칸 아래 설명 /폭비율 :::hl" 차례로 쓴다.`);
    if (/(^|\s)\/\s*-?\d/.test(t)) throw new Error(`${where}: "/N"이 처리되지 않고 남았다("${t}"). 폭비율 /N은 칸 끝(:::hl 바로 앞)에 하나만 두고, 칸 밖에는 쓰지 않는다.`);
    if (semicolon && t.includes(';')) throw new Error(`${where}: ";"가 처리되지 않고 남았다("${t}"). 칸 아래 설명 ";"는 칸 줄 [ ] 안의 칸에 하나만 쓴다.`);
  };
  function parseCell(src, where) {
    let [t, accent] = takeAccent(src, where), unit = 0;
    const u = t.match(/(?:^|\s)\/\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (u) {
      if (!(+u[1] > 0)) throw new Error(`${where}: 폭비율 "/${u[1]}"은 0보다 큰 수다.`);
      unit = +u[1]; t = t.slice(0, u.index).trim();
    }
    const parts = t.split(';').map(x => x.trim());
    if (parts.length > 2) throw new Error(`${where}: 칸 하나에 ";"는 하나만 쓴다("${t}"). 칸 아래 설명은 한 줄이다.`);
    const [main, sub = ''] = parts;
    rejectLeftover(main, where); rejectLeftover(sub, where);
    return { text: main, sub, accent, unit, ptr: main === '*', next: main === '>' };
  }
  // "[…]:::hl [… ]" 칸 줄들. 칸 줄 밖에 글이 남으면 오류다
  function parseStrips(body, where) {
    const re = /\s*\[([^\[\]]*)\](:::\S*)?/y, strips = [];
    let pos = 0;
    for (;;) {
      re.lastIndex = pos;
      const m = re.exec(body);
      if (!m) break;
      const [, accent] = takeAccent(m[2] || '', where);
      const cells = m[1].split('|').map(c => parseCell(c, where));
      if (cells.length > 12) report.problems.push(`${where}: 칸이 ${cells.length}개다. 한 줄에 12개까지다. 가운데를 "…" 칸으로 줄인다.`);
      strips.push({ cells, accent });
      pos = re.lastIndex;
    }
    const rest = body.slice(pos).trim();
    if (rest.startsWith('[') && !rest.includes(']')) throw new Error(`${where}: "["로 연 칸 줄을 "]"로 닫는다.`);
    if (rest) throw new Error(`${where}: 칸 줄 [ ] 밖에 글 "${rest.slice(0, 20)}"이 남았다. 칸 글은 [ ] 안에, 메모는 " -- " 뒤에 쓴다.`);
    return strips;
  }
  function measure(n, S, avail) {
    if (!n.cells) { n.w = textWidth(n.text, S.font, 600) + 2 * S.pad + 8; n.h = S.h; return; }
    n.h = S.h + (n.cells.some(c => c.sub) ? S.sub + 8 : 0);
    const need = c => Math.max(c.ptr || c.next ? S.ptr - 2 * S.pad : textWidth(c.text, S.font, 600), c.sub ? textWidth(c.sub, S.sub) : 0) + 2 * S.pad;
    n.tight = '';
    if (avail && n.cells.some(c => c.unit)) {  // 폭이 뜻인 줄(packet header, page): /N 비율대로 나눈다
      const total = n.cells.reduce((a, c) => a + (c.unit || 1), 0);
      for (const c of n.cells) { c.w = avail * (c.unit || 1) / total; if (c.w < need(c) - 2 * S.pad + 12) n.tight = c.text || c.sub; }
    } else for (const c of n.cells) c.w = Math.max(need(c), c.ptr || c.next ? S.ptr : S.h);
    n.w = n.cells.reduce((a, c) => a + c.w, 0);
  }
  const layoutCells = n => { let x = n.x; for (const c of n.cells || []) { c.x = x; x += c.w; } };
  const setSvgBox = (svg, x, y, w, h) => { for (const [k, v] of Object.entries({ width: w, height: h, viewBox: `${x} ${y} ${w} ${h}` })) svg.setAttribute(k, v); };
  const accentOf = n => n.accent || (n.cells && (n.cells.find(c => c.accent) || {}).accent) || '';
  function drawNode(n, S, svg) {
    const g = el('g', n.accent ? { class: n.accent } : {}, svg);
    const paint = a => ({
      box: `fill:${color(a ? `--${a}-fill` : '--box')};stroke:${color(a ? `--${a}` : '--line-strong')};stroke-width:${a ? 3 : 2}`,
      text: color(a ? `--${a}-text` : '--text'), dot: color(a ? `--${a}` : '--text-soft'),
    });
    const label = (s, x, y, style, parent) => {
      el('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', style }, parent).textContent = s;
    };
    if (!n.cells) {
      const p = paint(n.accent);
      el('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: 8, style: p.box }, g);
      label(n.text, n.x + n.w / 2, n.y + n.h / 2, `font-size:${S.font}px;font-weight:600;fill:${p.text}`, g);
      return;
    }
    layoutCells(n);
    for (const c of [...n.cells].sort((a, b) => !!a.accent - !!b.accent)) {  // 칠한 칸을 나중에 그려 테두리가 덮이지 않게
      const a = c.accent || n.accent, p = paint(a);
      const cg = c.accent && !n.accent ? el('g', { class: c.accent }, g) : g;
      el('rect', { x: c.x, y: n.y, width: c.w, height: n.h, style: p.box }, cg);
      const cx = c.x + c.w / 2;
      const cy = n.y + (c.sub ? S.h / 2 + 2 : n.h / 2), dim = c.next || c.text === '…';
      if (c.ptr) el('circle', { cx, cy, r: 6, style: `fill:${p.dot}` }, cg);
      else label(c.next ? '→' : c.text, cx, cy, `font-size:${S.font}px;font-weight:600;fill:${dim ? color('--text-soft') : p.text}`, cg);
      if (c.sub) label(c.sub, cx, n.y + S.h + 4, `font-size:${S.sub}px;fill:${color('--text-dim')}`, cg);
    }
  }

  // ── cells: "이름: [칸 | 칸 | 칸] [칸 | 칸] -- 메모" 줄마다 칸 줄을 위에서 아래로 쌓는다 ──
  function drawCells(pre) {
    const rows = valueLines(pre).map(({ s: line, no }) => {
      const where = `cells ${no}번째 줄(${line.trim()})`;
      const [head, note] = takeNote(line.trim());
      const m = head.match(/^([^\[]*?):\s*(\[.*)$/);
      const body = m ? m[2] : head;
      if (!body.startsWith('[')) throw new Error(`${where}: "이름: [칸 | 칸 | 칸]" 모양으로 쓴다.`);
      const name = m ? m[1].trim() : '';
      rejectLeftover(name, where, true); rejectLeftover(note, where);
      return { name, strips: parseStrips(body, where), note };
    });
    if (!rows.length) throw new Error('cells에 줄이 하나도 없다.');
    if (rows.length > 5) report.problems.push(`cells가 ${rows.length}줄이다. 5줄까지다. 장표를 나눈다.`);
    const W = pre.clientWidth;
    let S, gutter, width;
    for (S of SIZES) {
      gutter = Math.max(0, ...rows.map(r => r.name ? textWidth(r.name, 20, 600) + 16 : 0));
      width = 0;
      for (const r of rows) {
        for (const n of r.strips) measure(n, S, (W - gutter - S.gap * (r.strips.length - 1)) / r.strips.length);
        r.w = r.strips.reduce((a, n) => a + n.w, 0) + S.gap * (r.strips.length - 1);
        width = Math.max(width, gutter + r.w);
      }
      if (width <= W + 0.5 && rows.every(r => r.strips.every(n => !n.tight))) break;
    }
    if (width > W + 0.5) report.problems.push(`cells가 그림 폭을 넘는다(${Math.round(width)}px > ${W}px). 칸 글을 줄이거나 가운데 칸을 "…"로 줄이거나 장표를 나눈다.`);
    for (const r of rows) for (const n of r.strips) if (n.tight) report.problems.push(`cells "${n.tight}" 칸이 글보다 좁다. 그 칸의 /N 비율을 키우거나 글을 줄인다.`);
    const svg = el('svg', { class: 'chart' });
    let y = 0, right = width;
    for (const r of rows) {
      let x = gutter;
      const h = Math.max(...r.strips.map(n => n.h));
      if (r.name) el('text', { x: gutter - 16, y: y + S.h / 2, 'text-anchor': 'end', 'dominant-baseline': 'central', style: `font-size:20px;font-weight:600;fill:${color('--text-dim')}` }, svg).textContent = r.name;
      for (const n of r.strips) { n.x = x; n.y = y; drawNode(n, S, svg); x += n.w + S.gap; }
      y += h;
      if (r.note) {
        const a = r.strips.map(accentOf).find(Boolean), nw = textWidth(r.note, 18);  // 메모는 그 줄에서 칠한 색을 따른다
        el('text', { x: gutter, y: y + 22, style: `font-size:18px;fill:${color(a ? `--${a}-text` : '--text-dim')}` }, svg).textContent = r.note;
        right = Math.max(right, gutter + nw); y += 30;
        if (gutter + nw > W) report.problems.push(`cells 메모 "${r.note.slice(0, 12)}…"가 그림 폭을 넘는다. 줄이거나 ①만 두고 설명은 아래 글로 옮긴다.`);
      }
      y += S.h * 0.7;
    }
    y -= S.h * 0.7;
    // pre는 넘친 부분을 잘라 숨긴다(.diagram 넘침 검사에 안 걸린다). 그래서 높이를 여기서 본다
    if (pre.parentElement.classList.contains('diagram') && y + 6 > pre.clientHeight + 0.5)
      report.problems.push(`cells가 그림 높이를 넘는다(${Math.round(y + 6)}px > ${pre.clientHeight}px). 줄·칸 아래 설명·메모를 줄이거나 장표를 나눈다. 한 장에 cells 블록을 둘 두면 높이를 반씩 나눠 쓴다.`);
    setSvgBox(svg, -2, -2, right + 4, y + 6);
    pre.replaceChildren(svg);
  }

  const arrowDefs = svg => {
    const d = el('defs', {}, svg);
    for (const [id, c] of [['arw', '--line-strong'], ['arw-hl', '--hl'], ['arw-bad', '--bad'], ['arw-alt', '--alt']])
      el('path', { d: 'M0,0L10,5L0,10z', style: `fill:${color(c)}` }, el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, d));
  };
  const overlaps = (a, b, m = 6) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
  // tree node 하나: 칸 줄 하나거나 글 상자
  function parseNode(src, where) {
    if (src.startsWith('[')) {
      const strips = parseStrips(src, where);
      if (strips.length > 1) throw new Error(`${where}: tree node 하나에는 칸 줄 하나만 쓴다. 옆 node면 줄을 나눠 같은 깊이로 쓴다.`);
      return strips[0];
    }
    const [text, accent] = takeAccent(src, where);
    rejectLeftover(text, where, true);
    return { text, accent };
  }

  // ── tree: 들여쓰기(2칸)가 부모·자식이다. node는 글 상자거나 "[칸 | 칸]" 칸 줄이다 ──
  function drawTree(pre) {
    const roots = [], stack = [], all = [];
    let levelNames = [];
    valueLines(pre).forEach(({ s: line, no }) => {
      const where = `tree ${no}번째 줄(${line.trim()})`;
      if (/^\s*levels\s*:/.test(line)) {
        levelNames = line.split(':').slice(1).join(':').split(',').map(s => s.trim());
        for (const name of levelNames) rejectLeftover(name, where, true);
        return;
      }
      const lead = line.match(/^\s*/)[0];
      if (/[^ ]/.test(lead)) throw new Error(`${where}: 들여쓰기는 스페이스로 2칸씩이다. 탭·전각 공백·NBSP를 쓰지 않는다.`);
      const indent = lead.length;
      if (indent % 2) throw new Error(`${where}: 들여쓰기는 2칸씩이다.`);
      const depth = indent / 2;
      if (depth > stack.length) throw new Error(`${where}: 한 번에 한 단계만 들여쓴다.`);
      const [head, note] = takeNote(line.trim());
      rejectLeftover(note, where);
      const n = Object.assign(parseNode(head, where), { note, depth, kids: [] });
      stack.length = depth;
      (depth ? stack[depth - 1].kids : roots).push(n);
      stack.push(n); all.push(n);
    });
    if (!all.length) throw new Error('tree에 node가 하나도 없다.');
    const depthMax = Math.max(...all.map(n => n.depth));
    const inDiagram = pre.parentElement.classList.contains('diagram');  // 묶음 안(전후 장표)이면 제 높이만큼만 그리고 넘침은 .diagram 검사가 잡는다
    const W = pre.clientWidth, H = inDiagram ? pre.clientHeight : 1e9;
    const svg = el('svg', { class: 'chart' });
    arrowDefs(svg);
    let S, width, height;

    if (pre.dataset.layout === 'right') {  // 파일 시스템처럼: 한 줄에 node 하나, 깊이만큼 오른쪽으로
      if (levelNames.length) report.problems.push('tree의 "levels:" 줄은 아래로 펴는 배치에서만 그린다. data-layout="right"에서는 지우고, 층 뜻은 node 옆 딱지나 아래 글에 쓴다.');
      if (all.length > 12) report.problems.push(`tree node가 ${all.length}개다. 오른쪽으로 펴는 배치는 12개까지다. 가지를 "… 외 N개"로 줄이거나 장표를 나눈다.`);
      for (S of SIZES.slice(1)) {
        const row = S.h + 8, ind = 44;
        all.forEach((n, i) => { measure(n, S); n.x = n.depth * ind; n.y = i * row; });
        width = Math.max(...all.map(n => n.x + n.w + (n.note ? 12 + textWidth(n.note, 18) : 0))); height = all.length * row - 8;
        if (width <= W && height <= H) break;
      }
      for (const n of all) for (const k of n.kids)
        el('path', { d: `M${n.x + 18},${n.y + n.h} V${k.y + k.h / 2} H${k.x}`, style: `fill:none;stroke:${color('--line-strong')};stroke-width:2` }, svg);
      for (const n of all) {
        drawNode(n, S, svg);
        if (n.note) el('text', { x: n.x + n.w + 12, y: n.y + n.h / 2, 'dominant-baseline': 'central', style: `font-size:18px;fill:${color(accentOf(n) ? `--${accentOf(n)}-text` : '--text-dim')}` }, svg).textContent = n.note;
      }
      if (width > W + 0.5 || height > H + 0.5) report.problems.push(`tree가 그림 영역을 넘는다(${Math.round(width)}×${Math.round(height)}px > ${W}×${H}px). node 글을 줄이거나 가지를 줄이거나 장표를 나눈다.`);
      setSvgBox(svg, -2, -2, width + 4, height + 6);
      pre.replaceChildren(svg);
      return;
    }

    // 아래로 펴는 배치: leaf마다 자리를 주고 부모를 자식들 가운데 위에 둔다
    const gutter = levelNames.length ? Math.max(...levelNames.map(s => textWidth(s, 20, 600))) + 16 : 0;
    const span = (n, S) => { n.span = Math.max(n.w, n.kids.reduce((a, k) => a + span(k, S), 0) + S.gap * (n.kids.length - 1)); return n.span; };
    const place = (n, left, S) => {
      const inner = n.kids.reduce((a, k) => a + k.span, 0) + S.gap * (n.kids.length - 1);
      let x = left + (n.span - inner) / 2;
      for (const k of n.kids) { place(k, x, S); x += k.span + S.gap; }
      n.x = n.kids.length ? (n.kids[0].x + n.kids[n.kids.length - 1].x + n.kids[n.kids.length - 1].w) / 2 - n.w / 2 : left + (n.span - n.w) / 2;
    };
    const MIN_GAP = 64;
    let rowH;
    for (S of SIZES) {
      all.forEach(n => measure(n, S));
      rowH = Math.max(...all.map(n => n.h));
      width = gutter + roots.reduce((a, r) => a + span(r, S), 0) + S.gap * 2 * (roots.length - 1);
      height = (depthMax + 1) * rowH + depthMax * MIN_GAP;
      if (width <= W + 0.5 && height <= H + 0.5) break;
    }
    if (width > W + 0.5 || height > H + 0.5)
      report.problems.push(`tree가 그림 영역을 넘는다(${Math.round(width)}×${Math.round(height)}px > ${W}×${H}px). node를 줄이거나, 이름이 긴 계층이면 data-layout="right"로 바꾸거나, 장표를 나눈다.`);
    const levelGap = !depthMax ? 0 : !inDiagram ? MIN_GAP : Math.max(MIN_GAP, Math.min(120, (H - (depthMax + 1) * rowH) / depthMax));
    let left = gutter;
    for (const r of roots) { place(r, left, S); left += r.span + S.gap * 2; }
    for (const n of all) n.y = n.depth * (rowH + levelGap);
    // edge: 부모의 pointer 칸(*) 수가 자식 수와 같으면 칸마다 자식 하나로 잇는다. 아니면 부모 아래 가운데에서 잇는다
    all.forEach(layoutCells);
    for (const n of all) {
      const ptrs = n.cells ? n.cells.filter(c => c.ptr) : [];
      n.kids.forEach((k, i) => {
        const fromCell = ptrs.length === n.kids.length ? ptrs[i] : n.cells && n.cells.find(c => c.accent);
        const x1 = fromCell ? fromCell.x + fromCell.w / 2 : n.x + n.w / 2;
        const toCell = k.cells && !k.accent && k.cells.find(c => c.accent);
        const x2 = toCell ? toCell.x + toCell.w / 2 : k.x + k.w / 2;
        const a = accentOf(n) && accentOf(k) ? accentOf(k) : '';
        el('line', { x1, y1: n.y + n.h, x2, y2: k.y - 2, 'marker-end': ptrs.length === n.kids.length || a ? `url(#arw${a ? '-' + a : ''})` : '',
          style: `stroke:${color(a ? `--${a}` : '--line-strong')};stroke-width:${a ? 3.5 : 2}` }, svg);
      });
    }
    for (const n of all) drawNode(n, S, svg);
    // 메모와 층 이름은 node와 같은 높이 띠 안에만 둔다. edge는 띠 사이로만 지나가므로 글과 겹치지 않는다
    const lo = -(W - width) / 2, hi = width + (W - width) / 2, taken = all.map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
    // 부모에서 자식으로 가는 edge가 지나는 띠. leaf 아래 메모가 이 띠에 걸리면 edge가 글을 지나간다
    const bands = all.filter(n => n.kids.length).map(n => {
      const xs = [n, ...n.kids].flatMap(m => [m.x, m.x + m.w]);
      return { x: Math.min(...xs), y: n.y + n.h, w: Math.max(...xs) - Math.min(...xs), h: n.kids[0].y - n.y - n.h };
    });
    let minX = 0, maxX = width, extra = 0;
    for (const n of all.filter(n => n.note)) {
      const w = textWidth(n.note, 18, 600), y = n.y + n.h / 2 - 12, a = accentOf(n);
      const spots = [{ x: n.x + n.w + 12, y, w, h: 24 }, { x: n.x - 12 - w, y, w, h: 24 }];
      if (!n.kids.length) spots.push({ x: n.x + n.w / 2 - w / 2, y: n.y + n.h + 8, w, h: 24, below: true });  // leaf 아래에는 edge가 없다
      const spot = spots.find(s => s.x >= lo && s.x + s.w <= hi && !taken.some(t => t.x !== n.x && overlaps(s, t) || t.x === n.x && t.y !== n.y && overlaps(s, t))
        && !(s.below && bands.some(b => overlaps(s, b, 0))));
      if (!spot) { report.problems.push(`tree 메모 "${n.note.slice(0, 14)}…"를 둘 자리가 없다(양옆이 다른 node나 그림 끝에 닿는다). 메모를 줄이거나 번호(①)만 두고 글은 아래 글로 옮긴다.`); continue; }
      taken.push(spot); minX = Math.min(minX, spot.x); maxX = Math.max(maxX, spot.x + spot.w);
      if (spot.below) extra = 34;
      el('text', { x: spot.x, y: spot.y + 12, 'dominant-baseline': 'central', style: `font-size:18px;font-weight:600;fill:${color(a ? `--${a}-text` : '--text-dim')}` }, svg).textContent = n.note;
    }
    levelNames.forEach((name, d) => {
      const first = all.filter(n => n.depth === d).sort((a, b) => a.x - b.x)[0];
      if (!first || !name) return;
      const w = textWidth(name, 20, 600), s = { x: first.x - 14 - w, y: first.y, w, h: first.h };
      if (taken.some(t => t !== s && overlaps(s, t, 2) && !(t.x === first.x && t.y === first.y))) { report.problems.push(`tree 층 이름 "${name}"이 메모와 겹친다. 메모를 줄인다.`); return; }
      minX = Math.min(minX, s.x);
      el('text', { x: first.x - 14, y: first.y + first.h / 2, 'text-anchor': 'end', 'dominant-baseline': 'central', style: `font-size:20px;font-weight:600;fill:${color('--text-dim')}` }, svg).textContent = name;
    });
    const bottom = depthMax * (rowH + levelGap) + rowH + extra;
    if (bottom > H + 0.5 && !(height > H + 0.5))  // 크기 고르기 때는 leaf 아래 메모 높이를 몰랐다
      report.problems.push(`tree가 그림 영역을 넘는다(leaf 아래 메모까지 ${Math.round(bottom)}px > ${H}px). 메모를 줄이거나 ①만 두고 글은 아래 글로 옮기거나 장표를 나눈다.`);
    setSvgBox(svg, minX - 2, -2, maxX - minX + 4, bottom + 4);
    pre.replaceChildren(svg);
  }


  // ── quadrant: "x: 낮음 -> 높음", "y: …", "오른쪽 위: 이름", "이름, x, y[, hl]"(0~100) 줄로 2x2 위에 점을 찍는다 ──
  function drawQuadrant(pre) {
    const axis = {}, corner = {}, points = [];
    const CORNERS = { '오른쪽 위': [1, 0], '왼쪽 위': [0, 0], '왼쪽 아래': [0, 1], '오른쪽 아래': [1, 1] };
    for (const { s: line, no } of valueLines(pre)) {
      const s = line.trim(), where = `quadrant ${no}번째 줄(${s})`;
      let m;
      if ((m = s.match(/^([xy])\s*:\s*(.+?)\s*->\s*(.+)$/))) { axis[m[1]] = [m[2], m[3]]; continue; }
      if ((m = s.match(/^(오른쪽 위|왼쪽 위|왼쪽 아래|오른쪽 아래)\s*:\s*(.+)$/))) { corner[m[1]] = m[2]; continue; }
      const f = s.split(',').map(x => x.trim());
      if (f.length < 3 || f.length > 4 || !(f[1] !== '' && +f[1] >= 0 && +f[1] <= 100 && f[2] !== '' && +f[2] >= 0 && +f[2] <= 100))
        throw new Error(`${where}: 점은 "이름, x, y" 모양이고 x·y는 0~100이다. 축은 "x: 낮은 쪽 -> 높은 쪽", 사분면 이름은 "오른쪽 위: 이름"으로 쓴다.`);
      if (f[3] && !ACCENTS.includes(f[3])) throw new Error(`${where}: 넷째 칸은 hl, alt, bad 중 하나다.`);
      points.push({ name: f[0], x: +f[1], y: +f[2], accent: f[3] || '' });
    }
    if (!axis.x || !axis.y) throw new Error('quadrant에 "x: 낮은 쪽 -> 높은 쪽", "y: 낮은 쪽 -> 높은 쪽" 두 줄이 있어야 한다.');
    if (points.length > 8) report.problems.push(`quadrant 점이 ${points.length}개다. 8개까지다. 비슷한 것은 묶거나 장표를 나눈다.`);
    const W = pre.clientWidth, H = pre.clientHeight, FONT = 20, CAP = 18;
    const top = 6, bottom = 40, x0 = 40, y0 = top, side = Math.min(H - top - bottom, W - x0 - 10, 600);
    const svg = el('svg', { width: x0 + side + 10, height: side + top + bottom, viewBox: `0 0 ${x0 + side + 10} ${side + top + bottom}`, class: 'chart' });
    el('rect', { x: x0, y: y0, width: side, height: side, rx: 6, style: `fill:${color('--panel')};stroke:${color('--line-strong')};stroke-width:2` }, svg);
    const dash = `stroke:${color('--line-strong')};stroke-width:1.5;stroke-dasharray:6 5`;
    el('line', { x1: x0 + side / 2, x2: x0 + side / 2, y1: y0, y2: y0 + side, style: dash }, svg);
    el('line', { x1: x0, x2: x0 + side, y1: y0 + side / 2, y2: y0 + side / 2, style: dash }, svg);
    const label = (s, x, y, anchor, style, parent, rot) => {
      el('text', Object.assign({ x, y, 'text-anchor': anchor, 'dominant-baseline': 'central', style }, rot ? { transform: `rotate(-90 ${x} ${y})` } : {}), parent).textContent = s;
    };
    const dim = `font-size:${CAP}px;fill:${color('--text-dim')}`;
    for (const k of ['x', 'y']) {
      const [a, b] = axis[k].map((s, i) => textWidth(i ? s + ' →' : '← ' + s, CAP));
      if (a + b + 24 > side) report.problems.push(`quadrant ${k}축 양 끝 이름("${axis[k][0]}", "${axis[k][1]}")이 서로 겹친다. 축 이름을 짧게 줄인다.`);
    }
    label('← ' + axis.x[0], x0, y0 + side + 22, 'start', dim, svg); label(axis.x[1] + ' →', x0 + side, y0 + side + 22, 'end', dim, svg);
    label('← ' + axis.y[0], x0 - 20, y0 + side, 'start', dim, svg, true); label(axis.y[1] + ' →', x0 - 20, y0, 'end', dim, svg, true);
    const taken = [];
    for (const [k, s] of Object.entries(corner)) {
      const [cx, cy] = CORNERS[k], w = textWidth(s, CAP, 600);
      const x = cx ? x0 + side - 12 : x0 + 12, y = cy ? y0 + side - 18 : y0 + 18;
      label(s, x, y, cx ? 'end' : 'start', `font-size:${CAP}px;font-weight:600;fill:${color('--text-dim')}`, svg);
      const box = { x: cx ? x - w : x, y: y - 12, w, h: 24, name: s }, clash = taken.find(t => overlaps(box, t, 2));
      if (clash) report.problems.push(`quadrant 사분면 이름 "${s}"이 "${clash.name}"과 겹친다. 사분면 이름을 짧게 줄인다.`);
      taken.push(box);
    }
    for (const p of points) {
      const px = x0 + side * p.x / 100, py = y0 + side * (1 - p.y / 100), w = textWidth(p.name, FONT, 600);
      const g = el('g', p.accent ? { class: p.accent } : {}, svg);
      el('circle', { cx: px, cy: py, r: 8, style: `fill:${color(p.accent ? `--${p.accent}` : '--text-soft')}` }, g);
      const rightOk = px + 14 + w <= x0 + side - 6, box = { x: rightOk ? px + 14 : px - 14 - w, y: py - 12, w, h: 24, name: p.name };
      const clash = taken.find(t => overlaps(box, t, 2));
      if (clash) report.problems.push(`quadrant "${p.name}" 글자가 "${clash.name}"과 겹친다. 좌표를 조금 옮기거나 이름을 줄인다.`);
      taken.push(box, { x: px - 8, y: py - 8, w: 16, h: 16, name: p.name });
      label(p.name, rightOk ? px + 14 : px - 14, py, rightOk ? 'start' : 'end', `font-size:${FONT}px;font-weight:600;fill:${color(p.accent ? `--${p.accent}-text` : '--text')};paint-order:stroke;stroke:${color('--panel')};stroke-width:6px;stroke-linejoin:round`, g);  // 바탕색 테두리로 점선을 가린다
    }
    pre.replaceChildren(svg);
  }

  // ── line·bar 공통: 숫자 읽기, 보기 좋은 눈금 간격 ──
  const chartNumber = (s, where) => {
    const t = s.replace(/[_\s]/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(t)) throw new Error(`${where}: "${s}"는 숫자가 아니다. 천 단위는 1200이나 1_200으로 쓴다(쉼표는 칸을 나눈다).`);
    return +t;
  };
  const niceStep = (range, count) => {
    const raw = range / count || 1, p = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].map(k => k * p).find(s => s >= raw);
  };
  const valueText = (v, unit) => `${fmt(+v.toFixed(6))}${unit}`;

  // ── line: "x: 칸 이름들", "계열 이름: 값들[, hl]" 줄로 값이 시간에 따라 바뀌는 모습을 그린다 ──
  function drawLine(pre) {
    const unit = pre.dataset.unit || '';
    let xs = null;
    const series = [], marks = [], refs = [];
    for (const { s: line, no } of valueLines(pre)) {
      const s = line.trim(), where = `line ${no}번째 줄(${s})`;
      let m;
      if ((m = s.match(/^x\s*:\s*(.+)$/))) { xs = m[1].split(',').map(x => x.trim()); if (xs.some(x => !x)) throw new Error(`${where}: 빈 칸 이름이 있다.`); continue; }
      if (s.startsWith('|')) { const [at, ...label] = s.slice(1).split(',').map(x => x.trim()); marks.push({ at, label: label.join(', '), where }); continue; }
      if (s.startsWith('=')) { const [v, ...label] = s.slice(1).split(',').map(x => x.trim()); refs.push({ v: chartNumber(v, where), label: label.join(', ') }); continue; }
      if (!(m = s.match(/^(.+?)\s*:\s*(.+)$/)))
        throw new Error(`${where}: 줄은 "x: 1월, 2월, …", "계열 이름: 값, 값, …[, hl]", "| 칸 이름, 사건", "= 값, 기준 이름" 중 하나다.`);
      const f = m[2].split(',').map(x => x.trim());
      const accent = ACCENTS.includes(f[f.length - 1]) ? f.pop() : '';
      const points = f.map(v => { const star = v.endsWith('*'); return { v: chartNumber(star ? v.slice(0, -1) : v, where), star }; });
      series.push({ name: m[1], points, accent, where });
    }
    if (!xs) throw new Error('line에 "x: 1월, 2월, …" 줄(가로축 칸 이름)이 없다.');
    if (xs.length < 2) throw new Error('line 가로축 칸이 2개보다 적다. 값이 하나면 line이 아니라 bar를 쓴다.');
    if (!series.length) throw new Error('line에 계열(“이름: 값, 값, …”) 줄이 없다.');
    for (const sr of series) if (sr.points.length !== xs.length)
      throw new Error(`${sr.where}: 값이 ${sr.points.length}개인데 가로축 칸은 ${xs.length}개다. 개수를 맞춘다.`);
    for (const mk of marks) { mk.i = xs.indexOf(mk.at); if (mk.i < 0) throw new Error(`${mk.where}: "${mk.at}"는 x 줄에 없는 칸 이름이다.`); }
    if (series.length > 4) report.problems.push(`line 계열이 ${series.length}개다. 4개까지다. 볼 계열만 남기거나 장표를 나눈다.`);
    if (xs.length > 24) report.problems.push(`line 가로축 칸이 ${xs.length}개다. 24개까지다. 주·월 단위로 묶는다.`);

    const all = series.flatMap(sr => sr.points.map(p => p.v)).concat(refs.map(r => r.v));
    const minAttr = pre.dataset.min;
    // 세로축은 늘 0을 품는다. 값이 모두 음수면 0이 위끝이다. data-min은 값이 모두 0 이상일 때 바닥을 올리는 데만 쓴다
    let lo = minAttr !== undefined ? chartNumber(minAttr, 'line data-min') : Math.min(0, ...all), hi = Math.max(0, ...all);
    if (minAttr !== undefined && lo < 0) throw new Error(`line data-min(${lo})은 0 이상이다. 음수 값이 있으면 data-min을 지운다(세로축이 0과 음수를 함께 그린다).`);
    if (lo > Math.min(...all)) throw new Error(`line data-min(${lo})이 가장 작은 값(${Math.min(...all)})보다 크다.`);
    if (hi === lo) hi = lo + 1;
    const step = niceStep(hi - lo, 5);
    lo = Math.floor(lo / step + 1e-9) * step; hi = Math.ceil(hi / step - 1e-9) * step;
    const ticks = [];
    for (let t = lo; t <= hi + step / 1e6; t += step) ticks.push(t);

    const W = pre.clientWidth, H = pre.clientHeight, FONT = 20, TICK = 18;
    const solo = series.length === 1 && !series[0].accent;  // 계열 하나를 칠하지 않으면 조금 밝게 그린다
    const endLabel = sr => ({ name: sr.name, value: valueText(sr.points[sr.points.length - 1].v, unit) });
    const endWidth = sr => { const l = endLabel(sr); return textWidth(l.name, FONT, 600) + 8 + textWidth(l.value, FONT); };
    const tickW = Math.max(...ticks.map(t => textWidth(valueText(t, unit), TICK)));
    const left = Math.max(tickW + 14, textWidth(xs[0], TICK) / 2 + 4);
    const right = Math.max(...series.map(endWidth)) + 22;
    if (right > W * 0.35) report.problems.push('line 끝 라벨(계열 이름 + 마지막 값)이 그림 폭의 35%를 넘는다. 계열 이름을 줄인다.');
    const top = marks.length ? 44 : 22, bottom = 40, plotH = H - top - bottom;
    if (plotH < 200) report.problems.push(`line 그림 높이가 모자란다(${Math.round(plotH)}px). 장표의 다른 글을 줄이거나 장표를 나눈다.`);
    const x0 = left, x1 = W - right;
    const X = i => x0 + i * (x1 - x0) / (xs.length - 1);
    const Y = v => top + (hi - v) / (hi - lo) * plotH;
    if (plotH / (ticks.length - 1) < TICK + 8) report.problems.push('line 세로 눈금 글자가 서로 겹친다. 그림 높이를 늘리거나 값 범위를 줄인다.');

    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart' });
    for (const t of ticks) {
      const zero = Math.abs(t) < step / 1e6;  // 0 눈금(없으면 바닥)을 진하게 긋는다
      const base = zero || (lo > 0 && t === lo);
      el('line', { x1: x0, x2: x1, y1: Y(t), y2: Y(t), style: `stroke:${color(base ? '--line-strong' : '--line')};stroke-width:${base ? 1.5 : 1}` }, svg);
      el('text', { x: x0 - 12, y: Y(t), 'text-anchor': 'end', 'dominant-baseline': 'central', style: `font-size:${TICK}px;fill:${color('--text-dim')}` }, svg).textContent = valueText(t, unit);
    }
    // 가로축 칸 이름: 겹치면 몇 칸씩 건너뛰어 적는다. 마지막 칸은 늘 적는다
    const xw = Math.max(...xs.map(x => textWidth(x, TICK))), gap = (x1 - x0) / (xs.length - 1);
    const every = Math.max(1, Math.ceil((xw + 14) / gap));
    const shown = xs.map((_, i) => i).filter(i => i % every === 0 || i === xs.length - 1)
      .filter((i, k, a) => !(k === a.length - 2 && a[k + 1] === xs.length - 1 && (xs.length - 1 - i) * gap < xw + 14));
    // 겹침 검사: 값 글자·끝 라벨·점선 이름은 taken(이미 놓인 글자·점선)과 그림 밖을 피한다
    const taken = [];
    const box = (x, y, w, anchor, name) => ({ x: anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x, y: y - 12, w, h: 24, name });
    const inside = b => b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H;
    const xRow = top + plotH + 24;  // 가로축 칸 이름 줄의 가운데
    for (const i of shown) {
      el('text', { x: X(i), y: xRow, 'text-anchor': 'middle', 'dominant-baseline': 'central', style: `font-size:${TICK}px;fill:${color('--text-dim')}` }, svg).textContent = xs[i];
      taken.push(box(X(i), xRow, textWidth(xs[i], TICK), 'middle', `가로축 칸 이름 ${xs[i]}`));
    }
    for (const t of ticks) taken.push(box(x0 - 12, Y(t), textWidth(valueText(t, unit), TICK), 'end', `세로축 눈금 ${valueText(t, unit)}`));
    const halo = `paint-order:stroke;stroke:${color('--bg')};stroke-width:6px;stroke-linejoin:round`;  // 바탕색 테두리로 선·눈금을 가린다
    for (const r of refs) {
      el('line', { x1: x0, x2: x1, y1: Y(r.v), y2: Y(r.v), style: `stroke:${color('--text-soft')};stroke-width:2;stroke-dasharray:6 5` }, svg);
      const s = r.label ? `${r.label} ${valueText(r.v, unit)}` : valueText(r.v, unit), w = textWidth(s, TICK, 600);
      const b = [-14, 14].map(d => box(x0 + 8, Y(r.v) + d, w, 'start', s)).find(c => inside(c) && !taken.some(t => overlaps(c, t, 4)));
      if (!b) { report.problems.push(`line 기준 이름 "${s}"을 둘 자리가 없다. 기준을 줄이거나 이름을 줄인다.`); continue; }
      el('text', { x: x0 + 8, y: b.y + 12, 'text-anchor': 'start', 'dominant-baseline': 'central', style: `font-size:${TICK}px;font-weight:600;fill:${color('--text-soft')};${halo}` }, svg).textContent = s;
      taken.push(b);
      taken.push({ x: x0, y: Y(r.v) - 2, w: x1 - x0, h: 4, name: `${s} 점선` });
    }
    for (const mk of marks) {
      const x = X(mk.i), s = mk.label || mk.at, w = textWidth(s, TICK, 600);
      el('line', { x1: x, x2: x, y1: top - 8, y2: top + plotH, style: `stroke:${color('--text-soft')};stroke-width:2;stroke-dasharray:6 5` }, svg);
      const anchor = x - w / 2 < 0 ? 'start' : x + w / 2 > W ? 'end' : 'middle';
      el('text', { x, y: top - 22, 'text-anchor': anchor, 'dominant-baseline': 'central', style: `font-size:${TICK}px;font-weight:600;fill:${color('--text-soft')}` }, svg).textContent = s;
      const b = box(x, top - 22, w, anchor, s), clash = taken.find(t => overlaps(b, t, 4));
      if (clash) report.problems.push(`line 사건 이름 "${s}"이 "${clash.name}"과 겹친다. 사건 이름을 줄이거나 사건을 줄인다.`);
      taken.push(b, { x: x - 2, y: top - 8, w: 4, h: plotH + 8, name: `${s} 점선` });
    }

    // 계열: 회색 먼저, 칠한 계열은 위에 그린다
    const dots = xs.length <= 12;
    for (const sr of [...series].sort((a, b) => !!a.accent - !!b.accent)) {
      const g = el('g', sr.accent ? { class: sr.accent } : {}, svg);
      const stroke = sr.accent ? color(`--${sr.accent}`) : color(solo ? '--text-soft' : '--text-dim');
      el('path', { d: sr.points.map((p, i) => `${i ? 'L' : 'M'}${X(i)},${Y(p.v)}`).join(' '),
        style: `fill:none;stroke:${stroke};stroke-width:${sr.accent || solo ? 4 : 2.5};stroke-linejoin:round;stroke-linecap:round` }, g);
      sr.points.forEach((p, i) => {
        if (dots || p.star || i === sr.points.length - 1)
          el('circle', { cx: X(i), cy: Y(p.v), r: sr.accent || solo ? 6 : 4.5, style: `fill:${stroke};stroke:${color('--bg')};stroke-width:2` }, g);
      });
    }
    // 끝 라벨: 계열 이름과 마지막 값. 세로로 겹치면 위아래로 민다
    const ends = series.map(sr => ({ sr, y: Y(sr.points[sr.points.length - 1].v) })).sort((a, b) => a.y - b.y);
    const minGap = FONT + 6;
    for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + minGap);
    const lastHalf = textWidth(xs[xs.length - 1], TICK) / 2;
    const floor = lastHalf > 10 ? xRow - 12 - 4 - 12 : top + plotH + 10;  // 마지막 칸 이름이 끝 라벨 자리까지 오면 그 위에서 멈춘다
    const over = ends.length ? ends[ends.length - 1].y - floor : 0;
    if (over > 0) for (const e of ends) e.y -= over;
    for (let i = ends.length - 2; i >= 0; i--) ends[i].y = Math.min(ends[i].y, ends[i + 1].y - minGap);
    if (ends.length && ends[0].y < 10) report.problems.push('line 끝 라벨이 서로 겹쳐 둘 곳이 없다. 계열을 줄이거나 장표를 나눈다.');
    for (const { sr, y } of ends) {
      const { name, value } = endLabel(sr), x = X(xs.length - 1) + 14;
      const t = el('text', { x, y, 'dominant-baseline': 'central', style: `font-size:${FONT}px` }, svg);
      el('tspan', { style: `font-weight:600;fill:${color(sr.accent ? `--${sr.accent}-text` : '--text')}` }, t).textContent = name + ' ';
      el('tspan', { style: `fill:${color('--text-soft')}` }, t).textContent = value;
      const b = box(x, y, endWidth(sr), 'start', `${name} ${value}`), clash = taken.find(t => overlaps(b, t, 2));
      if (clash) report.problems.push(`line 끝 라벨 "${name} ${value}"이 "${clash.name}"과 겹친다. 마지막 칸 이름이나 계열 이름을 줄이거나 사건을 옮긴다.`);
      if (!inside(b)) report.problems.push(`line 끝 라벨 "${name} ${value}"이 그림 밖으로 나간다. 계열 이름을 줄인다.`);
      taken.push(b);
    }
    // 값을 적을 점(값 끝의 *): 골짜기면 점 아래부터, 아니면 위부터 자리를 찾는다. 기준·사건 점선과 다른 글자를 피한다
    for (const sr of series) sr.points.forEach((p, i, ps) => {
      if (!p.star || i === ps.length - 1) return;
      const nb = [ps[i - 1], ps[i + 1]].filter(Boolean).map(q => q.v), valley = nb.length && nb.every(v => v > p.v);
      const s = valueText(p.v, unit), w = textWidth(s, FONT, 700);
      // 자리 후보: 점 위·아래 가운데, 그다음 점 오른쪽으로 붙인 위·아래(첫 칸처럼 왼쪽이 막혔을 때)
      const spots = (valley ? [26, -26] : [-26, 26]).flatMap(d => [['middle', X(i)], ['start', X(i) + 4]].map(([anchor, x]) => Object.assign(box(x, Y(p.v) + d, w, anchor, s), { anchor, tx: x })));
      const b = spots.find(c => inside(c) && !taken.some(t => overlaps(c, t, 4)));
      if (!b) {
        const clash = taken.find(t => overlaps(spots[0], t, 4));
        report.problems.push(`line 값 "${s}"(${sr.name}, ${xs[i]})이 ${clash ? `"${clash.name}"과 겹친다` : '그림 밖으로 나간다'}. * 를 다른 점으로 옮기거나 빼거나 장표를 나눈다.`);
        return;
      }
      el('text', { x: b.tx, y: b.y + 12, 'text-anchor': b.anchor, 'dominant-baseline': 'central',
        style: `font-size:${FONT}px;font-weight:700;fill:${color(sr.accent ? `--${sr.accent}-text` : '--text')};${halo}` }, svg).textContent = s;
      taken.push(b);
    });
    pre.replaceChildren(svg);
  }

  // ── bar: "이름, 값[, hl|alt|bad]" 줄로 항목끼리 크기를 가로 막대로 견준다 ──
  function drawBar(pre) {
    const unit = pre.dataset.unit || '';
    const bars = [], refs = [];
    for (const { s: line, no } of valueLines(pre)) {
      const s = line.trim(), where = `bar ${no}번째 줄(${s})`;
      if (s.startsWith('|')) { const [v, ...label] = s.slice(1).split(',').map(x => x.trim()); refs.push({ v: chartNumber(v, where), label: label.join(', '), where }); continue; }
      const f = s.split(',').map(x => x.trim());
      if (f.length < 2 || f.length > 3) throw new Error(`${where}: "이름, 값" 또는 끝에 ", hl"을 더한 모양으로 쓴다. 천 단위는 1200이나 1_200으로 쓴다.`);
      if (f[2] && !ACCENTS.includes(f[2])) throw new Error(`${where}: 셋째 칸은 hl, alt, bad 중 하나다.`);
      const v = chartNumber(f[1], where);
      if (v < 0) throw new Error(`${where}: 값은 0 이상이다. 늘고 준 양(음수)은 before-after나 line으로 그린다.`);
      bars.push({ name: f[0], v, accent: f[2] || '' });
    }
    if (!bars.length) throw new Error('bar에 막대가 한 줄도 없다.');
    if (bars.length > 10) report.problems.push(`bar 막대가 ${bars.length}줄이다. 10줄까지다. 작은 것을 "기타"로 묶거나 장표를 나눈다.`);
    for (const r of refs) if (r.v < 0) throw new Error(`${r.where}: 기준선 값은 0 이상이다.`);
    const hi = Math.max(...bars.map(b => b.v), ...refs.map(r => r.v)) || 1;

    const W = pre.clientWidth, H = pre.clientHeight, FONT = 20, TICK = 18;
    const labelW = Math.max(...bars.map(b => textWidth(b.name, FONT, 600))) + 22;
    if (labelW > W * 0.4) report.problems.push('bar 이름 칸이 그림 폭의 40%를 넘는다. 막대 이름을 줄인다.');
    const valueW = Math.max(...bars.map(b => textWidth(valueText(b.v, unit), FONT, 700))) + 16;
    const top = refs.length ? 40 : 6, x0 = labelW, x1 = W - valueW;
    const ROW = Math.min(64, (H - top - 8) / bars.length), BAR = Math.round(ROW * 0.62);
    if (ROW < FONT + 14) report.problems.push(`bar 한 줄 높이가 모자란다(${Math.round(ROW)}px). 막대를 줄이거나 장표를 나눈다.`);
    const height = top + bars.length * ROW + 8;
    const X = v => x0 + v / hi * (x1 - x0);

    const svg = el('svg', { width: W, height, viewBox: `0 0 ${W} ${height}`, class: 'chart' });
    const bottom = top + bars.length * ROW;
    bars.forEach((b, i) => {
      const cy = top + i * ROW + ROW / 2;
      el('text', { x: x0 - 14, y: cy, 'text-anchor': 'end', 'dominant-baseline': 'central',
        style: `font-size:${FONT}px;font-weight:600;fill:${color(b.accent ? `--${b.accent}-text` : '--text')}` }, svg).textContent = b.name;
      const fill = b.accent ? color(`--${b.accent}-fill`) : color('--box');
      const stroke = b.accent ? color(`--${b.accent}`) : color('--line-strong');
      const r = el('rect', { x: x0, y: cy - BAR / 2, width: Math.max(X(b.v) - x0, 2), height: BAR, rx: 5,
        style: `fill:${fill};stroke:${stroke};stroke-width:${b.accent ? 2.5 : 1.5}` }, svg);
      if (b.accent) r.setAttribute('class', b.accent);
      el('text', { x: X(b.v) + 10, y: cy, 'dominant-baseline': 'central',
        style: `font-size:${FONT}px;font-weight:700;fill:${color(b.accent ? `--${b.accent}-text` : '--text-soft')}` }, svg).textContent = valueText(b.v, unit);
    });
    el('line', { x1: x0, x2: x0, y1: top - 4, y2: bottom, style: `stroke:${color('--line-strong')};stroke-width:2` }, svg);
    const taken = [];
    for (const r of refs) {
      const x = X(r.v), s = r.label ? `${r.label} ${valueText(r.v, unit)}` : valueText(r.v, unit), w = textWidth(s, TICK, 600);
      el('line', { x1: x, x2: x, y1: top - 6, y2: bottom, style: `stroke:${color('--text-soft')};stroke-width:2;stroke-dasharray:6 5` }, svg);
      const anchor = x + w / 2 > W ? 'end' : 'middle';
      el('text', { x, y: top - 20, 'text-anchor': anchor, 'dominant-baseline': 'central', style: `font-size:${TICK}px;font-weight:600;fill:${color('--text-soft')}` }, svg).textContent = s;
      const b = { x: anchor === 'end' ? x - w : x - w / 2, y: top - 32, w, h: 24, name: s }, clash = taken.find(t => overlaps(b, t, 4));
      if (clash) report.problems.push(`bar 기준선 이름 "${s}"이 "${clash.name}"과 겹친다. 기준선을 줄이거나 이름을 줄인다.`);
      taken.push(b);
      // 기준선이 값 글자를 지나가면 읽기 어렵다
      bars.forEach((b, i) => {
        const lx = X(b.v) + 10, lw = textWidth(valueText(b.v, unit), FONT, 700);
        if (x > lx - 4 && x < lx + lw + 4) report.problems.push(`bar 기준선 "${s}"이 "${b.name}" 값 글자를 지나간다. 기준선 값을 확인하거나 기준선을 아래 글로 옮긴다.`);
      });
    }
    pre.replaceChildren(svg);
  }

  // 팔레트(회색 + 강조 세 색) 밖의 채도 높은 색이면 '#rrggbb', 아니면 ''. 표에 없는 Mermaid 종류의 기본 무지개색, 손 그림의 임의 색을 잡는다
  let allowedRgb;
  function offColor(c) {
    allowedRgb = allowedRgb || ['--hl', '--alt', '--bad', '--hl-text', '--alt-text', '--bad-text'].map(v => hexRgb(color(v)));
    const m = c && c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    if (!m || (m[4] !== undefined && +m[4] < 0.15)) return '';
    const rgb = [+m[1], +m[2], +m[3]].map(v => v / 255);
    const mx = Math.max(...rgb), mn = Math.min(...rgb), l = (mx + mn) / 2;
    const sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
    if (sat < 0.4 || l < 0.22 || l > 0.9) return '';
    if (allowedRgb.some(a => a.reduce((d, v, i) => d + Math.abs(v - rgb[i] * 255), 0) < 60)) return '';
    return '#' + [m[1], m[2], m[3]].map(v => (+v | 0).toString(16).padStart(2, '0')).join('');
  }

  // 공통 검사: 그리는 수단(값 그림, Mermaid, HTML, 손으로 그린 SVG)과 상관없이 .diagram 안 모든 글자의 크기와 모든 색을 본다
  const SECONDARY = '.note, .link small, .fields, .fields *, table.grid th';  // 보조 글자. 16px까지 된다
  const MIN_SECONDARY = 16;
  function checkDiagram() {
    const small = [], offs = new Set();
    for (const e of document.querySelectorAll('.diagram, .diagram *')) {
      if (/^(style|script|defs|marker|title|desc)$/i.test(e.tagName) || e.closest('defs')) continue;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const svg = e.closest('svg'), inSvg = e instanceof SVGElement && e.tagName !== 'foreignObject';
      for (const c of inSvg ? [cs.fill, cs.stroke] : [cs.color, cs.backgroundColor, cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor]) { const o = offColor(c); if (o) offs.add(o); }
      if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      let k = 1;  // SVG는 영역에 맞춰 줄거나 커지고 transform으로도 줄어든다. 화면에 찍히는 크기로 본다
      if (svg) {
        const g = e instanceof SVGGraphicsElement ? e : e.closest('foreignObject') || svg, m = g.getScreenCTM && g.getScreenCTM();
        if (m) k = Math.min(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));  // 가로세로 배율이 다르면 작은 쪽
      }
      const px = parseFloat(cs.fontSize) * k, min = !svg && e.matches(SECONDARY) ? MIN_SECONDARY : MIN_FONT;
      if (px < min - 0.5) small.push({ px, min, text: e.textContent.trim().slice(0, 14) });
    }
    if (small.length) {
      const worst = small.sort((a, b) => a.px - b.px)[0];
      report.problems.push(`그림 글자 ${small.length}곳이 최소 크기보다 작다(가장 작은 곳 "${worst.text}" ${worst.px.toFixed(1)}px, 최소 ${worst.min}px). 글자를 줄이지 말고 글이나 상자를 줄이거나, 가로 흐름(LR)이면 세로(TB)로 바꾸거나, 장표를 나눈다. 손으로 그린 SVG면 font-size를 ${MIN_FONT}px 이상으로 쓴다.`);
    }
    if (offs.size)
      report.problems.push(`그림에 팔레트 밖 색(${[...offs].slice(0, 3).join(', ')})이 나온다. 색은 회색과 강조 세 색(hl, alt, bad)뿐이다. Mermaid는 SKILL.md "모양 고르기" 표에 있는 종류를 쓰고, 손으로 그린 SVG·HTML은 slide.css 색 변수(var(--hl) 등)를 쓴다.`);
  }

  try {
    // mermaid.initialize()까지는 await 없이 간다. 그 전에 기다리면 Mermaid가 load 때 기본 설정(밝은 테마)으로 스스로 그려 버린다
    const blocks = [...document.querySelectorAll('pre.mermaid')];
    // 예전 색 이름(ok, warn)은 없앴다. Mermaid는 정의 안 된 class를 말없이 무시하므로 여기서 잡는다
    const retired = new Set();
    for (const b of blocks) for (const m of b.textContent.matchAll(/:::(ok|warn)\b/g)) retired.add(m[1]);
    for (const c of ['ok', 'warn', 'text-ok', 'text-warn']) if (document.querySelector('.' + c)) retired.add(c);
    if (retired.size)
      report.problems.push(`없는 색(${[...retired].join(', ')})을 썼다. 색은 hl(지금 볼 곳), alt(대응의 두 번째 짝), bad(진짜 문제)뿐이고, 나머지 상자는 색 없이 둔다.`);
    const kindOf = b => {
      const first = b.textContent.replace(/%%\{[\s\S]*?\}%%/g, '').split('\n').map(s => s.trim()).find(s => s && !s.startsWith('%%')) || '';
      return first.split(/\s+/)[0];
    };
    if (blocks.length) {
      if (!window.mermaid) throw new Error('Mermaid를 불러오지 못했다. 인터넷 연결을 확인한다.');
      const classDefs = ACCENTS
        .map(c => `\nclassDef ${c} fill:${color(`--${c}-fill`)},stroke:${color(`--${c}`)},color:${color('--text')}`).join('');
      for (const b of blocks) {
        const word = kindOf(b), kind = MERMAID_KINDS[word];
        b.dataset.kind = kind || word;
        // :::hl, :::alt, :::bad 를 장표마다 정의하지 않아도 되게 여기서 붙인다
        if (kind === 'flowchart' || kind === 'state') b.append(classDefs);
        else if (kind === 'timeline') prepareTimeline(b);
        else if (kind === 'sequence') prepareSequence(b);
        else if (/^(sankey|gantt|xychart)/.test(word))
          report.problems.push(`Mermaid ${word}는 쓰지 않는다. 양의 흐름은 slide-sankey.html, 시간 막대는 slide-timebar.html, 값의 추이는 slide-line.html, 항목 크기 견주기는 slide-bar.html 견본으로 그린다.`);
      }
      mermaid.initialize({
        startOnLoad: false, theme: 'dark',
        flowchart: { useMaxWidth: false, padding: 14, nodeSpacing: 40, rankSpacing: 46, subGraphTitleMargin: { top: 4, bottom: 16 } },
        sequence: { useMaxWidth: false, mirrorActors: false, diagramMarginX: 16, actorMargin: 50, width: 160, height: 56, boxMargin: 10, messageMargin: 36, noteMargin: 10,
          actorFontSize: 20, messageFontSize: 20, noteFontSize: 20, actorFontFamily: color('--font'), messageFontFamily: color('--font'), noteFontFamily: color('--font') },
        timeline: { useMaxWidth: false, padding: 12 },
        themeVariables: {
          background: color('--bg'), primaryColor: color('--box'), primaryTextColor: color('--text'),
          primaryBorderColor: color('--line-strong'), lineColor: color('--text-dim'),
          mainBkg: color('--box'), nodeBorder: color('--line-strong'),  // 기본 상자는 회색. dark 테마 기본값은 파란 테두리라 강조가 묻힌다
          edgeLabelBackground: color('--bg'), clusterBkg: color('--box'), clusterBorder: color('--line-strong'),
          // sequence: 참여자·선·메모를 회색으로. 강조는 rect hl 구간만
          actorBkg: color('--box'), actorBorder: color('--line-strong'), actorTextColor: color('--text'),
          actorLineColor: color('--line-strong'), signalColor: color('--text-dim'), signalTextColor: color('--text'),
          labelBoxBkgColor: color('--box'), labelBoxBorderColor: color('--line-strong'), labelTextColor: color('--text'),
          loopTextColor: color('--text'), noteBkgColor: color('--panel'), noteBorderColor: color('--line-strong'),
          noteTextColor: color('--text'), activationBkgColor: color('--line'), activationBorderColor: color('--line-strong'),
          sequenceNumberColor: color('--bg'),
          fontSize: '20px', fontFamily: color('--font'),
        },
      });
      if (document.fonts) await document.fonts.ready;
      try { await mermaid.run({ nodes: blocks }); }
      catch (e) { throw new Error('Mermaid 문법 오류: ' + String((e && (e.str || e.message)) || e).split('\n').slice(0, 3).join(' | ')); }
      for (const b of blocks) if (b.dataset.kind === 'sequence' && b.querySelector('svg')) finishSequence(b.querySelector('svg'));
      for (const b of blocks) if (b.dataset.kind === 'state' && b.querySelector('svg')) finishState(b.querySelector('svg'));

      // 그림을 영역에 맞춘다. 키우는 것은 MAX_SCALE까지, 줄어드는 것은 글자 크기로 판정한다
      for (const svg of document.querySelectorAll('.diagram pre.mermaid svg')) {
        const vb = svg.viewBox && svg.viewBox.baseVal;
        if (!vb || !vb.width) continue;
        const box = svg.parentElement;
        const k = Math.min(box.clientWidth / vb.width, box.clientHeight / vb.height, MAX_SCALE);
        svg.removeAttribute('width'); svg.removeAttribute('height');
        Object.assign(svg.style, { width: vb.width * k + 'px', height: vb.height * k + 'px', maxWidth: 'none', maxHeight: 'none' });
      }
      for (const svg of document.querySelectorAll('.diagram pre.mermaid[data-kind="timeline"] svg')) {
        const wide = [...svg.querySelectorAll('g.timeline-node')].flatMap(g => {
          const bg = g.querySelector('.node-bkg');
          return bg ? [...g.querySelectorAll('text')].filter(x => x.getBBox().width > bg.getBBox().width - 6).map(x => x.textContent.trim()) : [];
        });
        if (wide.length)
          report.problems.push(`timeline 칸 글자가 칸 밖으로 넘친다(${wide.slice(0, 2).join(', ')}). 칸 폭은 고정이고 공백에서만 줄이 바뀐다. 긴 이름은 user_activity_<br>daily_report처럼 나눌 곳에 <br>을 넣거나, 이름 칸이 따로 있는 slide-timebar.html을 쓴다.`);
      }
    }

    if (document.fonts) await document.fonts.ready;
    for (const pre of document.querySelectorAll('.diagram pre.sankey')) drawSankey(pre);
    for (const pre of document.querySelectorAll('.diagram pre.timebar')) drawTimebar(pre);
    const outside = [...document.querySelectorAll('pre.cells, pre.tree, pre.quadrant, pre.sankey, pre.timebar, pre.line, pre.bar')].filter(p => !p.closest('.diagram'));
    if (outside.length) report.problems.push(`값 그림 <pre class="${outside[0].className}">이 그림 영역(.diagram) 밖에 있어 그려지지 않고 글자로 찍힌다. .diagram 안으로 옮긴다.`);
    for (const pre of document.querySelectorAll('.diagram pre.cells')) drawCells(pre);
    for (const pre of document.querySelectorAll('.diagram pre.tree')) drawTree(pre);
    for (const pre of document.querySelectorAll('.diagram pre.quadrant')) drawQuadrant(pre);
    for (const pre of document.querySelectorAll('.diagram pre.line')) drawLine(pre);
    for (const pre of document.querySelectorAll('.diagram pre.bar')) drawBar(pre);
    checkDiagram();

    // 색: 칠한 곳이 많으면 어디를 볼지 흐려진다. 나머지는 회색으로 두고 지금 볼 곳만 칠한다
    const accented = [...document.querySelectorAll('.diagram .hl, .diagram .alt, .diagram .bad')]
      .map(e => ACCENTS.find(c => e.classList.contains(c))).concat(counted);
    const kinds = new Set(accented);
    if (kinds.size > MAX_ACCENT_KINDS)
      report.problems.push(`강조 색을 ${kinds.size}가지(${[...kinds].join(', ')}) 썼다. ${MAX_ACCENT_KINDS}가지까지다. 색에 뜻을 하나씩 붙이지 말고, 지금 볼 곳만 hl로 칠한다.`);
    if (accented.length > MAX_ACCENTED)
      report.problems.push(`칠한 곳이 ${accented.length}곳이다. ${MAX_ACCENTED}곳까지다. 순서·종류는 번호나 글로 보이고, 색은 지금 볼 곳 1~2곳에만 쓴다.`);

    // 주석이 일찍 닫히면(주석 안의 '-->') 남은 글이 body에 떠서 줄 하나를 차지하고 그림 영역이 줄어든다
    const stray = [...document.body.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
    if (stray.length)
      report.problems.push(`장표 밖에 떠 있는 글이 있다("${stray[0].textContent.trim().slice(0, 30)}…"). 주석 안에 '-->'를 쓰면 주석이 거기서 끝난다. 주석을 고친다.`);

    // 장표 구조: 제목(결론) · 그림 · 아래 "그래서" 한두 문장
    const inlineDiagram = one('body > .diagram.diagram-only');
    report.inlineDiagram = Boolean(inlineDiagram);
    report.captureHeight = document.body.offsetHeight;
    if (inlineDiagram && [...document.body.children].some(el => el !== inlineDiagram && !['SCRIPT', 'STYLE'].includes(el.tagName)))
      report.problems.push('본문 삽화는 그림(.diagram.diagram-only) 한 개만 둔다.');
    const required = inlineDiagram ? [] : [['body>h1', '제목(h1)이'], ['.diagram', '그림 영역(.diagram)이'], ['.panel', '아래 글 칸(.panel)이'], ['.panel .key', '"그래서" 문장(.panel .key)이']];
    for (const [sel, what] of required)
      if (!one(sel)) report.problems.push(`${what} 없다. 견본의 구조를 그대로 쓴다.`);

    // 장면 장표: 설명은 그림이 한다. 아래 글은 결론 한두 문장이고, 읽는 법·용어 칸은 없다
    if (document.querySelector('.panel h3, .panel ul, .panel ol, .panel .next'))
      report.problems.push('설명 패널(핵심·용어·읽는 법·이어지는 것)은 더 쓰지 않는다. 아래 글은 .key 한두 문장만 두고, 붙일 말은 ①②③ 딱지로 그림의 그 자리에 쓴다. 새 용어는 그 사물 옆에 짧게 쓴다.');
    {
      const cap = (one('.panel') || { textContent: '' }).textContent.replace(/\s+/g, '').length;
      if (cap > MAX_CAPTION) report.problems.push(`아래 글이 ${cap}자다(공백 빼고 ${MAX_CAPTION}자까지). 결론 한두 문장만 남기고, 설명은 그림으로 옮긴다.`);
    }
    // 그림 안 문장: 그림 안 글 한 덩어리는 이름·값·짧은 딱지까지다. 문장으로 설명하던 것을 모양으로 그린다
    {
      const long = [];
      for (const e of document.querySelectorAll('.diagram *')) {
        if (/^(style|script|pre)$/i.test(e.tagName)) continue;
        const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('')
          .replace(/[A-Za-z_`][\w.`-]*/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/\s+/g, '');  // 코드 이름(영문 식별자)과 견본 자리는 세지 않는다
        if (own.length > MAX_LABEL) long.push(own);
      }
      if (long.length) {
        const worst = long.sort((a, b) => b.length - a.length)[0];
        report.problems.push(`그림 안에 문장이 ${long.length}곳 있다(가장 긴 곳 "${worst.slice(0, 18)}…" ${worst.length}자, 코드 이름·공백 빼고 ${MAX_LABEL}자까지). 그림 안 글은 이름·값·짧은 딱지만 쓴다. 문장으로 설명하던 것을 모양(값이 든 표, 겹친 상자, 이어진 column, 막힌 길)으로 그린다.`);
      }
    }

    // 넘침: 글자를 줄이지 않고 글을 줄이거나 장표를 나눈다
    await new Promise(r => setTimeout(r, 50));
    for (const [sel, what, fix] of [
      ['body', '장표 전체가', '글을 줄이거나 장표를 나눈다'],
      ['body>h1', '제목이', '한 줄에 들어가게 줄인다'],
      ['body>.subtitle', '부제가', '한 줄에 들어가게 줄인다'],
      ['.diagram', '그림 영역이', '상자나 표의 줄을 줄이거나 장표를 나눈다'],
      ['.panel', '아래 글이', '결론 한두 문장으로 줄인다'],
      ['.source', '근거 줄이', '두 줄 안으로 줄인다'],
    ]) {
      const e = one(sel);
      if (!e) continue;
      const down = e.scrollHeight - e.clientHeight, side = e.scrollWidth - e.clientWidth;
      if (down > 2 || side > 2)
        report.problems.push(`${what} 넘친다(${[down > 2 && `아래로 ${down}px`, side > 2 && `옆으로 ${side}px`].filter(Boolean).join(', ')}). ${fix}.`);
    }
    // 그림 안의 상자·표가 제 칸을 옆으로 삐져나오는 경우(overflow가 보이는 요소라 위 검사에 안 잡힌다)
    const spilled = [...document.querySelectorAll('.diagram .group, .diagram .card, .diagram .layer')].filter(e => e.scrollWidth > e.clientWidth + 2);
    if (spilled.length)
      report.problems.push(`그림 안의 상자 ${spilled.length}개에서 내용이 옆으로 삐져나온다. 표의 칸이나 값을 줄이거나 장표를 나눈다.`);
  } catch (e) {
    report.failure = String((e && e.message) || e);
  }
  document.title = 'SLIDE-REPORT:' + encodeURIComponent(JSON.stringify(report));
})();
