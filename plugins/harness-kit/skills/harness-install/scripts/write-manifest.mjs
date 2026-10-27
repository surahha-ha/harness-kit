#!/usr/bin/env node
/**
 * harness-install 9단계 — 설치 영수증(harness.install.json)을 쓴다.
 *
 * 사용: node write-manifest.mjs <레포 루트> <초안 JSON> [--example <harness.config.example.mjs 사본>]
 *   초안은 메인이 체크포인트에서 옮겨 Write 로 쓴다(꼴은 TEMPLATES.md §9). 이 스크립트는
 *   ① 디렉토리 항목을 파일로 펴고 ② 파일·블록·줄의 sha256 을 채우고 ③ 적힌 것이 실제로 있는지 대조한 뒤
 *   ④ 개인 경로가 없을 때만 레포 루트에 영수증을 쓴다. 하나라도 어긋나면 쓰지 않고 종료코드 1.
 *   ⑤ 초안의 tier(설치 범위 — light|instrumented)를 적고, 그 범위와 settings 훅이 맞는지 본다(schema 2).
 *   ⑥ --example 을 주면 config 칸마다 설치 전 값(example 원문)을 config.slots 에 적는다 — 걷어내기가
 *      범위를 낮출 때(계측 → 라이트) 그 칸을 이 값으로 되돌린다(harness-uninstall 의 칸 되돌리기).
 *
 * sha256 은 줄끝을 LF 로 맞춘 UTF-8 내용의 해시다 — autocrlf 트리에서는 같은 파일이 PC 마다 CRLF·LF 로 다르다.
 * 블록·줄의 해시는 harness-uninstall 이 같은 방식으로 계산해 「설치 뒤 손댄 것」을 가른다.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { LABEL, RANK, hookSpec, hooksFor, normTier, tierOfSlot } from './tiers.mjs';
import { scanConfig, slotValue } from '../../docs-setup/scripts/config-slots.mjs';

const argv = process.argv.slice(2);
const exIdx = argv.indexOf('--example');
const exampleArg = exIdx >= 0 ? argv[exIdx + 1] : null;
const [rootArg, draftArg] = argv.filter((_, i) => exIdx < 0 || (i !== exIdx && i !== exIdx + 1));
if (!rootArg || !draftArg) { console.error('사용: node write-manifest.mjs <레포 루트> <초안 JSON> [--example <example 사본>]'); process.exit(2); }
const root = path.resolve(rootArg);
const draft = JSON.parse(readFileSync(path.resolve(draftArg), 'utf8'));
const OUT = 'harness.install.json';
const abs = (rel) => path.join(root, rel);
const read = (rel) => readFileSync(abs(rel), 'utf8');

const norm = (s) => s.replace(/\r\n/g, '\n');
const sha = (s) => createHash('sha256').update(norm(s), 'utf8').digest('hex');
const lines = (t) => (t === '' ? [] : t.split(/(?<=\n)/));
const body = (l) => l.replace(/\r?\n$/, '');
const MARKS = {
  md: { begin: '<!-- harness-kit:begin -->', end: '<!-- harness-kit:end -->', line: '<!-- harness-kit:line -->' },
  hash: { begin: '# harness-kit:begin', end: '# harness-kit:end', line: null },
};
const marksFor = (f) => (/\.(md|markdown)$/i.test(f) ? MARKS.md : MARKS.hash);
function marked(ls, m) {
  const blocks = [], one = [];
  let open = -1;
  ls.forEach((l, i) => {
    const t = body(l).trim();
    if (t === m.begin) open = i;
    else if (t === m.end && open >= 0) { blocks.push([open, i]); open = -1; }
    else if (open < 0 && m.line && body(l).includes(m.line)) one.push(i);
  });
  return { blocks, one, unclosed: open >= 0 };
}

let fail = 0;
const bad = (m) => { fail++; console.log(`FAIL ${m}`); };
const relOk = (p) => typeof p === 'string' && p && !path.isAbsolute(p) && !/^[A-Za-z]:/.test(p) && !p.split(/[\\/]/).includes('..');

// ① 만든 파일 — 디렉토리는 펴고(런타임 *.jsonl 은 뺀다) 해시를 채운다
const files = [];
for (const f of draft.files || []) {
  if (!relOk(f.path)) { bad(`files 경로가 상대경로가 아님: ${f.path}`); continue; }
  if (!existsSync(abs(f.path))) { bad(`없는 파일: ${f.path}`); continue; }
  if (statSync(abs(f.path)).isDirectory()) {
    const walk = (d) => readdirSync(abs(d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
    for (const p of walk(f.path.replace(/[\\/]+$/, '')).sort()) {
      if (/^[^/]+\/[^/]+\.jsonl$/.test(p)) continue;
      files.push({ path: p, role: f.role, sha256: sha(read(p)) });
    }
  } else files.push({ path: f.path, role: f.role, ...(f.why ? { why: f.why } : {}), sha256: sha(read(f.path)) });
}

// ② 고친 파일 — block·line 은 표시를 찾아 해시를, replace 는 바뀐 원문의 수를 대조한다
const edits = [];
const byPath = new Map();
for (const e of draft.edits || []) { if (!byPath.has(e.path)) byPath.set(e.path, []); byPath.get(e.path).push(e); }
for (const [p, es] of byPath) {
  if (!relOk(p) || !existsSync(abs(p))) { bad(`edits 대상이 없거나 상대경로가 아님: ${p}`); continue; }
  const text = read(p), ls = lines(text), m = marked(ls, marksFor(p));
  if (m.unclosed) bad(`${p}: 닫히지 않은 시작 표시`);
  const blocks = es.filter((e) => e.how === 'block'), one = es.filter((e) => e.how === 'line');
  if (blocks.length !== m.blocks.length) bad(`${p}: 표시 블록 ${m.blocks.length}개 · 초안 ${blocks.length}개`);
  if (one.length !== m.one.length) bad(`${p}: 한 줄 표시 ${m.one.length}개 · 초안 ${one.length}개`);
  m.blocks.forEach(([s, t], i) => {
    if (!blocks[i]) return;
    const inner = ls.slice(s + 1, t).map(body);
    edits.push({ path: p, how: 'block', sha256: sha(ls.slice(s, t + 1).map(body).join('\n')),
      ...(marksFor(p) === MARKS.hash ? { lines: inner.filter((l) => l.trim() && !l.trim().startsWith('#')) } : { first: (inner.find((l) => l.trim()) || '').slice(0, 80) }) });
  });
  m.one.forEach((i, k) => { if (one[k]) edits.push({ path: p, how: 'line', sha256: sha(body(ls[i])) }); });
  for (const e of es.filter((x) => x.how === 'replace')) {
    const after = /\r\n/.test(text) ? norm(e.after).replace(/\n/g, '\r\n') : norm(e.after);
    let n = 0, i = text.indexOf(after);
    while (i >= 0 && after) { n++; i = text.indexOf(after, i + after.length); }
    const want = e.count ?? 1;
    if (n !== want) bad(`${p}: replace 의 바뀐 원문이 ${n}곳(초안 ${want}곳) — ${norm(e.after).split('\n')[0].slice(0, 60)}`);
    edits.push({ path: p, how: 'replace', before: norm(e.before), after: norm(e.after), count: want });
  }
  for (const e of es) if (!['block', 'line', 'replace'].includes(e.how)) bad(`${p}: 모르는 how ${e.how}`);
}

// ③ settings — 적힌 훅·키가 실제로 있는가
const st = draft.settings || null;
if (st) {
  const json = JSON.parse(read(st.path || '.claude/settings.json').replace(/^\uFEFF/, ''));
  for (const h of st.hooks || []) {
    const groups = (json.hooks || {})[h.event] || [];
    const hit = groups.some((g) => (g.matcher ?? null) === (h.matcher ?? null) && (g.hooks || []).some((x) => x.command === h.command));
    if (!hit) bad(`settings 훅 없음: ${h.event} | ${h.matcher ?? '*'} | ${h.command}`);
  }
  for (const k of st.keys || []) {
    let v = json;
    for (const s of k.path) v = v == null ? undefined : v[s];
    if (JSON.stringify(v) !== JSON.stringify(k.value)) bad(`settings 키 값이 다름: ${k.path.join('.')} = ${JSON.stringify(v)}`);
  }
}

// ⑤ 범위 — 초안의 tier 와 settings 의 하네스 훅이 맞는가(그 범위의 훅은 다 있고, 범위 밖 훅은 없다)
const tier = normTier(draft.tier);
if (!tier) bad(`tier 가 없거나 모르는 값(${JSON.stringify(draft.tier ?? null)}) — 설치 범위(D0) 답을 light(라이트)·instrumented(계측)로 적는다`);
if (tier && st) {
  const hs = (st.hooks || []).map((h) => ({ h, spec: hookSpec(h.event, h.command) }));
  for (const { h, spec } of hs) if (spec && RANK[spec.tier] > RANK[tier]) bad(`${LABEL[tier]} 범위인데 ${spec.what} 훅이 있다: ${h.event} | ${h.command}`);
  for (const spec of hooksFor(tier)) if (!hs.some((x) => x.spec === spec)) bad(`${LABEL[tier]} 범위의 ${spec.what} 훅(${spec.event})이 settings.hooks 에 없다`);
}

// ⑥ config 칸 — 설치가 바꾼 칸마다 설치 전 값(example 원문)과 범위
let slots = null;
const cfgFile = files.find((f) => f.role === 'config');
if (exampleArg && cfgFile) {
  const ex = readFileSync(path.resolve(exampleArg), 'utf8').replace(/^\uFEFF/, ''), cf = read(cfgFile.path).replace(/^\uFEFF/, '');
  const E = scanConfig(ex).props, C = scanConfig(cf).props;
  const parentOf = (p) => p.split('.').slice(0, -1).join('.');
  const has = (M, p) => p === '' || M.has(p);
  slots = [];
  const entry = (p, e, c) => {
    const ev = e && slotValue(ex, p), cv = c && slotValue(cf, p);
    if ((e && !ev) || (c && !cv)) { bad(`config 칸 ${p} 의 값을 읽지 못했다`); return; }
    slots.push({ path: p, tier: tierOfSlot(p), before: ev ? ev.source : null, beforeNote: ev ? ev.note : null, afterSha: cv ? sha(cv.source) : null });
  };
  for (const [p, c] of C) {
    if (!has(E, parentOf(p))) continue;              // 위 칸이 example 에 없다 — 그 위 칸 하나로 적는다
    const e = E.get(p);
    if (!e) { entry(p, null, c); continue; }          // example 에 없던 칸 — 되돌리기는 칸째 지운다
    if (e.object && c.object) continue;               // 둘 다 객체 — 아래 칸에서 본다
    const a = slotValue(ex, p), b = slotValue(cf, p);
    if (!a || !b || norm(a.source).trim() !== norm(b.source).trim() || (!!a.note) !== (!!b.note) || (a.note && b.note && a.note !== b.note)) entry(p, e, c);
  }
  for (const [p, e] of E) if (!C.has(p) && has(C, parentOf(p))) entry(p, e, null);   // 설치가 지운 칸
} else if (cfgFile) console.log('INFO --example 이 없어 config.slots 를 적지 않았다 — 범위 낮추기(걷어내기)에서 칸을 되돌릴 기준이 없다. 9단계는 §5 ② 의 example 사본을 넘긴다');

// ④ 반출 — 개인 경로·사용자 홈이 없는가
const manifest = {
  schema: 2, tool: 'harness-install', installedAt: draft.installedAt || new Date().toISOString(), tier,
  source: draft.source, kit: draft.kit || null, decisions: draft.decisions || [],
  files, edits, settings: st ? { path: st.path || '.claude/settings.json', hooks: st.hooks || [], keys: st.keys || [] } : null, plugin: draft.plugin || null,
  // D9·D10 — 커밋되지 않는 로컬 항목의 기록. 해시를 채우지 않는다(PC·트리마다 다르다). 경로는 상대경로 · ~/ · git-path: 꼴만
  ...(draft.local ? { local: draft.local } : {}),
  ...(slots ? { config: { path: cfgFile.path, slots } } : {}),
};
for (const [k, v] of Object.entries(draft.local || {})) {
  if (!['graft', 'statusline'].includes(k)) bad(`local 에 모르는 항목: ${k}`);
  for (const p of (v && v.items) || []) if (typeof p !== 'string' || !(relOk(p.split('#')[0]) || p.startsWith('~/') || p.startsWith('git-path:'))) bad(`local.${k}.items 경로가 상대경로·~/·git-path: 꼴이 아님: ${p}`);
}
const text = JSON.stringify(manifest, null, 2) + '\n';
const home = os.homedir().replace(/\\/g, '/');
for (const s of text.match(/"(?:[^"\\]|\\.)*"/g) || []) {
  const v = JSON.parse(s).replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(v) || /(^|[\s(])\/(Users|home)\//.test(v) || (home && v.toLowerCase().includes(home.toLowerCase()))) bad(`개인 경로로 보이는 값: ${v.slice(0, 80)}`);
}
if (!manifest.source || !/^[0-9a-f]{40}$/.test(manifest.source.sha || '')) bad('source.sha 가 40자 SHA 가 아님');

if (fail) { console.log(`failures=${fail} — 영수증을 쓰지 않았다`); process.exit(1); }
writeFileSync(abs(OUT), text, 'utf8');
console.log(`OK   ${OUT} — 범위 ${LABEL[tier]} · 파일 ${files.length} · 고친 곳 ${edits.length} · 훅 ${(st && st.hooks || []).length} · 키 ${(st && st.keys || []).length}${slots ? ` · config 칸 ${slots.length}(계측 칸 ${slots.filter((s) => s.tier === 'instrumented').length})` : ''}`);
