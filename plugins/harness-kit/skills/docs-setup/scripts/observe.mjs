// docs-setup 1단계 관찰 — 읽기 전용.
// 사용: node observe.mjs <레포 루트> [--slug <메모리 슬러그>]… [--json <전체 출력 파일>] [--untracked-skip <접두>]… [--line-max 150]
// 표준 출력은 요약만 낸다. 문서별 표·참조 수·메모리 상세는 --json 파일에 둔다.
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoFiles, readText, mdLinks, resolveLink, parseArgs, list, fenceTracker } from './lib.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
if (!pos[0]) { console.error('사용: node observe.mjs <레포 루트> [--slug <슬러그>] [--json <파일>]'); process.exit(2); }
const root = path.resolve(pos[0]);
const skip = list(opt['untracked-skip']);
const files = repoFiles(root).filter((f) => f.tracked || !skip.some((s) => f.rel.startsWith(s)));
const git = (...a) => { try { return execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).trim(); } catch { return ''; } };

// ── 표지(힌트) — 판정은 본문을 열어 사람이 한다 ──
const DONE = /✅|\bDONE\b|\bCOMPLETE(D)?\b|\bCLOSED\b|완료|종료|마감/g;
const OPEN = /\bTODO\b|IN[_ ]PROGRESS|\bACTIVE\b|\bBLOCKED\b|진행 ?중|대기|미완|후속|착수 전|예정/g;
// 배너 — 문서 첫머리의 배너 줄. 첫머리는 첫 15줄 안 · 코드 펜스 밖에서, 첫 제목을 하나 본 뒤 나오는 다음 제목(수준 무관) 전까지다.
// 첫 제목이 `#` 이든 `##` 이든 그 제목 바로 아래(제목이 없으면 맨 위)가 배너 자리다(TEMPLATES §1).
// 배너 줄은 인용(`>`)·경고 표시(⚠)·굵은 글씨(`**`)로 시작하고 표지 낱말을 담는다. 표 줄 · 목록 줄 · 일반 문단은 배너가 아니다 —
// 인수 시험에서 docs-setup 이 만든 docs/README.md 의 성격표 줄(「시점 기록 — 현행 아님」)을 배너로 읽어 아카이브 문서로 오판했다
const BANNER_WORD = /현행 아님|시점 (문서|기록)|archived|superseded|폐기됨/i;
const BANNER_LEAD = /^\s*(?:>|⚠|\*\*|:warning:)/;
const HEADING = /^\s*#{1,6}(?:\s|$)/;
function hasBanner(lines) {
  const inFence = fenceTracker();
  let seenHeading = false;
  for (const l of lines.slice(0, 15)) {
    if (inFence(l)) continue;
    if (HEADING.test(l)) {
      if (seenHeading) break;
      seenHeading = true;
      continue;
    }
    if (BANNER_LEAD.test(l) && BANNER_WORD.test(l)) return true;
  }
  return false;
}
const count = (t, re) => (t.match(re) || []).length;

const texts = new Map();
for (const f of files) {
  const r = readText(path.join(root, f.rel));
  if (r) texts.set(f.rel, { ...r, tracked: f.tracked });
}

// ── docs/ 문서 ──
const docFiles = files.filter((f) => f.rel.startsWith('docs/'));
const docs = docFiles.map(({ rel, tracked }) => {
  const t = texts.get(rel);
  const bytes = statSync(path.join(root, rel)).size;
  const d = { path: rel, bytes, tracked, last: tracked ? git('log', '-1', '--format=%cs', '--', rel) : '(미추적)' };
  if (!t) return { ...d, text: false };
  if (!t.utf8) return { ...d, utf8: false };
  const body = t.text;
  const lines = body.split('\n');
  const inFence = fenceTracker();
  const prose = lines.filter((l) => !inFence(l));
  // 상태 줄: 「상태:」/「Status:」 로 시작하는 산문 줄(코드 펜스 밖). 첫 줄이 문서 전체의 상태인 경우가 많다.
  const statusLines = prose.filter((l) => /^\s*>?\s*\**\s*(상태|Status)\s*\**\s*[:：]/.test(l)).slice(0, 3).map((l) => l.trim().slice(0, 100));
  const d2 = {
    ...d, lines: lines.length, bom: t.bom,
    title: (lines.find((l) => /^#\s/.test(l)) || '').replace(/^#\s+/, '').slice(0, 80),
    done: count(body, DONE), open: count(body, OPEN),
    unchecked: count(body, /^\s*[-*]\s+\[ \]/gm), checked: count(body, /^\s*[-*]\s+\[[xX]\]/gm),
    statusLines, banner: hasBanner(lines),
    dated: (rel.match(/20\d{6}|20\d{2}-\d{2}-\d{2}/) || [null])[0],
  };
  // 첫 상태 줄에서 먼저 나오는 표지로 가른다 — 미체크 상자는 체크하지 않은 채 끝난 문서에도 흔하다
  const first = (re, t) => { const m = new RegExp(re.source).exec(t); return m ? m.index : Infinity; };
  const st = statusLines[0] || '';
  const pd = first(DONE, st); const po = first(OPEN, st);
  d2.hint = d2.banner ? '이미 배너'
    : st && (pd < Infinity || po < Infinity) ? (pd < po ? '기록?' : '살아있음?')
    : d2.unchecked > 0 ? (d2.checked === 0 && d2.done === 0 ? '살아있음?' : '혼재')
    : d2.done > 0 && d2.done >= 3 * d2.open ? '기록?'
    : d2.open > d2.done ? '살아있음?' : '판별 안 됨';
  return d2;
});

// ── 들어오는 참조 수(문서마다) — 이동 비용의 근사 ──
const byBase = new Map();
for (const d of docs) {
  const b = path.posix.basename(d.path);
  byBase.set(b, [...(byBase.get(b) || []), d]);
}
for (const d of docs) { d.inLinks = 0; d.inPaths = 0; d.inNames = 0; d.refFiles = new Set(); }
for (const [rel, t] of texts) {
  if (!t.utf8) continue;
  const lines = t.text.split('\n');
  const linked = new Map();
  if (/\.mdx?$/i.test(rel)) for (const l of mdLinks(t.text)) {
    const r = resolveLink(rel, l.raw);
    if (r) linked.set(`${l.line}\0${r.file}`, true);
  }
  for (const [b, ds] of byBase) {
    if (!t.text.includes(b)) continue;
    for (const d of ds) {
      if (d.path === rel) continue;
      lines.forEach((line, i) => {
        if (!line.includes(b)) return;
        if (linked.has(`${i + 1}\0${d.path}`)) d.inLinks++;
        else if (line.includes(d.path) || line.includes(d.path.replace(/\//g, '\\'))) d.inPaths++;
        else d.inNames++;
        d.refFiles.add(rel);
      });
    }
  }
}
for (const d of docs) d.refFiles = [...d.refFiles];

// ── CLAUDE.md ──
const claudeFiles = files.filter((f) => /(^|\/)CLAUDE(\.local)?\.md$/.test(f.rel)).map((f) => f.rel);
const claude = claudeFiles.map((rel) => {
  const t = texts.get(rel);
  const heads = t?.utf8 ? t.text.split('\n').filter((l) => /^#{1,3}\s/.test(l)) : [];
  const has = (re) => heads.filter((h) => re.test(h)).map((h) => h.trim());
  return {
    path: rel, bytes: statSync(path.join(root, rel)).size, lines: t?.text?.split('\n').length,
    routing: has(/작업.*라우팅|라우팅.*작업|task routing|먼저 읽을/i), docsRule: has(/문서 규약|문서 구조|docs? 규약/i),
    keyDocs: has(/key documentation|주요 문서|문서 목록|문서 색인/i), memory: has(/메모리|memory/i),
  };
});

// ── 다른 곳의 docs 색인(루트 README 등) ──
const indexes = [];
for (const rel of ['README.md', 'docs/README.md', 'docs/index.md']) {
  const t = texts.get(rel);
  if (!t?.utf8) continue;
  let n = 0;
  for (const l of mdLinks(t.text)) { const r = resolveLink(rel, l.raw); if (r?.file.startsWith('docs/')) n++; }
  indexes.push({ path: rel, docsLinks: n });
}

// ── 경로 검사기 후보 ──
const validators = files.map((f) => f.rel).filter((r) => /(validate|check|lint)[-_]?(doc|path|link)|(doc|path|link)s?[-_]?(validate|check|lint)|markdown-link-check|lychee|remark-validate-links/i.test(r));
const pkg = texts.get('package.json');
if (pkg?.utf8) {
  try {
    for (const [k, v] of Object.entries(JSON.parse(pkg.text).scripts || {})) if (/link|doc.*(check|valid)/i.test(k + v)) validators.push(`package.json scripts.${k}`);
  } catch { /* 무시 */ }
}

// ── config ──
let cfg = null; let cfgErr = null;
const cfgPath = path.join(root, 'harness.config.mjs');
if (existsSync(cfgPath)) {
  try { cfg = (await import(pathToFileURL(cfgPath).href)).default; } catch (e) { cfgErr = String(e.message || e).slice(0, 200); }
}
const pd = cfg?.project?.docs;
const slot = (o, k) => (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : '(키 없음)');
const config = cfg ? {
  archiveDir: slot(pd, 'archiveDir'), pathValidator: slot(pd, 'pathValidator'), autoloaded: slot(pd, 'autoloaded'),
  memorySlugs: slot(cfg.project?.memory, 'slugs'), commitExecution: slot(cfg.project?.git, 'commitExecution'),
  coAuthor: slot(cfg.project?.git, 'coAuthor'),
  always: slot(cfg.docs, 'always'), archive: slot(cfg.docs, 'archive'),
} : null;

// 어긋남: archive 접두가 덮는 문서 · always 존재 · autoloaded ↔ 실제 CLAUDE.md
const gaps = [];
const notes = [];
if (config) {
  const pref = Array.isArray(config.archive) ? config.archive : [];
  const norm = (p) => String(p).replace(/\/+$/, '');
  for (const p of pref) {
    const hit = docs.filter((d) => d.path.startsWith(p));
    const live = hit.filter((d) => d.hint === '살아있음?');
    const md = hit.filter((d) => /\.mdx?$/i.test(d.path) && d.text !== false && d.utf8 !== false);
    const noBanner = md.filter((d) => !d.banner);
    // 아카이브 폴더 하나를 가리키고 그 안 문서가 모두 배너를 달았으면 어긋남이 아니다
    if (typeof config.archiveDir === 'string' && norm(p) === norm(config.archiveDir) && !live.length && !noBanner.length) {
      notes.push(`docs.archive '${p}' → ${hit.length}개 · archiveDir 와 같고 모두 배너 있음`);
      continue;
    }
    gaps.push(`docs.archive '${p}' → ${hit.length}개${noBanner.length ? ` · 배너 없음 ${noBanner.length}개` : ''}${live.length ? ` · 살아있음? 표지 ${live.length}개(${live.map((d) => path.posix.basename(d.path)).join(', ')})` : ''}`);
  }
  if (typeof config.archiveDir === 'string' && !pref.some((p) => config.archiveDir.startsWith(p) || p.startsWith(config.archiveDir))) gaps.push(`archiveDir '${config.archiveDir}' 가 docs.archive 접두에 없다`);
  if (typeof config.archiveDir === 'string' && !existsSync(path.join(root, config.archiveDir))) gaps.push(`archiveDir '${config.archiveDir}' 폴더 없음`);
  for (const a of Array.isArray(config.always) ? config.always : []) if (!existsSync(path.join(root, a))) gaps.push(`docs.always '${a}' 파일 없음`);
  const al = Array.isArray(config.autoloaded) ? config.autoloaded : [];
  const real = claudeFiles.filter((f) => !/\.local\.md$/.test(f));
  const miss = real.filter((f) => !al.includes(f)); const extra = al.filter((f) => !real.includes(f));
  if (miss.length || extra.length) gaps.push(`autoloaded ↔ 실제 CLAUDE.md: 빠짐 [${miss}] · 없는 항목 [${extra}]`);
}

// ── 메모리 ──
const projDir = path.join(os.homedir(), '.claude', 'projects');
const lineMax = opt['line-max'] && opt['line-max'] !== true ? Number(opt['line-max']) : 150; // 인덱스 한 줄 기준(판단값)
const derived = root.replace(/[:\\/]/g, '-');
const slugs = [...new Set([...list(opt.slug), ...(Array.isArray(config?.memorySlugs) ? config.memorySlugs : [])])];
let related = [];
try { related = readdirSync(projDir).filter((n) => n.toLowerCase().startsWith(derived.toLowerCase())); } catch { /* 없음 */ }
const uniq = new Map();
for (const s of [...slugs, ...related.filter((n) => n.toLowerCase() === derived.toLowerCase())]) {
  const k = process.platform === 'win32' ? s.toLowerCase() : s; // 대소문자 무시 파일시스템에서는 같은 폴더다
  if (!uniq.has(k)) uniq.set(k, s);
}
const memory = [...uniq.values()].map((slug) => {
  const dir = path.join(projDir, slug, 'memory');
  if (!existsSync(dir)) return { slug, exists: false };
  const fs = readdirSync(dir).filter((n) => statSync(path.join(dir, n)).isFile()).map((n) => ({ n, b: statSync(path.join(dir, n)).size }));
  const idx = readText(path.join(dir, 'MEMORY.md'));
  const L = idx?.utf8 ? idx.text.split('\n') : [];
  const lens = L.map((l) => [...l].length);
  return {
    slug, exists: true, files: fs.length, kb: Math.round(fs.reduce((s, f) => s + f.b, 0) / 1024),
    top: fs.sort((a, b) => b.b - a.b).slice(0, 5).map((f) => `${(f.b / 1024).toFixed(1)}KB ${f.n}`),
    handoffs: fs.filter((f) => /handoff|next[_-]?session|resume/i.test(f.n)).length,
    index: idx ? { lines: L.length - (L.at(-1) === '' ? 1 : 0), bytes: statSync(path.join(dir, 'MEMORY.md')).size,
      longest: Math.max(0, ...lens), overMax: lens.filter((n) => n > lineMax).length,
      entries: L.filter((l) => /^\s*-\s*\[/.test(l)).length, sections: L.filter((l) => /^##\s/.test(l)).map((l) => l.trim()) } : null,
  };
});

// ── 출력 ──
const out = { root, head: git('rev-parse', '--short', 'HEAD'), branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  // 문서와 지시 문서(하위 CLAUDE.md · .claude/ 의 에이전트·커맨드·스킬·설정) — 이 스킬이 고칠 수 있는 곳의 미커밋 변경
  dirty: git('status', '--short', '--', 'docs', 'CLAUDE.md', ':(glob)**/CLAUDE.md', ':(glob)**/CLAUDE.local.md', 'README.md', 'harness.config.mjs', '.claude').split('\n').filter(Boolean),
  docs, claude, indexes, validators, config, cfgErr, gaps, notes, memory, relatedSlugs: related };
if (opt.json && opt.json !== true) writeFileSync(opt.json, JSON.stringify(out, null, 2));

const dirtyClaude = out.dirty.filter((l) => /(^|\s)"?\.claude\//.test(l)).length;
console.log(`레포 ${out.branch} @ ${out.head} · 문서·지시 문서 미커밋 ${out.dirty.length}건${dirtyClaude ? `(그중 .claude/ ${dirtyClaude}건)` : ''}${out.dirty.length ? ' — ' + out.dirty.slice(0, 5).join(' | ') : ''}`);
const dirs = {};
for (const d of docs) { const k = path.posix.dirname(d.path); dirs[k] = (dirs[k] || 0) + 1; }
console.log(`docs/ 파일 ${docs.length} · 폴더별 ${Object.entries(dirs).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
const hints = {};
for (const d of docs) if (/\.mdx?$/i.test(d.path)) hints[d.hint || '텍스트 아님'] = (hints[d.hint || '텍스트 아님'] || 0) + 1;
console.log(`표지 힌트(.md) ${Object.entries(hints).map(([k, v]) => `${k} ${v}`).join(' · ')} — 판정은 본문을 연다`);
const nonUtf8 = docs.filter((d) => d.utf8 === false).map((d) => d.path);
if (nonUtf8.length) console.log(`UTF-8 아님 ${nonUtf8.length}: ${nonUtf8.join(', ')} — 변환 전에는 근거로 쓰지 않는다`);
for (const c of claude) console.log(`${c.path} ${c.lines}줄 ${c.bytes}B · 라우팅 ${c.routing.length ? c.routing.join('/') : '없음'} · 문서규약 ${c.docsRule.length ? c.docsRule.join('/') : '없음'} · 문서목록 ${c.keyDocs.length ? c.keyDocs.join('/') : '없음'} · 메모리절 ${c.memory.length ? c.memory.join('/') : '없음'}`);
console.log(`docs 색인 ${indexes.length ? indexes.map((i) => `${i.path}(docs 링크 ${i.docsLinks})`).join(' · ') : '없음'} · 경로 검사기 후보 ${validators.length ? validators.join(', ') : '없음'}`);
if (!config) console.log(`config ${cfgErr ? '읽기 실패 — ' + cfgErr : '없음(harness.config.mjs)'}`);
else {
  console.log(`config kit: archiveDir=${JSON.stringify(config.archiveDir)} pathValidator=${JSON.stringify(config.pathValidator)} autoloaded=${JSON.stringify(config.autoloaded)} memory.slugs=${JSON.stringify(config.memorySlugs)} commitExecution=${JSON.stringify(config.commitExecution)}`);
  console.log(`config 게이트: docs.always=${JSON.stringify(config.always)} docs.archive=${JSON.stringify(config.archive)}`);
}
for (const g of gaps) console.log(`어긋남? ${g}`);
for (const n of notes) console.log(`맞음 ${n}`);
for (const m of memory) {
  if (!m.exists) { console.log(`메모리 ${m.slug}: 디렉토리 없음`); continue; }
  const i = m.index;
  console.log(`메모리 ${m.slug}: 파일 ${m.files} · ${m.kb}KB · 핸드오프류 ${m.handoffs}${i ? ` · MEMORY.md ${i.lines}줄 ${i.bytes}B 최장 ${i.longest}자 ${lineMax}자초과 ${i.overMax}줄 항목 ${i.entries} · 자동 로드 한도 대비 ${Math.round(100 * Math.max(i.lines / 200, i.bytes / 25600))}% · 절 ${i.sections.length ? i.sections.join(' / ') : '없음'}` : ' · MEMORY.md 없음'}`);
}
if (new Set(related.map((n) => n.toLowerCase())).size > 1) console.log(`같은 경로로 시작하는 슬러그 ${related.length}개(worktree 등): ${related.slice(0, 4).join(', ')}${related.length > 4 ? ' …' : ''}`);
if (!opt.json) console.log('(문서별 표는 --json <파일> 로 받는다)');
