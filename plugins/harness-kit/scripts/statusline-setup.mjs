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
 *             전역 settings.json 을 백업한 뒤 statusLine.command 만 바꾸고 JSON 대조 · 영수증 <홈>/.claude/harness-kit/receipt.json
 *             지금 값이 이미 합치기 스크립트(우리 것이 아닌 비슷한 것 포함)를 가리키면 바꾸지 않고 종료코드 3
 *   restore   지금 statusLine.command 가 영수증에 적힌 우리 값과 같을 때만 원래 값으로 되돌린다. 다르면 손대지 않고 종료코드 3
 *
 * --home 은 시험용이다(실제 사용자 홈을 건드리지 않는다). 종료코드: 0 통과 · 1 FAIL · 2 사용 오류 · 3 멈춤(출력에 이유 — 사용자에게 묻는다)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
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
    mkdirSync(P.dir, { recursive: true });
    if (cur === P.command) {
      copyFileSync(source, P.script);
      console.log(`OK   이미 설치돼 있다 — 스크립트 사본만 지금 판으로 맞췄다(${posix(P.script)})`);
      return 0;
    }
    if (looksCombined(cur)) {
      console.log(`STOP 전역 statusLine 이 이미 상태 줄을 합치는 명령으로 보인다: ${cur}`);
      console.log('     덮어쓰지 않는다 — 사용자에게 보이고 묻는다(그 스크립트를 그대로 쓸지 · 그 원래 명령을 base 로 옮겨 바꿀지)');
      return 3;
    }
    const at = stamp();
    mkdirSync(P.backupDir, { recursive: true });
    const backup = s.existed ? path.join(P.backupDir, `settings-${at}.json`) : null;
    if (backup) copyFileSync(P.settings, backup);
    copyFileSync(source, P.script);
    writeFileSync(P.config, JSON.stringify({ base: cur }, null, 2) + '\n', 'utf8');
    const next = setCommandText(s.text, s.obj, cur, P.command);
    const after = JSON.parse(next.text.replace(/^﻿/, ''));
    if (!onlyStatusLineChanged(s.obj, after) || after.statusLine.command !== P.command) { console.log('FAIL 바꾼 결과가 statusLine.command 말고도 다르다 — 쓰지 않았다'); return 1; }
    mkdirSync(path.dirname(P.settings), { recursive: true });
    writeFileSync(P.settings, next.text, 'utf8');
    if (existsSync(P.receipt)) copyFileSync(P.receipt, path.join(P.backupDir, `receipt-${at}.json`));
    const receipt = { schema: 1, tool: 'harness-kit statusline-setup', installedAt: new Date().toISOString(), settings: posix(P.settings), settingsExisted: s.existed,
      original: { statusLine: curLine }, wrote: { statusLine: after.statusLine }, backup: backup && posix(backup), files: [posix(P.script), posix(P.config)] };
    writeFileSync(P.receipt, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
    console.log(`OK   전역 statusLine.command → ${P.command} (${next.inPlace ? '그 자리만 바꿈' : '다시 씀 — 키 순서·서식 확인'})`);
    console.log(`OK   base = ${cur === null ? '없음(graft 줄만 나온다)' : cur} → ${posix(P.config)}`);
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
    for (const f of [P.script, P.config, P.receipt]) if (existsSync(f)) rmSync(f);
    console.log(`OK   전역 statusLine 을 원래 값으로 되돌렸다: ${orig ? orig.command : '(없음 — 키를 지움)'}`);
    console.log(`OK   합치기 스크립트·설정·영수증을 지웠다(사본: ${posix(P.backupDir)})`);
    return 0;
  }
  console.error('사용: node statusline-setup.mjs <status|install|restore> [--home <디렉토리>]');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) process.exitCode = main(process.argv.slice(2));
export { main };
