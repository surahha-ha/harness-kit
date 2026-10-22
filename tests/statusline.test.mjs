// statusline-combined.cjs · statusline-setup.mjs 시험 — 실제 사용자 홈은 건드리지 않고 --home 과 설정 경로를 주입한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const COMBINED = fileURLToPath(new URL('../plugins/harness-kit/scripts/statusline-combined.cjs', import.meta.url));
const SETUP = fileURLToPath(new URL('../plugins/harness-kit/scripts/statusline-setup.mjs', import.meta.url));
const tmp = (p) => mkdtempSync(path.join(os.tmpdir(), p));

/** base 는 node -e 로 돌린다 — 셸이 없는 PC 에서도 같은 시험이 돈다. */
function combined({ base, helper, stdin, env = {}, timeoutMs }) {
  const dir = tmp('hk-sl-');
  const cfg = path.join(dir, 'statusline.json');
  writeFileSync(cfg, JSON.stringify({ base, shell: [process.execPath, '-e'], ...(timeoutMs ? { timeoutMs } : {}) }));
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

test('base 가 실패하면(종료코드 ≠ 0) graft 줄만', () => {
  const r = combined({ base: "process.stdout.write('partial');process.exit(1)", helper: HELPER });
  assert.equal(r.code, 0);
  assert.equal(r.out, `GRAFT M ${path.basename(r.project)}`);
});

test('base 가 타임아웃이면 기다리지 않고 graft 줄만', () => {
  const r = combined({ base: "setTimeout(()=>process.stdout.write('late'),20000)", helper: HELPER, timeoutMs: 1500 });
  assert.equal(r.out, `GRAFT M ${path.basename(r.project)}`);
  assert.ok(r.ms < 10000, `${r.ms}ms`);
});

test('base 가 없으면(원래 상태 줄 없음) graft 줄만 · stdin 이 JSON 이 아니면 헬퍼를 찾지 않는다', () => {
  assert.equal(combined({ base: null, helper: HELPER }).out.startsWith('GRAFT M'), true);
  assert.equal(combined({ base: BASE_OK.replace('JSON.parse(s).model.display_name', 's.length'), helper: HELPER, stdin: 'not json' }).out, 'BASE 8');
});

test('레포 경로는 CLAUDE_PROJECT_DIR 가 stdin 보다 앞선다', () => {
  const other = tmp('hk-other-');
  const r = combined({ base: null, helper: HELPER, env: { CLAUDE_PROJECT_DIR: true }, stdin: JSON.stringify({ model: { display_name: 'M' }, workspace: { project_dir: other } }) });
  assert.equal(r.out, `GRAFT M ${path.basename(r.project)}`);
});

// ── setup ────────────────────────────────────────────────────────────────────
function home(settingsText) {
  const h = tmp('hk-home-');
  if (settingsText !== null) { mkdirSync(path.join(h, '.claude'), { recursive: true }); writeFileSync(path.join(h, '.claude', 'settings.json'), settingsText); }
  return h;
}
const setup = (h, cmd) => { const r = spawnSync(process.execPath, [SETUP, cmd, '--home', h], { encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; };
const ORIG = '{\r\n    "model": "x",\r\n    "statusLine": { "type": "command", "command": "bash ~/sl.sh", "padding": 1 },\r\n    "enabledPlugins": { "a@b": true }\r\n}\r\n';

test('install — statusLine.command 만 그 자리에서 바꾸고 원래 명령을 base 로, restore 는 바이트까지 되돌린다', () => {
  const h = home(ORIG);
  const r = setup(h, 'install');
  assert.equal(r.code, 0, r.out);
  const script = path.join(h, '.claude', 'harness-kit', 'statusline-combined.cjs').split(path.sep).join('/');
  const want = `node "${script}"`;
  const after = readFileSync(path.join(h, '.claude', 'settings.json'), 'utf8');
  assert.equal(after, ORIG.replace('"bash ~/sl.sh"', JSON.stringify(want)), '다른 바이트는 그대로');
  assert.deepEqual(JSON.parse(readFileSync(path.join(h, '.claude', 'harness-kit', 'statusline.json'), 'utf8')), { base: 'bash ~/sl.sh' });
  assert.ok(existsSync(script));
  assert.equal(setup(h, 'install').code, 0, '두 번째 install 은 이미 설치됨');
  assert.equal(setup(h, 'restore').code, 0);
  assert.equal(readFileSync(path.join(h, '.claude', 'settings.json'), 'utf8'), ORIG);
  assert.ok(!existsSync(script) && !existsSync(path.join(h, '.claude', 'harness-kit', 'receipt.json')));
});

test('install — 이미 다른 합치기 스크립트를 가리키면 멈추고(3) 바꾸지 않는다', () => {
  const text = '{ "statusLine": { "type": "command", "command": "node ~/.claude/statusline-combined.cjs" } }\n';
  const h = home(text);
  assert.equal(setup(h, 'install').code, 3);
  assert.equal(readFileSync(path.join(h, '.claude', 'settings.json'), 'utf8'), text);
});

test('restore — 지금 값이 우리가 쓴 값과 다르면 멈추고(3) 바꾸지 않는다', () => {
  const h = home(ORIG);
  setup(h, 'install');
  const changed = '{ "statusLine": { "type": "command", "command": "something else" } }\n';
  writeFileSync(path.join(h, '.claude', 'settings.json'), changed);
  assert.equal(setup(h, 'restore').code, 3);
  assert.equal(readFileSync(path.join(h, '.claude', 'settings.json'), 'utf8'), changed);
});

test('원래 statusLine 이 없었으면 restore 가 키를 지운다', () => {
  const h = home('{\n  "model": "x"\n}\n');
  assert.equal(setup(h, 'install').code, 0);
  assert.equal(JSON.parse(readFileSync(path.join(h, '.claude', 'harness-kit', 'statusline.json'), 'utf8')).base, null);
  assert.equal(setup(h, 'restore').code, 0);
  assert.deepEqual(JSON.parse(readFileSync(path.join(h, '.claude', 'settings.json'), 'utf8')), { model: 'x' });
});
