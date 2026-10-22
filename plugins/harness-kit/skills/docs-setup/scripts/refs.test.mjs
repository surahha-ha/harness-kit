#!/usr/bin/env node
// docs-setup 참조 고침 시험 — node refs.test.mjs [작업 디렉토리]
// 임시 레포에서 refs.mjs --plan · --apply · --after 를 돌려 확인한다.
//   ① 링크 글자에 적힌 옛 경로(`[docs/a.md](a.md)`)도 대상과 함께 새 경로로 고친다
//   ② 지시 문서(CLAUDE.md · .claude/ · harness.config.mjs)의 링크·경로는 고치지 않고 「지시 문서」로 따로 낸다
//   ③ 자동 고침 수에는 지시 문서 줄이 들지 않는다
//   ④ --after 는 배너의 출처 표기와 새 경로 링크의 글자를 정상으로 보고, 진짜로 남은 옛 경로만 낸다
//   ⑤ 계획 없이 셀 때는 「자동 고침」이라고 쓰지 않는다
// 대상 레포 밖(작업 디렉토리)에만 쓴다. 실패가 하나라도 있으면 종료코드 1.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REFS = path.join(HERE, 'refs.mjs');
const work = path.resolve(process.argv[2] || os.tmpdir());
mkdirSync(work, { recursive: true });
const repo = mkdtempSync(path.join(work, 'ds-refs-'));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`PASS ${msg}`); } else { fail++; console.log(`FAIL ${msg}`); } };
const eq = (a, b, msg) => { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, x === y ? msg : `${msg} — 실제 ${x} · 기대 ${y}`); };
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
const run = (...a) => { try { return { code: 0, out: execFileSync(process.execPath, [REFS, ...a], { encoding: 'utf8' }) }; } catch (e) { return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` }; } };
const w = (rel, text) => { mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); writeFileSync(path.join(repo, rel), text, 'utf8'); };
const r = (rel) => readFileSync(path.join(repo, rel), 'utf8');
const line = (rel, n) => r(rel).split('\n')[n - 1];

// ── 1. 시험 레포 ──
git('init', '-q', '-b', 'main');
git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'test'); git('config', 'core.autocrlf', 'false');
w('docs/task/plan-a.md', '# 끝난 계획\n\n상태: 완료. 현행은 [안내](../guide.md).\n');
w('docs/guide.md', '# 안내\n\n- 상위 계획: [docs/task/plan-a.md](task/plan-a.md) §2\n- 경로: `docs/task/plan-a.md`\n- 이름만: plan-a.md 를 보라\n');
w('README.md', '# 레포\n\n| 문서 | 링크 |\n| - | - |\n| 계획 | [plan-a.md](docs/task/plan-a.md) |\n');
w('CLAUDE.md', '# 레포\n\n먼저 [끝난 계획](docs/task/plan-a.md) 을 읽는다.\n');
w('.claude/agents/worker.md', '# worker\n\n작업 전 읽는 문서:\n\ndocs/guide.md\ndocs/task/plan-a.md\n');
git('add', '.'); git('commit', '-q', '-m', 'base');
const plan = path.join(repo + '-plan.json');
writeFileSync(plan, JSON.stringify({ moves: [{ from: 'docs/task/plan-a.md', to: 'docs/archive/task/plan-a.md' }] }), 'utf8');

// ── 2. --plan (고침 목록) ──
const pj = path.join(repo + '-plan-refs.json');
const p = run(repo, '--plan', plan, '--list', '50', '--json', pj);
eq(p.code, 0, 'refs --plan 종료코드 0');
const hits = JSON.parse(readFileSync(pj, 'utf8')).hits;
const brief = (h) => `${h.instr ? 'instr' : h.kind} ${h.rel}:${h.line}`;
eq(hits.filter((h) => h.instr).map(brief).sort(), ['instr .claude/agents/worker.md:6', 'instr CLAUDE.md:3'], '지시 문서 2줄(CLAUDE.md 링크 · .claude/ 경로)은 instr 로 따로 낸다');
eq(hits.filter((h) => !h.instr && ['link', 'path', 'out'].includes(h.kind)).map(brief).sort(), [
  'link README.md:5', 'link docs/guide.md:3', 'out docs/task/plan-a.md:3', 'path docs/guide.md:3', 'path docs/guide.md:4',
], '자동 고침 대상 — 링크 2 · 링크 글자의 경로 1 · 백틱 경로 1 · 옮긴 문서 안 링크 1');
ok(/합계: 자동 고침 5건\(링크 2 · 경로 2 · 옮긴 문서 안 1\) · 지시 문서 2줄/.test(p.out), '합계 줄의 자동 고침 수에 지시 문서 줄이 들지 않는다');
eq(hits.filter((h) => h.kind === 'name').map(brief), ['name docs/guide.md:5'], '이름만 1줄(링크 글자의 파일 이름은 세지 않는다)');

// ── 3. --apply ──
const a = run(repo, '--plan', plan, '--apply', '--backup', path.resolve(repo, git('rev-parse', '--git-path', 'docs-setup-backup').trim()));
eq(a.code, 0, 'refs --apply 종료코드 0');
ok(/지시 문서 2줄은 고치지 않았다/.test(a.out), '적용 보고에 고치지 않은 지시 문서 줄 수가 있다');
eq(line('docs/guide.md', 3), '- 상위 계획: [docs/archive/task/plan-a.md](archive/task/plan-a.md) §2', '링크 글자의 옛 경로도 새 경로로 바뀐다(대상과 함께)');
eq(line('docs/guide.md', 4), '- 경로: `docs/archive/task/plan-a.md`', '백틱 경로는 새 경로로 바뀐다');
eq(line('docs/guide.md', 5), '- 이름만: plan-a.md 를 보라', '이름만 줄은 그대로다');
eq(line('README.md', 5), '| 계획 | [plan-a.md](docs/archive/task/plan-a.md) |', '서술 문서의 링크는 새 경로로 바뀐다');
eq(line('CLAUDE.md', 3), '먼저 [끝난 계획](docs/task/plan-a.md) 을 읽는다.', 'CLAUDE.md 의 링크는 고치지 않는다');
eq(line('.claude/agents/worker.md', 6), 'docs/task/plan-a.md', '.claude/ 의 경로는 고치지 않는다');
eq(line('docs/archive/task/plan-a.md', 3), '상태: 완료. 현행은 [안내](../../guide.md).', '옮긴 문서 안의 상대 링크는 새 위치 기준이다');

// ── 4. 3단계 답대로 손으로 고친 뒤(지시 문서 줄 정리 · 배너) --after ──
w('CLAUDE.md', '# 레포\n\n먼저 [안내](docs/guide.md) 를 읽는다.\n');
w('.claude/agents/worker.md', '# worker\n\n작업 전 읽는 문서:\n\ndocs/guide.md\n');
w('docs/archive/task/plan-a.md', '# 끝난 계획\n\n> ⚠️ **시점 문서 — 현행 아님.** 2026-10-22 에 `docs/task/plan-a.md` 에서 옮겼다. 판정: 접기 — 끝남.\n> 현행은 [docs/guide.md](../../guide.md) 을 본다. 이 본문은 경위를 되짚을 때만 읽는다.\n\n상태: 완료. 현행은 [안내](../../guide.md).\n');
w('docs/left.md', '# 남은 곳\n\n옛 경로 `docs/task/plan-a.md` 를 아직 쓴다.\n');
const aj = path.join(repo + '-after.json');
const af = run(repo, '--plan', plan, '--after', '--json', aj);
eq(af.code, 0, 'refs --after 종료코드 0');
const ah = JSON.parse(readFileSync(aj, 'utf8')).hits;
eq(ah.filter((h) => h.kind === 'banner').map(brief), ['banner docs/archive/task/plan-a.md:3'], '배너의 출처 표기는 banner(정상)로 센다');
eq(ah.filter((h) => h.kind === 'label').map(brief).sort(), ['label README.md:5', 'label docs/guide.md:3', 'label docs/guide.md:4'], '새 경로 링크·새 경로 문자열이 있는 줄의 파일 이름은 label(정상)로 센다');
eq(ah.filter((h) => ['link', 'path', 'out'].includes(h.kind)).map(brief), ['path docs/left.md:3'], '진짜로 남은 옛 경로만 path 로 낸다');
ok(/남은 옛 경로: 링크 0 · 경로 1 · 지시 문서 0 · 이름만 1 · 정상 4\(배너 출처 1 · 새 경로 표기 3\)/.test(af.out), '--after 합계 줄이 남은 것 · 정상인 것을 가른다');
ok(/path\s+docs\/left\.md:3/.test(af.out), '--after 는 남은 줄을 목록으로 낸다');
ok(!/WARN/.test(af.out), '--after — 옛 경로 없음 · 새 경로 있음');

// ── 5. 계획 없이 센 판은 「자동 고침」이라고 쓰지 않는다 ──
const np = run(repo, 'docs/task/plan-a.md');
eq(np.code, 0, '계획 없는 refs 종료코드 0');
ok(/^참조 합계: /m.test(np.out) && !/자동 고침/.test(np.out), '계획 없는 판의 합계 줄은 「참조 합계」다');
ok(run(repo, '--plan', plan, '--after', '--apply', '--backup', path.join(repo + '-bk')).code === 2, '--after 와 --apply 는 함께 쓰지 못한다');

console.log(`\n${pass}/${pass + fail} PASS · 작업 레포 ${repo}`);
process.exit(fail ? 1 : 0);
