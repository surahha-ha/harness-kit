#!/usr/bin/env node
/**
 * harness-install D9 「graft 사용」 — graft 연결을 이 PC·이 트리 전용으로 옮긴다(커밋되는 파일에 개인 경로를 남기지 않는다).
 *
 * 사용: node graft-localize.mjs <명령> <레포 루트> [인자…]
 *   check                         D9 를 묻기 전 사전 점검 — graft 설치 여부와 Node 조건만 본다(아무것도 쓰지 않는다)
 *   prepare                       graft init 전에 — graft 확인 · settings.json·.mcp.json·.gitignore·.ignore 스냅숏 · .gitignore 에 /graft/ 표시 블록
 *   localize [--statusline] [--home <디렉토리>]
 *                                 graft init·build 뒤에 — settings.json 의 graft 몫을 settings.local.json 으로 옮기고(timeout 은 초로),
 *                                 settings.json 을 init 전 내용으로 되돌리며, .mcp.json 을 정리하고 info/exclude 에 로컬 산출물 블록을 쓴다.
 *                                 --statusline 이면 전역 상태 줄 합치기(statusline-setup.mjs)가 쓴 명령을 settings.local.json 의 statusLine 에 넣는다.
 *                                 다시 돌려도 같은 결과다 — graft 업그레이드 뒤 settings.json 에 graft 키가 다시 들어오면 이것만 다시 돌린다.
 *   status                        settings.json 에 graft 몫이 다시 들어왔는가 · 로컬 쪽 상태
 *   remove [--keep-graph]         걷어내기 — settings.local.json 의 graft 몫 · helpers·skill · 새로 생긴 .mcp.json·.ignore · graft/ · exclude 블록
 *
 * check·prepare 는 graft 가 있으면 설치본 package.json 의 engines.node 를 지금 Node 판과 대어 본다 — 못 미치면 graft 가 있어도
 * 쓸 수 없다고 보고 종료코드 3. engines 를 못 읽거나 해석하지 못하면 WARN 만 내고 진행한다.
 * 설치본 찾기: `npm root -g` 아래 @nanonets/graft → 없으면 graft 실행 파일 위치(실경로의 위 디렉토리 · 옆 node_modules).
 *
 * 종료코드: 0 통과 · 1 FAIL 있음 · 2 사용 오류 · 3 건너뜀(graft 없음 · Node 판 모자람 등 — 출력에 이유)
 * 시험용 바꿔치기: HARNESS_KIT_GRAFT_VERSION(graft --version 대신 쓸 값, 빈 문자열이면 「없음」) ·
 *   HARNESS_KIT_GRAFT_PKG(graft 설치본 package.json 경로, 빈 문자열이면 「못 찾음」 — HARNESS_KIT_GRAFT_VERSION 을 바꿔치면
 *   이 값이 없을 때 실제 설치본을 찾지 않는다) · HARNESS_KIT_NODE_VERSION(process.version 대신 쓸 값)
 *
 * Node 내장 모듈만 쓴다. git 에는 쓰지 않는다(add·commit 을 부르지 않는다) — info/exclude 만 고친다.
 * 근거(graft 0.12.1): settings-merge.js 가 settings.json 에 statusLine·subagentStatusLine·훅 5개·footerLinksRegexes·
 * permissions.allow 를 넣고(timeout 은 ms 처럼 8000·10000·15000), init.js 가 settings.json 을 2칸 들여쓰기 LF 로 통째로 다시 쓴다.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync, readdirSync, statSync, rmdirSync, realpathSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// ── graft 가 넣는 것의 서명 ──────────────────────────────────────────────────
export const GRAFT_HOOK_MARK = 'graft-hooks.cjs';
export const GRAFT_SL_MARK = 'graft-statusline.cjs';
export const GRAFT_ALLOW = ['Bash(graft:*)', 'Bash(npx graft:*)', 'Bash(graft-dev:*)', 'Bash(node dist/cli.js:*)'];
export const GRAFT_FOOTER = 'graft/[\\w./-]+\\.md';
export const GRAFT_MCP = 'graft';
export const EXCLUDE_BEGIN = '# harness-kit graft-localize:begin';
export const EXCLUDE_END = '# harness-kit graft-localize:end';
export const EXCLUDE_BASE = ['/graft/', '/.claude/helpers/graft-*.cjs', '/.claude/skills/graft/'];
export const GITIGNORE_LINE = '/graft/';

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const canon = (v) => JSON.stringify(v, (_, x) => (isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
export const sameJson = (a, b) => canon(a) === canon(b);
const isGraftGroup = (g) => JSON.stringify(g ?? '').includes(GRAFT_HOOK_MARK);
const isGraftLine = (sl) => isObj(sl) && typeof sl.command === 'string' && sl.command.includes(GRAFT_SL_MARK);

/** 훅 timeout 은 초다(공식 hooks 문서 「Seconds before canceling」). 1000 이상은 ms 로 적힌 것으로 보고 초로 올림한다. */
export function fixTimeout(t) {
  return typeof t === 'number' && t >= 1000 ? Math.ceil(t / 1000) : t;
}
export function fixGroupTimeouts(group) {
  const g = clone(group);
  for (const h of g.hooks || []) if ('timeout' in h) h.timeout = fixTimeout(h.timeout);
  return g;
}

/**
 * settings 객체에서 graft 몫을 떼어 낸다.
 * @param {object} cur   지금 settings.json
 * @param {object|null} base init 전 settings.json(빈 그릇을 남길지 정하는 기준). 없으면 빈 그릇은 지운다
 * @returns {{ stripped: object, moved: { hooks: Record<string, object[]>, statusLine?: object, subagentStatusLine?: object, allow: string[], footer: string[] }, count: number }}
 */
export function stripGraft(cur, base = null) {
  const s = clone(cur) || {};
  const had = (...keys) => { let v = base; for (const k of keys) { if (!isObj(v) || !(k in v)) return false; v = v[k]; } return true; };
  const moved = { hooks: {}, allow: [], footer: [] };
  let count = 0;
  if (isObj(s.hooks)) {
    for (const [ev, groups] of Object.entries(s.hooks)) {
      if (!Array.isArray(groups)) continue;
      const g = groups.filter(isGraftGroup);
      if (!g.length) continue;
      moved.hooks[ev] = g; count += g.length;
      s.hooks[ev] = groups.filter((x) => !isGraftGroup(x));
      if (!s.hooks[ev].length && !had('hooks', ev)) delete s.hooks[ev];
    }
    if (!Object.keys(s.hooks).length && !had('hooks')) delete s.hooks;
  }
  for (const k of ['statusLine', 'subagentStatusLine']) if (isGraftLine(s[k])) { moved[k] = s[k]; delete s[k]; count++; }
  if (isObj(s.permissions) && Array.isArray(s.permissions.allow)) {
    moved.allow = s.permissions.allow.filter((a) => GRAFT_ALLOW.includes(a));
    count += moved.allow.length;
    s.permissions.allow = s.permissions.allow.filter((a) => !GRAFT_ALLOW.includes(a));
    if (!s.permissions.allow.length && !had('permissions', 'allow')) delete s.permissions.allow;
    if (!Object.keys(s.permissions).length && !had('permissions')) delete s.permissions;
  }
  if (Array.isArray(s.footerLinksRegexes)) {
    moved.footer = s.footerLinksRegexes.filter((f) => f === GRAFT_FOOTER);
    count += moved.footer.length;
    s.footerLinksRegexes = s.footerLinksRegexes.filter((f) => f !== GRAFT_FOOTER);
    if (!s.footerLinksRegexes.length && !had('footerLinksRegexes')) delete s.footerLinksRegexes;
  }
  return { stripped: s, moved, count };
}

/**
 * settings.local.json 에 graft 몫을 합친다. 같은 입력이면 같은 결과다(이미 있는 graft 그룹은 바꿔 끼운다).
 * @param {object} local 지금 settings.local.json(없으면 {})
 * @param {object} moved stripGraft 의 moved
 * @param {{ statusLine?: object|null, projectStatusLine?: boolean }} opt statusLine: 넣을 합치기 상태 줄 · projectStatusLine: settings.json 에 graft 가 아닌 statusLine 이 있다
 */
export function mergeLocal(local, moved, opt = {}) {
  const l = clone(local) || {};
  const notes = [];
  const evs = new Set([...Object.keys(moved.hooks || {}), ...Object.keys(isObj(l.hooks) ? l.hooks : {})]);
  if (Object.keys(moved.hooks || {}).length) l.hooks = isObj(l.hooks) ? l.hooks : {};
  for (const ev of evs) {
    const prior = Array.isArray(l.hooks && l.hooks[ev]) ? l.hooks[ev] : [];
    const graft = (moved.hooks[ev] && moved.hooks[ev].length ? moved.hooks[ev] : prior.filter(isGraftGroup)).map(fixGroupTimeouts);
    if (!graft.length) continue;
    l.hooks[ev] = [...prior.filter((x) => !isGraftGroup(x)), ...graft];
  }
  if (moved.subagentStatusLine) {
    if (!l.subagentStatusLine || isGraftLine(l.subagentStatusLine)) l.subagentStatusLine = moved.subagentStatusLine;
    else notes.push('WARN settings.local.json 에 graft 가 아닌 subagentStatusLine 이 있어 그대로 둔다');
  }
  if (opt.statusLine) {
    if (opt.projectStatusLine) notes.push('INFO settings.json 에 graft 가 아닌 statusLine 이 있다 — graft 업그레이드가 statusLine 을 다시 넣지 않으므로 settings.local.json 에 넣지 않는다');
    else if (!l.statusLine || isGraftLine(l.statusLine) || (isObj(l.statusLine) && l.statusLine.command === opt.statusLine.command)) l.statusLine = clone(opt.statusLine);
    else notes.push('WARN settings.local.json 에 다른 statusLine 이 있어 그대로 둔다 — 합치기 상태 줄로 바꾸려면 손으로 고친다');
  } else if (moved.statusLine) {
    notes.push('INFO graft 상태 줄을 settings.json 에서 뺐다 — 전역 상태 줄 합치기(D10)를 켜지 않아 settings.local.json 에는 넣지 않았다. graft 업그레이드 뒤 settings.json 에 statusLine 이 다시 들어오면 localize 를 다시 돌린다');
  }
  const union = (arr, add) => [...(Array.isArray(arr) ? arr : []), ...add.filter((x) => !(Array.isArray(arr) ? arr : []).includes(x))];
  if ((moved.allow || []).length) { l.permissions = isObj(l.permissions) ? l.permissions : {}; l.permissions.allow = union(l.permissions.allow, moved.allow); }
  if ((moved.footer || []).length) l.footerLinksRegexes = union(l.footerLinksRegexes, moved.footer);
  l.disabledMcpjsonServers = union(l.disabledMcpjsonServers, [GRAFT_MCP]);
  return { local: l, notes };
}

/** settings.local.json 에서 graft 몫과 localize 가 넣은 상태 줄을 걷어 낸다(remove). */
export function stripLocal(local, ourStatusCommand = null) {
  const l = clone(local) || {};
  const { stripped, count } = stripGraft(l, null);
  let n = count;
  if (ourStatusCommand && isObj(stripped.statusLine) && stripped.statusLine.command === ourStatusCommand) { delete stripped.statusLine; n++; }
  if (Array.isArray(stripped.disabledMcpjsonServers) && stripped.disabledMcpjsonServers.includes(GRAFT_MCP)) {
    stripped.disabledMcpjsonServers = stripped.disabledMcpjsonServers.filter((x) => x !== GRAFT_MCP); n++;
    if (!stripped.disabledMcpjsonServers.length) delete stripped.disabledMcpjsonServers;
  }
  return { local: stripped, count: n };
}

/** 이벤트별로 graft 가 아닌 훅 그룹만 — 기계 대조용. */
export function foreignHooks(s) {
  const out = {};
  for (const [ev, gs] of Object.entries(isObj(s && s.hooks) ? s.hooks : {})) {
    const f = (Array.isArray(gs) ? gs : []).filter((g) => !isGraftGroup(g));
    if (f.length) out[ev] = f;
  }
  return out;
}

// ── 텍스트 꼴 ────────────────────────────────────────────────────────────────
export const eolOf = (t) => (/\r\n/.test(t) ? '\r\n' : '\n');
const BOM = '﻿';
export function parseJsonText(t) { return JSON.parse(t.replace(/^﻿/, '')); }
/** 객체를 원래 파일의 BOM·줄끝·끝 줄바꿈·들여쓰기 꼴로 쓴다. */
export function jsonText(obj, like = '') {
  const m = /\n([ \t]+)"/.exec(like);
  const indent = m ? m[1] : 2;
  let t = JSON.stringify(obj, null, indent);
  if (!like || /\n$/.test(like)) t += '\n';
  t = t.replace(/\n/g, eolOf(like || '\n'));
  return (like.startsWith(BOM) ? BOM : '') + t;
}
/** exclude 블록이 없으면 끝에 넣고, 있으면 그대로 둔다(멱등). */
export function addBlock(text, entries) {
  if (blockEntries(text)) return text;
  const eol = eolOf(text || '\n');
  const lines = (text || '').split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return [...lines, EXCLUDE_BEGIN, '# graft 로컬 산출물 — 이 PC·이 트리 전용(harness-kit graft-localize)', ...entries, EXCLUDE_END].join(eol) + eol;
}
export function removeBlock(text) {
  const eol = eolOf(text || '\n');
  const lines = (text || '').split(/\r?\n/);
  const b = lines.findIndex((l) => l.trim() === EXCLUDE_BEGIN);
  const e = b >= 0 ? lines.findIndex((l, i) => i > b && l.trim() === EXCLUDE_END) : -1;
  if (b < 0 || e < b) return { text, removed: false };
  return { text: [...lines.slice(0, b), ...lines.slice(e + 1)].join(eol), removed: true };
}
export function blockEntries(text) {
  const lines = (text || '').split(/\r?\n/);
  const b = lines.findIndex((l) => l.trim() === EXCLUDE_BEGIN);
  const e = b >= 0 ? lines.findIndex((l, i) => i > b && l.trim() === EXCLUDE_END) : -1;
  return b >= 0 && e > b ? lines.slice(b + 1, e).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : null;
}
/** .gitignore 에 /graft/ 표시 블록을 더한다. graft 가 인정하는 꼴(/graft/ · graft/ · graft)이 이미 있으면 그대로 둔다. */
export function addGitignoreBlock(text) {
  const t = text || '';
  if (t.split(/\r?\n/).some((l) => ['/graft/', 'graft/', 'graft'].includes(l.trim()))) return { text: t, added: false };
  const eol = eolOf(t || '\n');
  const block = ['# harness-kit:begin', '# graft 그래프 캐시 — 이 PC 에서 다시 만드는 로컬 산출물이라 커밋하지 않는다(graft build 는 이 줄이 없으면 매번 덧붙인다)', GITIGNORE_LINE, '# harness-kit:end'].join(eol);
  const gap = !t ? '' : /\r?\n\r?\n$/.test(t) ? '' : /\r?\n$/.test(t) ? eol : eol + eol;
  return { text: t + gap + block + eol, added: true };
}

// ── graft 의 Node 조건(engines.node) ─────────────────────────────────────────
export const GRAFT_PKG = '@nanonets/graft';
/** 설치 안내 — 요구 판 숫자는 박지 않는다(graft 판마다 다를 수 있다). 숫자는 조사 판과 함께 예시로만. */
export const INSTALL_HINT = `설치 안내(사용자가 직접): ① npm view ${GRAFT_PKG} engines 로 요구 Node 판을 확인한다(예: 조사 판 0.12.1 기준 node >=20) ② node --version 과 비교한다 ③ 모자라면 Node 를 먼저 올린 뒤 npm i -g ${GRAFT_PKG} — 설치 뒤 새 세션에서 다시 묻는다`;
const cmpVer = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);

/** engines.node 범위식 해석 — `>=X[.Y[.Z]]` · `^X[.Y[.Z]]`(X ≥ 1) 만 본다. 그 밖(||·공백 범위·~·x·<·^0)은 null. */
export function parseNodeRange(range) {
  const m = /^\s*(>=|\^)\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?\s*$/.exec(String(range ?? ''));
  if (!m) return null;
  const min = [Number(m[2]), Number(m[3] ?? 0), Number(m[4] ?? 0)];
  if (m[1] === '>=') return { min, below: null };
  return min[0] > 0 ? { min, below: [min[0] + 1, 0, 0] } : null;
}

/** 지금 Node 판이 범위를 채우는가 — ok 가 true·false, 해석하지 못하면 null. why 는 보고 문구. */
export function checkNodeEngine(range, nodeVersion) {
  const r = parseNodeRange(range);
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(nodeVersion ?? '').trim());
  if (!r) return { ok: null, why: `Node 조건 "${range}" 을 해석하지 못했다(>=X · ^X 꼴만 본다)` };
  if (!m) return { ok: null, why: `Node 판 "${nodeVersion}" 을 해석하지 못했다` };
  const v = m.slice(1).map(Number);
  const ok = cmpVer(v, r.min) >= 0 && (!r.below || cmpVer(v, r.below) < 0);
  return { ok, why: ok ? `Node ${range.trim()} 충족, 현재 ${nodeVersion}` : `Node ${range.trim()} 필요, 현재 ${nodeVersion}` };
}

/** graft 설치본 package.json 찾기 — npmRoot(`npm root -g`) 아래 → graft 실행 파일 위치. name 이 @nanonets/graft 인 것만 받는다. */
export function findGraftPackage({ npmRoot = null, exePaths = [] } = {}) {
  const isGraft = (p) => { try { return JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, '')).name === GRAFT_PKG; } catch { return false; } };
  const sub = path.join(...GRAFT_PKG.split('/'), 'package.json');
  if (npmRoot) { const p = path.join(npmRoot, sub); if (isGraft(p)) return p; }
  for (const exe of exePaths) {
    let real; try { real = realpathSync(exe); } catch { continue; }
    // Windows npm shim(graft.cmd)은 <prefix>/node_modules 옆에 있고, 유닉스 bin 링크의 실경로는 패키지 안(dist/cli.js)이다
    for (let d = path.dirname(real), i = 0; i < 8; i++) {
      for (const p of [path.join(d, 'package.json'), path.join(d, 'node_modules', sub)]) if (isGraft(p)) return p;
      const up = path.dirname(d); if (up === d) break; d = up;
    }
  }
  return null;
}

/** 설치본의 engines.node 와 지금 Node 판 — state: ok · unmet · unknown(못 찾음·못 읽음·해석 못 함 — 진행한다). */
export function graftEngine(pkgPath, nodeVersion) {
  if (!pkgPath) return { state: 'unknown', why: 'graft 설치본 package.json 을 찾지 못했다' };
  let range;
  try { range = JSON.parse(readFileSync(pkgPath, 'utf8').replace(/^﻿/, '')).engines?.node; } catch (e) { return { state: 'unknown', why: `${pkgPath.split(path.sep).join('/')} 를 읽지 못했다(${e.code || e.name})` }; }
  if (typeof range !== 'string' || !range.trim()) return { state: 'unknown', why: 'graft package.json 에 engines.node 가 없다' };
  const c = checkNodeEngine(range, nodeVersion);
  return { state: c.ok === null ? 'unknown' : c.ok ? 'ok' : 'unmet', range: range.trim(), why: c.why };
}

// ── 실행부 ───────────────────────────────────────────────────────────────────
const SELF = fileURLToPath(import.meta.url);
function main(argv) {
  const [cmd, rootArg, ...args] = argv;
  if (!cmd || !rootArg) { console.error('사용: node graft-localize.mjs <check|prepare|localize|status|remove> <레포 루트> [인자…]'); return 2; }
  const root = path.resolve(rootArg);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  const tryGit = (...a) => { try { return git(...a); } catch { return null; } };
  const gitPath = (p) => path.resolve(root, git('rev-parse', '--git-path', p).trim());
  const abs = (rel) => path.join(root, rel);
  const exists = (rel) => existsSync(abs(rel));
  const read = (rel) => readFileSync(abs(rel), 'utf8');
  const tracked = (rel) => !!(tryGit('ls-files', '--', rel) || '').trim();
  const ignored = (rel) => tryGit('check-ignore', '-q', '--', rel) !== null;
  const stateDir = gitPath('harness-kit-graft');
  const statePath = path.join(stateDir, 'state.json');
  const loadState = () => (existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null);
  const saveState = (s) => { mkdirSync(stateDir, { recursive: true }); s.updated = new Date().toISOString(); writeFileSync(statePath, JSON.stringify(s, null, 2) + '\n', 'utf8'); };
  let fail = 0;
  const bad = (m) => { fail++; console.log(`FAIL ${m}`); };
  const SETTINGS = '.claude/settings.json', LOCAL = '.claude/settings.local.json', MCP = '.mcp.json', IGNORE = '.ignore';

  const graftVersion = () => {
    if ('HARNESS_KIT_GRAFT_VERSION' in process.env) return process.env.HARNESS_KIT_GRAFT_VERSION || null;
    try { return execFileSync('graft', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; } catch { return null; }
  };
  const nodeVersion = process.env.HARNESS_KIT_NODE_VERSION || process.version;
  const graftPkgPath = () => {
    if ('HARNESS_KIT_GRAFT_PKG' in process.env) return process.env.HARNESS_KIT_GRAFT_PKG || null;
    if ('HARNESS_KIT_GRAFT_VERSION' in process.env) return null; // 바꿔친 graft 에는 실제 설치본이 없다
    const quiet = { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] };
    const out = (f) => { try { return f(); } catch { return ''; } };
    const npmRoot = out(() => execSync('npm root -g', quiet)).trim() || null; // npm 은 Windows 에서 .cmd 라 셸로 부른다
    const found = findGraftPackage({ npmRoot });
    if (found) return found;
    const exePaths = out(() => (process.platform === 'win32' ? execFileSync('where', ['graft'], quiet) : execFileSync('which', ['-a', 'graft'], quiet)))
      .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return findGraftPackage({ exePaths });
  };
  /** graft 유무와 Node 조건 — 쓸 수 없으면 이유와 설치 안내를 찍고 null, 쓸 수 있으면 graft 판. Node 조건을 못 읽으면 WARN 만. */
  const precheck = () => {
    const v = graftVersion();
    if (!v) { console.log(`SKIP graft 가 이 PC 에 없다(graft --version 실패) — 이 항목을 건너뛴다. ${INSTALL_HINT}`); return null; }
    const e = graftEngine(graftPkgPath(), nodeVersion);
    if (e.state === 'unknown') console.log(`WARN graft ${v} 의 Node 조건(engines.node)을 확인하지 못했다 — ${e.why}. 확인 없이 진행한다(직접 확인: npm view ${GRAFT_PKG} engines · node --version)`);
    if (e.state === 'unmet') { console.log(`SKIP graft ${v} 가 있지만 ${e.why} — 이 PC 에서는 쓸 수 없어 이 항목을 건너뛴다. ${INSTALL_HINT}`); return null; }
    if (e.state === 'ok') console.log(`OK   graft ${v} 의 ${e.why}`);
    return v;
  };
  const loadJsonFile = (rel) => { try { return parseJsonText(read(rel)); } catch { return undefined; } };
  const homeDir = () => path.resolve(opt('--home') || os.homedir());

  if (cmd === 'check') {
    const v = precheck();
    if (!v) return 3;
    console.log(`graft ${v} — D9 를 묻는다`);
    return 0;
  }

  if (cmd === 'prepare') {
    const v = precheck();
    if (!v) return 3;
    if (tracked(LOCAL)) { bad(`${LOCAL} 이 추적 중이다 — graft 몫(개인 경로가 든 상태 줄 포함)을 옮기면 커밋된다. 이 레포에서는 로컬 전용 연결을 할 수 없다`); console.log(`failures=${fail}`); return 1; }
    let s = loadState();
    if (s && s.snapshot) console.log(`INFO 스냅숏이 이미 있다(${s.snapshot.at}) — 덮지 않는다(재실행·업그레이드 뒤에도 기준은 처음 판)`);
    else {
      const at = new Date().toISOString();
      const dir = path.join(stateDir, 'before');
      const snap = { at, files: {} };
      for (const rel of [SETTINGS, MCP, '.gitignore', IGNORE, LOCAL]) {
        const info = { exists: exists(rel), tracked: tracked(rel) };
        if (info.exists) { const dst = path.join(dir, rel); mkdirSync(path.dirname(dst), { recursive: true }); copyFileSync(abs(rel), dst); }
        snap.files[rel] = info;
      }
      snap.preexisting = Object.fromEntries(['.claude/helpers/graft-hooks.cjs', '.claude/helpers/graft-statusline.cjs', '.claude/skills/graft', 'graft'].map((p) => [p, exists(p)]));
      s = { tool: 'harness-kit graft-localize', root: root.split(path.sep).join('/'), graftVersion: v, snapshot: snap };
      saveState(s);
      console.log(`OK   스냅숏 → ${dir.split(path.sep).join('/')} (${Object.entries(snap.files).map(([k, x]) => `${k}:${x.exists ? (x.tracked ? '추적' : '미추적') : '없음'}`).join(' · ')})`);
    }
    const gi = exists('.gitignore') ? read('.gitignore') : '';
    const r = addGitignoreBlock(gi);
    if (r.added) {
      writeFileSync(abs('.gitignore'), r.text, 'utf8');
      const n = r.text.split(/\r?\n/).filter((l) => l.trim() === '# harness-kit:begin').length;
      console.log(`OK   .gitignore 에 /graft/ 표시 블록을 더했다 — 이 파일의 표시 블록 ${n}개 중 ${n}번째(영수증 edits 에 block 으로 적는다)`);
      s.gitignoreBlock = true; saveState(s);
    } else console.log(`INFO .gitignore 에 graft 가 인정하는 줄이 이미 있다 — 블록을 더하지 않는다${s.gitignoreBlock ? '(앞선 prepare 가 더한 블록)' : ''}`);
    console.log(`graft ${v} · 다음: 레포 루트에서 graft init . --no-agents --no-global --no-build -y → graft build . → node "${SELF.split(path.sep).join('/')}" localize "${root.split(path.sep).join('/')}" (전역 상태 줄 합치기를 켰으면 --statusline)`);
    return 0;
  }

  if (cmd === 'localize') {
    const s = loadState();
    if (!s || !s.snapshot) { bad('스냅숏이 없다 — 먼저 prepare(graft init 전에)'); console.log(`failures=${fail}`); return 1; }
    if (tracked(LOCAL)) { bad(`${LOCAL} 이 추적 중이다 — 옮기지 않는다`); console.log(`failures=${fail}`); return 1; }
    if (!exists('.claude/helpers/graft-hooks.cjs')) console.log('WARN .claude/helpers/graft-hooks.cjs 가 없다 — graft init 을 돌렸는지 본다');
    const snapDir = path.join(stateDir, 'before');
    const snapText = (rel) => (s.snapshot.files[rel] && s.snapshot.files[rel].exists ? readFileSync(path.join(snapDir, rel), 'utf8') : null);

    // ① settings.json — graft 몫을 떼고, 떼어 낸 결과가 init 전 판과 같으면 그 바이트로 되돌린다
    const curText = exists(SETTINGS) ? read(SETTINGS) : null;
    const cur = curText === null ? {} : parseJsonText(curText);
    const baseText = snapText(SETTINGS);
    const base = baseText === null ? null : parseJsonText(baseText);
    const baseClean = base ? stripGraft(base, null) : null;
    const { stripped, moved, count } = stripGraft(cur, base);
    let settingsOut = curText;
    if (base && baseClean.count === 0 && sameJson(stripped, base)) settingsOut = baseText;
    else if (!base && !Object.keys(stripped).length) settingsOut = null;
    else if (count) {
      settingsOut = jsonText(stripped, baseText ?? curText ?? '');
      console.log('WARN settings.json 이 init 전 판과 graft 몫 말고도 다르다 — graft 몫만 떼고 다시 썼다(서식은 원래 파일 꼴). git diff 로 확인한다');
    }
    const projectStatusLine = isObj(stripped.statusLine) && !isGraftLine(stripped.statusLine);

    // ② settings.local.json — graft 몫을 합친다(timeout 은 초로)
    const localText = exists(LOCAL) ? read(LOCAL) : null;
    const local = localText === null ? {} : parseJsonText(localText);
    let statusLine = null;
    if (args.includes('--statusline')) {
      const rp = path.join(homeDir(), '.claude', 'harness-kit', 'receipt.json');
      try { statusLine = JSON.parse(readFileSync(rp, 'utf8')).wrote.statusLine; } catch { bad(`--statusline 인데 전역 합치기 영수증을 읽지 못했다(${rp.split(path.sep).join('/')}) — statusline-setup.mjs install 을 먼저`); }
    }
    const { local: newLocal, notes } = mergeLocal(local, moved, { statusLine, projectStatusLine });
    notes.forEach((n) => console.log(n));
    const newLocalText = jsonText(newLocal, localText ?? '');

    // ③ 기계 대조 — 이벤트별 graft 아닌 훅 · 다른 키 · graft 몫 0
    const after = settingsOut === null ? {} : parseJsonText(settingsOut);
    if (stripGraft(after, null).count) bad('settings.json 에 graft 몫이 남는다');
    for (const ev of new Set([...Object.keys(foreignHooks(cur)), ...Object.keys(foreignHooks(after))])) {
      if (!sameJson(foreignHooks(cur)[ev], foreignHooks(after)[ev])) bad(`settings.json ${ev}: graft 가 아닌 훅이 옮기기 전과 다르다`);
    }
    if (!sameJson(stripped, after) && !(base && sameJson(after, base))) bad('settings.json: graft 몫 밖의 키가 옮기기 전과 다르다');
    const lAfter = parseJsonText(newLocalText);
    for (const ev of new Set([...Object.keys(foreignHooks(local)), ...Object.keys(foreignHooks(lAfter))])) {
      if (!sameJson(foreignHooks(local)[ev], foreignHooks(lAfter)[ev])) bad(`settings.local.json ${ev}: graft 가 아닌 훅이 합치기 전과 다르다`);
    }
    for (const [ev, gs] of Object.entries(isObj(lAfter.hooks) ? lAfter.hooks : {})) for (const g of gs.filter(isGraftGroup)) for (const h of g.hooks || []) {
      if (typeof h.timeout === 'number' && h.timeout >= 1000) bad(`settings.local.json ${ev}: timeout ${h.timeout} 이 초 단위가 아니다`);
    }
    for (const ev of Object.keys(moved.hooks)) if (!(lAfter.hooks && (lAfter.hooks[ev] || []).some(isGraftGroup))) bad(`settings.local.json ${ev}: graft 훅이 없다`);
    if (fail) { console.log(`failures=${fail} — 아무 파일도 쓰지 않았다`); return 1; }

    // ④ 쓰기 — local 먼저(중간에 끊겨도 훅을 잃지 않는다)
    if (newLocalText !== localText) { mkdirSync(path.dirname(abs(LOCAL)), { recursive: true }); writeFileSync(abs(LOCAL), newLocalText, 'utf8'); }
    const fixed = Object.values(moved.hooks).flat().flatMap((g) => g.hooks || []).filter((h) => typeof h.timeout === 'number' && h.timeout >= 1000).map((h) => `${h.timeout}→${fixTimeout(h.timeout)}`);
    console.log(`OK   settings.local.json — graft 훅 ${Object.values(moved.hooks).flat().length}그룹 옮김${fixed.length ? ` · timeout 초로 교정 ${fixed.join(' ')}` : ''} · disabledMcpjsonServers 에 graft${statusLine ? ' · statusLine = 전역 합치기 명령' : ''}`);
    if (settingsOut !== curText) {
      if (settingsOut === null) rmSync(abs(SETTINGS)); else writeFileSync(abs(SETTINGS), settingsOut, 'utf8');
    }
    console.log(`OK   settings.json — graft 몫 ${count}개 뗌 · ${settingsOut === baseText ? 'init 전 바이트로 되돌림' : settingsOut === null ? 'init 전에 없던 파일이라 지움' : count ? '다시 씀(위 WARN)' : '바뀐 것 없음'}`);
    s.local = { statusLine: statusLine ? statusLine.command : (s.local && s.local.statusLine) || null, localExisted: s.local ? s.local.localExisted : localText !== null };

    // ⑤ .mcp.json — init 전에 없었으면 로컬 전용, 추적 파일이었으면 init 전 내용으로
    const exclude = [...EXCLUDE_BASE];
    const mcpBefore = s.snapshot.files[MCP];
    if (exists(MCP)) {
      if (mcpBefore.exists && mcpBefore.tracked) {
        const before = snapText(MCP), now = read(MCP);
        const nowJ = loadJsonFile(MCP), beforeJ = parseJsonText(before);
        const minus = clone(nowJ); if (minus && isObj(minus.mcpServers)) delete minus.mcpServers[GRAFT_MCP];
        if (now === before) console.log('OK   .mcp.json — 추적 파일, init 전과 같음');
        else if (sameJson(minus, beforeJ) || sameJson(nowJ, beforeJ)) { writeFileSync(abs(MCP), before, 'utf8'); console.log('OK   .mcp.json — 추적 파일이라 init 전 바이트로 되돌림'); }
        else if (minus) { writeFileSync(abs(MCP), jsonText(minus, before), 'utf8'); console.log('WARN .mcp.json — init 전 판과 graft 서버 말고도 달라 graft 서버만 뺐다'); }
      } else if (!mcpBefore.exists) { exclude.push('/.mcp.json'); console.log('OK   .mcp.json — init 이 새로 만든 파일이라 로컬 전용(exclude)'); }
      else console.log('INFO .mcp.json — init 전부터 미추적 파일이었다. 그대로 두고 graft 서버는 settings.local.json 에서 끈다');
    }
    // ⑥ .ignore — graft build 가 만든 경우만 로컬 전용
    const ig = s.snapshot.files[IGNORE];
    if (exists(IGNORE)) {
      if (!ig.exists) { exclude.push('/.ignore'); console.log('OK   .ignore — graft build 가 새로 만든 파일이라 로컬 전용(exclude)'); }
      else if (ig.tracked && read(IGNORE) !== snapText(IGNORE)) console.log('WARN .ignore — 추적 파일에 graft build 가 블록을 덧붙였다. 매 build 다시 붙으므로 되돌리지 않는다 — 커밋할지는 사용자가 정한다');
    }
    if (!tracked(LOCAL) && exists(LOCAL) && !ignored(LOCAL)) exclude.push('/.claude/settings.local.json');
    // ⑦ .gitignore — graft 가 자기 줄을 덧붙이지 않았는가
    if (exists('.gitignore')) { const n = read('.gitignore').split(/\r?\n/).filter((l) => ['/graft/', 'graft/', 'graft'].includes(l.trim())).length; if (n !== 1) console.log(`WARN .gitignore 에 graft 줄이 ${n}개 — graft 가 표시 없이 덧붙였으면 그 줄과 주석을 지운다`); }

    // ⑧ info/exclude — 추적 중인 경로는 넣지 않는다
    const keep = exclude.filter((e) => { const t = tracked(e.replace(/^\//, '').replace(/\/$/, '')); if (t) console.log(`WARN exclude 에서 뺐다(추적 중인 경로): ${e}`); return !t; });
    const exPath = gitPath('info/exclude');
    const exText = existsSync(exPath) ? readFileSync(exPath, 'utf8') : '';
    const exNew = addBlock(exText, keep);
    if (exNew !== exText) { mkdirSync(path.dirname(exPath), { recursive: true }); writeFileSync(exPath, exNew, 'utf8'); }
    console.log(`OK   info/exclude 블록${exNew === exText ? '(이미 있어 그대로 둠)' : ''} — ${blockEntries(exNew).join(' · ')}`);
    s.exclude = { path: exPath.split(path.sep).join('/'), entries: blockEntries(exNew) };
    s.localizedAt = new Date().toISOString();
    saveState(s);
    console.log(`failures=0 · 체크포인트 ${statePath.split(path.sep).join('/')}`);
    console.log('다음: graft 업그레이드 뒤 settings.json 에 graft 키가 다시 들어오면 localize 만 다시 돌린다(status 로 확인)');
    return 0;
  }

  if (cmd === 'status') {
    const cur = exists(SETTINGS) ? loadJsonFile(SETTINGS) : {};
    const local = exists(LOCAL) ? loadJsonFile(LOCAL) : {};
    const s = loadState();
    const inProject = cur === undefined ? null : stripGraft(cur, null).count;
    const inLocal = local === undefined ? null : stripGraft(local, null).count;
    const exPath = gitPath('info/exclude');
    const ex = existsSync(exPath) ? blockEntries(readFileSync(exPath, 'utf8')) : null;
    console.log(`settings.json graft 몫: ${inProject ?? '읽지 못함'}개${inProject ? ' — localize 를 다시 돌린다(graft 업그레이드가 다시 넣었다)' : ''}`);
    console.log(`settings.local.json graft 몫: ${inLocal ?? '읽지 못함'}개 · helpers ${exists('.claude/helpers/graft-hooks.cjs') ? '있음' : '없음'} · graft/ ${exists('graft') ? '있음' : '없음'}`);
    console.log(`exclude 블록: ${ex ? ex.join(' · ') : '없음'} · 체크포인트 ${s ? `있음(스냅숏 ${s.snapshot.at}${s.localizedAt ? ` · localize ${s.localizedAt}` : ''})` : '없음'}`);
    return inProject ? 1 : 0;
  }

  if (cmd === 'remove') {
    const s = loadState() || {};
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bdir = path.join(stateDir, `backup-${stamp}`);
    const backup = (rel, from = abs(rel)) => { const dst = path.join(bdir, rel); mkdirSync(path.dirname(dst), { recursive: true }); copyFileSync(from, dst); };
    const untrackedFiles = (rel) => { if (!exists(rel)) return []; if (!statSync(abs(rel)).isDirectory()) return tracked(rel) ? [] : [rel]; const out = []; const go = (r) => { for (const e of readdirSync(abs(r), { withFileTypes: true })) { const p = `${r}/${e.name}`; e.isDirectory() ? go(p) : !tracked(p) && out.push(p); } }; go(rel); return out; };
    // settings.local.json
    if (exists(LOCAL)) {
      const text = read(LOCAL), j = parseJsonText(text);
      const { local, count } = stripLocal(j, s.local && s.local.statusLine);
      if (count) {
        backup(LOCAL);
        if (!Object.keys(local).length && s.local && s.local.localExisted === false) { rmSync(abs(LOCAL)); console.log(`OK   ${LOCAL} — graft 몫 ${count}개를 떼니 비어 지웠다(localize 전에 없던 파일)`); }
        else { writeFileSync(abs(LOCAL), jsonText(local, text), 'utf8'); console.log(`OK   ${LOCAL} — graft 몫 ${count}개 뗌`); }
        if (!sameJson(foreignHooks(j), foreignHooks(local))) bad(`${LOCAL}: graft 가 아닌 훅이 바뀌었다`);
      } else console.log(`INFO ${LOCAL} — graft 몫 없음`);
    }
    const cur = exists(SETTINGS) ? loadJsonFile(SETTINGS) : null;
    if (cur && stripGraft(cur, null).count) console.log('WARN settings.json 에 graft 몫이 있다(graft 업그레이드가 다시 넣었다) — 커밋 파일이라 여기서 지우지 않는다. git diff 로 보고 되돌린다');
    // helpers · skill
    const files = [...untrackedFiles('.claude/helpers').filter((p) => /\/graft-[^/]*\.cjs$/.test(p)), ...untrackedFiles('.claude/skills/graft')];
    for (const p of files) { backup(p); rmSync(abs(p)); }
    for (const d of ['.claude/skills/graft', '.claude/helpers', '.claude/skills']) if (exists(d) && statSync(abs(d)).isDirectory() && !readdirSync(abs(d)).length) rmdirSync(abs(d));
    console.log(`OK   helpers·skill ${files.length}개 지움${files.length ? ` (${files.join(' · ')})` : ''}`);
    // .mcp.json
    if (exists(MCP)) {
      const j = loadJsonFile(MCP);
      const servers = j && isObj(j.mcpServers) ? Object.keys(j.mcpServers) : [];
      const was = s.snapshot && s.snapshot.files[MCP];
      if (!tracked(MCP) && servers.length === 1 && servers[0] === GRAFT_MCP && (!was || !was.exists) && Object.keys(j).length === 1) { backup(MCP); rmSync(abs(MCP)); console.log('OK   .mcp.json — graft 서버뿐인 새 파일이라 지움'); }
      else if (servers.includes(GRAFT_MCP)) { backup(MCP); const t = read(MCP); delete j.mcpServers[GRAFT_MCP]; writeFileSync(abs(MCP), jsonText(j, t), 'utf8'); console.log('OK   .mcp.json — graft 서버만 뺐다'); }
    }
    // .ignore
    if (exists(IGNORE) && !tracked(IGNORE)) {
      const t = read(IGNORE);
      const rest = t.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#') && !/^!?graft\//.test(l.trim()));
      const was = s.snapshot && s.snapshot.files[IGNORE];
      if (!rest.length && (!was || !was.exists)) { backup(IGNORE); rmSync(abs(IGNORE)); console.log('OK   .ignore — graft 줄뿐인 새 파일이라 지움'); }
      else console.log('INFO .ignore — graft 밖의 줄이 있거나 원래 있던 파일이라 그대로 둔다');
    }
    // graft/
    if (exists('graft')) {
      if (args.includes('--keep-graph')) console.log('KEEP graft/ — --keep-graph');
      else if (tracked('graft')) console.log('WARN graft/ 에 추적 중인 파일이 있어 지우지 않는다');
      else { rmSync(abs('graft'), { recursive: true, force: true }); console.log('OK   graft/ 지움(다시 만드는 산출물이라 백업하지 않는다)'); }
    }
    // exclude 블록
    const exPath = gitPath('info/exclude');
    const ex = existsSync(exPath) ? removeBlock(readFileSync(exPath, 'utf8')) : { removed: false };
    if (ex.removed) {
      backup('info-exclude', exPath); writeFileSync(exPath, ex.text, 'utf8');
      console.log('OK   info/exclude 블록 지움');
      console.log('WARN info/exclude 는 워크트리끼리 공유된다 — 다른 워크트리에서 graft 를 쓰면 그쪽 graft 산출물(helpers 등)이 미추적으로 보일 수 있다. /graft/ 는 .gitignore 에 있어 영향 없음');
    }
    console.log('INFO .gitignore 의 /graft/ 표시 블록은 harness-uninstall 항목 질문(무시목록)에서 정한다');
    if (existsSync(bdir)) console.log(`백업: ${bdir.split(path.sep).join('/')}`);
    if (!fail && existsSync(statePath)) rmSync(statePath);
    console.log(`failures=${fail}`);
    return fail ? 1 : 0;
  }
  console.error(`모르는 명령: ${cmd}`);
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) process.exitCode = main(process.argv.slice(2));
export { main };
