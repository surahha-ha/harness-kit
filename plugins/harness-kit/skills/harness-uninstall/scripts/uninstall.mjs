#!/usr/bin/env node
/**
 * harness-uninstall 보조 스크립트 — 후보 뽑기 · 답 기록 · 백업 · 걷어내기 · 플러그인 키 · 검증.
 *
 * 사용: node uninstall.mjs <명령> <레포 루트> [인자…]
 *   scan    [--refresh]            후보를 뽑아 체크포인트에 계획으로 적는다(영수증이 있으면 영수증 기준)
 *   status                          계획·답·진행을 보인다
 *   answer  <id>=<값>… | --recommended   답을 적는다. purpose=reinstall|remove 도 여기서
 *   backup                          손댈 파일 전부를 git-path 아래로, 런타임 산출물을 git-common-dir 아래로 복사
 *   apply                           플러그인 키를 뺀 나머지를 걷어 낸다(다시 돌려도 안전)
 *   plugin                          플러그인 키 답(off|keep)을 반영한다 — 맨 마지막 결정
 *   verify                          남은 참조 · settings 대조 · 후보 밖 변경 · git status · 커밋 경로 · 보고용 요약
 *   finish                          체크포인트를 지운다(백업은 남긴다) — 보고를 사용자에게 보인 뒤에 부른다
 *   restore-check <백업 디렉토리> [증거 디렉토리]   백업을 되돌려 놓은 뒤 index.json 과 바이트 대조(체크포인트 없이 돈다)
 *
 * 인자에는 경로·후보 id·답만 넘긴다. 명령 문자열을 셸 인자로 넘기지 않는다(실행 전 가드가 그 문자열을 본다).
 * 이 스크립트는 git 에 쓰지 않는다 — add·commit·restore·checkout 을 부르지 않는다.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync, readdirSync, statSync, rmdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import {
  sha256, normEol, splitLines, body, marksFor, MARKS, findMarked, findSection, findPointerLines, findIgnoreGroups,
  rangeSha, widen, countText, toFileEol, applyTextOps, deleteKey, deleteHook, hookEntries, dupKeys, findKey, parseSpans,
} from './edit.mjs';

const [cmd, rootArg, ...args] = process.argv.slice(2);
if (!cmd || !rootArg) { console.error('사용: node uninstall.mjs <scan|status|answer|backup|apply|plugin|verify|finish|restore-check> <레포 루트> [인자…]'); process.exit(2); }
const root = path.resolve(rootArg);
const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 256 << 20 });
const tryGit = (...a) => { try { return execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
const gitPath = (p) => path.resolve(root, git('rev-parse', '--git-path', p).trim());
const abs = (rel) => path.join(root, rel);
const read = (rel) => readFileSync(abs(rel), 'utf8');
const exists = (rel) => existsSync(abs(rel));
const posix = (p) => p.split(path.sep).join('/');

const MANIFEST = 'harness.install.json';
const CONFIG = 'harness.config.mjs';
const SETTINGS = '.claude/settings.json';
const SETTINGS_LOCAL = '.claude/settings.local.json';
const KIT_PLUGIN = 'harness-kit@harness-kit';
const KIT_MARKET = 'harness-kit';
const RUNTIME = /^\.harness\/[^/]+\.jsonl$/;
const REF_PATTERNS = [/\.harness(?![\w-])/, /harness\.config/, /harness\.install/, /harness-kit/];
const statePath = gitPath('harness-uninstall-state.json');

const loadState = () => (existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null);
const saveState = (s) => { s.updated = new Date().toISOString(); writeFileSync(statePath, JSON.stringify(s, null, 2) + '\n', 'utf8'); };
const need = (s, what) => { if (!s || !s.plan) { console.error('체크포인트에 계획이 없다 — 먼저 scan'); process.exit(2); } return s; };

// ── 파일 목록 · 읽기 ─────────────────────────────────────────────────────────

function listFiles() {
  const t = git('ls-files', '-z').split('\0').filter(Boolean);
  const u = git('ls-files', '-o', '--exclude-standard', '-z').split('\0').filter(Boolean);
  return { tracked: new Set(t), untracked: new Set(u), all: [...new Set([...t, ...u])].filter((p) => exists(p)) };
}
function textOf(rel) {
  try {
    const st = statSync(abs(rel));
    if (!st.isFile() || st.size > 2 << 20) return null;
    const buf = readFileSync(abs(rel));
    if (buf.includes(0)) return null;
    return buf.toString('utf8');
  } catch { return null; }
}
const inHead = (rel) => tryGit('cat-file', '-e', `HEAD:${rel}`) !== null;
const walkDir = (rel) => {
  const out = [];
  const go = (r) => { for (const e of readdirSync(abs(r), { withFileTypes: true })) { const p = `${r}/${e.name}`; e.isDirectory() ? go(p) : out.push(p); } };
  if (exists(rel)) go(rel);
  return out.sort();
};
const fileSha = (rel) => sha256(read(rel));
/** 바이트 그대로의 해시 — 되돌려 놓은 파일을 대조할 때 쓴다(sha256 은 줄끝을 LF 로 맞춘 뒤의 해시라 CRLF 파일의 바이트와 맞지 않는다). */
const rawSha = (buf) => createHash('sha256').update(buf).digest('hex');
/** 그 판에 설치가 커밋돼 있는가 — config 나 .harness/ 파일이 그 판에 있으면 커밋된 설치다. */
const installAt = (rev) => ({
  config: tryGit('cat-file', '-e', `${rev}:${CONFIG}`) !== null,
  harnessDir: !!(tryGit('ls-tree', '-r', '--name-only', rev, '--', '.harness') || '').trim(),
  manifest: tryGit('cat-file', '-e', `${rev}:${MANIFEST}`) !== null,
});
const isWorktree = () => path.resolve(root, git('rev-parse', '--git-dir').trim()) !== path.resolve(root, git('rev-parse', '--git-common-dir').trim());

// ── 질문 header — 후보마다 하나, 한 계획 안에서 겹치지 않게(12자 이하) ────────────
const HOOK_SHORT = { Stop: 'Stop', PreToolUse: 'PreTool', PostToolUse: 'PostTool', PostToolUseFailure: 'PostFail', UserPromptSubmit: 'Prompt',
  SessionStart: 'Session', SessionEnd: 'SessEnd', SubagentStop: 'SubStop', Notification: 'Notify', PreCompact: 'Compact' };
const HEADER_MAX = 12;
/** header 의 조각 — pre + core + tail + ' ' + action. 12자를 넘으면 core 만 뒤에서 줄인다. */
function headerParts(c) {
  const H = (core, action, pre = '', tail = '') => ({ pre, core, tail, action });
  if (['modified', 'extra'].includes(c.status) && ['file', 'text', 'hook'].includes(c.kind)) return H('손댄파일', '처리');
  if (c.kind === 'files') return H('하네스파일', '삭제');
  if (c.kind === 'runtime') return H('계측로그', '보관');
  if (c.kind === 'manifest') return H('영수증', '삭제');
  if (c.kind === 'plugin') return H('kit 키', '처리');
  if (c.kind === 'key') return H('끈플러그인', '복원');
  if (c.kind === 'hook') return H(HOOK_SHORT[c.data.event] || c.data.event, '삭제', c.data.file === SETTINGS_LOCAL ? '로컬' : '', '훅');
  if (c.kind === 'file') return H(c.data.path === CONFIG ? '하네스설정' : '보조파일', '삭제');
  const p = c.data.path, op = c.data.op.op;
  if (op === 'replace') return H('문서줄', '되돌림');
  if (p === '.gitignore') return H('무시목록', '줄삭제');
  if (op === 'section' || op === 'block') return /(^|\/)CLAUDE\.md$/.test(p) ? H('안내절', '삭제') : H('표시블록', '삭제');
  return H('안내줄', '삭제');
}
/** 후보마다 header 를 정한다 — 같은 header 가 둘 이상이면 끝에 번호를 붙여 한 계획 안에서 겹치지 않게 한다. */
function assignHeaders(cands) {
  const join = (h, core) => `${h.pre}${core}${h.tail} ${h.action}`;
  const by = new Map();
  for (const c of cands) { const h = headerParts(c); const k = join(h, h.core); if (!by.has(k)) by.set(k, []); by.get(k).push({ c, h }); }
  for (const cs of by.values()) cs.forEach(({ c, h }, i) => {
    const suffix = cs.length > 1 ? ` ${i + 1}` : '';
    let core = h.core;
    while (core.length > 1 && (join(h, core) + suffix).length > HEADER_MAX) core = core.slice(0, -1);
    c.header = join(h, core) + suffix;
  });
}

async function loadConfig() {
  if (!exists(CONFIG)) return null;
  try { return (await import(pathToFileURL(abs(CONFIG)).href + `?t=${Date.now()}`)).default; } catch (e) { return { __error: String(e.message || e) }; }
}
function configStrings(cfg) {
  const out = [];
  const walk = (v) => { if (typeof v === 'string') out.push(v); else if (v && typeof v === 'object' && !(v instanceof RegExp)) Object.values(v).forEach(walk); };
  if (cfg && !cfg.__error) { walk(cfg.commands); walk(cfg.project && cfg.project.commands); }
  else if (exists(CONFIG)) for (const m of read(CONFIG).matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
const loadJson = (rel) => { try { return JSON.parse(read(rel).replace(/^\uFEFF/, '')); } catch { return null; } };

// ── scan ─────────────────────────────────────────────────────────────────────

async function scan() {
  const prev = loadState();
  if (prev && prev.plan && !args.includes('--refresh')) { console.log(`체크포인트가 이미 있다: ${statePath}\n이어받으려면 status, 새로 뽑으려면 scan --refresh(걷어내기 전만)`); printPlan(prev); return; }
  if (prev && (prev.applied || []).length) { console.error('이미 걷어내기를 시작한 체크포인트다 — --refresh 불가. status 로 이어받는다'); process.exit(2); }

  const files = listFiles();
  const warnings = [];
  const manifest = exists(MANIFEST) ? loadJson(MANIFEST) : null;
  if (exists(MANIFEST) && !manifest) warnings.push(`${MANIFEST} 를 JSON 으로 읽지 못했다 — 영수증 없는 경로로 뽑는다`);
  if (existsSync(gitPath('harness-install-state.json'))) warnings.push('harness-install 체크포인트가 남아 있다 — 중단된 설치다. 그 설치의 남은 단계는 하지 않는다');
  const cfg = await loadConfig();
  if (cfg && cfg.__error) warnings.push(`config 를 import 하지 못했다(${cfg.__error}) — 문자열만 정규식으로 읽는다`);
  const g = (cfg && !cfg.__error && cfg.project && cfg.project.git) || {};
  const captured = { commitExecution: g.commitExecution ?? null, push: g.push ?? null, coAuthor: g.coAuthor ?? null };

  const installCommit = (tryGit('log', '--diff-filter=A', '--format=%H', '--', CONFIG) || '').trim().split('\n').filter(Boolean).pop() || null;
  const cands = [];
  const add =(c) => cands.push({ options: ['remove', 'keep'], ...c });
  const mf = manifest || {};
  const mFiles = new Map((mf.files || []).map((f) => [f.path, f]));

  // 1) 만든 파일 — .harness/ · config · 보조 파일
  const harnessFiles = walkDir('.harness');
  const runtime = harnessFiles.filter((p) => RUNTIME.test(p));
  const skeleton = harnessFiles.filter((p) => !RUNTIME.test(p));
  const clean = [], unknown = [];
  for (const p of skeleton) {
    const m = mFiles.get(p);
    if (!manifest) unknown.push(p);
    else if (!m) add({ id: `file:${p}`, kind: 'file', group: 'gate', title: `${p} — 설치 뒤 생긴 파일`, status: 'extra', recommend: 'remove', basis: '영수증에 없는 파일이 .harness/ 안에 있다 — 백업본에 남는다', data: { path: p } });
    else if (m.sha256 !== fileSha(p)) add({ id: `file:${p}`, kind: 'file', group: 'gate', title: `${p} — 설치 뒤 손댄 파일`, status: 'modified', recommend: 'remove', basis: '.harness/ 사본은 하네스 없이는 쓸 데가 없다 — 고친 내용은 백업본에 남는다', data: { path: p } });
    else clean.push(p);
  }
  for (const [p, m] of mFiles) if (m.role === 'skeleton' && !exists(p)) warnings.push(`영수증의 ${p} 가 이미 없다`);
  if (clean.length || unknown.length) add({
    id: 'files:skeleton', kind: 'files', group: 'gate', title: `.harness/ 골격 사본 ${clean.length + unknown.length}개`,
    status: manifest ? 'clean' : 'unknown', recommend: 'remove',
    basis: manifest ? '영수증의 sha256 과 모두 같다' : '영수증 없음 — 설치 뒤 손댔는지는 가릴 수 없다(백업본에 남는다)', data: { paths: [...clean, ...unknown] },
  });
  if (runtime.length) add({
    id: 'runtime', kind: 'runtime', group: 'gate', title: `런타임 산출물 ${runtime.length}개 (${runtime.map((p) => path.posix.basename(p)).join(' · ')})`,
    status: 'runtime', recommend: 'remove', options: ['remove', 'keep'],
    basis: '계측 증거 데이터다 — 지우기 전에 git-common-dir 아래 harness-evidence/ 로 복사한다', data: { paths: runtime },
  });

  if (exists(CONFIG)) {
    const m = mFiles.get(CONFIG);
    const status = !manifest ? 'unknown' : !m ? 'extra' : m.sha256 === fileSha(CONFIG) ? 'clean' : 'modified';
    add({ id: `file:${CONFIG}`, kind: 'file', group: 'gate', title: `${CONFIG}${status === 'modified' ? ' — 설치 뒤 손댄 파일' : ''}`, status, recommend: 'remove',
      basis: status === 'modified' ? '설치 뒤 값이 바뀌었다(정상 운영에서도 바뀐다) — 백업본에 남는다' : '하네스 설정 — 하네스 없이는 읽는 쪽이 없다', data: { path: CONFIG } });
  }

  // 보조 파일 — 영수증의 aux, 없으면 config 명령이 가리키는 파일 중 설치가 만든 것
  const auxPaths = new Map();
  for (const f of mf.files || []) if (f.role === 'aux') auxPaths.set(f.path, { why: f.why || '영수증의 보조 파일', m: f });
  if (!manifest) {
    const tokens = new Set();
    for (const s of configStrings(cfg)) for (const t of s.split(/[\s'"`=]+/)) if (/[\w.-]\.[A-Za-z]{1,6}$/.test(t) && /[\/\\]|harness/i.test(t)) tokens.add(t.replace(/\\/g, '/').replace(/^\.\//, ''));
    for (const t of tokens) for (const p of files.all) {
      if (!(p === t || p.endsWith(`/${t}`)) || p.startsWith('.harness/') || p === CONFIG) continue;
      const named = /harness/i.test(path.posix.basename(p));
      const together = installCommit ? (tryGit('log', '--diff-filter=A', '--format=%H', '--', p) || '').includes(installCommit) : files.untracked.has(p);
      if (named || together) auxPaths.set(p, { why: `config 명령이 가리킨다(${t})${named ? ' · 이름에 harness' : ''}${together ? (installCommit ? ' · 설치 커밋에서 생김' : ' · config 와 함께 미추적') : ''}` });
    }
  }
  for (const [p, { why, m }] of auxPaths) {
    if (!exists(p)) { warnings.push(`보조 파일 ${p} 가 이미 없다`); continue; }
    const status = !m ? 'unknown' : m.sha256 === fileSha(p) ? 'clean' : 'modified';
    add({ id: `file:${p}`, kind: 'file', group: 'aux', title: `보조 파일 ${p}${status === 'modified' ? ' — 설치 뒤 손댄 파일' : ''}`, status, recommend: status === 'modified' ? 'keep' : 'remove', basis: why, data: { path: p, aux: true } });
  }

  // 2) 고친 텍스트 — 표시(어느 파일이든) · 표시 없는 옛 꼴(CLAUDE.md 절 · 가리키는 줄 · .gitignore 줄) · 영수증의 replace
  const mEdits = mf.edits || [];
  const blockSha = (p, i) => (mEdits.filter((e) => e.path === p && e.how === 'block')[i] || {}).sha256;
  const lineShas = (p) => new Set(mEdits.filter((e) => e.path === p && e.how === 'line').map((e) => e.sha256));
  const sectionTexts = [];
  for (const p of files.all) {
    if (p.startsWith('.harness/') || p === MANIFEST || p === CONFIG) continue;
    const text = textOf(p);
    if (text === null || !/harness-kit:(begin|line)/.test(text)) continue;
    const lines = splitLines(text);
    const marks = marksFor(p);
    const found = findMarked(lines, marks);
    found.errors.forEach((e) => warnings.push(`${p}: ${e} — 그 표시는 후보에서 뺀다`));
    if (found.errors.length) continue;
    found.blocks.forEach((b, i) => {
      const sha = rangeSha(lines, b), want = blockSha(p, i);
      const status = !manifest ? 'unknown' : !want ? 'extra' : want === sha ? 'clean' : 'modified';
      const first = lines.slice(b.start + 1, b.end).map(body).find((l) => l.trim()) || '';
      add({ id: `text:${p}#block${i + 1}`, kind: 'text', group: 'text', title: `${p} 표시 블록 ${i + 1} (${b.end - b.start + 1}줄: ${first.slice(0, 40)})`, status,
        recommend: 'remove', basis: status === 'modified' ? '설치 뒤 블록 안을 고쳤다 — 하네스 안내뿐이라 지우고 백업본에 남긴다' : '시작·끝 표시로 감싼 설치 블록', data: { path: p, op: { op: 'block', sha } } });
      sectionTexts.push(lines.slice(b.start, b.end + 1).join(''));
    });
    const ls = lineShas(p);
    found.lines.forEach((i, k) => {
      const sha = sha256(body(lines[i]));
      const status = !manifest ? 'unknown' : ls.has(sha) ? 'clean' : 'modified';
      add({ id: `text:${p}#line${k + 1}`, kind: 'text', group: 'text', title: `${p}:${i + 1} 표시 줄 — ${body(lines[i]).replace(MARKS.md.line, '').trim().slice(0, 50)}`, status,
        recommend: 'remove', basis: '한 줄 표시가 붙은 설치 줄', data: { path: p, op: { op: 'line', sha } } });
    });
  }
  for (const p of ['CLAUDE.md', '.claude/CLAUDE.md']) {
    const text = exists(p) ? read(p) : null;
    if (text === null) continue;
    const lines = splitLines(text);
    const marked = findMarked(lines, MARKS.md);
    const inBlock = (k) => marked.blocks.some((b) => k >= b.start && k <= b.end);
    const sec = findSection(lines);
    let secRange = null;
    if (sec && !inBlock(sec.start)) {
      secRange = sec;
      add({ id: `text:${p}#section`, kind: 'text', group: 'text', title: `${p} 「${sec.heading.replace(/^#+\s*/, '')}」 절 (${sec.end - sec.start + 1}줄, 표시 없음)`, status: 'unknown',
        recommend: 'remove', basis: '알려진 구조 — harness-install 8단계가 넣는 절 제목', data: { path: p, op: { op: 'section', sha: rangeSha(lines, sec) } } });
      sectionTexts.push(lines.slice(sec.start, sec.end + 1).join(''));
    }
    const skip = (k) => inBlock(k) || (secRange && k >= secRange.start && k <= secRange.end) || body(lines[k]).includes(MARKS.md.line);
    findPointerLines(lines, skip).forEach((i, k) => add({
      id: `text:${p}#pointer${k + 1}`, kind: 'text', group: 'text', title: `${p}:${i + 1} 절을 가리키는 줄 — ${body(lines[i]).trim().slice(0, 50)}`, status: 'unknown',
      recommend: 'remove', basis: '지울 「개발 하네스」 절을 가리킨다 — 절이 없어지면 끊긴 안내가 된다', data: { path: p, op: { op: 'line', sha: sha256(body(lines[i])) } },
    }));
  }
  if (exists('.gitignore')) {
    const lines = splitLines(read('.gitignore'));
    const marked = findMarked(lines, MARKS.hash);
    const inBlock = (k) => marked.blocks.some((b) => k >= b.start && k <= b.end);
    findIgnoreGroups(lines).filter((r) => !inBlock(r.start)).forEach((r, k) => add({
      id: `text:.gitignore#lines${k + 1}`, kind: 'text', group: 'text', title: `.gitignore ${r.start + 1}~${r.end + 1}행 하네스 줄 (표시 없음): ${lines.slice(r.start, r.end + 1).map(body).filter((l) => !l.startsWith('#')).join(' · ')}`,
      status: 'unknown', recommend: 'remove', basis: '.harness/ 경로 줄과 바로 위 하네스 주석 — 런타임 산출물을 남기기로 하면 남긴다', data: { path: '.gitignore', op: { op: 'ignore', sha: rangeSha(lines, r) } },
    }));
  }
  mEdits.filter((e) => e.how === 'replace').forEach((e, k) => {
    if (!exists(e.path)) { warnings.push(`영수증의 replace 대상 ${e.path} 가 없다`); return; }
    const text = read(e.path), n = countText(text, toFileEol(e.after, text)), want = e.count ?? 1;
    const ok = n === want;
    add({ id: `text:${e.path}#replace${k + 1}`, kind: 'text', group: 'text', title: `${e.path} 고친 줄 되돌리기 — ${e.after.split('\n')[0].trim().slice(0, 50)}`, status: ok ? 'clean' : 'modified',
      options: ok ? ['revert', 'keep'] : ['keep'], recommend: ok ? 'revert' : 'keep',
      basis: ok ? `설치가 바꾼 원문(${want}곳)이 그대로 있다 — 설치 전 원문으로 되돌린다` : `설치 뒤 손댔다(설치 뒤 원문 ${n}곳 · 영수증 ${want}곳) — 자동으로 되돌리지 않고 보고만 한다`,
      data: { path: e.path, op: { op: 'replace', before: e.before, after: e.after, count: want } } });
  });

  // 3) settings — .harness/ 를 가리키는 훅 · 설치가 넣은 false 키 · 플러그인 키
  const mHooks = (mf.settings && mf.settings.hooks) || [];
  for (const sf of [SETTINGS, SETTINGS_LOCAL]) {
    if (!exists(sf)) continue;
    const json = loadJson(sf);
    if (!json) { warnings.push(`${sf} 를 JSON 으로 읽지 못했다 — settings 후보를 뽑지 않는다. 손으로 고친 뒤 scan --refresh`); continue; }
    const dups = dupKeys(read(sf));
    if (dups.length) warnings.push(`${sf} 에 중복 키 ${dups.join(', ')} — JSON.parse 가 앞쪽을 버린다. 걷어내기는 이 파일을 건드리지 않는다(멈추고 보고)`);
    hookEntries(json).filter((e) => /[\/\\]\.harness[\/\\]/.test(e.command || '')).forEach((e, k) => {
      const m = sf === SETTINGS && mHooks.find((h) => h.event === e.event && h.command === e.command);
      const status = !manifest || sf !== SETTINGS ? 'unknown' : !m ? 'extra' : (m.matcher ?? null) === e.matcher ? 'clean' : 'modified';
      add({ id: `hook:${sf}#${e.event}#${k + 1}`, kind: 'hook', group: 'settings', title: `${sf} 훅 ${e.event} | ${e.matcher ?? '*'} | ${e.command}`, status, recommend: 'remove',
        basis: sf === SETTINGS_LOCAL ? '개인 설정 파일의 하네스 훅 — .harness/ 가 없어지면 실패한다' : status === 'modified' ? 'matcher 가 설치 때와 다르다 — 그래도 .harness/ 를 가리키므로 지운다' : '.harness/ 를 가리키는 훅',
        data: { file: sf, event: e.event, matcher: e.matcher, command: e.command } });
    });
  }
  const settings = exists(SETTINGS) ? loadJson(SETTINGS) : null;
  if (settings) {
    const ep = settings.enabledPlugins || {};
    const mKeys = (mf.settings && mf.settings.keys) || [];
    const headSettings = (() => { try { return JSON.parse(tryGit('show', `HEAD:${SETTINGS}`)); } catch { return null; } })();
    const allSection = sectionTexts.join('\n');
    const atInstall = (rev) => { try { return (JSON.parse(tryGit('show', `${rev}:${SETTINGS}`)).enabledPlugins) || {}; } catch { return {}; } };
    for (const [k, v] of Object.entries(ep)) {
      if (k === KIT_PLUGIN) continue;
      const m = mKeys.find((x) => x.path && x.path[0] === 'enabledPlugins' && x.path[1] === k);
      let recommend = null, basis;
      if (manifest) {
        if (!m) continue;
        recommend = 'remove'; basis = `영수증의 ${m.decision || '설치'} 결정으로 넣은 키`;
      } else {
        if (v !== false) continue;
        const inHeadKey = !!(headSettings && headSettings.enabledPlugins && k in headSettings.enabledPlugins);
        if (allSection.includes(k)) { recommend = 'remove'; basis = '「개발 하네스」 절이 이 키를 설치 결정으로 적었다'; }
        else if (installCommit && k in atInstall(installCommit) && !(k in atInstall(`${installCommit}^`))) { recommend = 'remove'; basis = `설치 커밋 ${installCommit.slice(0, 7)} 에서 생긴 키`; }
        else if (!inHeadKey && exists(CONFIG) && !files.tracked.has(CONFIG)) basis = 'HEAD 에 없고 미추적 config 와 함께 생겼다 — 설치가 넣었는지 판단 근거 부족';
        else continue;
      }
      add({ id: `key:${SETTINGS}#enabledPlugins.${k}`, kind: 'key', group: 'settings', title: `${SETTINGS} enabledPlugins."${k}": ${JSON.stringify(v)}`, status: m ? 'clean' : 'unknown', recommend,
        basis: `${basis} — 지우면 이 레포에서 그 플러그인이 설치 전처럼 다시 켜진다`, data: { file: SETTINGS, keys: ['enabledPlugins', k] } });
    }
    const keys = [];
    if (KIT_PLUGIN in ep) keys.push(['enabledPlugins', KIT_PLUGIN]);
    if (settings.extraKnownMarketplaces && KIT_MARKET in settings.extraKnownMarketplaces) keys.push(['extraKnownMarketplaces', KIT_MARKET]);
    if (keys.length) {
      const user = (() => { try { return JSON.parse(readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8')); } catch { return null; } })();
      const userOn = !!(user && user.enabledPlugins && user.enabledPlugins[KIT_PLUGIN]);
      cands.push({ id: 'plugin', kind: 'plugin', group: 'plugin', title: `harness-kit 플러그인 키 ${keys.map((k) => k.join('.')).join(' · ')}`, status: manifest ? 'clean' : 'unknown',
        options: ['off', 'keep'], recommend: null, recommendBy: { reinstall: 'keep', remove: 'off' },
        basis: `이 스킬도 harness-kit 안에 있다 — 끄면 다음 세션부터 이 레포에서 harness-install 이 안 뜬다${userOn ? ' (사용자 범위에서도 켜져 있어 이 PC 에서는 남는다)' : ''}`,
        data: { file: SETTINGS, keys, userScope: userOn, record: mf.plugin || null } });
    }
  }
  if (manifest) cands.push({ id: `file:${MANIFEST}`, kind: 'manifest', group: 'gate', title: `${MANIFEST} (영수증)`, status: 'clean', options: ['remove', 'keep'], recommend: 'remove', basis: '다른 항목을 하나라도 남기면 남긴다(다음 걷어내기의 기준)', data: { path: MANIFEST } });

  // 4) 참조 — 권장대로 걷어 낸 뒤에도 남을 줄
  assignHeaders(cands);
  const head = git('rev-parse', 'HEAD').trim();
  const plan = { scannedAt: new Date().toISOString(), head, branch: git('rev-parse', '--abbrev-ref', 'HEAD').trim(), manifest: !!manifest,
    installAtHead: installAt(head),
    source: mf.source || (exists(CONFIG) ? { headLine: body(splitLines(read(CONFIG))[0] || '').slice(0, 200) } : null), captured, candidates: cands, warnings };
  plan.refs = findRefs(plan, Object.fromEntries(cands.map((c) => [c.id, c.recommend ?? 'keep'])), files);
  for (const c of cands.filter((x) => x.data && x.data.aux)) {
    const base = path.posix.basename(c.data.path);
    const hits = plan.refs.filter((r) => r.text.includes(base));
    if (hits.length && c.recommend === 'remove') { c.recommend = 'keep'; c.basis += ` · 다른 파일 ${new Set(hits.map((h) => h.path)).size}곳이 가리킨다 — 지우면 그 안내가 끊긴다(참조는 보고만)`; }
  }
  plan.refs = findRefs(plan, Object.fromEntries(cands.map((c) => [c.id, c.recommend ?? 'keep'])), files);

  // 5) 걷어내기 전 상태 — 후보 밖 파일이 바뀌지 않았는지 verify 가 대조한다
  const candPaths = candidatePaths(plan);
  const porcelain = git('status', '--porcelain=v1', '-z', '--untracked-files=all').split('\0').filter(Boolean);
  const pre = {};
  for (const e of porcelain) { const p = e.slice(3); if (!candPaths.has(p) && !p.startsWith('.harness/') && exists(p) && statSync(abs(p)).isFile()) pre[p] = { code: e.slice(0, 2), sha: sha256(readFileSync(abs(p), 'utf8')) }; }
  plan.pre = pre;

  const state = { skill: 'harness-uninstall', root: posix(root), plan, purpose: null, answers: {}, done: ['scan'], applied: [], backup: null };
  saveState(state);
  printPlan(state);
  console.log(`\n체크포인트: ${statePath}`);
}

function candidatePaths(plan) {
  const s = new Set();
  for (const c of plan.candidates) {
    const d = c.data || {};
    if (d.path) s.add(d.path);
    if (d.paths) d.paths.forEach((p) => s.add(p));
    if (d.file) s.add(d.file);
  }
  return s;
}

/** answers 대로 걷어 냈다고 치고, 남을 참조 줄을 찾는다(텍스트 연산은 메모리에서만 적용). */
function findRefs(plan, answers, files = listFiles()) {
  const gone = new Set(), opsBy = new Map();
  for (const c of plan.candidates) {
    const a = answers[c.id];
    if (c.kind === 'text' && (a === 'remove' || a === 'revert')) { const l = opsBy.get(c.data.path) || []; l.push({ id: c.id, ...c.data.op }); opsBy.set(c.data.path, l); }
    if (['file', 'manifest'].includes(c.kind) && a === 'remove') gone.add(c.data.path);
    if (['files', 'runtime'].includes(c.kind) && a === 'remove') c.data.paths.forEach((p) => gone.add(p));
  }
  const auxNames = plan.candidates.filter((c) => c.data && c.data.aux).map((c) => path.posix.basename(c.data.path));
  const pats = [...REF_PATTERNS, ...auxNames.map((n) => new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))];
  const auxPaths = new Set(plan.candidates.filter((c) => c.data && c.data.aux).map((c) => c.data.path));
  const refs = [];
  for (const p of files.all) {
    if (gone.has(p) || auxPaths.has(p) ||p.startsWith('.harness/') || p === SETTINGS || p === SETTINGS_LOCAL) continue;
    let text = textOf(p);
    if (text === null) continue;
    if (opsBy.has(p)) text = applyTextOps(text, opsBy.get(p), p).text;
    splitLines(text).forEach((l, i) => { const t = body(l); const hit = pats.find((re) => re.test(t)); if (hit) refs.push({ path: p, line: i + 1, text: t.trim().slice(0, 160) }); });
  }
  return refs;
}

// ── status · answer ──────────────────────────────────────────────────────────

const recOf = (c, s) => {
  if (c.recommendBy) return s.purpose ? c.recommendBy[s.purpose] : null;
  if (c.id.startsWith('text:.gitignore') && s.answers.runtime === 'keep') return 'keep';
  return c.recommend;
};
const committedText = (ia) => (!ia ? '확인 전' : ia.config || ia.harnessDir || ia.manifest ? 'HEAD 에 커밋됨' : 'HEAD 에 없음 — 작업본에만 있는 설치');
function printPlan(s) {
  const p = s.plan;
  if (p.candidates.some((c) => !c.header)) assignHeaders(p.candidates);
  console.log(`기준: ${p.manifest ? `영수증(${MANIFEST})` : '영수증 없음 — 알려진 구조로 뽑은 후보, 항목마다 확인'} · HEAD ${p.head.slice(0, 7)} (${p.branch}) · 설치: ${committedText(p.installAtHead)}`);
  console.log(`읽어 둔 커밋 정책: commitExecution=${p.captured.commitExecution} · push=${p.captured.push} · coAuthor=${p.captured.coAuthor}`);
  console.log(`목적: ${s.purpose ?? '미정'} · 진행: ${s.done.join(' → ')} · 적용 ${s.applied.length}건`);
  console.log(`후보 ${p.candidates.length}개 (플러그인 키 ${p.candidates.filter((c) => c.kind === 'plugin').length}개 포함) · 답 ${Object.keys(s.answers).length}개 — 보고의 후보 수는 이 줄에서 옮긴다`);
  for (const w of p.warnings) console.log(`WARN ${w}`);
  console.log('\nid | 질문 header | 상태 | 권장 | 답 | 항목 — 근거');
  for (const c of p.candidates) console.log(`${c.id} | ${c.header} | ${c.status} | ${recOf(c, s) ?? '권장 없음'} | ${s.answers[c.id] ?? '-'} | ${c.title} — ${c.basis}`);
  const by = {};
  for (const r of p.refs) (by[r.path] ||= []).push(r);
  console.log(`\n남을 참조 ${p.refs.length}줄 (지우지 않고 보고만):`);
  for (const [f, rs] of Object.entries(by)) console.log(`  ${f}: ${rs.map((r) => r.line).join(', ')}행 — ${rs[0].text.slice(0, 90)}`);
}

function answer() {
  const s = need(loadState());
  const byId = new Map(s.plan.candidates.map((c) => [c.id, c]));
  for (const a of args) {
    if (a === '--recommended') continue;
    const i = a.indexOf('=');
    const id = a.slice(0, i), v = a.slice(i + 1);
    if (id === 'purpose') { if (!['reinstall', 'remove'].includes(v)) { console.error('purpose 는 reinstall|remove'); process.exit(2); } s.purpose = v; continue; }
    const c = byId.get(id);
    if (!c) { console.error(`없는 후보: ${id}`); process.exit(2); }
    if (!c.options.includes(v)) { console.error(`${id} 의 답은 ${c.options.join('|')}`); process.exit(2); }
    s.answers[id] = v;
  }
  if (args.includes('--recommended')) {
    const filled = [], skipped = [];
    for (const c of s.plan.candidates) if (!(c.id in s.answers)) {
      if (c.kind === 'plugin' && !s.purpose) { skipped.push(c.id); continue; }
      const r = recOf(c, s);
      s.answers[c.id] = r ?? 'keep';
      if (!r) filled.push(c.id);
    }
    s.filledByDefault = [...new Set([...(s.filledByDefault || []), ...filled])];
    if (!s.purpose) console.log('INFO 목적(purpose)은 권장이 없어 채우지 않았다 — 사용자에게 묻고 purpose=remove|reinstall 로 적는다');
    if (skipped.length) console.log(`INFO 목적이 미정이라 채우지 않은 칸: ${skipped.join(', ')}`);
    if (filled.length) console.log(`INFO 권장이 없어 keep 으로 채운 칸 ${filled.length}개(보고에 적는다): ${filled.join(', ')}`);
  }
  const rt = s.answers.runtime, ig = s.plan.candidates.filter((c) => c.id.startsWith('text:.gitignore'));
  if (rt === 'keep' && ig.some((c) => s.answers[c.id] === 'remove')) console.log('WARN 런타임 산출물을 남기는데 .gitignore 줄을 지우면 그 파일이 미추적으로 뜬다 — .gitignore 줄도 남기길 권한다');
  saveState(s);
  const left = s.plan.candidates.filter((c) => !(c.id in s.answers)).map((c) => c.id);
  console.log(`답 ${Object.keys(s.answers).length}/${s.plan.candidates.length} · 목적 ${s.purpose ?? '미정'}${left.length ? ` · 남은 질문: ${left.join(', ')}` : ''}`);
}

// ── backup ───────────────────────────────────────────────────────────────────

function backup() {
  const s = need(loadState());
  const left = s.plan.candidates.filter((c) => c.kind !== 'plugin' && !(c.id in s.answers));
  if (left.length) { console.error(`답이 없는 후보: ${left.map((c) => c.id).join(', ')}`); process.exit(2); }
  if (s.backup) { console.log(`백업이 이미 있다: ${s.backup.dir} (${s.backup.files.length}개) — 다시 뜨지 않는다(걷어내던 중간 상태를 덮으면 안 된다)`); return; }
  if (s.applied.length) { console.error('백업 없이 걷어내기가 시작됐다 — 멈추고 사용자에게 보고한다'); process.exit(2); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(gitPath('harness-uninstall-backup'), stamp);
  const planned = [...candidatePaths(s.plan)].sort();
  const missing = planned.filter((p) => !exists(p));
  const paths = planned.filter((p) => exists(p) && statSync(abs(p)).isFile());
  const index = [];
  for (const p of paths) {
    const dst = path.join(dir, 'files', p);
    mkdirSync(path.dirname(dst), { recursive: true });
    copyFileSync(abs(p), dst);
    const a = readFileSync(abs(p)), b = readFileSync(dst);
    if (!a.equals(b)) { console.error(`백업 대조 실패: ${p}`); process.exit(1); }
    // sha256 = 바이트 그대로(되돌려 놓은 뒤 대조용) · sha256Lf = 줄끝을 LF 로 맞춘 뒤(영수증과 같은 계산)
    index.push({ path: p, bytes: a.length, sha256: rawSha(a), sha256Lf: sha256(a.toString('utf8')) });
  }
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ root: posix(root), head: s.plan.head, at: stamp, hash: { sha256: '바이트 그대로', sha256Lf: '줄끝을 LF 로 맞춘 뒤' }, files: index }, null, 2) + '\n', 'utf8');
  let evidence = null;
  const evFiles = [];
  const rt = s.plan.candidates.find((c) => c.kind === 'runtime');
  if (rt && s.answers.runtime === 'remove') {
    const common = path.resolve(root, git('rev-parse', '--git-common-dir').trim());
    evidence = path.join(common, 'harness-evidence', `${path.basename(root)}-${stamp}`);
    for (const p of rt.data.paths) {
      const dst = path.join(evidence, 'files', p);
      mkdirSync(path.dirname(dst), { recursive: true });
      copyFileSync(abs(p), dst);
      evFiles.push({ path: p, bytes: statSync(dst).size });
    }
  }
  s.backup = { dir: posix(dir), evidence: evidence && posix(evidence), files: index.map((f) => f.path), evidenceFiles: evFiles, plannedFiles: paths.length, missing };
  s.done.push('backup');
  saveState(s);
  const same = index.length === paths.length;
  console.log(`백업 ${index.length}개 ${same ? '=' : '≠'} 후보 파일 ${paths.length}개${same ? '' : ' — 맞지 않는다. 멈추고 보고한다'} → ${dir}`);
  if (missing.length) console.log(`INFO 후보 경로 ${planned.length}개 중 ${missing.length}개는 이미 없어 백업하지 않았다: ${missing.join(', ')}`);
  if (evidence) console.log(`증거 사본(계측 로그) ${evFiles.length}개 → ${evidence}  (걷어내기 직전에 한 번 더 맞춘다)`);
  console.log(`되돌리기: cp -r "${posix(dir)}/files/." "${posix(root)}/"${evidence ? ` && cp -r "${posix(evidence)}/files/." "${posix(root)}/"` : ''}  → 그 뒤 restore-check "${posix(root)}" "${posix(dir)}"${evidence ? ` "${posix(evidence)}"` : ''}`);
  if (!same) process.exit(1);
}

// ── apply · plugin ───────────────────────────────────────────────────────────

function writeKeep(rel, text) { writeFileSync(abs(rel), text, 'utf8'); }

/**
 * 런타임 산출물을 지우기 직전에 증거 사본을 지금 판으로 맞춘다.
 * 백업과 걷어내기 사이에도 살아 있는 훅이 로그에 줄을 더한다 — 백업 때 뜬 사본만 두고 지우면 그 줄을 잃는다.
 * 사본이 지금 파일의 앞부분이면(덧붙이기만 한 로그) 통째로 다시 복사하고, 아니면 지금 판을 at-apply/ 에 따로 둔다.
 * 백업 뒤 새로 생긴 런타임 파일도 사본에 더하고 지울 목록에 넣는다. @returns 모두 맞췄으면 true
 */
function syncEvidence(s, c) {
  const ev = s.backup.evidence;
  const now = walkDir('.harness').filter((p) => RUNTIME.test(p));
  for (const p of now) if (!c.data.paths.includes(p)) { c.data.paths.push(p); console.log(`INFO 백업 뒤 새로 생긴 런타임 파일 ${p} — 증거 사본에 더하고 함께 지운다`); }
  const legacy = (p) => path.join(ev, p);                  // 예전 체크포인트: <증거>/<경로>
  const target = (p) => path.join(ev, 'files', p);
  let ok = true;
  for (const p of c.data.paths) {
    if (!exists(p)) continue;
    const cur = readFileSync(abs(p));
    const dst = existsSync(target(p)) || !existsSync(legacy(p)) ? target(p) : legacy(p);
    const old = existsSync(dst) ? readFileSync(dst) : null;
    if (old && cur.equals(old)) { console.log(`INFO 증거 사본 ${p} — 백업 뒤 바뀐 것 없음`); continue; }
    let out = dst, note;
    if (!old) note = '새로 복사';
    else if (cur.length > old.length && cur.subarray(0, old.length).equals(old)) {
      const added = cur.subarray(old.length).toString('utf8').split('\n').filter(Boolean).length;
      note = `백업 뒤 더해진 ${added}줄까지 다시 복사`;
    } else { out = path.join(ev, 'at-apply', p); note = `백업 때 사본과 앞부분이 달라 지금 판을 따로 둔다(${posix(out)})`; }
    mkdirSync(path.dirname(out), { recursive: true });
    copyFileSync(abs(p), out);
    if (!readFileSync(out).equals(cur)) { console.log(`FAIL 증거 사본 대조 실패 ${p}`); ok = false; continue; }
    console.log(`OK   증거 사본 ${p} — ${note}`);
    const f = (s.backup.evidenceFiles ||= []).find((x) => x.path === p);
    if (f) f.bytes = cur.length; else s.backup.evidenceFiles.push({ path: p, bytes: cur.length });
  }
  saveState(s);
  return ok;
}

function apply() {
  const s = need(loadState());
  if (!s.backup) { console.error('백업이 없다 — 먼저 backup'); process.exit(2); }
  const done = new Set(s.applied);
  const mark = (id, msg) => { if (!done.has(id)) { s.applied.push(id); done.add(id); } console.log(msg); saveState(s); };
  const todo = (c) => !done.has(c.id) && ['remove', 'revert'].includes(s.answers[c.id]);
  const C = s.plan.candidates;

  // 1) 텍스트 — 파일마다 한 번에 쓴다
  const byFile = new Map();
  for (const c of C.filter((x) => x.kind === 'text' && todo(x))) { const l = byFile.get(c.data.path) || []; l.push(c); byFile.set(c.data.path, l); }
  for (const [p, cs] of byFile) {
    const before = read(p);
    const { text, results } = applyTextOps(before, cs.map((c) => ({ id: c.id, ...c.data.op })), p);
    if (text !== before) writeKeep(p, text);
    for (const c of cs) mark(c.id, `${results[c.id] === 'removed' || results[c.id] === 'reverted' ? 'OK  ' : 'SKIP'} ${results[c.id]} ${c.id}`);
  }
  // 2) settings — 훅 · false 키 (플러그인 키는 plugin 단계)
  for (const c of C.filter((x) => (x.kind === 'hook' || x.kind === 'key') && todo(x))) {
    const before = read(c.data.file);
    if (dupKeys(before).length) { console.log(`SKIP ${c.id} — ${c.data.file} 에 중복 키가 있다. 손으로 정리한 뒤 다시 apply`); continue; }
    const r = c.kind === 'hook' ? deleteHook(before, { event: c.data.event, command: c.data.command, matcher: c.data.matcher }) : deleteKey(before, c.data.keys);
    if (r.removed) { JSON.parse(r.text.replace(/^\uFEFF/, '')); writeKeep(c.data.file, r.text); }
    mark(c.id, `${r.removed ? 'OK  ' : 'SKIP'} ${r.removed ? 'removed' : 'not-found'} ${c.id}`);
  }
  // 3) 파일 — 보조 · config · 손댄/생긴 파일 · 골격 · 런타임
  const rmFile = (p) => { if (exists(p)) { rmSync(abs(p)); return true; } return false; };
  for (const c of C.filter((x) => ['file', 'files', 'runtime'].includes(x.kind) && todo(x))) {
    if (c.kind === 'runtime' && !s.backup.evidence) { console.log(`SKIP ${c.id} — 증거 사본이 없다`); continue; }
    if (c.kind === 'runtime' && !syncEvidence(s, c)) { console.log(`SKIP ${c.id} — 증거 사본을 지금 판으로 맞추지 못했다. 지우지 않는다`); continue; }
    const ps = c.data.paths || [c.data.path];
    const n = ps.filter(rmFile).length;
    mark(c.id, `OK   removed ${n}/${ps.length} ${c.id}`);
  }
  // 빈 디렉토리 정리 — .harness/ 와 보조 파일이 있던 디렉토리(설치가 만든 것만 비었을 때)
  const prune = (dir) => { if (!exists(dir) || !statSync(abs(dir)).isDirectory()) return; for (const e of readdirSync(abs(dir))) prune(`${dir}/${e}`); if (!readdirSync(abs(dir)).length) rmdirSync(abs(dir)); };
  prune('.harness');
  for (const c of C.filter((x) => x.data && x.data.aux && s.answers[x.id] === 'remove')) { const d = path.posix.dirname(c.data.path); if (d !== '.' && exists(d) && !readdirSync(abs(d)).length && !inHead(d)) rmdirSync(abs(d)); }
  // 4) 영수증 — 남긴 항목이 없을 때만
  const mc = C.find((x) => x.kind === 'manifest');
  if (mc && todo(mc)) {
    const kept = C.filter((x) => !['plugin', 'manifest'].includes(x.kind) && s.answers[x.id] === 'keep' && x.status !== 'modified');
    if (kept.length) console.log(`KEEP ${MANIFEST} — 남긴 항목 ${kept.map((x) => x.id).join(', ')} 의 기준으로 둔다`);
    else { rmFile(MANIFEST); mark(mc.id, `OK   removed ${MANIFEST}`); }
  }
  s.done.includes('apply') || s.done.push('apply');
  saveState(s);
}

function plugin() {
  const s = need(loadState());
  const c = s.plan.candidates.find((x) => x.kind === 'plugin');
  if (!c) { console.log('플러그인 키 후보 없음'); return; }
  const a = s.answers.plugin;
  if (!a) { console.error('plugin 답이 없다 — answer plugin=off|keep'); process.exit(2); }
  if (a === 'keep' || s.applied.includes('plugin')) { console.log(`플러그인 키: ${a === 'keep' ? '남김' : '이미 반영'}`); }
  else {
    let text = read(c.data.file);
    if (dupKeys(text).length) { console.error(`${c.data.file} 에 중복 키가 있다 — 손으로 정리한 뒤 다시 plugin`); process.exit(1); }
    for (const k of c.data.keys) text = deleteKey(text, k).text;
    JSON.parse(text.replace(/^\uFEFF/, ''));
    writeKeep(c.data.file, text);
    s.applied.push('plugin');
    console.log(`OK   removed ${c.data.keys.map((k) => k.join('.')).join(' · ')}`);
  }
  s.done.includes('plugin') || s.done.push('plugin');
  saveState(s);
}

// ── verify ───────────────────────────────────────────────────────────────────

function verify() {
  const s = need(loadState());
  let fail = 0;
  const bad = (m) => { fail++; console.log(`FAIL ${m}`); };
  const ok = (m) => console.log(`OK   ${m}`);
  const C = s.plan.candidates;
  const removed = (c) => ['remove', 'revert', 'off'].includes(s.answers[c.id]);

  // ① 남아선 안 되는 것
  for (const c of C.filter(removed)) {
    if (c.kind === 'file' && exists(c.data.path)) bad(`남아 있음 ${c.data.path}`);
    if (c.kind === 'manifest') s.applied.includes(c.id) ? (exists(c.data.path) ? bad(`남아 있음 ${c.data.path}`) : ok(`지워짐 ${c.data.path}`)) : console.log(`INFO ${c.data.path} 남김 — 남긴 항목의 기준`);
    if (['files', 'runtime'].includes(c.kind)) { const left = c.data.paths.filter(exists); left.length ? bad(`남아 있음 ${c.id} ${left.length}개`) : ok(`지워짐 ${c.id}`); }
  }
  // ② settings — 파싱 · 중복 키 · .harness 훅 · 하네스 아닌 훅과 다른 키가 백업과 같은가
  const bdir = s.backup && s.backup.dir;
  for (const sf of [SETTINGS, SETTINGS_LOCAL]) {
    if (!exists(sf)) continue;
    const text = read(sf);
    let json;
    try { json = JSON.parse(text.replace(/^\uFEFF/, '')); ok(`${sf} JSON 파싱`); } catch (e) { bad(`${sf} JSON 파싱 실패 ${e.message}`); continue; }
    const d = dupKeys(text);
    d.length ? bad(`${sf} 중복 키 ${d.join(', ')}`) : ok(`${sf} 중복 키 0`);
    const keptHooks = new Set(C.filter((c) => c.kind === 'hook' && c.data.file === sf && !removed(c)).map((c) => `${c.data.event}|${c.data.command}`));
    const left = hookEntries(json).filter((e) => /[\/\\]\.harness[\/\\]/.test(e.command || '') && !keptHooks.has(`${e.event}|${e.command}`));
    left.length ? bad(`${sf} .harness 훅 ${left.length}개 남음`) : ok(`${sf} .harness 훅 0 (남기기로 한 것 ${keptHooks.size})`);
    const bf = bdir && path.join(bdir, 'files', sf);
    if (bf && existsSync(bf)) {
      const b = JSON.parse(readFileSync(bf, 'utf8').replace(/^\uFEFF/, ''));
      const other = (j) => { const by = {}; for (const e of hookEntries(j)) if (!/[\/\\]\.harness[\/\\]/.test(e.command || '')) (by[e.event] ||= []).push(`${e.matcher ?? '*'} | ${JSON.stringify(e.hook)}`); return by; };
      const ob = other(b), oc = other(json);
      for (const ev of new Set([...Object.keys(ob), ...Object.keys(oc)])) {
        const x = JSON.stringify(ob[ev] || []), y = JSON.stringify(oc[ev] || []);
        x === y ? ok(`${sf} ${ev} 하네스 아닌 훅 ${(ob[ev] || []).length}개 그대로`) : bad(`${sf} ${ev} 하네스 아닌 훅이 달라짐 — 전 ${x} · 후 ${y}`);
      }
      for (const k of new Set([...Object.keys(b), ...Object.keys(json)])) {
        if (k === 'hooks') continue;
        if (k === 'enabledPlugins' || k === 'extraKnownMarketplaces') {
          const gone = new Set(C.filter((c) => removed(c) && (c.kind === 'key' || c.kind === 'plugin') && c.data.file === sf).flatMap((c) => (c.kind === 'key' ? [c.data.keys] : c.data.keys)).filter((ks) => ks[0] === k).map((ks) => ks[1]));
          for (const kk of new Set([...Object.keys(b[k] || {}), ...Object.keys(json[k] || {})])) {
            const was = JSON.stringify((b[k] || {})[kk]), now = JSON.stringify((json[k] || {})[kk]);
            const isPluginKey = C.some((c) => c.kind === 'plugin' && c.data.keys.some((ks) => ks[0] === k && ks[1] === kk));
            if (gone.has(kk)) {
              if (now === undefined) ok(`${sf} ${k}.${kk} 지워짐`);
              else if (isPluginKey && !s.applied.includes('plugin')) console.log(`INFO ${sf} ${k}.${kk} — plugin 단계 전`);
              else bad(`${sf} ${k}.${kk} 남아 있음`);
            } else if (was !== now) bad(`${sf} ${k}.${kk} 달라짐 ${was} → ${now}`);
          }
        } else if (JSON.stringify(b[k]) !== JSON.stringify(json[k])) bad(`${sf} 최상위 키 ${k} 달라짐`);
      }
    }
  }
  // ③ 후보 밖 파일 — 걷어내기 전과 같은가
  const candPaths = candidatePaths(s.plan);
  for (const [p, v] of Object.entries(s.plan.pre || {})) {
    if (!exists(p)) { bad(`후보 밖 파일이 사라짐 ${p}`); continue; }
    sha256(readFileSync(abs(p), 'utf8')) === v.sha ? null : bad(`후보 밖 파일이 바뀜 ${p}`);
  }
  const now = git('status', '--porcelain=v1', '-z', '--untracked-files=all').split('\0').filter(Boolean);
  const extra = now.map((e) => e.slice(3)).filter((p) => !candPaths.has(p) && !p.startsWith('.harness/') && !(p in (s.plan.pre || {})));
  extra.length ? bad(`후보 밖에서 새로 바뀐 파일 ${extra.join(', ')}`) : ok(`후보 밖 변경 없음 (걷어내기 전부터 있던 ${Object.keys(s.plan.pre || {}).length}개 그대로)`);
  // ④ 남은 참조
  const refs = findRefs(s.plan, Object.fromEntries(C.map((c) => [c.id, 'keep'])));
  const by = {};
  for (const r of refs) (by[r.path] ||= []).push(r);
  console.log(`INFO 남은 참조 ${refs.length}줄 (.harness · harness.config · harness.install · harness-kit · 보조 파일 이름)`);
  for (const [f, rs] of Object.entries(by)) console.log(`     ${f}: ${rs.map((r) => r.line).join(', ')}행 — ${rs[0].text.slice(0, 90)}`);
  // ⑤ git status · 커밋 경로
  const st = git('status', '--short', '--untracked-files=all');
  console.log(`INFO git status --short ${st.trim() ? st.trim().split('\n').length : 0}줄`);
  if (st.trim()) console.log(st.trimEnd().split('\n').map((l) => `     ${l}`).join('\n'));
  // 커밋 경로 = 추적 중인 후보 중 HEAD 와 다르고, 걷어 낸 조각이 HEAD 에 있던 것.
  // 설치가 커밋되지 않은 트리에서는 걷어내기가 작업본을 HEAD 쪽으로 되돌릴 뿐이라, HEAD 와 남은 차이는
  // 손대지 않은 문서 줄·남긴 키 같은 설치의 남은 조각이다 — 그것을 커밋하면 「제거」가 아니라 「설치 일부」 커밋이 된다.
  const isTracked = (p) => git('ls-files', '--', p).trim() !== '' || inHead(p);
  const changed = [...candPaths].filter((p) => isTracked(p) && git('status', '--porcelain', '--', p).trim() !== '').sort();
  const differs = changed.filter((p) => tryGit('diff', '--quiet', 'HEAD', '--', p) === null);
  for (const p of changed.filter((x) => !differs.includes(x))) console.log(`INFO ${p} — status 는 M 이지만 HEAD 와 내용이 같다(줄끝만 다름: 설치가 다른 줄끝으로 썼다). 커밋 대상 아님`);
  const commitPaths = [], notRemoval = [];
  for (const p of differs) {
    const r = removalAtHead(s, p);
    if (!r.hit) { notRemoval.push(p); console.log(`INFO ${p} — HEAD 에 걷어 낸 조각이 없다(${r.why}). HEAD 와 남은 차이는 걷어내기 결과가 아니다 — 커밋 대상 아님`); continue; }
    commitPaths.push(p);
    if (r.mixed) console.log(`INFO ${p} — 걷어내기 말고도 HEAD 와 다른 곳이 있다(남긴 항목 · 커밋되지 않은 설치 조각 · 하네스와 무관한 변경). 경로 지정 커밋에 함께 실린다`);
  }
  const ia = s.plan.installAtHead || installAt(s.plan.head);
  const committed = ia.config || ia.harnessDir || ia.manifest;
  const reason = commitPaths.length ? null
    : !committed ? `설치가 HEAD(${s.plan.head.slice(0, 7)})에 커밋된 적이 없다 — 걷어내기는 작업본을 HEAD 쪽으로 되돌렸을 뿐이다${notRemoval.length ? `. HEAD 와 남은 차이 ${notRemoval.length}개(${notRemoval.join(' ')})는 설치의 남은 조각이라 커밋하지 않는다` : ''}`
    : 'HEAD 와 다른 후보 경로가 없다';
  console.log(`INFO 커밋 경로(추적 중인 후보 중 걷어 낸 조각이 HEAD 에 있던 것) ${commitPaths.length}개${commitPaths.length ? `: ${commitPaths.join(' ')}` : ` — 커밋하지 않는다. 메시지 파일도 만들지 않는다. 이유: ${reason}`}`);
  // ⑥ 보고용 요약 — 보고의 수와 경로는 여기서 옮긴다(손으로 세지 않는다)
  printSummary(s);
  console.log(`failures=${fail}`);
  s.done.includes('verify') || s.done.push('verify');
  s.lastVerify = { at: new Date().toISOString(), failures: fail, commitPaths, noCommitReason: reason, notRemoval };
  saveState(s);
  process.exit(fail ? 1 : 0);
}

/** 이 경로에서 실제로 걷어 낸 연산을 HEAD 판에 똑같이 해 보아, HEAD 에 그 조각이 있었는지 가린다. */
function removalAtHead(s, p) {
  if (!inHead(p)) return { hit: false, why: 'HEAD 에 없는 파일' };
  const applied = new Set(s.applied);
  const C = s.plan.candidates.filter((c) => applied.has(c.id));
  if (!exists(p)) return C.some((c) => (c.data.paths || [c.data.path]).includes(p)) ? { hit: true, mixed: false } : { hit: false, why: '걷어내기가 지운 파일이 아님' };
  let text = tryGit('show', `HEAD:${p}`);
  if (text === null) return { hit: false, why: 'HEAD 판을 읽지 못함' };
  let hit = false;
  const ops = C.filter((c) => c.kind === 'text' && c.data.path === p).map((c) => ({ id: c.id, ...c.data.op }));
  if (ops.length) { const r = applyTextOps(text, ops, p); text = r.text; hit = Object.values(r.results).some((v) => v === 'removed' || v === 'reverted'); }
  for (const c of C.filter((x) => ['hook', 'key', 'plugin'].includes(x.kind) && x.data.file === p)) {
    try {
      const steps = c.kind === 'hook' ? [(t) => deleteHook(t, { event: c.data.event, command: c.data.command, matcher: c.data.matcher })]
        : (c.kind === 'key' ? [c.data.keys] : c.data.keys).map((ks) => (t) => deleteKey(t, ks));
      for (const f of steps) { const r = f(text); if (r.removed) { hit = true; text = r.text; } }
    } catch { /* HEAD 판이 JSON 이 아니면 그 조각은 HEAD 에 없다 */ }
  }
  if (!hit) return { hit: false, why: ops.length ? '지운 블록·줄이 HEAD 판에 없음' : '지운 훅·키가 HEAD 판에 없음' };
  return { hit: true, mixed: normEol(text) !== normEol(read(p)) };
}

function printSummary(s) {
  const C = s.plan.candidates, A = s.answers;
  const count = (v) => C.filter((c) => A[c.id] === v).length;
  const skipped = C.filter((c) => ['remove', 'revert', 'off'].includes(A[c.id]) && !s.applied.includes(c.id)).map((c) => c.id);
  console.log('\n요약 — 보고의 수·경로는 이 블록에서 옮긴다');
  console.log(`  후보 ${C.length}개 (플러그인 키 포함) · 지움 ${count('remove')} · 되돌림 ${count('revert')} · 끔 ${count('off')} · 남김 ${count('keep')} · 미답 ${C.filter((c) => !(c.id in A)).length}`);
  console.log(`  적용 ${s.applied.length}건${skipped.length ? ` · 지우기로 했는데 적용 안 된 것 ${skipped.length}개: ${skipped.join(', ')}` : ''}`);
  if ((s.filledByDefault || []).length) console.log(`  권장이 없어 keep 으로 채운 칸 ${s.filledByDefault.length}개: ${s.filledByDefault.join(', ')}`);
  if (!s.backup) { console.log('  백업 없음'); return; }
  const bdir = path.resolve(s.backup.dir), ev = s.backup.evidence && path.resolve(s.backup.evidence);
  console.log(`  백업 ${s.backup.files.length}개${s.backup.plannedFiles != null ? ` (후보 파일 ${s.backup.plannedFiles}개)` : ''}: ${bdir}`);
  if (ev) console.log(`  증거 사본(계측 로그) ${(s.backup.evidenceFiles || []).length}개: ${ev}`);
  console.log(`  되돌리기: cp -r "${posix(bdir)}/files/." "${posix(root)}/"${ev ? ` && cp -r "${posix(ev)}/files/." "${posix(root)}/"` : ''} → restore-check "${posix(root)}" "${posix(bdir)}"${ev ? ` "${posix(ev)}"` : ''}`);
  console.log(`  백업 수명: ${isWorktree() ? `이 트리는 worktree 라 백업이 ${posix(path.dirname(bdir))} 아래(.git/worktrees/<이름>/)에 있다 — git worktree remove 하면 백업도 함께 지워진다` : '백업은 이 저장소의 .git 아래에 있다 — 저장소를 지우면 함께 지워진다'}. 재설치할 수 있으면 레포 밖으로 옮겨 둔다`);
  if (ev) console.log(`  증거 사본 수명: git-common-dir 아래라 worktree 를 지워도 남는다 — 필요 없어지면 손으로 지운다`);
}

/** 백업을 되돌려 놓은 뒤 대조한다 — 체크포인트 없이(finish 뒤에도) 돈다. */
function restoreCheck() {
  const [bdirArg, evArg] = args;
  if (!bdirArg) { console.error('사용: restore-check <레포 루트> <백업 디렉토리> [증거 디렉토리]'); process.exit(2); }
  const idx = JSON.parse(readFileSync(path.join(path.resolve(bdirArg), 'index.json'), 'utf8'));
  let fail = 0;
  for (const f of idx.files) {
    if (!exists(f.path)) { fail++; console.log(`FAIL 없음 ${f.path}`); continue; }
    const buf = readFileSync(abs(f.path));
    if (RUNTIME.test(f.path) && evArg) {
      const e = [path.join(path.resolve(evArg), 'files', f.path), path.join(path.resolve(evArg), f.path)].find((x) => existsSync(x));
      if (e) { readFileSync(e).equals(buf) ? console.log(`OK   ${f.path} (증거 사본과 같음)`) : (fail++, console.log(`FAIL ${f.path} — 증거 사본과 다르다`)); continue; }
    }
    // 예전 백업은 sha256 이 LF 정규화 해시였다 — sha256Lf 가 없으면 그쪽으로 본다
    const ok = f.sha256Lf ? rawSha(buf) === f.sha256 : sha256(buf.toString('utf8')) === f.sha256;
    ok ? console.log(`OK   ${f.path}`) : (fail++, console.log(`FAIL ${f.path} — 백업과 다르다`));
  }
  console.log(`대조 ${idx.files.length}개 · failures=${fail}${fail ? '' : ' — 백업 때와 같다. 하네스 훅이 되살아났으니 새 세션을 연다'}`);
  process.exit(fail ? 1 : 0);
}

function finish() {
  const s = loadState();
  if (!s) { console.log('체크포인트 없음'); return; }
  rmSync(statePath);
  console.log(`체크포인트를 지웠다. 백업은 남는다: ${s.backup ? path.resolve(s.backup.dir) : '(없음)'}${s.backup && s.backup.evidence ? `\n증거: ${path.resolve(s.backup.evidence)}` : ''}`);
}

const table = { scan, status: () => printPlan(need(loadState())), answer, backup, apply, plugin, verify, finish, 'restore-check': restoreCheck };
if (!table[cmd]) { console.error(`모르는 명령: ${cmd}`); process.exit(2); }
await table[cmd]();
