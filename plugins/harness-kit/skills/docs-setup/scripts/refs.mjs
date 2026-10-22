// docs-setup 참조 grep · 참조 고침 계획 · (승인 뒤) 이동 적용.
// 사용:
//   node refs.mjs <레포 루트> <문서 경로>…                      옮길 문서마다 참조를 센다(읽기 전용)
//   node refs.mjs <레포 루트> --prefix <문자열>…                 접두 경로를 쓰는 줄(명령·훅·config 의 패턴 참조)
//   node refs.mjs <레포 루트> --plan <plan.json> [--list N]      이동 계획의 참조 고침 목록(읽기 전용)
//   node refs.mjs <레포 루트> --plan <plan.json> --apply --backup <디렉토리>   백업 → 이동 → 참조 고침
//   node refs.mjs <레포 루트> --plan <plan.json> --after        적용 뒤 남은 옛 경로(4단계 2번, 읽기 전용)
// plan.json: { "moves": [ { "from": "docs/a.md", "to": "docs/archive/a.md" } ] }  (레포 기준 상대경로)
// 공통: [--json <전체 출력 파일>] [--untracked-skip <접두>]…
// 판정 종류: link = 그 문서로 풀리는 마크다운 링크(자동 고침) · path = 레포 기준 경로 문자열(자동 고침, 링크 글자 안의 경로 포함)
//            name = 파일 이름만 맞는 줄(자동으로 고치지 않음 — 눈으로 본다) · out = 옮긴 문서 안의 상대 링크(자동 고침)
//            instr 표시 = 지시 문서(CLAUDE.md · .claude/ · harness.config.mjs)의 link·path — 경로만 바꾸면 에이전트가
//            시점 기록을 현행으로 읽으므로 자동으로 고치지 않는다(지우거나 현행 문서로 바꿀지 줄마다 묻는다)
//            banner = 옮긴 문서 배너의 출처 표기(「<옛 경로> 에서 옮겼다」) · label = 새 경로 링크·새 경로 문자열이 있는 줄의 파일 이름 — 둘 다 정상
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoFiles, readText, mdLinks, resolveLink, relLink, parseArgs, list } from './lib.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
if (!pos[0]) { console.error('사용: node refs.mjs <레포 루트> (<문서>… | --prefix <문자열> | --plan <plan.json> [--apply --backup <dir> | --after])'); process.exit(2); }
const root = path.resolve(pos[0]);
const skip = list(opt['untracked-skip']);
const limit = opt.list === undefined ? 20 : Number(opt.list);
const files = repoFiles(root).filter((f) => f.tracked || !skip.some((s) => f.rel.startsWith(s)));
const tracked = new Map(files.map((f) => [f.rel, f.tracked]));
const texts = new Map();
const notUtf8 = [];
for (const f of files) {
  const r = readText(path.join(root, f.rel));
  if (!r) continue;
  if (!r.utf8) { notUtf8.push(f.rel); continue; }
  texts.set(f.rel, r);
}
const tag = (rel) => (tracked.get(rel) ? '' : ' (미추적)');
const dump = (o) => { if (opt.json && opt.json !== true) writeFileSync(opt.json, JSON.stringify(o, null, 2)); };

// ── --prefix: 패턴 참조 ──
if (opt.prefix !== undefined) {
  const out = {};
  for (const p of list(opt.prefix)) {
    out[p] = [];
    for (const [rel, t] of texts) t.text.split('\n').forEach((l, i) => { if (l.includes(p)) out[p].push(`${rel}:${i + 1}${tag(rel)}  ${l.trim().slice(0, 110)}`); });
    console.log(`접두 '${p}' — ${out[p].length}줄 · 파일 ${new Set(out[p].map((h) => h.split(':')[0])).size}`);
    for (const h of out[p].slice(0, limit)) console.log(`  ${h}`);
    if (out[p].length > limit) console.log(`  … ${out[p].length - limit}줄 더(--list N · --json)`);
  }
  dump(out);
  process.exit(0);
}

// ── 이동 계획 ──
let moves = [];
if (opt.plan !== undefined) {
  moves = JSON.parse(readFileSync(path.resolve(String(opt.plan)), 'utf8')).moves || [];
} else {
  moves = pos.slice(1).map((from) => ({ from: from.replace(/\\/g, '/'), to: null }));
}
if (!moves.length) { console.error('옮길 문서가 없다'); process.exit(2); }
const after = Boolean(opt.after);
if (after && opt.plan === undefined) { console.error('--after 는 --plan 과 함께 쓴다(적용한 이동 계획)'); process.exit(2); }
if (after && opt.apply) { console.error('--after 는 읽기 전용이다 — --apply 와 함께 쓰지 않는다'); process.exit(2); }
const moveTo = new Map(moves.map((m) => [m.from, m.to]));
const finalPath = (rel) => (after ? rel : moveTo.get(rel) || rel);
const planned = opt.plan !== undefined && !after; // 적용 전 고침 목록 · 적용

/** 지시 문서 — 에이전트·커맨드·스킬·자동 로드 문서·config. 이 안의 참조는 경로만 바꾸지 않는다. */
const isInstruction = (rel) => /(^|\/)CLAUDE(\.local)?\.md$/.test(rel) || rel.startsWith('.claude/') || rel === 'harness.config.mjs';
/** 옮긴 문서 배너의 출처 표기 줄(TEMPLATES §1 「<옛 경로> 에서 옮겼다」). */
const isBannerOf = (line, from) => /^\s*>/.test(line) && /현행 아님/.test(line) && /에서 옮겼다/.test(line) && line.includes(from);

/** 한 파일 안의 참조 판정과 고친 본문. */
function scan(rel, text) {
  const hits = [];
  const lines = text.split('\n');
  const instr = isInstruction(rel);
  const linkAt = new Map(); // 줄 → [{ raw, file, anchor }]
  if (/\.mdx?$/i.test(rel)) for (const l of mdLinks(text)) {
    const r = resolveLink(rel, l.raw);
    if (r) linkAt.set(l.line, [...(linkAt.get(l.line) || []), { raw: l.raw, ...r }]);
  }
  const selfMoves = !after && moveTo.has(rel) && moveTo.get(rel);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const newLines = lines.map((line, i) => {
    let out = line;
    const n = i + 1;
    const handled = new Set();
    // 링크: 대상이 옮겨지거나 이 파일이 옮겨지면 새 위치 기준으로 다시 쓴다(지시 문서의 링크는 고치지 않고 따로 낸다)
    for (const lk of linkAt.get(n) || []) {
      const targetMoves = moveTo.has(lk.file);
      if (!targetMoves && !selfMoves) continue;
      const exists = moveTo.has(lk.file) || existsSync(path.join(root, lk.file));
      if (!exists) { hits.push({ rel, line: n, kind: 'broken', target: lk.file, text: lk.raw }); continue; }
      const to = after ? moveTo.get(lk.file) : finalPath(lk.file);
      const next = to && (selfMoves || targetMoves) ? relLink(finalPath(rel), to, lk.raw) + lk.anchor : null;
      if (targetMoves) handled.add(lk.file);
      const kind = targetMoves ? 'link' : 'out';
      const hold = instr && kind === 'link';
      if (next && next !== lk.raw) {
        hits.push({ rel, line: n, kind, target: lk.file, from: lk.raw, to: next, ...(hold ? { instr: true } : {}) });
        if (!hold && !after) out = out.split(`](${lk.raw}`).join(`](${next}`).split(`]: ${lk.raw}`).join(`]: ${next}`);
      } else hits.push({ rel, line: n, kind, target: lk.file, from: lk.raw, to: next || '(계획에 새 경로 없음)', ...(hold ? { instr: true } : {}) });
    }
    // 경로 문자열 · 이름만 — 이미 링크로 센 대상은 그 링크의 대상만 가린다. 링크 글자(`[docs/a.md](…)`)의 경로는 path 로 세고 고친다.
    // 이름만은 링크 글자까지 가린 줄로 본다(고칠 링크의 글자가 파일 이름이면 그 줄은 링크로 이미 셌다)
    let maskedTarget = line;
    let maskedAll = line;
    for (const lk of linkAt.get(n) || []) {
      if (!handled.has(lk.file)) continue;
      const linkRe = new RegExp(`\\[([^\\]]*)\\]\\(\\s*<?${esc(lk.raw)}[^)]*\\)`, 'g');
      maskedTarget = maskedTarget.replace(linkRe, (_, label) => `[${label}]()`).split(`]: ${lk.raw}`).join(']: ');
      maskedAll = maskedAll.replace(linkRe, '[]()').split(`]: ${lk.raw}`).join(']: ');
    }
    for (const m of moves) {
      if (m.from === rel) continue;
      const base = path.posix.basename(m.from);
      if (!maskedTarget.includes(base)) continue;
      if (isBannerOf(line, m.from)) { hits.push({ rel, line: n, kind: 'banner', target: m.from, text: line.trim().slice(0, 110) }); continue; }
      // 레포 기준 경로 문자열 — 앞 글자가 경로의 일부가 아닐 때만 맞는다(`x/docs/a.md` 는 아님)
      const variants = m.from.includes('/') ? [m.from, m.from.replace(/\//g, '\\')] : [];
      const v = variants.find((x) => new RegExp(`(^|[^\\w./\\\\-])${esc(x)}`).test(maskedTarget));
      if (v) {
        const to = m.to ? (v.includes('\\') ? m.to.replace(/\//g, '\\') : m.to) : null;
        hits.push({ rel, line: n, kind: 'path', target: m.from, from: v, to: to || '(계획에 새 경로 없음)', ...(instr ? { instr: true } : {}) });
        if (to && !instr && !after) out = out.replace(new RegExp(`(^|[^\\w./\\\\-])${esc(v)}`, 'g'), (_, p) => p + to);
        continue;
      }
      if (!maskedAll.includes(base)) continue;
      // 적용 뒤(--after)·계획 없이 볼 때 — 같은 이름의 열리는 링크(새 경로)가 있는 줄의 이름은 그 링크의 글자다
      // --after 에서는 새 경로 문자열(`docs/archive/a.md`)이 적힌 줄의 이름도 그 경로의 일부다
      const sameNameLink = !planned && (linkAt.get(n) || []).some((lk) => lk.file !== m.from && path.posix.basename(lk.file) === base && existsSync(path.join(root, lk.file)));
      const newPath = after && m.to && [m.to, m.to.replace(/\//g, '\\')].some((x) => line.includes(x));
      hits.push({ rel, line: n, kind: sameNameLink || newPath ? 'label' : 'name', target: m.from, text: line.trim().slice(0, 110) });
    }
    return out;
  });
  return { hits, text: newLines.join('\n') };
}

const results = [];
const rewrites = new Map();
for (const [rel, t] of texts) {
  const touches = moveTo.has(rel) || moves.some((m) => t.text.includes(path.posix.basename(m.from)));
  if (!touches) continue;
  const { hits, text } = scan(rel, t.text);
  results.push(...hits);
  if (text !== t.text || moveTo.has(rel)) rewrites.set(rel, { text, bom: t.bom });
}

// ── 보고 ──
const by = (k) => results.filter((h) => h.kind === k);
const held = results.filter((h) => h.instr);
for (const m of moves) {
  const hs = results.filter((h) => h.target === m.from && h.rel !== m.from);
  const c = (k) => hs.filter((h) => h.kind === k && !h.instr).length;
  const ci = hs.filter((h) => h.instr).length;
  const normal = hs.filter((h) => h.kind === 'banner' || h.kind === 'label').length;
  console.log(`${m.from}${m.to ? ' → ' + m.to : ''} · 링크 ${c('link')} · 경로 ${c('path')} · 지시 문서 ${ci} · 이름만 ${c('name')}${normal ? ` · 정상(배너 출처·새 경로 표기) ${normal}` : ''} · 파일 ${new Set(hs.filter((h) => h.kind !== 'banner' && h.kind !== 'label').map((h) => h.rel)).size}`);
}
const fmt = (h) => `  ${(h.instr ? 'instr' : h.kind).padEnd(6)} ${h.rel}:${h.line}${tag(h.rel)}  ${h.from !== undefined ? `${h.from} → ${h.to}` : h.text || h.target}`;
const fixable = [...by('link'), ...by('path'), ...by('out')].filter((h) => !h.instr && h.to && !h.to.startsWith('(') && h.from !== h.to);
const tail = `눈으로 볼 것(이름만) ${by('name').length} · 이미 깨진 링크 ${by('broken').length} · UTF-8 아닌 파일 ${notUtf8.length}`;
if (planned) {
  const fx = (k) => fixable.filter((h) => h.kind === k).length;
  console.log(`합계: 자동 고침 ${fixable.length}건(링크 ${fx('link')} · 경로 ${fx('path')} · 옮긴 문서 안 ${fx('out')}) · 지시 문서 ${held.length}줄(자동으로 고치지 않음 — 지우거나 현행 문서로 바꿀지 줄마다 묻는다) · ${tail}`);
  for (const h of [...fixable, ...held, ...by('name'), ...by('broken')].slice(0, limit)) console.log(fmt(h));
  const all = fixable.length + held.length + by('name').length + by('broken').length;
  if (all > limit) console.log(`  … ${all - limit}건 더(--list N · --json)`);
} else {
  // 고치지 않는 판(계획 없이 · 적용 뒤) — 남은 참조를 센다
  const left = results.filter((h) => ['link', 'path', 'out', 'name', 'broken'].includes(h.kind));
  const cnt = (k) => left.filter((h) => h.kind === k && !h.instr).length;
  console.log(`${after ? '남은 옛 경로' : '참조 합계'}: 링크 ${cnt('link')} · 경로 ${cnt('path')} · 지시 문서 ${held.length} · 이름만 ${cnt('name')} · 정상 ${by('banner').length + by('label').length}(배너 출처 ${by('banner').length} · 새 경로 표기 ${by('label').length}) · 이미 깨진 링크 ${by('broken').length} · UTF-8 아닌 파일 ${notUtf8.length}`);
  if (after || opt.list !== undefined) {
    for (const h of left.slice(0, limit)) console.log(fmt(h));
    if (left.length > limit) console.log(`  … ${left.length - limit}건 더(--list N · --json)`);
  }
  if (after) for (const m of moves) {
    if (existsSync(path.join(root, m.from))) console.log(`WARN 옛 경로가 아직 있다: ${m.from}`);
    if (!m.to || !existsSync(path.join(root, m.to))) console.log(`WARN 새 경로가 없다: ${m.to}`);
  }
}
if (notUtf8.length) console.log(`UTF-8 아님(검사·고침 제외): ${notUtf8.slice(0, 5).join(', ')}${notUtf8.length > 5 ? ' …' : ''}`);
dump({ moves, hits: results, rewrite: [...rewrites.keys()], notUtf8 });

if (!opt.apply) process.exit(0);

// ── 적용: 백업 → 이동 → 참조 고침 ──
if (opt.plan === undefined || !opt.backup || opt.backup === true) { console.error('--apply 는 --plan 과 --backup <디렉토리> 가 함께 있어야 한다'); process.exit(2); }
const problems = [];
for (const m of moves) {
  if (!m.to) problems.push(`새 경로 없음: ${m.from}`);
  else if (!existsSync(path.join(root, m.from))) problems.push(`원본 없음: ${m.from}`);
  else if (existsSync(path.join(root, m.to))) problems.push(`대상이 이미 있음: ${m.to}`);
}
for (const rel of rewrites.keys()) if (notUtf8.includes(rel)) problems.push(`UTF-8 아님: ${rel}`);
if (problems.length) { console.error(`적용 중단 — ${problems.join(' · ')}`); process.exit(1); }
const backup = path.resolve(String(opt.backup));
for (const rel of new Set([...moves.map((m) => m.from), ...rewrites.keys()])) {
  const dst = path.join(backup, rel);
  mkdirSync(path.dirname(dst), { recursive: true });
  copyFileSync(path.join(root, rel), dst);
}
writeFileSync(path.join(backup, 'docs-setup-backup.json'), JSON.stringify({ at: new Date().toISOString(), moves, rewritten: [...rewrites.keys()] }, null, 2));
for (const m of moves) {
  mkdirSync(path.dirname(path.join(root, m.to)), { recursive: true });
  renameSync(path.join(root, m.from), path.join(root, m.to));
}
for (const [rel, { text, bom }] of rewrites) {
  const dst = path.join(root, finalPath(rel));
  writeFileSync(dst, (bom ? '﻿' : '') + text, 'utf8');
}
console.log(`적용: 이동 ${moves.length} · 고친 파일 ${rewrites.size}${held.length ? ` · 지시 문서 ${held.length}줄은 고치지 않았다(3단계 답대로 Edit)` : ''} · 백업 ${backup}`);
