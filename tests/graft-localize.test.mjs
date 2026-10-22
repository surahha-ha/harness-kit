// graft-localize.mjs 시험 — 임시 git 레포에 graft init 이 쓰는 파일을 흉내 내 놓고(실제 graft 는 부르지 않는다) 옮기기·멱등·되돌리기를 본다.
// graft init 흉내의 값은 graft 0.12.1 dist/claude/settings-merge.js · init.js 를 옮긴 것이다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { fixTimeout, stripGraft, addBlock, removeBlock, addGitignoreBlock, checkNodeEngine, findGraftPackage, graftEngine } from '../plugins/harness-kit/scripts/graft-localize.mjs';

// 이 PC 의 git 전역·시스템 설정(전역 ignore · autocrlf)이 판정에 섞이지 않게 비운다 — 스크립트를 띄우는 자식에도 물려준다
const EMPTY_GITCONFIG = path.join(mkdtempSync(path.join(os.tmpdir(), 'hk-gitcfg-')), 'gitconfig');
writeFileSync(EMPTY_GITCONFIG, '');
process.env.GIT_CONFIG_GLOBAL = EMPTY_GITCONFIG;
process.env.GIT_CONFIG_NOSYSTEM = '1';

const SCRIPT = fileURLToPath(new URL('../plugins/harness-kit/scripts/graft-localize.mjs', import.meta.url));
const SL = 'node "${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/graft-statusline.cjs"';
const hook = (arg) => `node "\${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/graft-hooks.cjs" ${arg}`;

function graftMerge(existing) {
  const m = { ...existing };
  if (!m.statusLine) m.statusLine = { type: 'command', command: SL };
  if (!m.subagentStatusLine) m.subagentStatusLine = { type: 'command', command: SL };
  const blocks = {
    PostToolUse: [
      { matcher: 'Write|Edit|MultiEdit', hooks: [{ type: 'command', command: hook('post-edit'), timeout: 10000 }] },
      { matcher: 'Bash|mcp__graft__', hooks: [{ type: 'command', command: hook('tool-savings'), timeout: 8000 }] },
    ],
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: hook('prompt'), timeout: 15000 }] }],
    SessionStart: [{ hooks: [{ type: 'command', command: hook('session-start'), timeout: 8000 }] }],
    Stop: [{ hooks: [{ type: 'command', command: hook('stop'), timeout: 8000 }] }],
  };
  m.hooks = { ...(m.hooks || {}) };
  for (const [ev, b] of Object.entries(blocks)) m.hooks[ev] = [...(m.hooks[ev] || []).filter((e) => !JSON.stringify(e).includes('graft-hooks.cjs')), ...b];
  m.footerLinksRegexes = [...new Set([...(m.footerLinksRegexes || []), 'graft/[\\w./-]+\\.md'])];
  m.permissions = { ...(m.permissions || {}) };
  m.permissions.allow = [...new Set([...(m.permissions.allow || []), 'Bash(graft:*)', 'Bash(npx graft:*)', 'Bash(graft-dev:*)', 'Bash(node dist/cli.js:*)'])];
  return m;
}
/** graft init + build 이 이 레포에 쓰는 것 — settings.json 을 2칸 LF 로 통째로 다시 쓴다. */
function simulateGraft(root) {
  const sp = path.join(root, '.claude', 'settings.json');
  const cur = existsSync(sp) ? JSON.parse(readFileSync(sp, 'utf8').replace(/^﻿/, '')) : {};
  writeFileSync(sp, `${JSON.stringify(graftMerge(cur), null, 2)}\n`);
  mkdirSync(path.join(root, '.claude', 'helpers'), { recursive: true });
  writeFileSync(path.join(root, '.claude', 'helpers', 'graft-statusline.cjs'), 'const BAKED = "/abs/path/dist/claude";\n');
  writeFileSync(path.join(root, '.claude', 'helpers', 'graft-hooks.cjs'), 'const BAKED = "/abs/path/dist/claude";\n');
  mkdirSync(path.join(root, '.claude', 'skills', 'graft'), { recursive: true });
  writeFileSync(path.join(root, '.claude', 'skills', 'graft', 'SKILL.md'), '# graft\n');
  const mp = path.join(root, '.mcp.json');
  const mcp = existsSync(mp) ? JSON.parse(readFileSync(mp, 'utf8')) : {};
  mcp.mcpServers = { ...(mcp.mcpServers || {}), graft: { command: 'graft', args: ['mcp'] } };
  writeFileSync(mp, `${JSON.stringify(mcp, null, 2)}\n`);
  mkdirSync(path.join(root, 'graft', '.cache'), { recursive: true });
  writeFileSync(path.join(root, 'graft', 'INDEX.md'), '# index\n');
  if (!existsSync(path.join(root, '.ignore'))) writeFileSync(path.join(root, '.ignore'), "# graft's cards\n!graft/\ngraft/.cache/\ngraft/.graph/\n");
}

const git = (root, ...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' });
function repo(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hk-graft-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'test');
  git(root, 'config', 'core.autocrlf', 'false');
  for (const [p, t] of Object.entries(files)) { mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); writeFileSync(path.join(root, p), t); }
  git(root, 'add', '-f', '--', ...Object.keys(files)); // -f: 이 PC 의 전역 ignore 가 settings.local.json 을 숨겨도 추적 파일로 만든다
  git(root, 'commit', '-qm', 'init');
  return root;
}
function run(root, cmd, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, cmd, root, ...args], { encoding: 'utf8', env: { ...process.env, HARNESS_KIT_GRAFT_VERSION: '0.12.1' } });
  return { code: r.status, out: r.stdout + r.stderr };
}
const rd = (root, p) => readFileSync(path.join(root, p), 'utf8');
const json = (root, p) => JSON.parse(rd(root, p));
const exclude = (root) => readFileSync(path.resolve(root, git(root, 'rev-parse', '--git-path', 'info/exclude').trim()), 'utf8');

// CRLF · 4칸 들여쓰기 · 기존 훅이 있는 settings.json — graft init 이 LF 2칸으로 다시 쓴 뒤 바이트까지 돌아오는가
const SETTINGS_CRLF = '{\r\n    "hooks": {\r\n        "PreToolUse": [\r\n            { "matcher": "Bash", "hooks": [{ "type": "command", "command": "node guard.mjs", "timeout": 10 }] }\r\n        ]\r\n    },\r\n    "enabledPlugins": { "a@b": true }\r\n}\r\n';
const LOCAL = '{\n  "hooks": {\n    "Stop": [{ "hooks": [{ "type": "command", "command": "node mine.mjs" }] }]\n  }\n}\n';

test('옮기기 — settings.json 은 init 전 바이트로, graft 몫은 settings.local.json 으로(timeout 은 초), 로컬 산출물은 exclude 로', () => {
  const root = repo({ '.claude/settings.json': SETTINGS_CRLF, '.gitignore': 'node_modules/\n' });
  writeFileSync(path.join(root, '.claude/settings.local.json'), LOCAL);
  assert.equal(run(root, 'prepare').code, 0);
  assert.match(rd(root, '.gitignore'), /# harness-kit:begin\n# graft[^\n]*\n\/graft\/\n# harness-kit:end\n$/);
  simulateGraft(root);
  const r = run(root, 'localize');
  assert.equal(r.code, 0, r.out);
  assert.equal(rd(root, '.claude/settings.json'), SETTINGS_CRLF);
  const l = json(root, '.claude/settings.local.json');
  assert.deepEqual(l.hooks.Stop[0], { hooks: [{ type: 'command', command: 'node mine.mjs' }] }, '원래 로컬 훅이 첫 자리에 그대로');
  assert.deepEqual(l.hooks.Stop[1].hooks[0], { type: 'command', command: hook('stop'), timeout: 8 });
  assert.equal(l.hooks.UserPromptSubmit[0].hooks[0].timeout, 15);
  assert.deepEqual(l.hooks.PostToolUse.map((g) => g.hooks[0].timeout), [10, 8]);
  assert.equal(l.hooks.SessionStart[0].hooks[0].timeout, 8);
  assert.equal(l.subagentStatusLine.command, SL);
  assert.equal(l.statusLine, undefined, '합치기를 켜지 않았으면 statusLine 을 넣지 않는다');
  assert.deepEqual(l.permissions.allow, ['Bash(graft:*)', 'Bash(npx graft:*)', 'Bash(graft-dev:*)', 'Bash(node dist/cli.js:*)']);
  assert.deepEqual(l.footerLinksRegexes, ['graft/[\\w./-]+\\.md']);
  assert.deepEqual(l.disabledMcpjsonServers, ['graft']);
  const ex = exclude(root);
  for (const e of ['/graft/', '/.claude/helpers/graft-*.cjs', '/.claude/skills/graft/', '/.mcp.json', '/.ignore']) assert.ok(ex.split('\n').includes(e), `exclude 에 ${e}`);
  assert.equal(git(root, 'status', '--porcelain'), ' M .gitignore\n', '커밋 대상으로 보이는 것은 .gitignore 블록뿐');
});

test('멱등 — 다시 돌려도 같고, graft 업그레이드가 settings.json 에 다시 넣어도 localize 한 번으로 같은 상태가 된다', () => {
  const root = repo({ '.claude/settings.json': SETTINGS_CRLF });
  run(root, 'prepare'); run(root, 'prepare');
  assert.equal(rd(root, '.gitignore').split('\n').filter((x) => x === '/graft/').length, 1, 'prepare 를 두 번 돌려도 블록은 하나');
  simulateGraft(root);
  assert.equal(run(root, 'localize').code, 0);
  const snap = () => ['.claude/settings.json', '.claude/settings.local.json', '.gitignore'].map((p) => rd(root, p)).concat(exclude(root));
  const first = snap();
  assert.equal(run(root, 'localize').code, 0);
  assert.deepEqual(snap(), first, '두 번째 실행이 바꾼 것이 없다');
  simulateGraft(root); // 업그레이드 뒤 reconcileWiring → runInit
  assert.equal(run(root, 'status').code, 1, 'status 가 settings.json 의 graft 몫을 알린다');
  assert.equal(run(root, 'localize').code, 0);
  assert.deepEqual(snap(), first);
});

test('추적 중인 .mcp.json 은 init 전 바이트로 되돌리고 exclude 에 넣지 않는다', () => {
  const MCP = '{\r\n  "mcpServers": {\r\n    "other": { "command": "x" }\r\n  }\r\n}\r\n';
  const root = repo({ '.claude/settings.json': '{}\n', '.mcp.json': MCP });
  run(root, 'prepare');
  simulateGraft(root);
  assert.equal(run(root, 'localize').code, 0);
  assert.equal(rd(root, '.mcp.json'), MCP);
  assert.equal(rd(root, '.claude/settings.json'), '{}\n');
  assert.ok(!exclude(root).split('\n').includes('/.mcp.json'));
  assert.deepEqual(json(root, '.claude/settings.local.json').disabledMcpjsonServers, ['graft']);
});

test('--statusline — 전역 합치기 영수증의 명령을 settings.local.json statusLine 에 넣는다', () => {
  const root = repo({ '.claude/settings.json': '{}\n' });
  const home = mkdtempSync(path.join(os.tmpdir(), 'hk-home-'));
  mkdirSync(path.join(home, '.claude', 'harness-kit'), { recursive: true });
  const line = { type: 'command', command: 'node "/h/.claude/harness-kit/statusline-combined.cjs"' };
  writeFileSync(path.join(home, '.claude', 'harness-kit', 'receipt.json'), JSON.stringify({ wrote: { statusLine: line } }));
  run(root, 'prepare');
  simulateGraft(root);
  assert.equal(run(root, 'localize', '--statusline', '--home', home).code, 0);
  assert.deepEqual(json(root, '.claude/settings.local.json').statusLine, line);
  assert.equal(rd(root, '.claude/settings.json'), '{}\n');
});

test('remove — localize 가 만든 것을 걷어 내고 settings.json 은 건드리지 않는다', () => {
  const root = repo({ '.claude/settings.json': SETTINGS_CRLF });
  run(root, 'prepare');
  simulateGraft(root);
  run(root, 'localize');
  const r = run(root, 'remove');
  assert.equal(r.code, 0, r.out);
  for (const p of ['.claude/settings.local.json', '.claude/helpers', '.claude/skills', '.mcp.json', '.ignore', 'graft']) assert.ok(!existsSync(path.join(root, p)), `${p} 가 남았다`);
  assert.equal(rd(root, '.claude/settings.json'), SETTINGS_CRLF);
  assert.ok(!exclude(root).includes('graft-localize:begin'));
  assert.match(r.out, /WARN info\/exclude 는 워크트리끼리 공유된다/);
});

test('remove — 원래 있던 settings.local.json 은 graft 몫만 떼고 남긴다', () => {
  const root = repo({ '.claude/settings.json': '{}\n' });
  writeFileSync(path.join(root, '.claude/settings.local.json'), LOCAL);
  run(root, 'prepare'); simulateGraft(root); run(root, 'localize');
  assert.equal(run(root, 'remove').code, 0);
  assert.deepEqual(json(root, '.claude/settings.local.json'), JSON.parse(LOCAL));
});

test('settings.local.json 이 추적 중이면 prepare 가 멈춘다', () => {
  const root = repo({ '.claude/settings.json': '{}\n', '.claude/settings.local.json': '{}\n' });
  const r = run(root, 'prepare');
  assert.equal(r.code, 1);
  assert.match(r.out, /추적 중이다/);
  assert.equal(rd(root, '.claude/settings.json'), '{}\n');
});

test('graft 가 없으면 prepare 는 건너뛴다(종료코드 3) — 아무것도 쓰지 않는다', () => {
  const root = repo({ '.claude/settings.json': '{}\n' });
  const r = spawnSync(process.execPath, [SCRIPT, 'prepare', root], { encoding: 'utf8', env: { ...process.env, HARNESS_KIT_GRAFT_VERSION: '' } });
  assert.equal(r.status, 3);
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.match(r.stdout, /npm view @nanonets\/graft engines/, '설치 안내에 요구 Node 판 확인 방법');
  assert.match(r.stdout, /node --version/);
  assert.match(r.stdout, /Node 를 먼저 올린 뒤 npm i -g @nanonets\/graft/);
});

// ── Node 조건(engines.node) — graft 설치본 package.json 경로와 Node 판을 바꿔쳐서 본다 ──
function graftPkg(pkg) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hk-graftpkg-'));
  const p = path.join(dir, 'package.json');
  writeFileSync(p, JSON.stringify(pkg));
  return p;
}
function runNode(root, cmd, pkgPath, nodeVersion) {
  const env = { ...process.env, HARNESS_KIT_GRAFT_VERSION: '0.12.1', HARNESS_KIT_GRAFT_PKG: pkgPath, HARNESS_KIT_NODE_VERSION: nodeVersion };
  const r = spawnSync(process.execPath, [SCRIPT, cmd, root], { encoding: 'utf8', env });
  return { code: r.status, out: r.stdout + r.stderr };
}
const stateDirOf = (root) => path.resolve(root, git(root, 'rev-parse', '--git-path', 'harness-kit-graft').trim());

test('Node 조건 불충족 — graft 가 있어도 prepare 는 건너뛰고(종료코드 3) 아무것도 쓰지 않는다', () => {
  const root = repo({ '.claude/settings.json': '{}\n' });
  const r = runNode(root, 'prepare', graftPkg({ name: '@nanonets/graft', engines: { node: '>=20' } }), 'v18.19.0');
  assert.equal(r.code, 3);
  assert.match(r.out, /Node >=20 필요, 현재 v18\.19\.0/);
  assert.match(r.out, /npm view @nanonets\/graft engines/);
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.equal(existsSync(stateDirOf(root)), false, '스냅숏을 뜨지 않는다');
});

test('Node 조건 불충족 — check 도 건너뜀(종료코드 3)으로 낸다', () => {
  const root = repo({ 'a.js': '1\n' });
  const r = runNode(root, 'check', graftPkg({ name: '@nanonets/graft', engines: { node: '>=20' } }), 'v18.19.0');
  assert.equal(r.code, 3);
  assert.match(r.out, /SKIP graft 0\.12\.1 가 있지만 Node >=20 필요, 현재 v18\.19\.0/);
});

test('Node 조건 충족 — prepare 가 진행하고 OK 줄을 낸다', () => {
  const root = repo({ '.claude/settings.json': '{}\n' });
  const r = runNode(root, 'prepare', graftPkg({ name: '@nanonets/graft', engines: { node: '>=20' } }), 'v20.0.0');
  assert.equal(r.code, 0);
  assert.match(r.out, /OK {3}graft 0\.12\.1 의 Node >=20 충족, 현재 v20\.0\.0/);
  assert.doesNotMatch(r.out, /WARN/);
  assert.equal(existsSync(stateDirOf(root)), true);
});

test('Node 조건을 읽지 못하면 WARN 만 내고 진행한다 — 파일 없음 · engines 없음 · 해석 못 하는 범위식', () => {
  const cases = [
    [path.join(os.tmpdir(), 'hk-no-such-dir', 'package.json'), /WARN graft 0\.12\.1 의 Node 조건\(engines\.node\)을 확인하지 못했다 — .*읽지 못했다/],
    ['', /WARN .*package\.json 을 찾지 못했다/],
    [graftPkg({ name: '@nanonets/graft' }), /WARN .*engines\.node 가 없다/],
    [graftPkg({ name: '@nanonets/graft', engines: { node: '>=18 <22' } }), /WARN .*">=18 <22" 을 해석하지 못했다/],
  ];
  for (const [pkgPath, warn] of cases) {
    const root = repo({ '.claude/settings.json': '{}\n' });
    const r = runNode(root, 'prepare', pkgPath, 'v16.0.0');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, warn);
  }
});

test('checkNodeEngine — >=X · >=X.Y.Z · ^X 만 판정하고 그 밖은 null', () => {
  assert.equal(checkNodeEngine('>=20', 'v20.0.0').ok, true);
  assert.equal(checkNodeEngine('>=20', 'v24.14.0').ok, true);
  assert.equal(checkNodeEngine('>=20', 'v19.9.9').ok, false);
  assert.equal(checkNodeEngine('>=20.10.0', 'v20.9.5').ok, false);
  assert.equal(checkNodeEngine('>= 20.10', 'v20.10.0').ok, true);
  assert.equal(checkNodeEngine('^20', 'v20.5.1').ok, true);
  assert.equal(checkNodeEngine('^20', 'v21.0.0').ok, false, '^ 는 다음 주 판 미만');
  assert.equal(checkNodeEngine('^20.3', 'v20.2.0').ok, false);
  assert.equal(checkNodeEngine('>=20', 'v22.0.0-nightly2024').ok, true);
  assert.equal(checkNodeEngine('>=18 <22', 'v20.0.0').ok, null);
  assert.equal(checkNodeEngine('^18 || ^20', 'v20.0.0').ok, null);
  assert.equal(checkNodeEngine('20.x', 'v20.0.0').ok, null);
  assert.equal(checkNodeEngine('>=20', 'garbage').ok, null);
  assert.equal(checkNodeEngine('>=20', 'v18.0.0').why, 'Node >=20 필요, 현재 v18.0.0');
});

test('findGraftPackage — npm root -g 아래 · 실행 파일 옆 node_modules · 실행 파일 위 디렉토리, 이름이 다른 package.json 은 받지 않는다', () => {
  const put = (p, obj) => { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(obj)); return p; };
  const base = mkdtempSync(path.join(os.tmpdir(), 'hk-findgraft-'));
  const G = { name: '@nanonets/graft', engines: { node: '>=20' } };
  // npm root -g
  const inRoot = put(path.join(base, 'root', 'node_modules', '@nanonets', 'graft', 'package.json'), G);
  assert.equal(findGraftPackage({ npmRoot: path.join(base, 'root', 'node_modules') }), inRoot);
  // Windows npm shim — <prefix>/graft.cmd 옆 <prefix>/node_modules/@nanonets/graft
  const shim = path.join(base, 'prefix', 'graft.cmd');
  const beside = put(path.join(base, 'prefix', 'node_modules', '@nanonets', 'graft', 'package.json'), G);
  mkdirSync(path.dirname(shim), { recursive: true }); writeFileSync(shim, '@echo off\n');
  assert.equal(findGraftPackage({ npmRoot: path.join(base, 'empty'), exePaths: [shim] }), beside, 'npm root 에 없으면 실행 파일 위치로');
  // 실경로가 패키지 안(dist/cli.js)
  const pkgDir = path.join(base, 'lib', 'graft');
  const inside = put(path.join(pkgDir, 'package.json'), G);
  const cli = path.join(pkgDir, 'dist', 'cli.js'); mkdirSync(path.dirname(cli), { recursive: true }); writeFileSync(cli, '');
  assert.equal(findGraftPackage({ exePaths: [cli] }), inside);
  // 다른 이름
  const other = path.join(base, 'other');
  put(path.join(other, 'node_modules', '@nanonets', 'graft', 'package.json'), { name: 'not-graft' });
  assert.equal(findGraftPackage({ npmRoot: path.join(other, 'node_modules'), exePaths: [path.join(base, 'missing.cmd')] }), null);
  // 찾은 파일로 판정
  assert.equal(graftEngine(inRoot, 'v18.0.0').state, 'unmet');
  assert.equal(graftEngine(inRoot, 'v20.1.0').state, 'ok');
  assert.equal(graftEngine(null, 'v20.1.0').state, 'unknown');
});

test('fixTimeout — 1000 이상은 ms 로 보고 초로 올림, 그 밖은 그대로', () => {
  assert.equal(fixTimeout(15000), 15);
  assert.equal(fixTimeout(8000), 8);
  assert.equal(fixTimeout(1500), 2);
  assert.equal(fixTimeout(999), 999);
  assert.equal(fixTimeout(10), 10);
  assert.equal(fixTimeout(undefined), undefined);
});

test('stripGraft — graft 가 아닌 statusLine·allow·훅은 남기고, init 전에 있던 빈 그릇은 지우지 않는다', () => {
  const base = { permissions: { allow: [] }, statusLine: { type: 'command', command: 'mine' } };
  const { stripped, count } = stripGraft(graftMerge(base), base);
  assert.deepEqual(stripped, base);
  assert.equal(count, 1 + 5 + 1 + 4, 'subagentStatusLine 1 · 훅 그룹 5 · footer 1 · allow 4');
});

test('exclude 블록 — 없으면 넣고 있으면 그대로 두며, 지우면 블록 밖 줄만 남는다', () => {
  const a = addBlock('*.log\r\n', ['/graft/']);
  assert.match(a, /^\*\.log\r\n# harness-kit graft-localize:begin\r\n# graft [^\r\n]*\r\n\/graft\/\r\n# harness-kit graft-localize:end\r\n$/);
  assert.equal(addBlock(a, ['/graft/', '/.mcp.json']), a);
  assert.equal(removeBlock(a).text, '*.log\r\n');
});

test('.gitignore — graft 가 인정하는 줄이 이미 있으면 블록을 더하지 않는다', () => {
  assert.equal(addGitignoreBlock('graft/\n').added, false);
  const t = addGitignoreBlock('a\r\n').text;
  assert.ok(!/[^\r]\n/.test(t), 'CRLF 파일에는 CRLF 로 더한다');
  const ls = t.split('\r\n');
  assert.deepEqual([ls[0], ls[1], ls[2], ls[4], ls[5], ls[6]], ['a', '', '# harness-kit:begin', '/graft/', '# harness-kit:end', '']);
  assert.match(ls[3], /^# graft /, '블록 안 첫 줄은 이유 주석');
});
