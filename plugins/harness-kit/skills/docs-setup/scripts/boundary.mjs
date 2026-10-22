#!/usr/bin/env node
// docs-setup 이 쓴 줄이 harness-uninstall 의 후보로 잡히지 않는가 — 4단계 검증. 읽기 전용.
// 사용: node boundary.mjs <레포 루트> [--base <rev>] [--json <파일>]
//   base(기본 HEAD) 이후 바뀐 파일(미추적 포함)에서 새로 생긴 줄만 본다. harness.config.mjs · harness.install.json · .harness/ 는 뺀다
//   (config 칸은 config-slots.mjs 가 본다).
// 판정은 harness-uninstall 의 edit.mjs 를 그대로 쓴다 — 후보를 고르는 함수와 같은 함수로 본다.
//   ① 새 줄에 설치 표시(harness-kit:begin·end·line)가 있다 — 옮긴 문서에 표시가 딸려 왔거나 docs-setup 이 표시를 썼다
//   ② 새 줄이 표시 블록 안에 있다 — 걷어낼 때 블록과 함께 지워진다
//   ③ CLAUDE.md 에서 새 줄이 「개발 하네스」 절 안에 있거나 그 절을 가리키는 줄 꼴이다 — 절·가리키는 줄로 잡힌다
// 종료코드: 하나라도 걸리면 1.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const edit = await import(new URL('../../harness-uninstall/scripts/edit.mjs', import.meta.url).href).catch(() => null);
const args = process.argv.slice(2);
const rootArg = args[0];
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
if (!rootArg) { console.error('사용: node boundary.mjs <레포 루트> [--base <rev>] [--json <파일>]'); process.exit(2); }
if (!edit) { console.error('harness-uninstall 의 edit.mjs 를 읽지 못했다 — 같은 플러그인 안에서 돌린다'); process.exit(2); }
const root = path.resolve(rootArg);
const base = opt('--base') || 'HEAD';
const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 256 << 20 });
const tryGit = (...a) => { try { return execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };

const SKIP = (p) => p === 'harness.config.mjs' || p === 'harness.install.json' || p.startsWith('.harness/');
const changed = new Set([
  ...git('diff', '--name-only', '-z', base, '--').split('\0'),
  ...git('ls-files', '-z', '--others', '--exclude-standard').split('\0'),
].filter(Boolean).filter((p) => !SKIP(p) && existsSync(path.join(root, p))));

const { splitLines, body, marksFor, MARKS, findMarked, findSection, findPointerLines } = edit;
const ANY_MARK = /harness-kit:(begin|end|line)\b/;
const hits = [];
let files = 0;
for (const p of [...changed].sort()) {
  const buf = readFileSync(path.join(root, p));
  if (buf.subarray(0, 8192).includes(0)) continue;
  const text = buf.toString('utf8');
  files++;
  const lines = splitLines(text);
  const old = tryGit('show', `${base}:${p}`);
  const pool = new Map();
  for (const l of old === null ? [] : splitLines(old)) { const k = body(l); pool.set(k, (pool.get(k) || 0) + 1); }
  const added = [];
  lines.forEach((l, i) => { const k = body(l); const n = pool.get(k) || 0; if (n) pool.set(k, n - 1); else added.push(i); });
  if (!added.length) continue;
  const marks = marksFor(p);
  const found = findMarked(lines, marks);
  const inBlock = (i) => found.blocks.some((b) => i >= b.start && i <= b.end);
  const isClaude = p === 'CLAUDE.md' || p === '.claude/CLAUDE.md';
  const sec0 = isClaude ? findSection(lines) : null;
  const sec = sec0 && !inBlock(sec0.start) ? sec0 : null; // 표시 블록 안의 절은 걷어내기가 블록으로 잡는다(uninstall scan 과 같은 판정)
  const pointers = new Set(isClaude ? findPointerLines(lines) : []);
  for (const i of added) {
    const t = body(lines[i]);
    if (!t.trim()) continue; // 빈 줄은 무엇으로 잡혀도 잃을 내용이 없다
    const why = ANY_MARK.test(t) ? '설치 표시가 있는 새 줄 — 옮긴 문서에 딸려 왔거나 docs-setup 이 썼다. 표시가 있는 문서는 옮기지 않는다'
      : inBlock(i) ? '설치 표시 블록 안의 새 줄 — 걷어낼 때 블록과 함께 지워진다. 블록 밖으로 옮긴다'
      : sec && i >= sec.start && i <= sec.end ? '「개발 하네스」 절 안의 새 줄 — 걷어낼 때 절과 함께 지워진다. 절 밖에 둔다'
      : pointers.has(i) ? '「개발 하네스」 절을 가리키는 줄 꼴 — 걷어내기가 가리키는 줄로 잡는다. 그 절은 설치가 가리킨다'
      : null;
    if (why) hits.push({ path: p, line: i + 1, text: t.trim().slice(0, 120), why });
  }
}
for (const h of hits) console.log(`FAIL ${h.path}:${h.line} ${h.why} — ${h.text}`);
console.log(`boundary: 바뀐 파일 ${files}개 · 걷어내기 후보로 잡힐 새 줄 ${hits.length} (기준 ${base}) · failures=${hits.length}`);
const j = opt('--json');
if (j) writeFileSync(j, JSON.stringify({ base, files, hits }, null, 2) + '\n', 'utf8');
process.exit(hits.length ? 1 : 0);
