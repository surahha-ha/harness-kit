#!/usr/bin/env node
// docs-setup 링크 추출 시험 — node links.test.mjs [작업 디렉토리]
// 임시 레포에 문서를 두고 links.mjs · refs.mjs 를 돌려 확인한다.
//   ① 인라인 코드 스팬 안의 링크 꼴(`[a](없는.md)`)은 링크로 세지 않는다
//   ② 펜스 블록(``` · ~~~) 안의 링크 꼴도 링크로 세지 않는다
//   ③ 본문의 깨진 링크는 그대로 깨짐이다(음성 대조)
//   ④ 백틱 속 레포 기준 경로 문자열 판정은 그대로다(links 의 path · refs 의 경로)
// 대상 레포 밖(작업 디렉토리)에만 쓴다. 실패가 하나라도 있으면 종료코드 1.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskCodeSpans, mdLinks } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LINKS = path.join(HERE, 'links.mjs');
const REFS = path.join(HERE, 'refs.mjs');
const work = path.resolve(process.argv[2] || os.tmpdir());
mkdirSync(work, { recursive: true });
const repo = mkdtempSync(path.join(work, 'ds-links-'));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`PASS ${msg}`); } else { fail++; console.log(`FAIL ${msg}`); } };
const eq = (a, b, msg) => { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, x === y ? msg : `${msg} — 실제 ${x} · 기대 ${y}`); };
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
const run = (script, ...a) => { try { return { code: 0, out: execFileSync(process.execPath, [script, ...a], { encoding: 'utf8' }) }; } catch (e) { return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` }; } };
const w = (rel, text) => { mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); writeFileSync(path.join(repo, rel), text, 'utf8'); };

// ── 0. maskCodeSpans 단독 ──
eq(maskCodeSpans('앞 `[a](b.md)` 뒤'), `앞 ${' '.repeat('`[a](b.md)`'.length)} 뒤`, '코드 스팬은 같은 길이 공백으로 가린다');
eq(maskCodeSpans('``a ` b`` [c](d.md)'), `${' '.repeat(9)} [c](d.md)`, '두 겹 백틱 스팬은 안의 홑 백틱까지 가리고 밖은 둔다');
eq(maskCodeSpans('닫히지 않은 `[a](b.md)'), '닫히지 않은 `[a](b.md)', '닫는 백틱이 없으면 글자 그대로 둔다');
eq([...mdLinks('`[a](x.md)` [b](y.md)\n```\n[c](z.md)\n```\n')].map((l) => [l.line, l.raw]), [[1, 'y.md']], 'mdLinks 는 스팬·펜스 밖 링크만 낸다');

// ── 1. 시험 레포 ──
git('init', '-q', '-b', 'main');
git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'test'); git('config', 'core.autocrlf', 'false');
w('docs/real.md', '# 있는 문서\n');
w('docs/span.md', [
  '# 코드 스팬',
  '',
  '- **인덱스 `MEMORY.md`** — 한 줄에 하나: `- [제목](파일.md) — 한 줄 요약`, 150자 이하.',
  '두 겹: ``[a](없는.md)`` 와 있는 링크 [real](real.md).',
  '',
].join('\n'));
w('docs/fence.md', [
  '# 펜스',
  '',
  '```md',
  '[a](없는.md)',
  '```',
  '',
  '~~~',
  '[b](없는.md)',
  '[ref]: 없는.md',
  '~~~',
  '',
].join('\n'));
w('docs/body.md', [
  '# 본문',
  '',
  '깨진 링크 [a](없는.md) 와 있는 링크 [b](real.md).',
  '백틱 경로 `docs/없는경로.md` 와 `docs/real.md`.',
  '',
].join('\n'));
git('add', '.'); git('commit', '-q', '-m', 'base');

// ── 2. links.mjs ──
const json = path.join(repo + '-links.json');
const res = run(LINKS, repo, '--json', json);
const got = JSON.parse(readFileSync(json, 'utf8'));
eq(res.code, 1, '깨짐이 있으면 종료코드 1');
eq(got.broken.map((b) => `${b.kind} ${b.file}:${b.line} ${b.ref}`), [
  'link docs/body.md:3 없는.md',
  'path docs/body.md:4 docs/없는경로.md',
], '깨짐은 본문 링크 1 · 백틱 경로 1 뿐이다(스팬·펜스 안 링크 꼴 0)');
eq(got.checked, 5, '검사한 참조 5(real.md 링크 2 · 없는.md 링크 1 · 백틱 경로 2)');
eq(got.broken.filter((b) => b.file === 'docs/span.md').length, 0, '코드 스팬 안 [a](없는.md) 는 깨짐이 아니다');
eq(got.broken.filter((b) => b.file === 'docs/fence.md').length, 0, '펜스(``` · ~~~) 안 링크·참조 정의는 깨짐이 아니다');

// ── 3. refs.mjs — 백틱 경로 판정이 그대로인지 ──
w('docs/ref-user.md', '# 쓰는 곳\n\n경로 `docs/real.md` 를 본다. 예시 `[x](real.md)`.\n');
git('add', '.'); git('commit', '-q', '-m', 'ref-user');
const rjson = path.join(repo + '-refs.json');
const rr = run(REFS, repo, 'docs/real.md', '--json', rjson);
const hits = JSON.parse(readFileSync(rjson, 'utf8')).hits.filter((h) => h.rel === 'docs/ref-user.md').map((h) => `${h.kind}:${h.line}`);
eq(rr.code, 0, 'refs 종료코드 0');
eq(hits, ['path:3'], '코드 스팬 속 링크 꼴은 refs 도 링크로 세지 않고 레포 경로는 계속 경로로 센다');

console.log(`\n${pass}/${pass + fail} PASS · 작업 레포 ${repo}`);
process.exit(fail ? 1 : 0);
