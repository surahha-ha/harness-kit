#!/usr/bin/env node
/**
 * harness-install D10 「전역 상태 줄」 — 사용자 전역 settings.json 의 statusLine 을 합치기 스크립트로 바꾸고 되돌린다.
 *
 * harness-kit 이 사용자 전역(~/.claude)에 쓰는 유일한 항목이다. 플러그인은 statusLine 을 줄 수 없다
 * (플러그인 settings 에서 효력이 있는 키는 agent · subagentStatusLine 뿐 — 공식 plugins manifest-reference 「settings」).
 *
 * 사용: node statusline-setup.mjs <status|install|restore> [--home <디렉토리>]
 *   status    지금 전역 statusLine · 우리 것인가 · 영수증 유무
 *   install   statusline-combined.cjs 를 <홈>/.claude/harness-kit/ 로 복사 · 원래 명령을 statusline.json 의 base 로 ·
 *             base 를 돌릴 셸을 여기서 한 번 정해 statusline.json 의 shell 에 절대경로로 적는다(실행 때는 찾지 않는다) ·
 *             전역 settings.json 을 백업한 뒤 statusLine.command 만 바꾸고 JSON 대조 · 영수증 <홈>/.claude/harness-kit/receipt.json
 *             지금 값이 이미 합치기 스크립트(우리 것이 아닌 비슷한 것 포함)를 가리키거나, base 를 그 셸로 한 번 돌려
 *             종료 0 + 출력이 나오지 않으면 아무것도 쓰지 않고(폴더도 만들지 않고) 종료코드 3
 *   restore   지금 statusLine.command 가 영수증에 적힌 우리 값과 같을 때만 원래 값으로 되돌린다. 다르면 손대지 않고 종료코드 3.
 *             사본 스크립트·statusline.json 은 남긴다 — localize --statusline 이 레포 settings.local.json 에서 그 사본을 가리킨다
 *
 * 셸(pickShell): Windows 는 CLAUDE_CODE_GIT_BASH_PATH → `where git` 의 git.exe 위치에서 <Git>\bin\bash.exe → PowerShell 절대경로,
 *   그 밖은 $SHELL → /bin/sh. Claude Code 와 같은 PATH(System32 가 앞)에서 이름으로 bash 를 찾으면 WSL bash 가 잡혀 base 줄이 사라졌다.
 * --home 은 시험용이다(실제 사용자 홈을 건드리지 않는다). 시험용 바꿔치기: HARNESS_KIT_STATUSLINE_SHELL(셸 배열 JSON — pickShell 대신)
 * 종료코드: 0 통과 · 1 FAIL · 2 사용 오류 · 3 멈춤(출력에 이유 — 사용자에게 묻는다)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const posix = (p) => p.split(path.sep).join('/');
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const canon = (v) => JSON.stringify(v, (_, x) => (isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

/** 경로 묶음 — 실경로는 실행 때 홈에서 계산한다(커밋 파일에 개인 경로를 남기지 않는다). */
export function paths(home) {
  const dir = path.join(home, '.claude', 'harness-kit');
  const script = path.join(dir, 'statusline-combined.cjs');
  return { settings: path.join(home, '.claude', 'settings.json'), dir, script, config: path.join(dir, 'statusline.json'),
    receipt: path.join(dir, 'receipt.json'), backupDir: path.join(dir, 'backup'), command: `node "${posix(script)}"` };
}
/** 이미 상태 줄을 합치는 명령으로 보이는가 — 우리 것이 아니면 덮어쓰지 않고 묻는다. */
export const looksCombined = (cmd) => typeof cmd === 'string' && /statusline-combined|graft-statusline/i.test(cmd);

/** base 를 돌릴 셸 — [절대경로, ...인자]. base 명령은 맨 뒤 인자로 붙는다. gitExes 는 `where git` 결과. */
export function pickShell({ platform = process.platform, env = process.env, gitExes = [], exists = existsSync } = {}) {
  if (platform !== 'win32') return [env.SHELL || '/bin/sh', '-c'];
  const w = path.win32;
  const bash = [env.CLAUDE_CODE_GIT_BASH_PATH, ...gitExes.flatMap((g) => [w.join(g, '..', '..', 'bin', 'bash.exe'), w.join(g, '..', '..', '..', 'bin', 'bash.exe')])]
    .find((p) => p && exists(p));
  if (bash) return [bash, '-c'];
  return [w.join(env.SystemRoot || env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), '-NoProfile', '-Command'];
}
function installShell() {
  if (process.env.HARNESS_KIT_STATUSLINE_SHELL) return JSON.parse(process.env.HARNESS_KIT_STATUSLINE_SHELL);
  let gitExes = [];
  if (process.platform === 'win32') {
    const r = spawnSync('where', ['git'], { encoding: 'utf8', windowsHide: true });
    gitExes = (r.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  }
  return pickShell({ gitExes });
}
/** base 를 그 셸로 한 번 돌려 본다 — 종료 0 이고 출력이 있어야 통과(null). 아니면 이유. */
export function tryBase(shell, base, cwd) {
  const input = JSON.stringify({ model: { display_name: 'harness-kit' }, cwd, workspace: { current_dir: cwd, project_dir: cwd } });
  const r = spawnSync(shell[0], [...shell.slice(1), base], { input, encoding: 'utf8', timeout: 8000, windowsHide: true });
  if (r.error) return r.error.code === 'ETIMEDOUT' ? '8초 안에 끝나지 않음' : `실행 못 함(${r.error.code})`;
  if (r.status !== 0) return `종료코드 ${r.status}${r.stderr && r.stderr.trim() ? ` — ${r.stderr.trim().split(/\r?\n/)[0]}` : ''}`;
  return r.stdout.trim() ? null : '출력이 비어 있음';
}

/** statusLine.command 만 바꾼 텍스트 — 원래 명령 문자열이 한 번만 나오면 그 자리만 바꿔 서식을 그대로 둔다. */
export function setCommandText(text, obj, from, to) {
  const next = JSON.parse(JSON.stringify(obj));
  if (to === null) delete next.statusLine;
  else next.statusLine = { ...(isObj(next.statusLine) ? next.statusLine : {}), type: 'command', command: to };
  if (from !== null && to !== null) {
    const lit = JSON.stringify(from);
    const i = text.indexOf(lit);
    if (i >= 0 && text.indexOf(lit, i + lit.length) < 0) return { text: text.slice(0, i) + JSON.stringify(to) + text.slice(i + lit.length), obj: next, inPlace: true };
  }
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const m = /\n([ \t]+)"/.exec(text);
  let t = JSON.stringify(next, null, m ? m[1] : 2);
  if (!text || /\n$/.test(text)) t += '\n';
  return { text: (text.startsWith('﻿') ? '﻿' : '') + t.replace(/\n/g, eol), obj: next, inPlace: false };
}
/** statusLine 말고 다른 키가 그대로인가. */
export function onlyStatusLineChanged(a, b) {
  const x = { ...a }, y = { ...b };
  delete x.statusLine; delete y.statusLine;
  return canon(x) === canon(y);
}

function main(argv) {
  const [cmd, ...args] = argv;
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const home = path.resolve(opt('--home') || os.homedir());
  const P = paths(home);
  const readSettings = () => {
    if (!existsSync(P.settings)) return { text: '', obj: {}, existed: false };
    const text = readFileSync(P.settings, 'utf8');
    return { text, obj: JSON.parse(text.replace(/^﻿/, '')), existed: true };
  };
  const loadReceipt = () => { try { return JSON.parse(readFileSync(P.receipt, 'utf8')); } catch { return null; } };
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

  if (cmd === 'status') {
    const s = readSettings(), r = loadReceipt();
    const cur = isObj(s.obj.statusLine) ? s.obj.statusLine.command ?? null : null;
    console.log(`전역 statusLine: ${cur === null ? '없음' : cur}`);
    console.log(`판정: ${cur === P.command ? '우리 합치기 스크립트' : looksCombined(cur) ? '다른 합치기 스크립트로 보임 — install 은 멈추고 묻는다' : cur === null ? '없음 — install 하면 graft 줄만 나온다' : '보통 상태 줄 — install 하면 base 로 보존된다'} · 영수증 ${r ? `있음(${r.installedAt})` : '없음'}`);
    return 0;
  }

  if (cmd === 'install') {
    const source = path.resolve(opt('--source') || path.join(path.dirname(SELF), 'statusline-combined.cjs'));
    if (!existsSync(source)) { console.log(`FAIL 합치기 스크립트 원본이 없다: ${posix(source)}`); return 1; }
    let s;
    try { s = readSettings(); } catch (e) { console.log(`FAIL 전역 settings.json 을 JSON 으로 읽지 못했다 — 손대지 않는다(${e.message})`); return 1; }
    const curLine = isObj(s.obj.statusLine) ? s.obj.statusLine : null;
    const cur = curLine && typeof curLine.command === 'string' ? curLine.command : null;
    const again = cur === P.command;
    if (!again && looksCombined(cur)) {
      console.log(`STOP 전역 statusLine 이 이미 상태 줄을 합치는 명령으로 보인다: ${cur}`);
      console.log('     덮어쓰지 않는다 — 사용자에게 보이고 묻는다(그 스크립트를 그대로 쓸지 · 그 원래 명령을 base 로 옮겨 바꿀지)');
      return 3;
    }
    // 검사 먼저, 쓰기 나중 — 여기까지는 아무것도 쓰지 않는다
    let base = cur;
    if (again) { try { base = JSON.parse(readFileSync(P.config, 'utf8')).base ?? null; } catch { console.log(`FAIL 이미 설치돼 있는데 설정을 읽지 못했다(${posix(P.config)}) — restore 뒤 다시 install`); return 1; } }
    const shell = installShell();
    const why = base === null ? null : tryBase(shell, base, home);
    if (why) {
      console.log(`STOP base 명령을 ${shell[0]} 로 한 번 돌렸더니 ${why}: ${base}`);
      console.log('     아무것도 바꾸지 않았다 — 이 셸로 도는 명령인지 사용자에게 보이고 묻는다(Claude Code 가 상태 줄을 돌리는 셸과 같아야 한다)');
      return 3;
    }
    const config = JSON.stringify({ base, shell }, null, 2) + '\n';
    if (again) {
      copyFileSync(source, P.script);
      writeFileSync(P.config, config, 'utf8');
      console.log(`OK   이미 설치돼 있다 — 스크립트 사본을 지금 판으로 맞추고 셸을 다시 적었다(${shell[0]})`);
      return 0;
    }
    const next = setCommandText(s.text, s.obj, cur, P.command);
    const after = JSON.parse(next.text.replace(/^﻿/, ''));
    if (!onlyStatusLineChanged(s.obj, after) || after.statusLine.command !== P.command) { console.log('FAIL 바꾼 결과가 statusLine.command 말고도 다르다 — 쓰지 않았다'); return 1; }
    const at = stamp();
    mkdirSync(P.backupDir, { recursive: true });
    const backup = s.existed ? path.join(P.backupDir, `settings-${at}.json`) : null;
    if (backup) copyFileSync(P.settings, backup);
    copyFileSync(source, P.script);
    writeFileSync(P.config, config, 'utf8');
    writeFileSync(P.settings, next.text, 'utf8');
    if (existsSync(P.receipt)) copyFileSync(P.receipt, path.join(P.backupDir, `receipt-${at}.json`));
    const receipt = { schema: 1, tool: 'harness-kit statusline-setup', installedAt: new Date().toISOString(), settings: posix(P.settings), settingsExisted: s.existed,
      original: { statusLine: curLine }, wrote: { statusLine: after.statusLine }, backup: backup && posix(backup), files: [posix(P.script), posix(P.config)] };
    writeFileSync(P.receipt, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
    console.log(`OK   전역 statusLine.command → ${P.command} (${next.inPlace ? '그 자리만 바꿈' : '다시 씀 — 키 순서·서식 확인'})`);
    console.log(`OK   base = ${cur === null ? '없음(graft 줄만 나온다)' : `${cur} (셸 ${shell[0]} 로 돌려 확인)`} → ${posix(P.config)}`);
    console.log(`백업: ${backup ? posix(backup) : '없음(전역 settings.json 이 없었다)'} · 영수증: ${posix(P.receipt)}`);
    return 0;
  }

  if (cmd === 'restore') {
    const r = loadReceipt();
    if (!r) { console.log('STOP 전역 상태 줄 영수증이 없다 — 이 PC 에서 설치한 적이 없거나 이미 되돌렸다. 손대지 않는다'); return 3; }
    const s = readSettings();
    const cur = isObj(s.obj.statusLine) ? s.obj.statusLine.command ?? null : null;
    const ours = r.wrote && r.wrote.statusLine && r.wrote.statusLine.command;
    if (cur !== ours) {
      console.log(`STOP 지금 전역 statusLine(${cur ?? '없음'})이 우리가 쓴 값과 다르다 — 그 뒤 누가 바꿨다. 손대지 않는다`);
      return 3;
    }
    const orig = r.original && r.original.statusLine;
    // install 은 command 만 바꿨으므로 command 만 되돌리면 원래 객체(padding 등 다른 필드 포함)가 된다
    const { text } = setCommandText(s.text, s.obj, cur, orig && typeof orig.command === 'string' ? orig.command : null);
    const after = JSON.parse(text.replace(/^﻿/, ''));
    if (!onlyStatusLineChanged(s.obj, after) || canon(after.statusLine ?? null) !== canon(orig ?? null)) { console.log('FAIL 되돌린 결과가 원래 statusLine 과 다르거나 다른 키가 바뀐다 — 쓰지 않았다'); return 1; }
    mkdirSync(P.backupDir, { recursive: true });
    const at = stamp();
    copyFileSync(P.settings, path.join(P.backupDir, `settings-before-restore-${at}.json`));
    writeFileSync(P.settings, text, 'utf8');
    copyFileSync(P.receipt, path.join(P.backupDir, `receipt-restored-${at}.json`));
    rmSync(P.receipt);
    console.log(`OK   전역 statusLine 을 원래 값으로 되돌렸다: ${orig ? orig.command : '(없음 — 키를 지움)'} · 영수증은 ${posix(P.backupDir)} 로 옮겼다`);
    console.log(`KEEP 합치기 스크립트 사본·statusline.json 은 남긴다(${posix(P.dir)}). graft 를 쓰는 레포의 settings.local.json statusLine 이 이 사본을 계속 쓴다 — 지우려면 각 레포에서 graft 연결 제거 후 수동 삭제`);
    return 0;
  }
  console.error('사용: node statusline-setup.mjs <status|install|restore> [--home <디렉토리>]');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) process.exitCode = main(process.argv.slice(2));
export { main };
