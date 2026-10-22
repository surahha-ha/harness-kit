// statusline-combined.cjs · statusline-setup.mjs 시험 — 실제 사용자 홈은 건드리지 않고 --home 과 설정 경로·셸을 주입한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { pickShell } from '../plugins/harness-kit/scripts/statusline-setup.mjs';

const COMBINED = fileURLToPath(new URL('../plugins/harness-kit/scripts/statusline-combined.cjs', import.meta.url));
const SETUP = fileURLToPath(new URL('../plugins/harness-kit/scripts/statusline-setup.mjs', import.meta.url));
const tmp = (p) => mkdtempSync(path.join(os.tmpdir(), p));
const NODE_SHELL = [process.execPath, '-e'];

/** base 는 node -e 로 돌린다 — 셸이 없는 PC 에서도 같은 시험이 돈다. shell 이 null 이면 설정에 shell 을 적지 않는다(옛 설정). */
function combined({ base, helper, stdin, env = {}, timeoutMs, shell = NODE_SHELL }) {
  const dir = tmp('hk-sl-');
  const cfg = path.join(dir, 'statusline.json');
  writeFileSync(cfg, JSON.stringify({ base, ...(shell ? { shell } : {}), ...(timeoutMs ? { timeoutMs } : {}) }));
  const project = tmp('hk-proj-');
  if (helper) { mkdirSync(path.join(project, '.claude', 'helpers'), { recursive: true }); writeFileSync(path.join(project, '.claude', 'helpers', 'graft-statusline.cjs'), helper); }
  const e = { ...process.env, HARNESS_KIT_STATUSLINE_CONFIG: cfg, ...env };
  delete e.CLAUDE_PROJECT_DIR;
  if (env.CLAUDE_PROJECT_DIR === true) e.CLAUDE_PROJECT_DIR = project;
  const input = stdin ?? JSON.stringify({ model: { display_name: 'M' }, workspace: { project_dir: project } });
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [COMBINED], { input, encoding: 'utf8', env: e });
  return { code: r.status, out: r.stdout, ms: Date.now() - t0, project };
}
const BASE_OK = "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write('BASE '+JSON.parse(s).model.display_name+'\\n'))";
const HELPER = "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write('GRAFT '+JSON.parse(s).model.display_name+' '+require('path').basename(process.env.CLAUDE_PROJECT_DIR)+'\\n'))";

test('합치기 — base 다음 줄에 graft 줄, 둘 다 같은 stdin 을 받고 헬퍼는 레포 경로를 CLAUDE_PROJECT_DIR 로 받는다', () => {
  const r = combined({ base: BASE_OK, helper: HELPER });
  assert.equal(r.code, 0);
  assert.equal(r.out, `BASE M\nGRAFT M ${path.basename(r.project)}`);
});

test('헬퍼가 없는 레포에서는 base 줄만', () => {
  const r = combined({ base: BASE_OK });
  assert.equal(r.out, 'BASE M');
});

test('base 가 실패하면(종료코드 ≠ 0) 그 자리에 실패 표식 한 줄, 그 아래 graft 줄', () => {
  const r = combined({ base: "process.stdout.write('partial');process.exit(1)", helper: HELPER });
  assert.equal(r.code, 0);
  assert.equal(r.out, `statusline base 실패(exit 1)\nGRAFT M ${path.basename(r.project)}`);
});

test('base 가 타임아웃이면 기다리지 않고 실패 표식 한 줄, 그 아래 graft 줄', () => {
  const r = combined({ base: "setTimeout(()=>process.stdout.write('late'),20000)", helper: HELPER, timeoutMs: 1500 });
  assert.equal(r.out, `statusline base 실패(timeout)\nGRAFT M ${path.basename(r.project)}`);
  assert.ok(r.ms < 10000, `${r.ms}ms`);
});

test('실행 때는 기록된 셸만 쓴다 — 그 셸이 없으면 다른 셸을 찾지 않고 실패 표식', () => {
  const missing = path.join(tmp('hk-noshell-'), 'no-such-shell.exe');
  const r = combined({ base: BASE_OK, helper: HELPER, shell: [missing, '-c'], env: { CLAUDE_CODE_GIT_BASH_PATH: process.execPath, SHELL: process.execPath } });
  assert.equal(r.out, `statusline base 실패(ENOENT)\nGRAFT M ${path.basename(r.project)}`);
});

test('shell 이 없는 옛 설정이면 base 를 돌리지 않고 안내 한 줄', () => {
  const r = combined({ base: BASE_OK, helper: HELPER, shell: null });
  assert.equal(r.out, `harness-kit statusline: shell 미기록 — install 다시 실행\nGRAFT M ${path.basename(r.project)}`);
});

test('base 가 없으면(원래 상태 줄 없음) graft 줄만 · stdin 이 JSON 이 아니면 헬퍼를 찾지 않는다', () => {
  assert.equal(combined({ base: null, helper: HELPER, shell: null }).out.startsWith('GRAFT M'), true);
  assert.equal(combined({ base: BASE_OK.replace('JSON.parse(s).model.display_name', 's.length'), helper: HELPER, stdin: 'not json' }).out, 'BASE 8');
});

test('레포 경로는 CLAUDE_PROJECT_DIR 가 stdin 보다 앞선다', () => {
  const other = tmp('hk-other-');
  const r = combined({ base: null, helper: HELPER, env: { CLAUDE_PROJECT_DIR: true }, stdin: JSON.stringify({ model: { display_name: 'M' }, workspace: { project_dir: other } }) });
  assert.equal(r.out, `GRAFT M ${path.basename(r.project)}`);
});

// ── 셸 고르기(설치 때 한 번) ─────────────────────────────────────────────────────
test('pickShell — Windows: CLAUDE_CODE_GIT_BASH_PATH → where git 의 <Git>\\bin\\bash.exe → PowerShell 절대경로', () => {
  const has = (...ps) => (p) => ps.includes(p);
  const win = (env, gitExes, exists) => pickShell({ platform: 'win32', env, gitExes, exists });
  assert.deepEqual(win({ CLAUDE_CODE_GIT_BASH_PATH: 'D:\\B\\bash.exe' }, ['C:\\G\\cmd\\git.exe'], has('D:\\B\\bash.exe', 'C:\\G\\bin\\bash.exe')), ['D:\\B\\bash.exe', '-c']);
  assert.deepEqual(win({ CLAUDE_CODE_GIT_BASH_PATH: 'D:\\gone.exe' }, ['C:\\G\\cmd\\git.exe'], has('C:\\G\\bin\\bash.exe')), ['C:\\G\\bin\\bash.exe', '-c'], '없는 경로는 건너뛴다');
  assert.deepEqual(win({}, ['C:\\G\\mingw64\\bin\\git.exe'], has('C:\\G\\bin\\bash.exe')), ['C:\\G\\bin\\bash.exe', '-c']);
  assert.deepEqual(win({ SystemRoot: 'C:\\WIN' }, ['C:\\G\\cmd\\git.exe'], has()), ['C:\\WIN\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', '-NoProfile', '-Command']);
});

test('pickShell — Windows 밖: $SHELL → /bin/sh', () => {
  assert.deepEqual(pickShell({ platform: 'linux', env: { SHELL: '/bin/zsh' } }), ['/bin/zsh', '-c']);
  assert.deepEqual(pickShell({ platform: 'darwin', env: {} }), ['/bin/sh', '-c']);
});

// ── setup ────────────────────────────────────────────────────────────────────
function home(settingsText) {
  const h = tmp('hk-home-');
  if (settingsText !== null) { mkdirSync(path.join(h, '.claude'), { recursive: true }); writeFileSync(path.join(h, '.claude', 'settings.json'), settingsText); }
  return h;
}
const setup = (h, cmd, shell = NODE_SHELL) => {
  const r = spawnSync(process.execPath, [SETUP, cmd, '--home', h], { encoding: 'utf8', env: { ...process.env, HARNESS_KIT_STATUSLINE_SHELL: JSON.stringify(shell) } });
  return { code: r.status, out: r.stdout + r.stderr };
};
const kitDir = (h) => path.join(h, '.claude', 'harness-kit');
const CMD = "process.stdout.write('B')";
const settingsWith = (cmd) => `{\r\n    "model": "x",\r\n    "statusLine": { "type": "command", "command": ${JSON.stringify(cmd)}, "padding": 1 },\r\n    "enabledPlugins": { "a@b": true }\r\n}\r\n`;
const ORIG = settingsWith(CMD);

test('install — 셸을 정해 기록하고 statusLine.command 만 그 자리에서 바꾼다 · restore 는 바이트까지 되돌리되 사본·설정은 남긴다', () => {
  const h = home(ORIG);
  const r = setup(h, 'install');
  assert.equal(r.code, 0, r.out);
  const script = path.join(kitDir(h), 'statusline-combined.cjs').split(path.sep).join('/');
  const want = `node "${script}"`;
  const after = readFileSync(path.join(h, '.claude', 'settings.json'), 'utf8');
  assert.equal(after, settingsWith(want), '다른 바이트는 그대로');
  const cfg = path.join(kitDir(h), 'statusline.json');
  assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { base: CMD, shell: NODE_SHELL });
  assert.ok(existsSync(script));
  // 옛 설정(shell 없음)이면 두 번째 install 이 셸을 다시 적는다 — 「install 다시 실행」 안내가 실제로 고친다
  writeFileSync(cfg, JSON.stringify({ base: CMD }));
  assert.equal(setup(h, 'install').code, 0, '두 번째 install 은 이미 설치됨');
  assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { base: CMD, shell: NODE_SHELL });
  const rs = setup(h, 'restore');
  assert.equal(rs.code, 0, rs.out);
  assert.equal(readFileSync(path.join(h, '.claude', 'settings.json'), 'utf8'), ORIG);
  assert.ok(existsSync(script) && existsSync(cfg), 'graft 연결을 남긴 레포의 settings.local.json 이 사본을 가리킨다 — 지우지 않는다');
  assert.ok(!existsSync(path.join(kitDir(h), 'receipt.json')));
  assert.match(rs.out, /graft 를 쓰는 레포의 settings\.local\.json statusLine 이 이 사본을 계속 쓴다 — 지우려면 각 레포에서 graft 연결 제거 후 수동 삭제/);
});

test('install — base 를 기록할 셸로 돌려 실패하거나(종료 ≠ 0) 출력이 비면 멈추고(3) 아무것도 쓰지 않는다', () => {
  for (const [cmd, why] of [["process.exit(2)", /종료코드 2/], ["process.exit(0)", /출력이 비어 있음/]]) {
    const text = settingsWith(cmd);
    const h = home(text);
    const r = setup(h, 'install');
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, why);
    assert.equal(readFileSync(path.join(h, '.claude', 'settings.json'), 'utf8'), text);
    assert.equal(existsSync(kitDir(h)), false, 'harness-kit 폴더를 만들지 않는다');
  }
});

test('install — 이미 다른 합치기 스크립트를 가리키면 멈추고(3) 바꾸지 않으며 폴더도 만들지 않는다', () => {
  const text = '{ "statusLine": { "type": "command", "command": "node ~/.claude/statusline-combined.cjs" } }\n';
  const h = home(text);
  assert.equal(setup(h, 'install').code, 3);
  assert.equal(readFileSync(path.join(h, '.claude', 'settings.json'), 'utf8'), text);
  assert.equal(existsSync(kitDir(h)), false);
});

test('restore — 지금 값이 우리가 쓴 값과 다르면 멈추고(3) 바꾸지 않는다', () => {
  const h = home(ORIG);
  assert.equal(setup(h, 'install').code, 0);
  const changed = '{ "statusLine": { "type": "command", "command": "something else" } }\n';
  writeFileSync(path.join(h, '.claude', 'settings.json'), changed);
  assert.equal(setup(h, 'restore').code, 3);
  assert.equal(readFileSync(path.join(h, '.claude', 'settings.json'), 'utf8'), changed);
});

test('원래 statusLine 이 없었으면 base 를 돌려 보지 않고 설치하고, restore 가 키를 지운다', () => {
  const h = home('{\n  "model": "x"\n}\n');
  assert.equal(setup(h, 'install', [path.join(h, 'no-such-shell.exe')]).code, 0);
  assert.equal(JSON.parse(readFileSync(path.join(kitDir(h), 'statusline.json'), 'utf8')).base, null);
  assert.equal(setup(h, 'restore').code, 0);
  assert.deepEqual(JSON.parse(readFileSync(path.join(h, '.claude', 'settings.json'), 'utf8')), { model: 'x' });
});

test('전역 settings.json 이 원래 없었으면 restore 가 파일을 지워 원상태로 되돌린다 — 있던 파일이 비게 되면 남긴다', () => {
  const h = home(null);
  assert.equal(setup(h, 'install').code, 0);
  assert.ok(existsSync(path.join(h, '.claude', 'settings.json')), '전제: install 이 파일을 만들었다');
  const rs = setup(h, 'restore');
  assert.equal(rs.code, 0, rs.out);
  assert.equal(existsSync(path.join(h, '.claude', 'settings.json')), false);
  assert.match(rs.out, /install 전에 없던 settings\.json 이라 파일을 지웠다/);
  const h2 = home('{}\n');
  assert.equal(setup(h2, 'install').code, 0);
  assert.equal(setup(h2, 'restore').code, 0);
  assert.equal(readFileSync(path.join(h2, '.claude', 'settings.json'), 'utf8'), '{}\n', '원래 있던 빈 파일은 바이트 그대로');
});
