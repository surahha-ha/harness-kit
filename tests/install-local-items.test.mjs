// 영수증의 로컬 항목(write-manifest) · 걷어내기 후보의 /graft/ 블록 권장(uninstall scan) 시험.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const EMPTY_GITCONFIG = path.join(mkdtempSync(path.join(os.tmpdir(), 'hk-gitcfg-')), 'gitconfig');
writeFileSync(EMPTY_GITCONFIG, '');
process.env.GIT_CONFIG_GLOBAL = EMPTY_GITCONFIG;
process.env.GIT_CONFIG_NOSYSTEM = '1';

const MANIFEST = fileURLToPath(new URL('../plugins/harness-kit/skills/harness-install/scripts/write-manifest.mjs', import.meta.url));
const UNINSTALL = fileURLToPath(new URL('../plugins/harness-kit/skills/harness-uninstall/scripts/uninstall.mjs', import.meta.url));
const SHA = 'a'.repeat(40);
const git = (root, ...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' });

function repo(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hk-inst-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'test');
  for (const [p, t] of Object.entries(files)) { mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); writeFileSync(path.join(root, p), t); }
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'init');
  return root;
}
function manifest(root, local) {
  const draft = path.join(mkdtempSync(path.join(os.tmpdir(), 'hk-draft-')), 'draft.json');
  writeFileSync(draft, JSON.stringify({ source: { repo: 'https://github.com/example/x', sha: SHA }, files: [{ path: 'harness.config.mjs', role: 'config' }], local }));
  const r = spawnSync(process.execPath, [MANIFEST, root, draft], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('영수증 — local 항목을 그대로 옮기고 해시는 채우지 않는다', () => {
  const root = repo({ 'harness.config.mjs': 'export default {};\n' });
  const local = { graft: { answer: 'local', items: ['.claude/settings.local.json#graft', 'graft/', 'git-path:info/exclude#harness-kit graft-localize'] }, statusline: { answer: 'combined', items: ['~/.claude/harness-kit/receipt.json'] } };
  const r = manifest(root, local);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'harness.install.json'), 'utf8')).local, local);
});

test('영수증 — local 항목에 절대경로나 모르는 항목이 있으면 쓰지 않는다', () => {
  const root = repo({ 'harness.config.mjs': 'export default {};\n' });
  const r = manifest(root, { graft: { items: ['C:/Users/someone/graft'] }, other: {} });
  assert.equal(r.code, 1);
  assert.match(r.out, /local\.graft\.items/);
  assert.match(r.out, /모르는 항목: other/);
});

const GI = 'node_modules/\n\n# harness-kit:begin\n# graft 그래프 캐시\n/graft/\n# harness-kit:end\n';
function scanLine(root) {
  const r = spawnSync(process.execPath, [UNINSTALL, 'scan', root], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout.split('\n').find((l) => l.startsWith('text:.gitignore#block1 |'));
}

test('걷어내기 scan — graft 가 아직 연결된 트리의 /graft/ 블록은 남김을 권한다', () => {
  const root = repo({ '.gitignore': GI });
  mkdirSync(path.join(root, '.claude', 'helpers'), { recursive: true });
  writeFileSync(path.join(root, '.claude', 'helpers', 'graft-hooks.cjs'), '\n');
  assert.match(scanLine(root), /\| keep \| - \|.*graft 가 이 트리에 아직 연결돼 있다/);
});

test('걷어내기 scan — graft 연결을 걷어 낸 트리에서는 /graft/ 블록도 지움을 권한다', () => {
  const root = repo({ '.gitignore': GI });
  assert.match(scanLine(root), /\| remove \| - \|/);
});
