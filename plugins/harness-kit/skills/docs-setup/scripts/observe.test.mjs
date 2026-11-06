#!/usr/bin/env node
// docs-setup 관찰 시험 — node observe.test.mjs [작업 디렉토리]
// 임시 레포에서 observe.mjs 를 돌려 확인한다.
//   ① 미커밋 변경은 문서뿐 아니라 지시 문서(.claude/ · 하위 CLAUDE.md)도 센다 — 이 스킬이 고치는 곳이다
//   ② docs.archive 가 archiveDir 와 같고 안의 문서가 모두 배너를 달았으면 「어긋남?」이 아니다
//   ③ 같은 칸이라도 배너 없는 문서가 끼면 「어긋남?」으로 낸다(음성 대조)
//   ④ 배너는 문서 첫머리의 배너 줄만 — 성격표 줄 · 목록 줄 · 펜스 안 · 둘째 제목(수준 무관) 뒤의 「현행 아님」은 배너가 아니다.
//      첫 제목이 `##` 여도 그 제목 바로 아래 배너는 배너다
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

// ── 4. 배너 판정은 첫머리 배너 줄만 ──
// 인수 시험에서 docs-setup 이 새로 쓴 docs/README.md 본문 그대로다. 성격표 줄과 규칙 목록 줄에 「현행 아님」·「시점 기록」이 있어
// 배너 달린 아카이브 문서로 오판했다
const TRIAL_README = [
  '# docs — 문서 트리 안내',
  '',
  '무엇을 하려는지에 따라 여는 곳이 다르다. 작업으로 찾는 라우팅 표는 [../CLAUDE.md](../CLAUDE.md) 에 있고, 문서 목록은 [../README.md](../README.md) 「문서」 절에 있다.',
  '',
  '| 분류 · 위치 | 성격 | 언제 여나 |',
  '| - | - | - |',
  '| `API.md` · `ARCHITECTURE.md` · `TESTING.md` | 현행 명세·설명·규칙 (상시) | API·구조·테스트를 손대기 전 |',
  '| `task/` | 백로그 — 현재 범위·우선순위의 기준 (상시 갱신) | 다음 할 일을 고를 때 |',
  '| `plan/` | 진행 계획 (살아 있는 동안만) — 상태 줄이 「완료」인 계획은 현행 범위로 읽지 않는다 | 진행 중인 기능을 이어갈 때 |',
  '| `notes/` | 회고 — 시점 기록, 참조 | 지난 결정의 경위를 볼 때 |',
  '| `archive/` (첫 문서를 옮길 때 생긴다) | **시점 기록 — 현행 아님** | 과거 경위를 되짚을 때만 |',
  '',
  '## 이 디렉토리의 규칙',
  '',
  '- 끝난 계획·완료 보고·협의 기록은 `docs/archive` 로 옮기고 상단에 배너를 단다(시점 · 현행 아님 · 판정 근거 · 현행이 있는 곳). 판정 기준은 「이 문서가 아직 일을 시키는가」다.',
  '- `docs/archive` 는 검사 대상이 아니다. 낡은 채로 두는 것이 그 폴더의 목적이다.',
  '',
].join('\n');
w('docs/README.md', TRIAL_README);
// 첫 15줄 안이지만 펜스 안 · 둘째 제목 뒤 — 배너가 아니다
w('docs/how-to-fold.md', '# 접는 법\n\n배너 예:\n\n```markdown\n> ⚠️ **시점 문서 — 현행 아님.** 날짜 에 옮겼다.\n```\n');
w('docs/later.md', '# 나중 절\n\n## 기록\n\n> 이 절은 현행 아님 표시가 붙은 문서를 다룬다.\n');
// 진짜 배너 — 이 스킬의 배너 꼴(인용 줄) · 굵은 글씨로 시작하는 배너 줄 · 제목 없이 맨 위 경고 줄
w('docs/archive/plan-b.md', `# 끝난 계획 둘\n\n${banner('docs/plan-b.md')}\n## 본문\n\n내용.\n`);
w('docs/old-bold.md', '# 옛 설계\n\n**폐기됨** — 새 설계로 바뀌었다.\n');
w('docs/old-warn.md', '⚠️ superseded by the new guide.\n\n# old guide\n');
// 첫 제목이 `##` 인 문서 — TEMPLATES §1 대로 그 첫 제목 줄 바로 아래에 배너를 달았다
w('docs/archive/plan-h2.md', `## 끝난 계획 셋\n\n${banner('docs/plan-h2.md')}\n### 본문\n\n내용.\n`);
git('add', '.'); git('commit', '-q', '-m', 'readme');
o = observe();
const bannerOf = (p) => (o.j.docs.find((d) => d.path === p) || {}).banner;
eq(bannerOf('docs/README.md'), false, '새 docs/README.md — 성격표 줄 · 목록 줄의 「현행 아님」은 배너가 아니다');
ok((o.j.docs.find((d) => d.path === 'docs/README.md') || {}).hint !== '이미 배너', 'docs/README.md 의 표지 힌트가 「이미 배너」가 아니다');
eq(bannerOf('docs/how-to-fold.md'), false, '코드 펜스 안의 배너 예시는 배너가 아니다');
eq(bannerOf('docs/later.md'), false, '둘째 제목 뒤의 인용 줄은 첫머리 배너가 아니다');
eq(bannerOf('docs/archive/plan-b.md'), true, '이 스킬의 배너(첫 제목 아래 인용 줄)는 배너다');
eq(bannerOf('docs/old-bold.md'), true, '굵은 글씨로 시작하는 첫머리 배너 줄은 배너다');
eq(bannerOf('docs/old-warn.md'), true, '맨 위 경고 표시 줄(제목 없음)은 배너다');
eq(bannerOf('docs/archive/plan-h2.md'), true, '첫 제목이 ## 이어도 그 제목 바로 아래 인용 줄은 배너다');

console.log(`\n${pass}/${pass + fail} PASS · 작업 레포 ${repo}`);
process.exit(fail ? 1 : 0);
