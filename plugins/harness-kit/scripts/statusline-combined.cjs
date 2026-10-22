#!/usr/bin/env node
// harness-kit 전역 상태 줄 합치기 — 사용자의 원래 상태 줄 명령(base)과, 지금 레포에 graft 상태 줄 헬퍼가 있으면 그 출력을 줄 단위로 잇는다.
//
// 설치: statusline-setup.mjs install 이 이 파일을 ~/.claude/harness-kit/ 로 복사하고, 전역 settings.json 의 statusLine.command 가 그 사본을 가리키게 한다.
//       플러그인 캐시 경로는 판(SHA)마다 바뀌므로 거기를 가리키지 않는다.
// 설정: 이 파일 옆 statusline.json — { "base": "<원래 statusLine 명령 또는 null>", "shell": ["<셸>", "<인자>"]?, "timeoutMs": 8000? }
//       시험용 바꿔치기: HARNESS_KIT_STATUSLINE_CONFIG(설정 파일 경로)
// 동작: stdin 을 두 쪽에 그대로 넘기고 병렬로 돈다. 한쪽이 실패(종료코드 ≠ 0)·타임아웃이면 나머지만 낸다. 늘 종료코드 0.
// 레포 경로: CLAUDE_PROJECT_DIR → stdin workspace.project_dir → stdin cwd. 헬퍼는 <레포>/.claude/helpers/graft-statusline.cjs.
// 개인 경로를 이 파일에 적지 않는다 — 실경로는 실행 때 설정 파일과 stdin 에서 읽는다.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = process.env.HARNESS_KIT_STATUSLINE_CONFIG || path.join(__dirname, 'statusline.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { config = {}; }
const TIMEOUT = Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 8000;

let input = '';
try { input = fs.readFileSync(0, 'utf8'); } catch { input = ''; }
let projectDir = process.env.CLAUDE_PROJECT_DIR || '';
try {
  const data = JSON.parse(input);
  projectDir = projectDir || (data.workspace && data.workspace.project_dir) || data.cwd || '';
} catch { /* stdin 이 JSON 이 아니어도 base 는 돈다 */ }

/** @returns {Promise<{ok: boolean, out: string, code?: string}>} */
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let out = '', done = false, timer = null;
    const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    let child;
    try { child = spawn(cmd, args, { windowsHide: true, ...opts }); } catch (e) { return finish({ ok: false, out: '', code: e.code }); }
    timer = setTimeout(() => { try { child.kill(); } catch { /* 이미 끝남 */ } finish({ ok: false, out: '', code: 'TIMEOUT' }); }, TIMEOUT);
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', (e) => finish({ ok: false, out: '', code: e.code }));
    child.on('close', (status) => finish({ ok: status === 0, out: out.replace(/\s+$/, '') }));
    child.stdin.on('error', () => { /* 입력을 안 읽고 끝난 명령 */ });
    child.stdin.end(input);
  });
}

/** base 명령을 돌릴 셸 — 설정에 있으면 그것, 없으면 Claude Code 와 같은 순서(Windows: Git Bash → PowerShell, 그 밖: $SHELL → /bin/sh). */
async function runBase(base) {
  if (Array.isArray(config.shell) && config.shell.length) return run(config.shell[0], [...config.shell.slice(1), base]);
  if (process.platform === 'win32') {
    const r = await run(process.env.CLAUDE_CODE_GIT_BASH_PATH || 'bash', ['-c', base]);
    if (r.code !== 'ENOENT') return r;
    return run('powershell.exe', ['-NoProfile', '-Command', base]);
  }
  return run(process.env.SHELL || '/bin/sh', ['-c', base]);
}

const jobs = [];
if (typeof config.base === 'string' && config.base.trim()) jobs.push(runBase(config.base));
const helper = projectDir ? path.join(projectDir, '.claude', 'helpers', 'graft-statusline.cjs') : null;
if (helper && fs.existsSync(helper)) {
  jobs.push(run(process.execPath, [helper], { cwd: projectDir, env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir } }));
}

Promise.all(jobs).then((rs) => {
  process.stdout.write(rs.filter((r) => r.ok && r.out).map((r) => r.out).join('\n'));
  process.exit(0);
});
