/**
 * harness-uninstall 의 순수 편집 함수 — 파일 시스템을 만지지 않는다.
 *
 * 원칙: 지울 것의 바이트 범위만 잘라 낸다. 나머지 바이트(들여쓰기·키 순서·줄끝·BOM)는 그대로 둔다.
 * JSON 을 parse → stringify 로 다시 쓰면 그 레포의 서식이 바뀌어, 하네스와 무관한 diff 가 생긴다.
 */
import { createHash } from 'node:crypto';

// ── 해시 · 줄 ────────────────────────────────────────────────────────────────

/** 줄끝을 LF 로 맞춘다 — autocrlf 트리에서는 같은 내용이 PC 마다 CRLF·LF 로 다르다. */
export const normEol = (s) => s.replace(/\r\n/g, '\n');

/** 영수증의 sha256 — 줄끝을 LF 로 정규화한 UTF-8 내용의 해시. */
export const sha256 = (text) => createHash('sha256').update(normEol(text), 'utf8').digest('hex');

/** 줄 배열(줄끝 포함). 빈 문자열은 빈 배열. */
export const splitLines = (text) => (text === '' ? [] : text.split(/(?<=\n)/));

/** 줄끝을 뺀 본문. */
export const body = (line) => line.replace(/\r?\n$/, '');

export const isBlank = (line) => line !== undefined && body(line).trim() === '';

// ── 경계 표시 ────────────────────────────────────────────────────────────────

export const MARKS = {
  md: { begin: '<!-- harness-kit:begin -->', end: '<!-- harness-kit:end -->', line: '<!-- harness-kit:line -->' },
  hash: { begin: '# harness-kit:begin', end: '# harness-kit:end', line: null },
};

/** 파일 종류별 표시 — Markdown 은 HTML 주석, 그 밖(.gitignore 류)은 # 주석. */
export const marksFor = (file) => (/\.(md|markdown)$/i.test(file) ? MARKS.md : MARKS.hash);

/**
 * 표시로 감싼 블록과 한 줄 표시를 찾는다.
 * @returns {{ blocks: {start:number,end:number}[], lines: number[], errors: string[] }} 줄 번호는 0 부터, end 포함
 */
export function findMarked(lines, marks) {
  const blocks = [], marked = [], errors = [];
  let open = -1;
  lines.forEach((l, i) => {
    const t = body(l).trim();
    if (t === marks.begin) {
      if (open >= 0) errors.push(`${open + 1}행의 시작 표시가 닫히기 전에 ${i + 1}행에서 다시 열림`);
      open = i;
    } else if (t === marks.end) {
      if (open < 0) errors.push(`${i + 1}행의 끝 표시에 짝이 되는 시작 표시가 없음`);
      else blocks.push({ start: open, end: i });
      open = -1;
    } else if (open < 0 && marks.line && body(l).includes(marks.line)) marked.push(i);
  });
  if (open >= 0) errors.push(`${open + 1}행의 시작 표시가 끝나지 않음`);
  return { blocks, lines: marked, errors };
}

/**
 * 블록 범위를 지울 때 함께 지울 빈 줄을 정한다.
 * 설치가 「빈 줄 + 블록 + 빈 줄」로 넣었으면 빈 줄 하나만 남겨야 원래대로 돌아간다.
 */
export function widen({ start, end }, lines) {
  if (isBlank(lines[end + 1]) && (start === 0 || isBlank(lines[start - 1]))) return { start, end: end + 1 };
  if (end === lines.length - 1 && start > 0 && isBlank(lines[start - 1])) return { start: start - 1, end };
  return { start, end };
}

/** 범위들(겹치지 않음)을 지운 줄 배열. */
export function dropRanges(lines, ranges) {
  const drop = new Set();
  for (const r of ranges) for (let i = r.start; i <= r.end; i++) drop.add(i);
  return lines.filter((_, i) => !drop.has(i));
}

/** 코드 펜스 밖의 줄인지 — 펜스 안의 `# …` 는 제목이 아니다. */
export function fenceMask(lines) {
  let fence = null;
  return lines.map((l) => {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(body(l));
    if (m) {
      if (!fence) { fence = m[1][0]; return true; }
      if (m[1][0] === fence) { fence = null; return true; }
    }
    return fence !== null;
  });
}

/**
 * 표시 없는 옛 설치의 「개발 하네스」 절 — 제목 줄부터 같은 단계 이상의 다음 제목 직전까지.
 * @returns {{start:number,end:number,heading:string}|null}
 */
export function findSection(lines, title = '개발 하네스') {
  const inFence = fenceMask(lines);
  const re = new RegExp(`^(#{1,6})\\s+${title}(?![\\w가-힣])`);
  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) continue;
    const m = re.exec(body(lines[i]));
    if (!m) continue;
    const level = m[1].length;
    let end = lines.length - 1;
    for (let j = i + 1; j < lines.length; j++) {
      const h = /^(#{1,6})\s/.exec(body(lines[j]));
      if (!inFence[j] && h && h[1].length <= level) { end = j - 1; break; }
    }
    return { start: i, end, heading: body(lines[i]) };
  }
  return null;
}

/** 절 밖에서 그 절을 가리키는 줄(라우팅 한 줄) — 「개발 하네스」 절 참조 꼴. */
export function findPointerLines(lines, skip = () => false) {
  const inFence = fenceMask(lines);
  const out = [];
  lines.forEach((l, i) => {
    if (!inFence[i] && !skip(i) && /개발 하네스」?\s*(절|section)/.test(body(l))) out.push(i);
  });
  return out;
}

/** 표시 없는 옛 설치의 .gitignore 하네스 줄 묶음 — 하네스 경로 줄과 바로 위 주석 줄. */
export function findIgnoreGroups(lines) {
  const isHarness = (l) => /^\/?\.harness\//.test(body(l).trim());
  const groups = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isHarness(lines[i])) continue;
    let start = i, end = i;
    while (end + 1 < lines.length && isHarness(lines[end + 1])) end++;
    while (start > 0 && /^#/.test(body(lines[start - 1]).trim()) && /하네스|harness/i.test(body(lines[start - 1]))) start--;
    groups.push({ start, end });
    i = end;
  }
  return groups;
}

/** 줄 범위의 해시 — 블록·절·줄 묶음을 찾을 때 쓰는 신원. */
export const rangeSha = (lines, { start, end }) => sha256(lines.slice(start, end + 1).map(body).join('\n'));

/** 텍스트 안에 needle 이 몇 번 나오는가(겹치지 않게). */
export function countText(text, needle) {
  if (!needle) return 0;
  let n = 0, i = text.indexOf(needle);
  while (i >= 0) { n++; i = text.indexOf(needle, i + needle.length); }
  return n;
}

/** 파일의 줄끝에 맞춘 문자열 — 영수증의 before/after 는 LF 로 적혀 있다. */
export const toFileEol = (s, text) => (/\r\n/.test(text) ? normEol(s).replace(/\n/g, '\r\n') : normEol(s));

/**
 * 한 파일에 대한 텍스트 연산을 한 번에 적용한다.
 * op: block · section · ignore(줄 묶음) · line(한 줄) — 범위의 해시(sha)로 찾는다 / replace — after 를 before 로 되돌린다.
 * 해시로 찾으므로 다시 돌려도 이미 지운 것은 'not-found' 로 끝나고 다른 블록을 잘못 지우지 않는다.
 * @returns {{ text: string, results: Record<string, 'removed'|'reverted'|'not-found'|'mismatch'> }}
 */
export function applyTextOps(text, ops, file) {
  const results = {};
  for (const o of ops.filter((x) => x.op === 'replace')) {
    const after = toFileEol(o.after, text), before = toFileEol(o.before, text);
    const n = countText(text, after);
    if (n === 0) { results[o.id] = 'not-found'; continue; }
    if (n !== (o.count ?? 1)) { results[o.id] = 'mismatch'; continue; }
    text = text.split(after).join(before);
    results[o.id] = 'reverted';
  }
  const lines = splitLines(text);
  const pool = {
    block: findMarked(lines, marksFor(file)).blocks,
    section: [findSection(lines)].filter(Boolean),
    ignore: findIgnoreGroups(lines),
  };
  const ranges = [];
  const taken = (k) => ranges.some((r) => k >= r.start && k <= r.end);
  for (const o of ops.filter((x) => x.op !== 'replace')) {
    let r = null;
    if (o.op === 'line') {
      const i = lines.findIndex((l, k) => !taken(k) && sha256(body(l)) === o.sha);
      if (i >= 0) r = { start: i, end: i };
    } else r = (pool[o.op] || []).find((x) => rangeSha(lines, x) === o.sha) || null;
    if (!r) { results[o.id] = 'not-found'; continue; }
    ranges.push(o.op === 'line' ? r : widen(r, lines));
    results[o.id] = 'removed';
  }
  return { text: dropRanges(lines, ranges).join(''), results };
}

// ── JSON 바이트 범위 ─────────────────────────────────────────────────────────

/**
 * 위치를 기록하는 JSON 파서. 값마다 { type, start, end }, 객체·배열은 members 를 갖는다.
 * 객체 member: { key, start(키 시작), end(값 끝), value } · 배열 member: { start, end, value }
 */
export function parseSpans(text) {
  let i = 0;
  const fail = (m) => { throw new Error(`JSON ${i} 위치: ${m}`); };
  const ws = () => { while (i < text.length && /[\s\uFEFF]/.test(text[i])) i++; };
  const str = () => {
    if (text[i] !== '"') fail('문자열이 아님');
    let j = i + 1;
    while (text[j] !== '"') { if (j >= text.length) fail('문자열이 닫히지 않음'); if (text[j] === '\\') j++; j++; }
    const raw = text.slice(i, j + 1);
    i = j + 1;
    return JSON.parse(raw);
  };
  const value = () => {
    ws();
    const start = i, c = text[i];
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']';
      i++;
      const members = [];
      ws();
      if (text[i] === close) { i++; return { type: c === '{' ? 'object' : 'array', start, end: i, members }; }
      for (;;) {
        ws();
        if (c === '{') {
          const keyStart = i, key = str();
          ws();
          if (text[i] !== ':') fail('콜론 없음');
          i++;
          const v = value();
          members.push({ key, start: keyStart, end: v.end, value: v });
        } else {
          const v = value();
          members.push({ start: v.start, end: v.end, value: v });
        }
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === close) { i++; break; }
        fail('쉼표나 닫는 괄호가 없음');
      }
      return { type: c === '{' ? 'object' : 'array', start, end: i, members };
    }
    if (c === '"') { str(); return { type: 'string', start, end: i }; }
    const m = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i));
    if (!m) fail('알 수 없는 값');
    i += m[0].length;
    return { type: 'literal', start, end: i };
  };
  const root = value();
  ws();
  if (i !== text.length) fail('값 뒤에 남은 글자');
  return root;
}

/** 이 member 를 지운 텍스트 — 앞 member 끝부터 이 member 끝까지(첫 member 면 다음 member 시작까지) 잘라 낸다. */
export function removeMember(text, container, index) {
  const ms = container.members;
  if (ms.length === 1) return text.slice(0, container.start + 1) + text.slice(container.end - 1);
  if (index > 0) return text.slice(0, ms[index - 1].end) + text.slice(ms[index].end);
  return text.slice(0, ms[0].start) + text.slice(ms[1].start);
}

/** 객체 경로로 member 를 찾는다. @returns {{parent, index, member}|null} */
export function findKey(root, keys) {
  let node = root, parent = null, index = -1;
  for (const k of keys) {
    if (!node || node.type !== 'object') return null;
    index = node.members.findIndex((m) => m.key === k);
    if (index < 0) return null;
    parent = node;
    node = node.members[index].value;
  }
  return { parent, index, member: parent.members[index] };
}

/** 객체 키를 지운다. 그 키가 마지막이라 부모가 비면 부모 키도 지운다(최상위는 남긴다). */
export function deleteKey(text, keys) {
  const root = parseSpans(text);
  const hit = findKey(root, keys);
  if (!hit) return { text, removed: false };
  if (hit.parent.members.length === 1 && keys.length > 1) return { text: deleteKey(text, keys.slice(0, -1)).text, removed: true, parentRemoved: true };
  return { text: removeMember(text, hit.parent, hit.index), removed: true };
}

/** 훅 항목을 "이벤트 | matcher | 명령" 목록으로 편다. */
export function hookEntries(json) {
  const out = [];
  for (const [ev, groups] of Object.entries((json && json.hooks) || {}))
    for (const g of Array.isArray(groups) ? groups : []) for (const h of g.hooks || []) out.push({ event: ev, matcher: g.matcher ?? null, command: h.command, hook: h });
  return out;
}

/**
 * 훅 하나를 지운다 — 그룹에 그 훅뿐이면 그룹을, 이벤트에 그 그룹뿐이면 이벤트 키를, hooks 가 비면 hooks 키를 지운다.
 * 같은 그룹의 다른 훅·같은 이벤트의 다른 그룹은 건드리지 않는다.
 */
export function deleteHook(text, { event, command, matcher }) {
  const root = parseSpans(text);
  const json = JSON.parse(text.replace(/^\uFEFF/, ''));
  const groups = json.hooks && json.hooks[event];
  if (!Array.isArray(groups)) return { text, removed: false };
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    if (matcher !== undefined && (g.matcher ?? null) !== matcher) continue;
    const hi = (g.hooks || []).findIndex((h) => h.command === command);
    if (hi < 0) continue;
    const ev = findKey(root, ['hooks', event]).member.value;
    const hooksNode = ev.members[gi].value.members.find((m) => m.key === 'hooks').value;
    if (hooksNode.members.length > 1) return { text: removeMember(text, hooksNode, hi), removed: true };
    if (ev.members.length > 1) return { text: removeMember(text, ev, gi), removed: true };
    return { text: deleteKey(text, ['hooks', event]).text, removed: true };
  }
  return { text, removed: false };
}

/** 객체마다 같은 키가 두 번 나오는지 — JSON.parse 는 중복을 말없이 뒤쪽으로 덮는다. */
export function dupKeys(text) {
  const dups = [];
  const walk = (node, p) => {
    if (node.type === 'object') {
      const seen = new Set();
      for (const m of node.members) { if (seen.has(m.key)) dups.push(`${p}.${m.key}`); seen.add(m.key); walk(m.value, `${p}.${m.key}`); }
    } else if (node.type === 'array') node.members.forEach((m) => walk(m.value, `${p}[]`));
  };
  walk(parseSpans(text), '$');
  return dups;
}
