#!/usr/bin/env node
/**
 * harness-uninstall 보조 스크립트 — 후보 뽑기 · 답 기록 · 백업 · 걷어내기 · 플러그인 키 · 검증.
 *
 * 사용: node uninstall.mjs <명령> <레포 루트> [인자…]
 *   sessions [--self <id>] [--projects <디렉토리>]   같은 트리의 다른 Claude 세션 — 마지막 기록 시각(0단계, 체크포인트 없이 돈다)
 *   scan    [--refresh]            후보를 뽑아 체크포인트에 계획으로 적는다(영수증이 있으면 영수증 기준 · 앞선 걷어내기 백업도 본다)
 *   status                          계획·답·진행을 보인다
 *   answer  <id>=<값>… | --recommended   답을 적는다. purpose=reinstall|remove 도 여기서
 *   backup                          손댈 파일 전부를 git-path 아래로, 런타임 산출물을 git-common-dir 아래로 복사
 *   apply                           플러그인 키를 뺀 나머지를 걷어 낸다(다시 돌려도 안전)
 *   plugin                          플러그인 키 답(off|keep)을 반영하고 settings 스냅숏(after-plugin/)을 뜬다
 *   records [--records <파일>]      이 트리의 플러그인 설치 기록만 골라 CLI 를 권할지 정한다(다른 트리 기록은 보고만)
 *   after-cli                       CLI 뒤 settings 를 after-plugin 스냅숏과 대조해 달라졌으면 스냅숏 바이트로 되덮는다
 *   verify                          남은 참조 · settings 대조 · 후보 밖 변경 · git status · 커밋 경로 · 보고용 요약
 *   eol-fix <경로>…                 HEAD 와 내용이 같고 줄끝만 다른 파일을 체크아웃 판 바이트로 쓴다(git 은 부르지 않는다)
 *   finish                          체크포인트를 지운다(백업은 남긴다) — 보고를 사용자에게 보인 뒤에 부른다
 *   restore-check <백업 디렉토리> [증거 디렉토리]   백업을 되돌려 놓은 뒤 index.json 과 바이트 대조(체크포인트 없이 돈다)
 *
 * 순서: scan → answer → backup → apply → plugin → records → (CLI 를 돌렸으면) after-cli → verify → 보고 → finish
 * 시험용 바꿔치기: HARNESS_UNINSTALL_PLUGINS_JSON(설치 기록 파일) · HARNESS_UNINSTALL_PROJECTS_DIR(세션 기록 디렉토리)
 *
 * 인자에는 경로·후보 id·답만 넘긴다. 명령 문자열을 셸 인자로 넘기지 않는다(실행 전 가드가 그 문자열을 본다).
 * 이 스크립트는 git 에 쓰지 않는다 — add·commit·restore·checkout 을 부르지 않는다.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync, readdirSync, statSync, rmdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  sha256, normEol, splitLines, body, marksFor, MARKS, findMarked, findSection, findPointerLines, findIgnoreGroups,
  rangeSha, widen, countText, toFileEol, applyTextOps, deleteKey, deleteHook, hookEntries, dupKeys, findKey, parseSpans,
} from './edit.mjs';

const [cmd, rootArg, ...args] = process.argv.slice(2);
if (!cmd || !rootArg) { console.error('사용: node uninstall.mjs <sessions|scan|status|answer|backup|apply|plugin|records|after-cli|verify|eol-fix|finish|restore-check> <레포 루트> [인자…]'); process.exit(2); }
const root = path.resolve(rootArg);
/** 이 스크립트의 절대경로 — 되돌리기 줄을 그대로 복사해 돌릴 수 있게 출력에 넣는다. */
const SELF = fileURLToPath(import.meta.url);
const selfCmd = (sub, ...a) => `node "${SELF.split(path.sep).join('/')}" ${sub} ${a.map((x) => `"${x}"`).join(' ')}`.trimEnd();
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
/** 경로 비교용 — 슬래시를 맞추고 끝 슬래시를 떼며, Windows 에서는 대소문자를 무시한다. */
const normPath = (p) => { const x = path.resolve(String(p)).replace(/\\/g, '/').replace(/\/+$/, ''); return process.platform === 'win32' ? x.toLowerCase() : x; };
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
/** docs-setup 이 config 에 채운 칸(줄 끝 `// harness-kit:docs-setup`) — 걷어내기 후보가 아니라 따로 보고하고 백업 index.json 에 적는다. */
const DOCS_SETUP_MARK = /\/\/\s*harness-kit:docs-setup\b/;
const docsSetupLib = await import(new URL('../../docs-setup/scripts/config-slots.mjs', import.meta.url).href).catch(() => null);

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
const commonDir = () => path.resolve(root, git('rev-parse', '--git-common-dir').trim());
const isWorktree = () => path.resolve(root, git('rev-parse', '--git-dir').trim()) !== commonDir();
/** worktree 면 메인 트리 루트(공용 .git 의 부모), 아니면 null. */
const mainRoot = () => (isWorktree() && path.basename(commonDir()) === '.git' ? path.dirname(commonDir()) : null);
/** 체크아웃 판의 바이트 — git 이 이 경로를 HEAD 에서 꺼낼 때 쓸 바이트(줄끝 변환 포함). HEAD 에 없으면 null. */
const checkoutBytes = (rel) => { try { return execFileSync('git', ['-C', root, 'cat-file', '--filters', `HEAD:${rel}`], { maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
const eolName = (s) => (/\r\n/.test(s) ? 'CRLF' : 'LF');
/** 앞선 걷어내기의 백업 — 새것부터. index.json 을 읽지 못한 디렉토리는 뺀다. */
function priorRuns(exclude = null) {
  const base = gitPath('harness-uninstall-backup');
  if (!existsSync(base)) return [];
  return readdirSync(base).sort().reverse().map((d) => {
    const dir = path.join(base, d);
    if (exclude && normPath(dir) === normPath(exclude)) return null;
    try { return { dir, at: d, idx: JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8')) }; } catch { return null; }
  }).filter(Boolean);
}
/** 이 트리 이름으로 git-common-dir/harness-evidence/ 아래 남은 증거 사본 디렉토리. */
function evidenceDirs(exclude = null) {
  const base = path.join(commonDir(), 'harness-evidence');
  if (!existsSync(base)) return [];
  const name = path.basename(root);
  return readdirSync(base).filter((d) => {
    const dir = path.join(base, d);
    if (exclude && normPath(dir) === normPath(exclude)) return false;
    try { const m = JSON.parse(readFileSync(path.join(dir, 'evidence.json'), 'utf8')); if (m.root) return normPath(m.root) === normPath(root); } catch { /* 예전 사본은 evidence.json 이 없다 — 이름으로 가린다 */ }
    return d.startsWith(`${name}-`) && /^\d{4}-\d{2}-\d{2}T/.test(d.slice(name.length + 1));
  }).sort().map((d) => path.join(base, d));
}

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
  else if (exists(CONFIG)) for (const m of read(CONFIG).split('\n').filter((l) => !DOCS_SETUP_MARK.test(l)).join('\n').matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
const loadJson = (rel) => { try { return JSON.parse(read(rel).replace(/^\uFEFF/, '')); } catch { return null; } };
/** docs-setup 소유 칸 — 값은 import 한 config 에서, 경로는 표시 줄에서. 영수증 owners["docs-setup"] 도 함께 싣는다. */
function docsSetupSlots(cfg, mf) {
  if (!exists(CONFIG)) return null;
  const text = read(CONFIG);
  const manifest = (mf && mf.owners && mf.owners['docs-setup']) || null;
  if (!DOCS_SETUP_MARK.test(text) && !manifest) return null;
  const get = (p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), cfg && !cfg.__error ? cfg : undefined);
  if (!docsSetupLib) return { slots: [], blocks: [], errors: ['docs-setup 의 config-slots.mjs 를 읽지 못했다 — 표시 줄은 백업 config 에만 남는다'], manifest };
  const o = docsSetupLib.ownedSlots(text);
  return { slots: o.slots.map((s) => ({ path: s.path, ...(cfg && !cfg.__error ? { value: get(s.path) ?? null } : {}), text: s.text.trim(), comment: s.comment })), blocks: o.blocks.map((b) => b.path), errors: o.errors, manifest };
}

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
  // 앞선 걷어내기 — 그때 남긴 보조 파일은 config 가 지워진 뒤라 config 로는 다시 못 찾는다. 백업 index.json 에서 되찾는다
  const prevBackup = prev && prev.backup && prev.backup.dir;
  const prior = priorRuns(prevBackup);
  const KNOWN = (p) => p.startsWith('.harness/') || [CONFIG, MANIFEST, SETTINGS, SETTINGS_LOCAL, '.gitignore', 'CLAUDE.md', '.claude/CLAUDE.md'].includes(p);
  for (const run of prior) {
    const cs = run.idx.candidates;
    const priorAux = cs ? cs.filter((c) => c.aux).flatMap((c) => c.paths.map((p) => ({ p, answer: c.answer })))
      : (run.idx.files || []).map((f) => ({ p: f.path, answer: null })).filter(({ p }) => !KNOWN(p) && /harness/i.test(path.posix.basename(p)));
    for (const { p, answer } of priorAux) {
      if (auxPaths.has(p) || !exists(p)) continue;
      const copy = path.join(run.dir, 'files', p);
      const same = existsSync(copy) ? (sha256(readFileSync(copy, 'utf8')) === fileSha(p) ? ' · 그때 백업과 같음' : ' · 그때 백업과 다름(그 뒤 손댐)') : '';
      auxPaths.set(p, { why: `앞선 걷어내기(${run.at})${answer === 'keep' ? '에서 남긴' : cs ? '의' : ' 백업에 있던'} 보조 파일${cs ? '' : ' · 이름에 harness'}${same}`, prior: run.at });
    }
  }
  // config 없이 — 이름에 harness 가 있고 미추적이거나 설치 커밋에서 생긴 파일. 근거가 약해 권장 없이 묻는다
  if (!exists(CONFIG)) for (const p of files.all) {
    if (KNOWN(p) || p === MANIFEST || auxPaths.has(p) || !/harness/i.test(path.posix.basename(p))) continue;
    const together = installCommit ? (tryGit('log', '--diff-filter=A', '--format=%H', '--', p) || '').includes(installCommit) : files.untracked.has(p);
    if (together) auxPaths.set(p, { why: `이름에 harness${installCommit ? ' · 설치 커밋에서 생김' : ' · 미추적'} — config 가 없어 설치가 만든 파일인지 근거가 약하다`, weak: true });
  }
  for (const [p, { why, m, weak }] of auxPaths) {
    if (!exists(p)) { warnings.push(`보조 파일 ${p} 가 이미 없다`); continue; }
    const status = !m ? 'unknown' : m.sha256 === fileSha(p) ? 'clean' : 'modified';
    add({ id: `file:${p}`, kind: 'file', group: 'aux', title: `보조 파일 ${p}${status === 'modified' ? ' — 설치 뒤 손댄 파일' : ''}`, status, recommend: weak ? null : status === 'modified' ? 'keep' : 'remove', basis: why, data: { path: p, aux: true } });
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
      // graft 로컬 연결(D9)의 /graft/ 줄 — graft 가 아직 이 트리에 연결돼 있으면, 지우는 순간 graft build 가 표시 없는 줄을 다시 덧붙인다
      const inner = lines.slice(b.start + 1, b.end).map((l) => body(l).trim()).filter((l) => l && !l.startsWith('#'));
      const graftWired = p === '.gitignore' && inner.length === 1 && inner[0] === '/graft/' && exists('.claude/helpers/graft-hooks.cjs');
      add({ id: `text:${p}#block${i + 1}`, kind: 'text', group: 'text', title: `${p} 표시 블록 ${i + 1} (${b.end - b.start + 1}줄: ${first.slice(0, 40)})`, status,
        recommend: graftWired ? 'keep' : 'remove',
        basis: graftWired ? 'graft 가 이 트리에 아직 연결돼 있다(.claude/helpers/graft-hooks.cjs) — 지우면 다음 graft build 가 표시 없는 /graft/ 줄을 다시 덧붙인다. graft 로컬 연결을 먼저 걷어 냈으면(0-2단계) 지운다'
          : status === 'modified' ? '설치 뒤 블록 안을 고쳤다 — 하네스 안내뿐이라 지우고 백업본에 남긴다' : '시작·끝 표시로 감싼 설치 블록', data: { path: p, op: { op: 'block', sha } } });
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
    source: mf.source || (exists(CONFIG) ? { headLine: body(splitLines(read(CONFIG))[0] || '').slice(0, 200) } : null), captured, candidates: cands, warnings,
    docsSetup: docsSetupSlots(cfg, manifest) };
  const cfgCand = cands.find((c) => c.id === `file:${CONFIG}`);
  if (cfgCand && plan.docsSetup && plan.docsSetup.slots.length) cfgCand.basis += ` · docs-setup 칸 ${plan.docsSetup.slots.length}개가 함께 지워진다 — 값은 백업에 남고, 재설치 때 harness-install D8-2 가 되살릴지 묻는다`;
  plan.refs = findRefs(plan, Object.fromEntries(cands.map((c) => [c.id, c.recommend ?? 'keep'])), files);
  for (const c of cands.filter((x) => x.data && x.data.aux)) {
    const base = path.posix.basename(c.data.path);
    const hits = plan.refs.filter((r) => r.text.includes(base));
    if (hits.length && c.recommend !== 'keep') { c.recommend = 'keep'; c.basis += ` · 다른 파일 ${new Set(hits.map((h) => h.path)).size}곳 ${hits.length}줄이 가리킨다 — 지우면 그 안내가 끊긴다(참조는 보고만)`; }
  }
  plan.refs = findRefs(plan, Object.fromEntries(cands.map((c) => [c.id, c.recommend ?? 'keep'])), files);
  plan.prior = prior.map((r) => ({ dir: posix(r.dir), at: r.at, files: (r.idx.files || []).length }));

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
  console.log('다음: 2단계 결정 질문(목적 → 계측로그 → 항목 → 손댄 것) → answer → backup');
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
  if ((p.prior || []).length) console.log(`앞선 걷어내기 백업 ${p.prior.length}개 (그때 남긴 보조 파일을 여기서 되찾는다): ${p.prior.map((r) => `${r.at} · 파일 ${r.files}개`).join(' / ')}`);
  printDocsSetup(p.docsSetup, '');
  console.log('\nid | 질문 header | 상태 | 권장 | 답 | 항목 — 근거');
  for (const c of p.candidates) console.log(`${c.id} | ${c.header} | ${c.status} | ${recOf(c, s) ?? '권장 없음'} | ${s.answers[c.id] ?? '-'} | ${c.title} — ${c.basis}`);
  const by = {};
  for (const r of p.refs) (by[r.path] ||= []).push(r);
  console.log(`\n남을 참조 ${p.refs.length}줄 · ${Object.keys(by).length}곳 (지우지 않고 보고만 — 보고의 수는 이 줄에서 옮긴다):`);
  for (const [f, rs] of Object.entries(by)) console.log(`  ${f}: ${rs.map((r) => r.line).join(', ')}행 — ${rs[0].text.slice(0, 90)}`);
}

/** docs-setup 소유 칸 — 후보가 아니다. config 와 함께 백업에 남고, docs-setup 재실행이나 harness-install D8-2 가 되살린다. */
function printDocsSetup(ds, indent, bdir = null) {
  if (!ds) return;
  const n = ds.slots.length;
  console.log(`${indent}docs-setup 칸 ${n}개${(ds.blocks || []).length ? ` · 블록 ${ds.blocks.join(' · ')}` : ''} — 걷어내기 후보가 아니다(docs-setup 이 채운 값)${ds.manifest ? ` · 영수증 owners["docs-setup"] ${ds.manifest.slots.length}칸` : ''}`);
  for (const sl of ds.slots) console.log(`${indent}  ${sl.path} = ${'value' in sl ? JSON.stringify(sl.value) : '(config 를 import 하지 못해 값은 백업 config 의 줄로만 남는다)'}`);
  for (const e of ds.errors || []) console.log(`${indent}  WARN ${e}`);
  if (bdir) console.log(`${indent}  값은 백업 ${posix(path.join(bdir, 'files', CONFIG))} 와 index.json 의 docsSetup 에 남았다. 되살리는 길: ① 새 설치 뒤 docs-setup 을 다시 돌린다 ② 재설치면 harness-install D8-2 가 최신 백업에서 되살릴지 묻는다(가리키는 폴더·파일이 남아 있으면 권장 「되살림」). 옮긴 문서·배너·docs/README.md·CLAUDE.md 표는 손대지 않았다`);
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
  const leftBeforeBackup = left.filter((id) => id !== 'plugin');
  if (!leftBeforeBackup.length && !s.backup) console.log(`다음: backup${left.includes('plugin') ? ' (kit 키 질문은 5단계)' : ''}`);
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
  mkdirSync(path.join(dir, 'files'), { recursive: true });   // 후보 파일이 0개여도 index.json 자리는 있어야 한다
  for (const p of paths) {
    const dst = path.join(dir, 'files', p);
    mkdirSync(path.dirname(dst), { recursive: true });
    copyFileSync(abs(p), dst);
    const a = readFileSync(abs(p)), b = readFileSync(dst);
    if (!a.equals(b)) { console.error(`백업 대조 실패: ${p}`); process.exit(1); }
    // sha256 = 바이트 그대로(되돌려 놓은 뒤 대조용) · sha256Lf = 줄끝을 LF 로 맞춘 뒤(영수증과 같은 계산)
    index.push({ path: p, bytes: a.length, sha256: rawSha(a), sha256Lf: sha256(a.toString('utf8')) });
  }
  // candidates — 다음 걷어내기가 이 판의 후보와 답(특히 남긴 보조 파일)을 되찾는 근거다. config 가 지워진 뒤에는 이것뿐이다
  const candidates = s.plan.candidates.map((c) => ({ id: c.id, kind: c.kind, aux: !!(c.data && c.data.aux), paths: [...new Set([c.data && c.data.path, ...((c.data && c.data.paths) || []), c.data && c.data.file].filter(Boolean))], answer: s.answers[c.id] ?? null }));
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ root: posix(root), head: s.plan.head, at: stamp, purpose: s.purpose, hash: { sha256: '바이트 그대로', sha256Lf: '줄끝을 LF 로 맞춘 뒤' }, files: index, candidates, ...(s.plan.docsSetup ? { docsSetup: s.plan.docsSetup } : {}) }, null, 2) + '\n', 'utf8');
  let evidence = null;
  const evFiles = [];
  const rt = s.plan.candidates.find((c) => c.kind === 'runtime');
  if (rt && s.answers.runtime === 'remove') {
    evidence = path.join(commonDir(), 'harness-evidence', `${path.basename(root)}-${stamp}`);
    for (const p of rt.data.paths) {
      const dst = path.join(evidence, 'files', p);
      mkdirSync(path.dirname(dst), { recursive: true });
      copyFileSync(abs(p), dst);
      evFiles.push({ path: p, bytes: statSync(dst).size });
    }
    writeFileSync(path.join(evidence, 'evidence.json'), JSON.stringify({ root: posix(root), at: stamp }, null, 2) + '\n', 'utf8');
  }
  s.backup = { dir: posix(dir), evidence: evidence && posix(evidence), files: index.map((f) => f.path), evidenceFiles: evFiles, plannedFiles: paths.length, missing };
  s.done.push('backup');
  saveState(s);
  const same = index.length === paths.length;
  console.log(`백업 ${index.length}개 ${same ? '=' : '≠'} 후보 파일 ${paths.length}개${same ? '' : ' — 맞지 않는다. 멈추고 보고한다'} → ${dir}`);
  if (missing.length) console.log(`INFO 후보 경로 ${planned.length}개 중 ${missing.length}개는 이미 없어 백업하지 않았다: ${missing.join(', ')}`);
  if (evidence) console.log(`증거 사본(계측 로그) ${evFiles.length}개 → ${evidence}  (걷어내기 직전에 한 번 더 맞춘다)`);
  restoreLines(dir, evidence).forEach((l) => console.log(l));
  if (!same) process.exit(1);
  console.log('다음: apply');
}

/** 되돌리기 줄 — 복사해 그대로 돌릴 수 있는 명령(스크립트 절대경로 포함)과, 플러그인 사본이 없어졌을 때의 손 절차. */
function restoreLines(bdir, ev, indent = '') {
  const cp = `cp -r "${posix(bdir)}/files/." "${posix(root)}/"${ev ? ` && cp -r "${posix(ev)}/files/." "${posix(root)}/"` : ''}`;
  return [
    `${indent}되돌리기: ${cp} && ${selfCmd('restore-check', posix(root), posix(bdir), ...(ev ? [posix(ev)] : []))}`,
    `${indent}되돌리기(스크립트가 없을 때 — kit 키를 지워 플러그인 사본이 사라졌으면): ${cp} 를 돌린 뒤 git -C "${posix(root)}" status --short 와 git -C "${posix(root)}" diff 로 걷어내기 전 상태인지 본다(index.json 의 sha256 은 바이트 해시라 sha256sum 과 대조할 수 있다)`,
  ];
}

// ── apply · plugin ───────────────────────────────────────────────────────────

/**
 * 걷어 낸 결과를 쓴다 — 바이트는 그대로 두되, 결과가 HEAD 와 내용이 같아졌는데 줄끝만 체크아웃 판과 다르면
 * 체크아웃 판 바이트(git cat-file --filters)로 쓴다. 설치(또는 플러그인 CLI)가 CRLF 체크아웃 파일을 LF 로 다시 써서,
 * 내용은 HEAD 와 같은데 status 만 M 으로 남던 것을 막는다. 내용이 HEAD 와 다르면 줄끝도 손대지 않는다.
 */
function writeKeep(rel, text) {
  const co = checkoutBytes(rel);
  if (co && co.toString('utf8') !== text && normEol(co.toString('utf8')) === normEol(text)) {
    writeFileSync(abs(rel), co);
    console.log(`INFO ${rel} — 걷어 낸 결과가 HEAD 와 내용이 같아져 줄끝을 체크아웃 판(${eolName(co.toString('utf8'))})에 맞췄다(전에는 ${eolName(text)})`);
    return;
  }
  writeFileSync(abs(rel), text, 'utf8');
}

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
  let n0 = 0, skips = 0;
  const mark = (id, msg) => { if (!done.has(id)) { s.applied.push(id); done.add(id); n0++; } console.log(msg); saveState(s); };
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
  skips = s.plan.candidates.filter((c) => c.kind !== 'plugin' && ['remove', 'revert'].includes(s.answers[c.id]) && !s.applied.includes(c.id)).length;
  console.log(n0 ? `적용 ${n0}건 (이번 실행 · 누계 ${s.applied.length}건)${skips ? ` · 적용 안 된 것 ${skips}개(위 SKIP·KEEP 줄)` : ''} — 플러그인 키는 5단계`
    : `적용 0건 (플러그인 키는 5단계)${skips ? ` · 적용 안 된 것 ${skips}개(위 SKIP·KEEP 줄)` : s.applied.length ? ` · 누계 ${s.applied.length}건은 앞선 실행에서 적용` : ' — 지우기·되돌리기로 답한 항목이 플러그인 키 말고는 없다'}`);
  console.log('다음: 5단계 kit 키 질문 → answer plugin=off|keep → plugin');
}

function plugin() {
  const s = need(loadState());
  const c = s.plan.candidates.find((x) => x.kind === 'plugin');
  if (!c) { console.log('플러그인 키 후보 없음'); return; }
  const a = s.answers.plugin;
  if (!a) { console.error('plugin 답이 없다 — answer plugin=off|keep'); process.exit(2); }
  if (!s.backup) { console.error('백업이 없다 — 먼저 backup'); process.exit(2); }
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
  if (!s.afterPlugin) snapshotAfterPlugin(s);
  else console.log(`INFO after-plugin 스냅숏이 이미 있다: ${s.afterPlugin.dir} — 다시 뜨지 않는다`);
  saveState(s);
  console.log(a === 'off' ? '다음: records (이 트리의 설치 기록 확인 → 있을 때만 설치기록 질문) — verify 는 그 뒤' : '다음: verify (kit 키를 켜 두어 설치기록 질문은 없다)');
}

/**
 * plugin 단계 직후의 settings 판을 백업 디렉토리 after-plugin/ 에 뜬다.
 * 3단계 백업은 키를 지우기 전 판이라, CLI 가 settings 를 다시 쓴 뒤 그것으로 되덮으면 kit 키가 되살아난다.
 */
function snapshotAfterPlugin(s) {
  const dir = path.join(s.backup.dir, 'after-plugin');
  const files = [];
  for (const sf of [SETTINGS, SETTINGS_LOCAL]) {
    if (!exists(sf)) continue;
    const dst = path.join(dir, 'files', sf);
    mkdirSync(path.dirname(dst), { recursive: true });
    copyFileSync(abs(sf), dst);
    const buf = readFileSync(dst);
    if (!buf.equals(readFileSync(abs(sf)))) { console.error(`after-plugin 스냅숏 대조 실패: ${sf}`); process.exit(1); }
    files.push({ path: sf, bytes: buf.length, sha256: rawSha(buf), eol: eolName(buf.toString('utf8')) });
  }
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ root: posix(root), at: new Date().toISOString(), files }, null, 2) + '\n', 'utf8');
  s.afterPlugin = { dir: posix(dir), files };
  console.log(`OK   after-plugin 스냅숏 ${files.length}개 → ${dir} (${files.map((f) => `${f.path} ${f.eol}`).join(' · ')}) — CLI 뒤 대조·복원의 기준`);
}

/** installed_plugins.json 에서 harness-kit 기록을 읽는다. 시험에서는 --records 나 HARNESS_UNINSTALL_PLUGINS_JSON 으로 가짜 파일을 넘긴다. */
function readRecords() {
  const file = opt('--records') || process.env.HARNESS_UNINSTALL_PLUGINS_JSON || path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
  try { const j = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')); return { file, list: ((j.plugins || {})[KIT_PLUGIN]) || [] }; } catch (e) { return { file, error: String(e.message || e) }; }
}

/**
 * 이 트리의 설치 기록만 고른다 — projectPath 가 이 레포 루트와 같은 기록(Windows 는 대소문자 무시 · 슬래시 통일).
 * 다른 트리(메인 트리 · 다른 worktree)의 기록은 근거로 쓰지 않고 「건드리지 않는다」로만 보인다.
 * `--scope project|local` 은 cwd 의 프로젝트에 작용하는데, worktree 를 메인 트리로 푸는지는 확인되지 않았다 —
 * worktree 이고 메인 트리에도 기록이 있으면 CLI 를 권하지 않고 손 절차를 낸다.
 */
function records() {
  const s = need(loadState());
  if (s.answers.plugin !== 'off') { const why = s.plan.candidates.some((c) => c.kind === 'plugin') ? 'kit 키를 켜 두기로 했다' : 'kit 키 후보가 없다'; console.log(`INFO ${why} — 설치기록 질문 없음`); s.records = { at: new Date().toISOString(), offer: false, reason: why }; s.done.includes('records') || s.done.push('records'); saveState(s); console.log('다음: verify'); return; }
  if (!s.applied.includes('plugin')) { console.error('plugin 단계 전이다 — 먼저 plugin'); process.exit(2); }
  const r = readRecords();
  const out = { at: new Date().toISOString(), file: posix(r.file), mine: [], others: [], offer: false, reason: null, manual: null };
  if (r.error) {
    out.reason = `설치 기록 파일을 읽지 못했다(${r.error})`;
    console.log(`INFO ${out.reason} — 이 트리의 설치 기록을 가릴 수 없어 CLI 를 권하지 않는다`);
  } else {
    const me = normPath(root), main = mainRoot();
    const isMine = (x) => !!x.projectPath && normPath(x.projectPath) === me;
    const isMain = (x) => !!main && !!x.projectPath && normPath(x.projectPath) === normPath(main);
    out.mine = r.list.filter(isMine).map((x) => ({ scope: x.scope, projectPath: x.projectPath }));
    out.others = r.list.filter((x) => !isMine(x)).map((x) => ({ scope: x.scope, projectPath: x.projectPath ?? null, main: isMain(x) }));
    const mainRecs = out.others.filter((x) => x.main);
    console.log(`설치 기록 파일: ${r.file} · ${KIT_PLUGIN} 기록 ${r.list.length}개 · 이 트리(${posix(root)}) ${out.mine.length}개 · 다른 곳 ${out.others.length}개`);
    for (const x of out.others) console.log(`     다른 기록(근거로 쓰지 않고 건드리지 않는다): scope=${x.scope} · ${x.projectPath ?? '(사용자 범위)'}${x.main ? ' — 이 worktree 의 메인 트리' : ''}`);
    if (!out.mine.length) {
      out.reason = '이 트리의 설치 기록 없음';
      console.log('INFO 이 트리의 설치 기록 없음 — CLI 실행 안 함. 설치기록 질문을 하지 않는다(다른 트리의 기록은 그 트리의 일이다)');
    } else if (mainRecs.length) {
      out.reason = 'worktree 이고 메인 트리에도 기록이 있다';
      out.manual = `Claude Code 를 모두 닫고 ${r.file} 를 레포 밖에 복사해 둔 뒤, "${KIT_PLUGIN}" 배열에서 projectPath 가 ${root} 인 항목만 지운다. 메인 트리(${main}) 항목은 남긴다`;
      console.log(`WARN 이 트리는 worktree 이고 메인 트리(${main})에도 기록이 있다. CLI 의 --scope ${out.mine.map((x) => x.scope).join('|')} 범위는 cwd 의 프로젝트에 작용하는데, worktree 를 메인 트리로 푸는지 확인되지 않았다 — 메인 트리 기록을 지울 수 있어 CLI 를 권하지 않는다`);
      console.log(`INFO 손 절차(사용자가 원할 때만): ${out.manual}`);
    } else {
      out.offer = true;
      for (const x of out.mine) console.log(`CLI 후보 (이 트리 루트에서만 실행): cd "${posix(root)}" && claude plugin uninstall ${KIT_PLUGIN} --scope ${x.scope}`);
      console.log('INFO CLI 는 settings 를 통째로 다시 쓴다 — 실행 뒤 after-cli 가 after-plugin 스냅숏과 대조해 되덮는다');
    }
  }
  if (s.afterPlugin) {
    const diff = s.afterPlugin.files.filter((f) => !exists(f.path) || rawSha(readFileSync(abs(f.path))) !== f.sha256);
    console.log(diff.length ? `WARN CLI 전인데 settings 가 after-plugin 스냅숏과 다르다: ${diff.map((f) => f.path).join(', ')} — 다른 세션이 고쳤을 수 있다. CLI 를 돌리지 말고 보고한다` : 'OK   CLI 전 settings = after-plugin 스냅숏');
    if (diff.length) out.offer = false;
  }
  s.records = out;
  s.done.includes('records') || s.done.push('records');
  saveState(s);
  console.log(out.offer ? '다음: 설치기록 질문 → 「기록 삭제」면 위 CLI 를 이 트리 루트에서 실행 → after-cli → verify' : '다음: verify (설치기록 질문 없음 — 보고에 위 이유 줄을 옮긴다)');
}

/** settings 두 판의 키 차이 — 사라진 키 · 생긴 키 · 순서가 바뀐 객체 · 값이 바뀐 키 · 줄끝. */
function describeJsonDiff(a, b) {
  const out = [];
  let A, B;
  try { A = JSON.parse(a.replace(/^﻿/, '')); B = JSON.parse(b.replace(/^﻿/, '')); } catch { return ['JSON 으로 읽지 못했다']; }
  const join = (p, k) => (p ? `${p}.${k}` : k);
  const walk = (x, y, p, depth) => {
    const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
    if (!obj(x) || !obj(y) || depth > 2) { if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`값 바뀜 ${p || '$'}`); return; }
    const kx = Object.keys(x), ky = Object.keys(y);
    for (const k of kx) if (!(k in y)) out.push(`사라짐 ${join(p, k)}`);
    for (const k of ky) if (!(k in x)) out.push(`생김 ${join(p, k)}`);
    const common = kx.filter((k) => k in y);
    if (common.join('\0') !== ky.filter((k) => k in x).join('\0')) out.push(`키 순서 바뀜 ${p || '$'}`);
    for (const k of common) walk(x[k], y[k], join(p, k), depth + 1);
  };
  walk(A, B, '', 0);
  if (eolName(a) !== eolName(b)) out.push(`줄끝 ${eolName(a)} → ${eolName(b)}`);
  return out.length ? out : ['서식만 다름(들여쓰기·공백)'];
}

/** CLI 뒤 — settings 를 after-plugin 스냅숏과 대조하고, 달라졌으면 CLI 판을 after-cli/ 에 남긴 뒤 스냅숏 바이트로 되덮는다. */
function afterCli() {
  const s = need(loadState());
  if (!s.afterPlugin) { console.error('after-plugin 스냅숏이 없다 — plugin 단계를 먼저(그 단계가 스냅숏을 뜬다)'); process.exit(2); }
  let fail = 0, restored = 0;
  for (const f of s.afterPlugin.files) {
    const snap = readFileSync(path.join(s.afterPlugin.dir, 'files', f.path));
    const cur = exists(f.path) ? readFileSync(abs(f.path)) : null;
    if (cur && cur.equals(snap)) { console.log(`OK   ${f.path} — CLI 뒤에도 after-plugin 스냅숏과 같다`); continue; }
    if (cur) {
      const keep = path.join(s.backup.dir, 'after-cli', 'files', f.path);
      mkdirSync(path.dirname(keep), { recursive: true });
      copyFileSync(abs(f.path), keep);
      console.log(`INFO ${f.path} — CLI 가 다시 썼다: ${describeJsonDiff(snap.toString('utf8'), cur.toString('utf8')).join(' · ')} (CLI 판은 ${posix(keep)})`);
    } else console.log(`INFO ${f.path} — CLI 뒤 파일이 없어졌다`);
    writeFileSync(abs(f.path), snap);
    if (readFileSync(abs(f.path)).equals(snap)) { restored++; console.log(`OK   ${f.path} — after-plugin 스냅숏 바이트로 되덮었다(kit 키는 지운 채 · 줄끝 ${f.eol})`); }
    else { fail++; console.log(`FAIL ${f.path} — 되덮은 뒤 대조 실패`); }
  }
  for (const sf of [SETTINGS, SETTINGS_LOCAL]) if (exists(sf) && !s.afterPlugin.files.some((f) => f.path === sf)) console.log(`INFO ${sf} — 스냅숏에 없던 파일이 CLI 뒤 생겼다. 지우지 않고 보고한다`);
  s.afterCli = { at: new Date().toISOString(), restored, failures: fail };
  s.done.includes('after-cli') || s.done.push('after-cli');
  saveState(s);
  console.log(`after-cli: 되덮음 ${restored}개 · failures=${fail}`);
  console.log('다음: verify');
  process.exit(fail ? 1 : 0);
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
  // ②-1 순서 · after-plugin 스냅숏 — plugin → records → (CLI) after-cli → verify
  if (s.answers.plugin === 'off' && !s.done.includes('records')) console.log('WARN 설치기록 단계(records)를 아직 안 돌렸다 — 순서: plugin → records → (CLI 를 돌렸으면) after-cli → verify. records 뒤 verify 를 다시 돌린다');
  for (const f of (s.afterPlugin && s.afterPlugin.files) || []) {
    const cur = exists(f.path) ? readFileSync(abs(f.path)) : null;
    if (cur && rawSha(cur) === f.sha256) ok(`${f.path} = after-plugin 스냅숏`);
    else bad(`${f.path} 가 after-plugin 스냅숏과 다르다 — CLI 가 다시 썼으면 after-cli 를 돌린다. 아니면 다른 세션이 고친 것이니 보고한다`);
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
  // 줄끝만 다른 파일 — 후보 경로와, 설치가 늘 고치는 파일(후보가 아니어도: 앞선 걷어내기 뒤 남은 줄끝 차이)
  const installTouched = [SETTINGS, SETTINGS_LOCAL, '.gitignore', 'CLAUDE.md', '.claude/CLAUDE.md']
    .filter((p) => !candPaths.has(p) && exists(p) && isTracked(p) && git('status', '--porcelain', '--', p).trim() !== '' && tryGit('diff', '--quiet', 'HEAD', '--', p) !== null);
  const eolOnly = [...changed.filter((x) => !differs.includes(x)), ...installTouched];
  for (const p of eolOnly) {
    const co = checkoutBytes(p);
    const now = exists(p) ? readFileSync(abs(p), 'utf8') : '';
    console.log(`INFO ${p} — status 는 M 이지만 HEAD 와 내용이 같다(줄끝만 다름: 지금 ${eolName(now)} · 체크아웃 판 ${co ? eolName(co.toString('utf8')) : '?'} — 설치나 플러그인 CLI 가 다른 줄끝으로 썼다). 커밋 대상 아님`);
    console.log(`     고치려면(사용자가 원할 때만 · 잃을 변경이 없다): ${selfCmd('eol-fix', posix(root), p)} — 또는 git -C "${posix(root)}" checkout -- ${p}. git update-index --refresh 로는 풀리지 않는다`);
  }
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
  printSummary(s, refs, eolOnly);
  console.log(`failures=${fail}`);
  s.done.includes('verify') || s.done.push('verify');
  s.lastVerify = { at: new Date().toISOString(), failures: fail, commitPaths, noCommitReason: reason, notRemoval, refs: refs.length, eolOnly };
  saveState(s);
  console.log(fail ? '다음: FAIL 줄을 사용자에게 보이고 멈춘다' : `다음: ${commitPaths.length ? '7단계 제거 커밋 질문 → ' : ''}보고(위 요약) → finish`);
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

function printSummary(s, refs = [], eolOnly = []) {
  const C = s.plan.candidates, A = s.answers;
  const count = (v) => C.filter((c) => A[c.id] === v).length;
  const skipped = C.filter((c) => ['remove', 'revert', 'off'].includes(A[c.id]) && !s.applied.includes(c.id)).map((c) => c.id);
  console.log('\n요약 — 보고의 수·경로는 이 블록에서 옮긴다');
  console.log(`  후보 ${C.length}개 (플러그인 키 포함) · 지움 ${count('remove')} · 되돌림 ${count('revert')} · 끔 ${count('off')} · 남김 ${count('keep')} · 미답 ${C.filter((c) => !(c.id in A)).length}`);
  console.log(`  적용 ${s.applied.length}건${skipped.length ? ` · 지우기로 했는데 적용 안 된 것 ${skipped.length}개: ${skipped.join(', ')}` : ''}`);
  if ((s.filledByDefault || []).length) console.log(`  권장이 없어 keep 으로 채운 칸 ${s.filledByDefault.length}개: ${s.filledByDefault.join(', ')}`);
  console.log(`  남은 참조 ${refs.length}줄 · ${new Set(refs.map((r) => r.path)).size}곳 (위 INFO 목록)`);
  if (s.records) console.log(`  설치 기록: ${s.records.offer ? `이 트리 기록 ${s.records.mine.length}개 — CLI 질문 대상` : s.records.reason}${s.afterCli ? ` · CLI 뒤 되덮음 ${s.afterCli.restored}개` : ''}`);
  if (!s.backup) { console.log('  백업 없음'); printDocsSetup(s.plan.docsSetup, '  '); return; }
  const bdir = path.resolve(s.backup.dir), ev = s.backup.evidence && path.resolve(s.backup.evidence);
  const cfgGone = s.plan.candidates.some((c) => c.id === `file:${CONFIG}` && s.answers[c.id] === 'remove');
  printDocsSetup(s.plan.docsSetup, '  ', cfgGone ? bdir : null);
  if (s.plan.docsSetup && !cfgGone) console.log(`  docs-setup 칸: ${CONFIG} 를 남겼다 — 칸도 그대로다`);
  console.log(`  백업 ${s.backup.files.length}개${s.backup.plannedFiles != null ? ` (후보 파일 ${s.backup.plannedFiles}개)` : ''}: ${bdir}`);
  if (s.afterPlugin) console.log(`  after-plugin 스냅숏(kit 키 반영 뒤 settings) ${s.afterPlugin.files.length}개: ${path.resolve(s.afterPlugin.dir)}`);
  if (ev) console.log(`  증거 사본(계측 로그) ${(s.backup.evidenceFiles || []).length}개: ${ev}`);
  restoreLines(bdir, ev, '  ').forEach((l) => console.log(l));
  console.log(`  백업 수명: ${isWorktree() ? `이 트리는 worktree 라 백업이 ${posix(path.dirname(bdir))} 아래(.git/worktrees/<이름>/)에 있다 — git worktree remove 하면 백업도 함께 지워진다` : '백업은 이 저장소의 .git 아래에 있다 — 저장소를 지우면 함께 지워진다'}. 재설치할 수 있으면 레포 밖으로 옮겨 둔다`);
  if (ev) console.log(`  증거 사본 수명: git-common-dir 아래라 worktree 를 지워도 남는다 — 필요 없어지면 손으로 지운다`);
  // 앞선 걷어내기가 남긴 백업·증거 사본 — 이번 것과 따로 쌓여 있다
  const oldBackups = priorRuns(bdir);
  if (oldBackups.length) console.log(`  앞선 백업 ${oldBackups.length}개 (이번 것과 수명이 같다): ${oldBackups.map((r) => r.dir).join(' · ')}`);
  const oldEv = evidenceDirs(ev);
  if (oldEv.length) console.log(`  앞선 증거 사본 ${oldEv.length}개 (이 트리 이름 · worktree 를 지워도 남는다 — 필요 없어지면 손으로 지운다): ${oldEv.join(' · ')}`);
  // 남긴 것을 나중에 지우려면 — 항목마다 한 줄
  const kept = C.filter((c) => A[c.id] === 'keep' || (['remove', 'revert'].includes(A[c.id]) && !s.applied.includes(c.id) && c.kind !== 'plugin'));
  const lines = [];
  for (const c of kept) {
    const d = c.data || {};
    const again = 'uninstall 을 다시 돌리면 다시 후보로 잡힌다';
    if (c.kind === 'plugin') lines.push(`${c.id}: ${d.file} 에서 ${d.keys.map((k) => `${k[0]}."${k[1]}"`).join(' · ')} 키를 Edit 로 지운다 — 그 뒤 새 세션. 키를 지우면 이 레포에서 이 스킬도 안 뜬다`);
    else if (c.kind === 'manifest') lines.push(`${c.id}: 남긴 항목을 모두 지운 뒤 ${d.path} 를 지운다 — ${again}`);
    else if (c.kind === 'file') lines.push(`${c.id}: ${d.path} 파일을 지운다${d.aux ? ' — 가리키는 문서 줄(남은 참조)을 먼저 고친다. 다음 걷어내기도 이번 백업 index.json 으로 이 파일을 되찾는다' : ` — ${again}`}`);
    else if (c.kind === 'files' || c.kind === 'runtime') lines.push(`${c.id}: ${d.paths.length}개 파일 — ${again}${c.kind === 'runtime' ? '(지우기 전에 증거 사본을 뜬다)' : ''}`);
    else if (c.kind === 'text') lines.push(`${c.id}: ${d.path} 의 ${c.title.replace(/^\S+\s*/, '')} — ${again}(표시·절은 해시로 찾는다). 손으로는 그 줄만 Edit 로 지운다`);
    else if (c.kind === 'hook') lines.push(`${c.id}: ${d.file} 의 hooks.${d.event} 에서 command 가 ${d.command} 인 항목만 Edit 로 지운다(그룹·이벤트가 비면 그것도) — ${again}`);
    else if (c.kind === 'key') lines.push(`${c.id}: ${d.file} 의 ${d.keys.join('.')} 키를 Edit 로 지운다 — 그 플러그인이 이 레포에서 다시 켜진다`);
  }
  if (refs.length) lines.push(`남은 참조 ${refs.length}줄: 후보가 아니라 스크립트가 고치지 않는다 — 줄마다 Edit 로 고친다(설치 전 판이 HEAD 에 있으면 git diff -- <파일> 로 그 줄만 본다)`);
  for (const p of eolOnly) lines.push(`${p} 줄끝: ${selfCmd('eol-fix', posix(root), p)} (또는 git checkout -- ${p} — HEAD 와 내용이 같아 잃을 것이 없다)`);
  if (lines.length) {
    console.log('  남긴 것을 나중에 지우려면:');
    lines.forEach((l) => console.log(`    - ${l}`));
    console.log('    - git restore · git checkout -- <파일> 로 한꺼번에 되돌리지 않는다 — 파일 단위라 그 파일의 다른 변경까지 되돌린다(줄끝만 다른 파일은 예외). 자동 모드의 권한 분류기가 막으면 우회하지 말고 위 Edit 절차로 한다');
  }
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

/**
 * HEAD 와 내용이 같고 줄끝만 다른 파일을 체크아웃 판 바이트로 쓴다 — git checkout 과 같은 결과지만 git 은 부르지 않는다.
 * 내용이 HEAD 와 하나라도 다르면 쓰지 않는다(그 파일의 다른 변경을 잃는다).
 */
function eolFix() {
  const ps = args.filter((a) => !a.startsWith('--'));
  if (!ps.length) { console.error('사용: eol-fix <레포 루트> <경로>…'); process.exit(2); }
  const s = loadState();
  let fail = 0;
  for (const p of ps.map((x) => x.replace(/\\/g, '/'))) {
    const co = checkoutBytes(p);
    if (!co) { fail++; console.log(`FAIL ${p} — HEAD 에 없다`); continue; }
    if (!exists(p)) { fail++; console.log(`FAIL ${p} — 작업본에 없다`); continue; }
    const cur = readFileSync(abs(p));
    if (cur.equals(co)) { console.log(`OK   ${p} — 이미 체크아웃 판과 같다`); continue; }
    if (normEol(cur.toString('utf8')) !== normEol(co.toString('utf8'))) { fail++; console.log(`FAIL ${p} — HEAD 와 내용이 다르다(줄끝 말고도 다름). 쓰지 않는다`); continue; }
    writeFileSync(abs(p), co);
    console.log(`OK   ${p} — 줄끝 ${eolName(cur.toString('utf8'))} → ${eolName(co.toString('utf8'))} (체크아웃 판 바이트)`);
    // after-plugin 스냅숏에 든 파일이면 스냅숏도 이 판으로 — verify 의 스냅숏 대조가 줄끝 때문에 틀리지 않게
    const f = s && s.afterPlugin && s.afterPlugin.files.find((x) => x.path === p);
    if (f) { writeFileSync(path.join(s.afterPlugin.dir, 'files', p), co); Object.assign(f, { bytes: co.length, sha256: rawSha(co), eol: eolName(co.toString('utf8')) }); saveState(s); console.log(`INFO ${p} — after-plugin 스냅숏도 이 판으로 맞췄다`); }
  }
  const st = git('status', '--short', '--', ...ps);
  console.log(`git status --short (그 경로): ${st.trim() ? st.trim().split('\n').join(' / ') : '깨끗함'}`);
  console.log(`eol-fix failures=${fail}`);
  process.exit(fail ? 1 : 0);
}

/**
 * 같은 트리의 다른 Claude 세션 — 마지막 기록 시각은 파일 수정 시각이 아니라 timestamp 가 있는 마지막 기록에서 읽는다.
 * 세션이 끝날 때 timestamp 없는 줄(비용 상태 등)이 붙어 수정 시각이 늦어진다 — 시험에서 1시간 전에 끝난 세션이 「약 1분 전」으로 보였다.
 */
function sessions() {
  const base = opt('--projects') || process.env.HARNESS_UNINSTALL_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects');
  const dir = path.join(base, root.replace(/[^A-Za-z0-9]/g, '-'));
  if (!existsSync(dir)) { console.log(`세션 기록 디렉토리 없음: ${dir} — 이 트리에서 연 Claude 세션이 없다`); return; }
  const now = Date.now();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const ago = (t) => { const m = Math.round((now - t) / 60000); return m < 1 ? '1분 안' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 ${m % 60}분 전` : `${Math.floor(m / 1440)}일 전`; };
  // user·assistant 메시지의 timestamp 를 먼저 보고, 없으면 timestamp 가 있는 아무 기록
  const lastTs = (file) => {
    const lines = readFileSync(file, 'utf8').split('\n');
    let any = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"timestamp"')) continue;
      try {
        const r = JSON.parse(lines[i]); const t = Date.parse(r.timestamp);
        if (Number.isNaN(t)) continue;
        if (r.type === 'user' || r.type === 'assistant') return { t, type: r.type };
        any ||= { t, type: r.type || '?' };
      } catch { /* 끊긴 줄 */ }
    }
    return any;
  };
  const all = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => {
    const file = path.join(dir, f), mtime = statSync(file).mtimeMs;
    return { id: f.replace(/\.jsonl$/, ''), mtime, last: lastTs(file) };
  }).sort((a, b) => (b.last ? b.last.t : 0) - (a.last ? a.last.t : 0));
  const selfArg = opt('--self');
  const newest = [...all].sort((a, b) => b.mtime - a.mtime)[0];
  const self = selfArg ? all.find((x) => x.id.startsWith(selfArg)) : newest;
  console.log(`세션 기록 ${all.length}개: ${dir}`);
  console.log(`이 세션: ${self ? `${self.id.slice(0, 8)}${selfArg ? '' : ' (파일을 가장 최근에 쓴 것으로 추정 — 틀리면 --self <id>)'}` : '모름'}`);
  for (const x of all.filter((y) => y !== self).slice(0, 5)) {
    const late = x.last && x.mtime - x.last.t > 60000 ? ` · 파일 수정 ${fmt(x.mtime)}(마지막 기록보다 늦다 — 종료 때 붙는 줄일 수 있다)` : '';
    console.log(`  다른 세션 ${x.id.slice(0, 8)} · 마지막 기록 ${x.last ? `${fmt(x.last.t)} (${ago(x.last.t)}, ${x.last.type})` : '없음(timestamp 있는 줄 없음)'}${late}`);
  }
  if (all.length - 1 > 5) console.log(`  … 그보다 오래된 세션 ${all.length - 1 - 5}개`);
  console.log('질문 근거에는 「마지막 기록」 시각과 몇 분 전인지를 쓴다 — 파일 수정 시각을 쓰지 않는다. 세션이 끝났는지는 사용자가 판단한다');
}

function finish() {
  const s = loadState();
  if (!s) { console.log('체크포인트 없음'); return; }
  rmSync(statePath);
  console.log(`체크포인트를 지웠다. 백업은 남는다: ${s.backup ? path.resolve(s.backup.dir) : '(없음)'}${s.backup && s.backup.evidence ? `\n증거: ${path.resolve(s.backup.evidence)}` : ''}`);
}

const table = { sessions, scan, status: () => printPlan(need(loadState())), answer, backup, apply, plugin, records, 'after-cli': afterCli, verify, 'eol-fix': eolFix, finish, 'restore-check': restoreCheck };
if (!table[cmd]) { console.error(`모르는 명령: ${cmd}`); process.exit(2); }
await table[cmd]();
