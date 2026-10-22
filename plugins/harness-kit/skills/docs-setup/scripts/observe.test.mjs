#!/usr/bin/env node
// docs-setup 관찰 시험 — node observe.test.mjs [작업 디렉토리]
// 임시 레포에서 observe.mjs 를 돌려 확인한다.
//   ① 미커밋 변경은 문서뿐 아니라 지시 문서(.claude/ · 하위 CLAUDE.md)도 센다 — 이 스킬이 고치는 곳이다
//   ② docs.archive 가 archiveDir 와 같고 안의 문서가 모두 배너를 달았으면 「어긋남?」이 아니다
//   ③ 같은 칸이라도 배너 없는 문서가 끼면 「어긋남?」으로 낸다(음성 대조)
// 대상 레포 밖(작업 디렉토리)에만 쓴다. 실패가 하나라도 있으면 종료코드 1.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OBSERVE = path.join(HERE, 'observe.mjs');
const work = path.resolve(process.argv[2] || os.tmpdir());
mkdirSync(work, { recursive: true });
const repo = mkdtempSync(path.join(work, 'ds-observe-'));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`PASS ${msg}`); } else { fail++; console.log(`FAIL ${msg}`); } };
const eq = (a, b, msg) => { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, x === y ? msg : `${msg} — 실제 ${x} · 기대 ${y}`); };
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
const w = (rel, text) => { mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); writeFileSync(path.join(repo, rel), text, 'utf8'); };
const observe = () => {
  const json = path.join(repo + '-observe.json');
  const out = execFileSync(process.execPath, [OBSERVE, repo, '--json', json], { encoding: 'utf8', env: { ...process.env, USERPROFILE: work, HOME: work } });
  return { out, j: JSON.parse(readFileSync(json, 'utf8')) };
};
const banner = (from) => `> ⚠️ **시점 문서 — 현행 아님.** 2026-10-22 에 \`${from}\` 에서 옮겼다. 판정: 접기 — 끝남.\n> 현행은 [안내](../guide.md) 을 본다.\n`;

git('init', '-q', '-b', 'main');
git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'test'); git('config', 'core.autocrlf', 'false');
w('CLAUDE.md', '# 레포\n');
w('sub/CLAUDE.md', '# 하위\n');
w('.claude/agents/worker.md', '# worker\n');
w('docs/guide.md', '# 안내\n\n상태: 진행 중\n');
w('docs/archive/plan-a.md', `# 끝난 계획\n\n${banner('docs/plan-a.md')}`);
w('harness.config.mjs', [
  'export default {',
  '  project: {',
  "    docs: { archiveDir: 'docs/archive', pathValidator: null, autoloaded: ['CLAUDE.md', 'sub/CLAUDE.md'] },",
  '    memory: { slugs: null },',
  '  },',
  "  docs: { always: ['CLAUDE.md'], archive: ['docs/archive/'] },",
  '};',
  '',
].join('\n'));
git('add', '.'); git('commit', '-q', '-m', 'base');

// ── 1. 깨끗한 트리 · 배너 단 아카이브 ──
let o = observe();
eq(o.j.dirty, [], '깨끗한 트리 — 미커밋 0');
eq(o.j.gaps.filter((g) => g.startsWith('docs.archive')), [], 'archiveDir 와 같고 모두 배너 — 「어긋남?」 없음');
eq(o.j.notes, ["docs.archive 'docs/archive/' → 1개 · archiveDir 와 같고 모두 배너 있음"], '그 칸은 「맞음」 줄로 낸다');

// ── 2. 지시 문서의 미커밋 변경 ──
w('.claude/agents/worker.md', '# worker\n\n바뀜\n');
w('sub/CLAUDE.md', '# 하위\n\n바뀜\n');
o = observe();
eq(o.j.dirty.map((l) => l.trim()).sort(), ['M .claude/agents/worker.md', 'M sub/CLAUDE.md'], '.claude/ 와 하위 CLAUDE.md 의 미커밋 변경을 센다');
ok(/문서·지시 문서 미커밋 2건\(그중 \.claude\/ 1건\)/.test(o.out), '요약 줄이 .claude/ 변경 수를 따로 보인다');
git('checkout', '-q', '--', '.');

// ── 3. 아카이브 폴더에 배너 없는 문서가 끼면 어긋남 ──
w('docs/archive/raw.md', '# 배너 없음\n\n옮겨만 둠.\n');
git('add', '.'); git('commit', '-q', '-m', 'raw');
o = observe();
eq(o.j.gaps.filter((g) => g.startsWith('docs.archive')), ["docs.archive 'docs/archive/' → 2개 · 배너 없음 1개"], '배너 없는 문서가 끼면 「어긋남?」으로 낸다');
eq(o.j.notes, [], '그때는 「맞음」 줄이 없다');

console.log(`\n${pass}/${pass + fail} PASS · 작업 레포 ${repo}`);
process.exit(fail ? 1 : 0);
