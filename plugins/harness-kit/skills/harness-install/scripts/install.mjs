#!/usr/bin/env node
/**
 * harness-install 보조 스크립트 — 사전 확인 · settings 스냅숏/줄끝 · CLI 뒤 대조 · 테스트 제외 확인 · kit 칸 점검 · 플러그인 훅 목록.
 *
 * 사용: node install.mjs <명령> <레포 루트> [인자…]
 *   precheck [--self <id>] [--projects <디렉토리>]   0단계 — 트리 종류(메인/연결 worktree)·브랜치·설치 대상 파일 미커밋·같은 트리의 다른 세션(마지막 기록 시각)
 *   settings-snap <before|after-edit>               5단계 — settings.json·settings.local.json 바이트를 git-path 아래에 뜬다(줄끝·BOM 기록)
 *   settings-eol                                    5단계 — 지금 settings 의 줄끝·BOM 을 before 스냅숏과 맞춘다(내용은 그대로, 줄끝 바이트만)
 *   after-cli                                       5단계 — CLI 뒤 settings 를 after-edit 스냅숏과 대조해 달라졌으면 스냅숏 바이트로 되덮는다
 *   test-select --src <테스트 소스 디렉토리> [--exclude <Ant 패턴>]… [--filter-exclude <클래스 패턴>]…
 *               [--expect-excluded <FQN>]… [--results <JUnit XML 디렉토리>]
 *                                                   6·7단계 — 제외 규칙이 무엇을 빼는지(정적), 실제 실행에서 돌아야 할 것이 돌았는지(결과)
 *   slots [--kit <harness-kit 플러그인 디렉토리>] [--tier light|instrumented]
 *                                                   4·6단계 — kit 자산이 읽는 project 칸마다 값·null·없음, null 이면 주석이 끄는 자산을 적었는지.
 *                                                   라이트면 문서·메모리 칸(docs.*·memory.*)의 「키 없음」은 실패가 아니다(DEFER — 읽는 자산이 쓸 때 묻는다)
 *   hooks [--tier light|instrumented]               5·6단계 — 그 범위의 하네스 훅이 각 이벤트에 정확히 1번, 범위 밖 훅은 0번인가
 *   docs-hookup [--json <파일>]                     10단계 — 문서 구조 맞추기(docs-setup)를 권할지: 문서 수 · archiveDir · 문서 칸 null
 *   plugin-hooks <이름@마켓> [--records <installed_plugins.json>]   2단계 D6 — 끌 플러그인이 건 훅 목록(빈자리 조사의 출발점)
 *
 * 범위(--tier)를 주지 않으면 설치 체크포인트의 tier → 영수증 tier(schema 1 은 계측) → 계측 순으로 정한다(tiers.mjs).
 *
 * 시험용 바꿔치기: HARNESS_INSTALL_PROJECTS_DIR(세션 기록 디렉토리) · HARNESS_INSTALL_PLUGINS_JSON(설치 기록 파일)
 * 인자에는 경로·이름·패턴만 넘긴다. 실행 전 가드가 막을 명령 문자열을 셸 인자로 넘기지 않는다.
 * 이 스크립트는 git 에 쓰지 않는다 — add·commit·restore·checkout 을 부르지 않는다.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { HOOKS, LABEL, RANK, hookSpec, resolveTier, deferredInLight } from './tiers.mjs';

const [cmd, rootArg, ...args] = process.argv.slice(2);
const USAGE = '사용: node install.mjs <precheck|settings-snap|settings-eol|after-cli|test-select|slots|hooks|docs-hookup|plugin-hooks> <레포 루트 | 이름@마켓> [인자…]';
if (!cmd || !rootArg) { console.error(USAGE); process.exit(2); }
const SELF = fileURLToPath(import.meta.url);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const opts = (name) => args.flatMap((a, i) => (a === name && args[i + 1] !== undefined ? [args[i + 1]] : []));
const posix = (p) => p.split(path.sep).join('/');
const normPath = (p) => { const x = path.resolve(String(p)).replace(/\\/g, '/').replace(/\/+$/, ''); return process.platform === 'win32' ? x.toLowerCase() : x; };
const rawSha = (buf) => createHash('sha256').update(buf).digest('hex');
const SETTINGS = ['.claude/settings.json', '.claude/settings.local.json'];
const TARGETS = ['.claude/settings.json', '.claude/settings.local.json', '.gitignore', 'CLAUDE.md'];

const root = cmd === 'plugin-hooks' ? null : path.resolve(rootArg);
const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 256 << 20 });
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };
const gitPath = (p) => path.resolve(root, git('rev-parse', '--git-path', p).trim());
const abs = (rel) => path.join(root, rel);
const exists = (rel) => existsSync(abs(rel));
let fail = 0;
const bad = (m) => { fail++; console.log(`FAIL ${m}`); };

/** 줄끝 판정 — CRLF·LF 가 섞였으면 MIXED. */
function eolOf(buf) {
  const s = buf.toString('utf8');
  const crlf = (s.match(/\r\n/g) || []).length, lf = (s.match(/\n/g) || []).length - crlf;
  return crlf && lf ? 'MIXED' : crlf ? 'CRLF' : 'LF';
}
const hasBom = (buf) => buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
const fileInfo = (buf) => ({ bytes: buf.length, sha256: rawSha(buf), eol: eolOf(buf), bom: hasBom(buf), finalNewline: /\n$/.test(buf.toString('utf8')) });

// ── precheck ─────────────────────────────────────────────────────────────────

/** user·assistant 기록의 마지막 timestamp(없으면 timestamp 있는 아무 기록)와 그 기록의 종류. 파일 수정 시각은 쓰지 않는다. */
function lastRecord(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let any = null, last = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"timestamp"')) continue;
    try {
      const r = JSON.parse(lines[i]); const t = Date.parse(r.timestamp);
      if (Number.isNaN(t)) continue;
      if (r.type === 'user' || r.type === 'assistant') {
        const kind = recordKind(r);
        if (!last) last = { t, type: r.type, kind };
        // 마지막 사람 기록(입력·중단)도 함께 본다 — 맨 끝이 알림·도구 결과면 그것만으로는 사람이 떠났는지 모른다
        if (kind === '사용자 입력' || kind === '사용자 중단') return { ...last, human: { t, kind } };
        if (lines.length - i > 400) return last;
      } else any ||= { t, type: r.type || '?', kind: r.type || '?' };
    } catch { /* 끊긴 줄 */ }
  }
  return last || any;
}
function firstTimestamp(file) {
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    if (!l.includes('"timestamp"')) continue;
    try { const t = Date.parse(JSON.parse(l).timestamp); if (!Number.isNaN(t)) return t; } catch { /* 끊긴 줄 */ }
  }
  return null;
}
function recordKind(r) {
  const c = r.message && r.message.content;
  const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '';
  if (r.type === 'assistant') return Array.isArray(c) && c.some((b) => b.type === 'tool_use') ? '에이전트 도구 호출' : '에이전트 응답';
  if (/^\[Request interrupted/.test(text)) return '사용자 중단';
  if (/^<task-notification>/.test(text)) return '백그라운드 작업 알림';
  if (Array.isArray(c) && c.some((b) => b.type === 'tool_result')) return '도구 결과';
  return '사용자 입력';
}
function sessionDir(base) {
  const slug = root.replace(/[^A-Za-z0-9]/g, '-');
  if (!existsSync(base)) return null;
  // 드라이브 문자 대소문자가 다른 슬러그 둘(C--x · c--x)은 Windows 에서 같은 폴더로 본다
  const hits = readdirSync(base).filter((d) => (process.platform === 'win32' ? d.toLowerCase() === slug.toLowerCase() : d === slug));
  return hits.length ? hits.map((d) => path.join(base, d)) : null;
}
function precheck() {
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const mins = (ms) => Math.round(ms / 60000);
  const span = (m) => (m < 1 ? '1분 안' : m < 60 ? `${m}분` : m < 1440 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${Math.floor(m / 1440)}일`);

  // ① 트리 — 메인 트리인가 연결 worktree 인가
  const gitDir = path.resolve(root, git('rev-parse', '--git-dir').trim());
  const common = path.resolve(root, git('rev-parse', '--git-common-dir').trim());
  const linked = normPath(gitDir) !== normPath(common);
  const mainTree = linked && path.basename(common) === '.git' ? path.dirname(common) : null;
  const branch = (tryGit('rev-parse', '--abbrev-ref', 'HEAD') || '?').trim();
  console.log(`트리: ${linked ? `연결 worktree (메인 트리 ${mainTree ? posix(mainTree) : '알 수 없음'})` : '메인 트리'} · 브랜치 ${branch}`);
  const wt = (tryGit('worktree', 'list', '--porcelain') || '').split('\n').filter((l) => l.startsWith('worktree ')).length;
  console.log(`worktree 수(메인 포함): ${wt}`);

  // ② 설치 대상 파일의 미커밋 변경
  const st = (tryGit('status', '--porcelain', '--', ...TARGETS) || '').split('\n').filter(Boolean);
  console.log(st.length ? `설치 대상 파일 미커밋 ${st.length}건: ${st.map((l) => l.trim()).join(' · ')}` : '설치 대상 파일 미커밋 0건');
  const stash = (tryGit('stash', 'list') || '').split('\n').filter(Boolean).length;
  console.log(`stash ${stash}건`);

  // ③ 같은 트리의 다른 세션 — 마지막 user·assistant 기록 시각으로 본다(파일 수정 시각은 종료 때 붙는 줄로 늦어진다)
  const base = opt('--projects') || process.env.HARNESS_INSTALL_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects');
  const dirs = sessionDir(base);
  let concurrent = 0, recent = 0;
  if (!dirs) console.log(`세션 기록 디렉토리 없음(${posix(base)} 아래 이 트리 슬러그) — 이 트리에서 연 Claude 세션이 없다`);
  else {
    const all = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.jsonl')).map((f) => {
      const file = path.join(d, f);
      return { id: f.replace(/\.jsonl$/, ''), mtime: statSync(file).mtimeMs, last: lastRecord(file), first: firstTimestamp(file) };
    }));
    const selfArg = opt('--self') || process.env.CLAUDE_SESSION_ID || null;
    const self = selfArg ? all.find((x) => x.id.startsWith(selfArg)) : [...all].sort((a, b) => b.mtime - a.mtime)[0];
    const start = self && self.first ? self.first : Date.now();
    console.log(`세션 기록 ${all.length}개: ${dirs.map(posix).join(' · ')}`);
    console.log(`이 세션: ${self ? `${self.id.slice(0, 8)} · 시작 ${self.first ? fmt(self.first) : '모름'}${selfArg ? '' : ' (파일을 가장 최근에 쓴 것으로 추정 — 틀리면 --self <id>)'}` : '모름 — 시작 시각 대신 지금을 기준으로 센다'}`);
    const others = all.filter((x) => x !== self && x.last).sort((a, b) => b.last.t - a.last.t);
    for (const x of others.slice(0, 5)) {
      const d = x.last.t - start;
      const cls = d >= 0 ? '동시' : -d <= 2 * 3600e3 ? '최근' : '오래됨';
      if (cls === '동시') concurrent++; else if (cls === '최근') recent++;
      const rel = mins(Math.abs(d)) < 1 ? `이 세션 시작 ${d >= 0 ? '직후' : '직전'}` : d >= 0 ? `이 세션 시작 ${span(mins(d))} 뒤` : `이 세션 시작 ${span(mins(-d))} 전`;
      const late = x.mtime - x.last.t > 60000 ? ` · 파일 수정 ${fmt(x.mtime)}(마지막 기록보다 늦다 — 종료 때 붙는 줄)` : '';
      const human = x.last.human && x.last.human.t !== x.last.t ? ` · 마지막 사람 기록 ${fmt(x.last.human.t)}(${x.last.human.kind})` : '';
      console.log(`  [${cls}] 다른 세션 ${x.id.slice(0, 8)} · 마지막 기록 ${fmt(x.last.t)} (${rel}, ${x.last.kind})${human}${late}`);
    }
    if (others.length > 5) {
      for (const x of others.slice(5)) { const d = x.last.t - start; if (d >= 0) concurrent++; else if (-d <= 2 * 3600e3) recent++; }
      console.log(`  … 그보다 오래된 세션 ${others.length - 5}개(분류 수에는 들어 있다)`);
    }
  }
  console.log(`D1 관찰: 대상 파일 미커밋 ${st.length} · 동시 세션 ${concurrent} · 최근(시작 전 2시간 안) 세션 ${recent} · ${linked ? '연결 worktree' : '메인 트리'} · 브랜치 ${branch}`);
  console.log('질문 근거에는 「마지막 기록」 시각·이 세션 시작과의 앞뒤·마지막 기록 종류를 쓴다 — 파일 수정 시각을 쓰지 않는다. 시작 전 세션이 끝났는지는 사용자가 판단한다');
}

// ── settings 스냅숏 · 줄끝 · CLI 뒤 대조 ─────────────────────────────────────

const snapBase = () => gitPath('harness-install-settings');
function settingsSnap() {
  const label = args[0];
  if (!['before', 'after-edit'].includes(label)) { console.error('settings-snap <before|after-edit>'); process.exit(2); }
  const dir = path.join(snapBase(), label);
  if (label === 'before' && existsSync(path.join(dir, 'index.json')) && !args.includes('--force')) {
    console.log(`INFO before 스냅숏이 이미 있다: ${posix(dir)} — 편집 전 판을 덮지 않는다(새로 뜨려면 --force, 재개라면 그대로 쓴다)`);
    return;
  }
  const files = [];
  for (const sf of SETTINGS) {
    if (!exists(sf)) { files.push({ path: sf, absent: true }); continue; }
    const dst = path.join(dir, 'files', sf);
    mkdirSync(path.dirname(dst), { recursive: true });
    copyFileSync(abs(sf), dst);
    const buf = readFileSync(dst);
    if (!buf.equals(readFileSync(abs(sf)))) { bad(`스냅숏 대조 실패: ${sf}`); continue; }
    files.push({ path: sf, ...fileInfo(buf) });
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ root: posix(root), label, at: new Date().toISOString(), files }, null, 2) + '\n', 'utf8');
  for (const f of files) console.log(f.absent ? `INFO ${f.path} 없음(스냅숏에 「없음」으로 적음)` : `OK   ${label} ${f.path} · ${f.eol}${f.bom ? ' · BOM' : ''}${f.finalNewline ? '' : ' · 끝 줄바꿈 없음'} · ${f.bytes}B`);
  console.log(`스냅숏: ${posix(dir)}`);
  process.exit(fail ? 1 : 0);
}
const loadSnap = (label) => {
  const dir = path.join(snapBase(), label);
  try { return { dir, idx: JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8')) }; } catch { return null; }
};

/** 내용(줄끝 뺀 글자)은 그대로 두고 줄끝·BOM·끝 줄바꿈만 기준 판에 맞춘다. */
function toShape(text, ref) {
  let s = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (ref.finalNewline && !s.endsWith('\n')) s += '\n';
  if (ref.eol === 'CRLF') s = s.replace(/\n/g, '\r\n');
  return (ref.bom ? '\uFEFF' : '') + s;
}
function settingsEol() {
  const before = loadSnap('before');
  if (!before) { console.error('before 스냅숏이 없다 — 편집 전에 settings-snap before'); process.exit(2); }
  for (const f of before.idx.files) {
    if (!exists(f.path)) { if (!f.absent) bad(`${f.path} — 편집 전에는 있었는데 없어졌다`); continue; }
    const buf = readFileSync(abs(f.path)), cur = fileInfo(buf);
    if (f.absent) { console.log(`INFO ${f.path} — 이 설치가 새로 만든 파일(${cur.eol}). 레포의 다른 JSON 관례를 따랐는지 눈으로 본다`); continue; }
    if (f.eol === 'MIXED') { console.log(`WARN ${f.path} — 편집 전 판이 줄끝 혼합이라 맞추지 않는다. 보고에 적는다`); continue; }
    if (cur.eol === f.eol && cur.bom === f.bom && cur.finalNewline === f.finalNewline) { console.log(`OK   ${f.path} — 줄끝 ${cur.eol}${cur.bom ? ' · BOM' : ''} 이 편집 전과 같다`); continue; }
    const fixed = toShape(buf.toString('utf8'), f);
    JSON.parse(fixed.replace(/^\uFEFF/, ''));
    writeFileSync(abs(f.path), fixed, 'utf8');
    const again = fileInfo(readFileSync(abs(f.path)));
    if (again.eol === f.eol && again.bom === f.bom) console.log(`OK   ${f.path} — 줄끝 ${cur.eol}${cur.bom ? '+BOM' : ''} → ${f.eol}${f.bom ? '+BOM' : ''} 로 되돌렸다(내용은 그대로)`);
    else bad(`${f.path} — 줄끝을 맞춘 뒤에도 ${again.eol}`);
  }
  console.log(`settings-eol: failures=${fail}`);
  process.exit(fail ? 1 : 0);
}

/** settings 두 판의 키 차이 — 사라진 키 · 생긴 키 · 순서 · 값 · 줄끝 · BOM. */
function describeJsonDiff(a, b) {
  const out = [];
  let A, B;
  try { A = JSON.parse(a.replace(/^\uFEFF/, '')); B = JSON.parse(b.replace(/^\uFEFF/, '')); } catch { return { lines: ['JSON 으로 읽지 못했다'], added: [] }; }
  const added = [];
  const join = (p, k) => (p ? `${p}.${k}` : k);
  const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const walk = (x, y, p, depth) => {
    if (!obj(x) || !obj(y) || depth > 2) { if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`값 바뀜 ${p || '$'}`); return; }
    const kx = Object.keys(x), ky = Object.keys(y);
    for (const k of kx) if (!(k in y)) out.push(`사라짐 ${join(p, k)}`);
    for (const k of ky) if (!(k in x)) { out.push(`생김 ${join(p, k)}`); added.push(join(p, k)); }
    const common = kx.filter((k) => k in y);
    if (common.join('\0') !== ky.filter((k) => k in x).join('\0')) out.push(`키 순서 바뀜 ${p || '$'}`);
    for (const k of common) walk(x[k], y[k], join(p, k), depth + 1);
  };
  walk(A, B, '', 0);
  const ea = eolOf(Buffer.from(a)), eb = eolOf(Buffer.from(b));
  if (ea !== eb) out.push(`줄끝 ${ea} → ${eb}`);
  if (a.startsWith('\uFEFF') !== b.startsWith('\uFEFF')) out.push(`BOM ${a.startsWith('\uFEFF') ? '있음' : '없음'} → ${b.startsWith('\uFEFF') ? '있음' : '없음'}`);
  return { lines: out.length ? out : ['서식만 다름(들여쓰기·공백)'], added };
}
function afterCli() {
  const snap = loadSnap('after-edit');
  if (!snap) { console.error('after-edit 스냅숏이 없다 — CLI 전에 settings-snap after-edit'); process.exit(2); }
  let restored = 0;
  for (const f of snap.idx.files) {
    const snapPath = path.join(snap.dir, 'files', f.path);
    if (f.absent) {
      if (exists(f.path)) console.log(`INFO ${f.path} — 편집 뒤에는 없던 파일이 CLI 뒤 생겼다. 지우지 않고 보고한다`);
      continue;
    }
    const want = readFileSync(snapPath);
    const cur = exists(f.path) ? readFileSync(abs(f.path)) : null;
    if (cur && cur.equals(want)) { console.log(`OK   ${f.path} — CLI 뒤에도 after-edit 스냅숏과 같다`); continue; }
    if (cur) {
      const keep = path.join(snapBase(), 'after-cli', 'files', f.path);
      mkdirSync(path.dirname(keep), { recursive: true });
      copyFileSync(abs(f.path), keep);
      const d = describeJsonDiff(want.toString('utf8'), cur.toString('utf8'));
      console.log(`INFO ${f.path} — CLI 가 다시 썼다: ${d.lines.join(' · ')} (CLI 판은 ${posix(keep)})`);
      if (d.added.length) console.log(`WARN ${f.path} — CLI 가 더한 키 ${d.added.join(', ')} 는 되덮으면 빠진다. 설치에 필요한 키인지 보고 필요하면 Edit 로 다시 넣는다`);
    } else console.log(`INFO ${f.path} — CLI 뒤 파일이 없어졌다`);
    writeFileSync(abs(f.path), want);
    if (readFileSync(abs(f.path)).equals(want)) { restored++; console.log(`OK   ${f.path} — after-edit 스냅숏 바이트로 되덮었다(넣은 훅·키 유지 · CLI 가 지운 키 복원 · 줄끝 ${f.eol}${f.bom ? ' · BOM' : ''})`); }
    else bad(`${f.path} — 되덮은 뒤 대조 실패`);
  }
  console.log(`after-cli: 되덮음 ${restored}개 · failures=${fail}`);
  process.exit(fail ? 1 : 0);
}

// ── test-select — 제외 규칙이 무엇을 빼는가, 돌아야 할 것이 돌았나 ───────────

/** Ant 패턴(Gradle PatternFilterable) → 정규식. ** 는 디렉토리 여러 단, * · ? 는 한 단 안. 끝이 / 면 /** 로 본다. */
function antRe(p) {
  let s = p.replace(/\\/g, '/').replace(/^\/+/, '');
  if (s.endsWith('/')) s += '**';
  let re = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '*' && s[i + 1] === '*') { re += s[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += s[i + 2] === '/' ? 2 : 1; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
/** Gradle 테스트 필터(excludeTestsMatching · --tests) → 정규식. * 는 점을 포함해 아무 글자. */
const filterRe = (p) => new RegExp(`^${p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}(?:\\..*)?$`);

function testSelect() {
  const src = opt('--src');
  if (!src) { console.error('test-select --src <테스트 소스 디렉토리> 가 필요하다'); process.exit(2); }
  const srcAbs = path.resolve(root, src);
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const classes = walk(srcAbs).filter((f) => /\.(java|kt|groovy)$/.test(f)).map((f) => {
    const rel = posix(path.relative(srcAbs, f));
    const text = readFileSync(f, 'utf8');
    const fqn = rel.replace(/\.(java|kt|groovy)$/, '').split('/').join('.');
    return { rel, cls: rel.replace(/\.(java|kt|groovy)$/, '.class'), fqn, test: /(Test|Tests|IT)\.(java|kt|groovy)$/.test(rel) || /@Test\b/.test(text), abstract: /\babstract\s+class\b/.test(text) };
  }).filter((c) => c.test);
  const ants = opts('--exclude').map((p) => ({ p, re: antRe(p) }));
  const filters = opts('--filter-exclude').map((p) => ({ p, re: filterRe(p) }));
  const expect = new Set(opts('--expect-excluded'));
  // Gradle 은 디렉토리에도 패턴을 맞춘다 — 디렉토리가 맞으면 그 아래 전체가 빠진다
  const hitBy = (c) => {
    const segs = c.cls.split('/');
    for (const a of ants) for (let i = 1; i <= segs.length; i++) { const sub = segs.slice(0, i).join('/'); if (a.re.test(sub)) return `exclude '${a.p}'${i < segs.length ? ` (디렉토리 ${sub}/ 가 맞아 그 아래 전체)` : ''}`; }
    for (const f of filters) if (f.re.test(c.fqn)) return `excludeTestsMatching '${f.p}'`;
    return null;
  };
  const rows = classes.map((c) => ({ ...c, by: hitBy(c) }));
  const excluded = rows.filter((r) => r.by), kept = rows.filter((r) => !r.by && !r.abstract);
  console.log(`테스트 클래스 ${rows.length}개(추상 ${rows.filter((r) => r.abstract).length}) · 규칙이 빼는 것 ${excluded.length} · 돌아야 할 것 ${kept.length}`);
  for (const r of excluded) console.log(`  빠짐 ${r.fqn}${r.abstract ? '(추상 — 원래 돌지 않음)' : ''} ← ${r.by}`);
  if (expect.size) {
    for (const r of excluded) if (!expect.has(r.fqn) && !r.abstract) bad(`의도 밖 제외 ${r.fqn} ← ${r.by} — 돌아야 할 테스트가 빠진다`);
    for (const e of expect) if (!excluded.some((r) => r.fqn === e)) bad(`빼려던 ${e} 가 빠지지 않는다${rows.some((r) => r.fqn === e) ? '' : '(소스에서 찾지 못함)'}`);
  } else console.log('INFO --expect-excluded 가 없어 의도와 대조하지 않았다 — 위 「빠짐」 목록을 사용자에게 보이고 의도와 같은지 묻는다');

  const resDir = opt('--results');
  if (resDir) {
    const rd = path.resolve(root, resDir);
    const ran = new Set(existsSync(rd) ? readdirSync(rd).filter((f) => /^TEST-.+\.xml$/.test(f)).map((f) => f.replace(/^TEST-/, '').replace(/\.xml$/, '')) : []);
    const ranTop = new Set([...ran].map((x) => x.split('$')[0]));
    const missing = kept.filter((r) => !ranTop.has(r.fqn));
    const leaked = excluded.filter((r) => ranTop.has(r.fqn));
    console.log(`실행 결과 ${ran.size}개(${posix(rd)}) · 돌아야 할 것 ${kept.length} 중 결과 있음 ${kept.length - missing.length} · 결과 없음 ${missing.length} · 빠져야 할 것 중 돈 것 ${leaked.length}`);
    for (const r of leaked) bad(`빠져야 할 ${r.fqn} 가 돌았다 — 공유 자원에 닿았을 수 있다. 바로 사용자에게 알린다`);
    if (missing.length) {
      for (const r of missing.slice(0, 20)) console.log(`  결과 없음 ${r.fqn}`);
      if (missing.length > 20) console.log(`  … ${missing.length - 20}개 더`);
      bad(`돌아야 할 테스트 ${missing.length}개에 결과가 없다 — 제외가 넓거나, 결과 디렉토리가 이전 실행 판이다(cleanTest 뒤 다시)`);
    }
    if (!ran.size) bad('결과 파일이 0개다 — 실행이 안 됐거나 디렉토리가 틀렸다');
  }
  console.log(`test-select: failures=${fail}`);
  process.exit(fail ? 1 : 0);
}

// ── slots — kit 자산이 읽는 project 칸 ────────────────────────────────────────

/** kit 문서의 「이 … 가 읽는 슬롯:」 줄에서 칸 → 읽는 자산을 모은다. `x.*`(a·b) 는 a·b 로 편다. */
function kitSlots(kit) {
  const map = new Map();
  const add = (slot, asset) => { if (!map.has(slot)) map.set(slot, new Set()); map.get(slot).add(asset); };
  const docs = [];
  for (const sub of ['skills', 'commands', 'agents']) {
    const d = path.join(kit, sub);
    if (!existsSync(d)) continue;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { const f = path.join(d, e.name, 'SKILL.md'); if (existsSync(f)) docs.push({ f, asset: e.name }); }
      else if (e.name.endsWith('.md')) docs.push({ f: path.join(d, e.name), asset: sub === 'commands' ? `/${e.name.replace(/\.md$/, '')}` : e.name.replace(/\.md$/, '') });
    }
  }
  for (const { f, asset } of docs) {
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (!/읽는 슬롯:/.test(line)) continue;
      const re = /`([\w.*]+)`(?:\(([^)]*)\))?/g;
      let m;
      while ((m = re.exec(line))) {
        if (m[2] && m[1].endsWith('.*')) for (const k of m[2].split('·').map((x) => x.trim()).filter(Boolean)) add(m[1].replace(/\*$/, k), asset);
        else add(m[1], asset);
      }
    }
  }
  return map;
}
/** config 의 project 블록에서 값이 null 인 칸의 줄 번호와 그 줄(또는 바로 위 주석 줄)의 주석을 찾는다. */
function nullComments(text) {
  const start = text.search(/(^|\n)\s*project\s*:\s*\{/);
  const out = new Map();
  if (start < 0) return out;
  const lines = text.split(/\r?\n/);
  let pos = text.indexOf('{', start), lineNo = text.slice(0, pos).split('\n').length - 1;
  const stack = [], keyRe = /^\s*([A-Za-z_$][\w$]*|'[^']*'|"[^"]*")\s*:/;
  let depth = 0;
  for (let i = lineNo; i < lines.length; i++) {
    const raw = lines[i];
    const code = raw.replace(/\/\/.*$/, '').replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""');
    if (i === lineNo) { depth = 1; stack.push('project'); continue; }
    // 한 줄에 여러 키가 있으면(인라인 객체) 앞에서부터 읽는다
    let rest = code;
    while (rest.length) {
      const k = rest.match(keyRe);
      if (k) {
        const key = k[1].replace(/^['"]|['"]$/g, '');
        rest = rest.slice(k[0].length);
        const v = rest.match(/^\s*(\{|null\b)/);
        if (v && v[1] === '{') { stack.push(key); depth++; rest = rest.slice(v[0].length); continue; }
        if (v && v[1] === 'null') {
          const p = [...stack.slice(1), key].join('.');
          const cm = raw.match(/\/\/\s*(.*)$/) || ((lines[i - 1] || '').match(/^\s*\/\/\s*(.*)$/));
          out.set(p, { line: i + 1, comment: cm ? cm[1] : '' });
        }
        const next = rest.search(/[,{}]/);
        if (next < 0) break;
        rest = rest.slice(next);
        continue;
      }
      const c = rest[0];
      if (c === '{') { stack.push('?'); depth++; }
      else if (c === '}') { stack.pop(); depth--; if (depth === 0) return out; }
      rest = rest.slice(1).replace(/^\s*,?/, '');
    }
  }
  return out;
}
function tierOrExit() {
  try { return resolveTier(root, opt('--tier')); } catch (e) { console.error(e.message); process.exit(2); }
}
async function slots() {
  const { tier, from } = tierOrExit();
  console.log(`설치 범위: ${LABEL[tier]} (${from})`);
  const kit = path.resolve(opt('--kit') || path.join(path.dirname(SELF), '..', '..', '..'));
  const map = kitSlots(kit);
  if (!map.size) { console.error(`kit 문서에서 「읽는 슬롯」 줄을 찾지 못했다: ${posix(kit)}`); process.exit(2); }
  const cfgPath = abs('harness.config.mjs');
  if (!existsSync(cfgPath)) { console.error('harness.config.mjs 가 없다'); process.exit(2); }
  const cfg = (await import(pathToFileURL(cfgPath).href + `?t=${Date.now()}`)).default || {};
  const proj = cfg.project;
  if (!proj) { bad('config 에 project 블록이 없다 — kit 자산이 전부 멈추고 묻는다'); process.exit(1); }
  const nulls = nullComments(readFileSync(cfgPath, 'utf8'));
  const disabled = [];
  const resolve = (slot) => {
    const parts = slot.split('.');
    // 단일 레포에서 project.commands 가 없으면 kit 은 최상위 commands 를 읽는다(README 읽기 규칙 6)
    if (parts[0] === 'commands' && !('commands' in proj)) return [{ path: slot, state: 'fallback' }];
    const expand = (o, ps, pre) => {
      if (!ps.length) return [{ path: pre.join('.'), state: o === null ? 'null' : 'value' }];
      if (o === null) return [{ path: pre.join('.'), state: 'null' }];
      if (o === undefined || typeof o !== 'object') return [{ path: pre.join('.'), state: 'missing' }];
      const [h, ...t] = ps;
      if (h === '*') return Object.keys(o).length ? Object.keys(o).flatMap((k) => expand(o[k], t, [...pre, k])) : [{ path: [...pre, '*'].join('.'), state: 'empty' }];
      if (!(h in o)) return [{ path: [...pre, h].join('.'), state: t.length || pre.length ? 'missing' : 'missing' }];
      return expand(o[h], t, [...pre, h]);
    };
    return expand(proj, parts, []);
  };
  // 칸 패턴을 실제 칸으로 펴고, 같은 칸을 읽는 자산을 모은다(`commands.fe.*` 와 `commands.*.testAll` 이 같은 칸에 닿는다)
  const cells = new Map();
  for (const [slot, assets] of map) for (const r of resolve(slot)) {
    if (r.state === 'missing' && slot.includes('*')) continue;
    const c = cells.get(r.path) || { state: r.state, assets: new Set(), slot };
    for (const a of assets) c.assets.add(a);
    cells.set(r.path, c);
  }
  const deferred = [];
  for (const [p, c] of [...cells].sort(([a], [b]) => a.localeCompare(b))) {
    const who = [...c.assets].sort().join(', ');
    // 라이트 — 문서·메모리 칸은 키 없이 둔다. null 과 달리 말없이 건너뛰지 않고, 읽는 자산이 쓸 때 멈추고 묻는다
    if (c.state === 'missing' && tier === 'light' && deferredInLight(p)) { console.log(`DEFER project.${p} — 라이트라 키 없이 둔다. 읽는 자산 ${who} 가 쓸 때 묻는다 · 설치 끝의 문서 구조 질문(docs-setup)에서 정한다`); deferred.push(`project.${p} → ${who}`); continue; }
    if (c.state === 'missing') bad(`없음 project.${p} — 읽는 자산 ${who} 가 그 자리에서 멈추고 묻는다. 값이나 null + 주석을 넣는다`);
    else if (c.state === 'null') {
      const nc = nulls.get(p);
      const names = [...c.assets].map((a) => a.replace(/^\//, ''));
      const ok = nc && (names.some((n) => nc.comment.includes(n)) || /docs-setup/.test(nc.comment));
      if (!nc) console.log(`NULL project.${p} — 읽는 자산 ${who} (주석 위치를 찾지 못함 — 눈으로 본다)`);
      else if (!ok) bad(`null 주석에 꺼지는 자산이 없다 project.${p} :${nc.line} 「${nc.comment || '주석 없음'}」 — 읽는 자산 ${who} 중 무엇의 어느 단계가 건너뛰는지 적는다`);
      else console.log(`NULL project.${p} :${nc.line} — ${nc.comment}`);
      disabled.push(`project.${p} → ${who}`);
    } else if (c.state === 'fallback') console.log(`INFO project.${p} — project.commands 가 없어 최상위 commands 를 읽는다`);
  }
  console.log(`null 칸 ${disabled.length}개 — 보고의 「null 로 둔 칸」에 읽는 자산과 함께 옮긴다`);
  for (const d of disabled) console.log(`  ${d}`);
  if (deferred.length) {
    console.log(`키 없이 둔 칸 ${deferred.length}개(라이트) — 보고의 「키 없이 둔 칸」에 옮긴다. 읽는 자산이 쓸 때 묻는다`);
    for (const d of deferred) console.log(`  ${d}`);
  }
  console.log(`slots: failures=${fail}`);
  process.exit(fail ? 1 : 0);
}

// ── hooks — 그 범위의 하네스 훅이 정확히 1번, 범위 밖 훅은 0번 ──────────────────────

function hooks() {
  const { tier, from } = tierOrExit();
  console.log(`설치 범위: ${LABEL[tier]} (${from})`);
  const sf = '.claude/settings.json';
  if (!exists(sf)) { bad(`${sf} 가 없다`); console.log(`hooks: failures=${fail}`); process.exit(1); }
  let json;
  try { json = JSON.parse(readFileSync(abs(sf), 'utf8').replace(/^\uFEFF/, '')); } catch (e) { bad(`${sf} JSON 파싱 실패 ${e.message}`); console.log(`hooks: failures=${fail}`); process.exit(1); }
  const found = [];
  for (const [ev, groups] of Object.entries(json.hooks || {})) for (const g of Array.isArray(groups) ? groups : []) for (const h of g.hooks || []) {
    if (!/[\/\\]\.harness[\/\\]/.test(String(h.command || ''))) continue;
    found.push({ event: ev, matcher: g.matcher ?? null, command: h.command, spec: hookSpec(ev, h.command) });
  }
  for (const spec of HOOKS) {
    const n = found.filter((f) => f.spec === spec).length;
    const want = RANK[spec.tier] <= RANK[tier] ? 1 : 0;
    if (n === want) console.log(`OK   ${spec.event} 하네스 훅 ${n}개${want ? '' : ` — ${LABEL[tier]} 범위 밖(${spec.what})이라 걸지 않는다`}`);
    else if (want) bad(`${spec.event} 하네스 훅 ${n}개 — ${LABEL[tier]} 범위는 ${spec.what} 훅을 정확히 1번 건다`);
    else bad(`${spec.event} 하네스 훅 ${n}개 — ${LABEL[tier]} 범위 밖(${spec.what})인데 걸려 있다. 범위와 settings 가 어긋난다`);
    if (want && n && spec.matcher) {
      const m = found.find((f) => f.spec === spec).matcher || '';
      if (!/Bash/.test(m) || !/PowerShell/.test(m)) bad(`${spec.event} matcher 가 Bash·PowerShell 둘 다가 아님(${m || '*'})`);
    }
  }
  for (const f of found.filter((x) => !x.spec)) bad(`표에 없는 하네스 훅 ${f.event} | ${f.matcher ?? '*'} | ${f.command} — TEMPLATES §1 꼴이 아니다`);
  console.log(`hooks: failures=${fail}`);
  process.exit(fail ? 1 : 0);
}

// ── docs-hookup — 설치 끝에 문서 구조 맞추기(docs-setup)를 권할지 ──────────────────

/** 문서로 세는 것 — 루트 README·CLAUDE·CHANGELOG·LICENSE 와 .claude/·.github/·.harness/ 아래는 뺀다. */
const NOT_DOC = (p) => /^(README|CLAUDE|CHANGELOG|LICENSE)(\.[^/]*)?$/i.test(p) || /^(\.claude|\.github|\.harness|node_modules)\//.test(p) || /(^|\/)node_modules\//.test(p);
/** 이 수 이하면 「거의 빈 새 레포」로 본다 — 맞출 문서가 아직 없다. */
const NEAR_EMPTY_MAX = 2;
async function docsHookup() {
  const ls = (...a) => (tryGit('ls-files', '-z', ...a) || '').split('\0').filter(Boolean);
  const docs = [...new Set([...ls(), ...ls('-o', '--exclude-standard')])].filter((p) => /\.(md|markdown)$/i.test(p) && !NOT_DOC(p) && exists(p)).sort();
  const underDocs = docs.filter((p) => p.startsWith('docs/'));
  let cfg = null, cfgErr = null;
  if (exists('harness.config.mjs')) { try { cfg = (await import(pathToFileURL(abs('harness.config.mjs')).href + `?t=${Date.now()}`)).default || {}; } catch (e) { cfgErr = String(e.message || e); } }
  const proj = (cfg && cfg.project) || {};
  const state = (o, k) => (!o || typeof o !== 'object' || !(k in o) ? 'missing' : o[k] === null ? 'null' : Array.isArray(o[k]) && !o[k].length ? 'empty' : 'value');
  const archive = state(proj.docs, 'archiveDir');
  const docSlots = [...['archiveDir', 'pathValidator', 'autoloaded'].map((k) => ['docs', k]), ['memory', 'slugs']].map(([a, k]) => ({ path: `project.${a}.${k}`, state: state(proj[a], k) }));
  const nulls = docSlots.filter((s) => s.state === 'null').map((s) => s.path);
  const missing = docSlots.filter((s) => s.state === 'missing').map((s) => s.path);
  const marks = exists('harness.config.mjs') ? (readFileSync(abs('harness.config.mjs'), 'utf8').match(/\/\/\s*harness-kit:docs-setup\b/g) || []).length : 0;
  const archText = archive === 'value' ? JSON.stringify(proj.docs.archiveDir) : archive === 'null' ? 'null' : archive === 'empty' ? '빈 값' : '키 없음';
  console.log(`관찰: 문서 ${docs.length}개(docs/ 아래 ${underDocs.length}개 · 루트 README·CLAUDE·CHANGELOG 와 .claude/ 등은 세지 않음) · archiveDir ${archText} · 문서 칸 null ${nulls.length}개${nulls.length ? `(${nulls.join(' · ')})` : ''} · 키 없음 ${missing.length}개${missing.length ? `(${missing.join(' · ')})` : ''} · docs-setup 표시 칸 ${marks}개${cfgErr ? ` · WARN config 를 import 하지 못했다(${cfgErr.slice(0, 80)})` : ''}`);
  if (docs.length) console.log(`  문서 표본: ${docs.slice(0, 5).join(' · ')}${docs.length > 5 ? ` … ${docs.length - 5}개 더` : ''}`);
  let rec, why;
  if (docs.length <= NEAR_EMPTY_MAX) { rec = 'later'; why = `맞출 문서가 거의 없다(문서 ${docs.length}개 — ${NEAR_EMPTY_MAX}개 이하). 문서가 쌓인 뒤 docs-setup 을 돌려도 늦지 않다`; }
  else if (archive !== 'value' || nulls.length || missing.length) { rec = 'proceed'; why = `문서가 ${docs.length}개 있는데 ${archive !== 'value' ? `아카이브 폴더 칸(project.docs.archiveDir)이 ${archText}라` : `문서 칸 ${[...nulls, ...missing].length}개가 비어`} 문서 정리(archive-cycle)가 문서를 옮기지 못한다`; }
  else { rec = 'skip'; why = `아카이브 폴더(${JSON.stringify(proj.docs.archiveDir)})와 문서 칸이 이미 채워져 있다 — 묻지 않는다`; }
  const LBL = { proceed: '진행', later: '나중에', skip: '묻지 않음' };
  console.log(`권장: ${LBL[rec]}`);
  console.log(`권장 이유: ${why}`);
  const j = opt('--json');
  if (j) writeFileSync(path.resolve(j), JSON.stringify({ docs: docs.length, underDocs: underDocs.length, archiveDir: archive, nulls, missing, marks, recommend: rec, why }, null, 2) + '\n', 'utf8');
}

// ── plugin-hooks — 끌 플러그인이 건 훅 ────────────────────────────────────────

function pluginHooks() {
  const id = rootArg;
  const file = opt('--records') || process.env.HARNESS_INSTALL_PLUGINS_JSON || path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
  let recs;
  try { recs = (JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')).plugins || {})[id] || []; } catch (e) { console.error(`설치 기록을 읽지 못했다: ${file} (${e.message})`); process.exit(2); }
  if (!recs.length) { console.log(`${id} 설치 기록 없음(${posix(file)}) — 훅 목록을 낼 수 없다. 플러그인 디렉토리를 사용자에게 묻는다`); return; }
  const dirs = [...new Set(recs.map((r) => r.installPath).filter(Boolean))];
  for (const d of dirs) {
    console.log(`플러그인 디렉토리: ${posix(d)}`);
    const sources = [];
    const hj = path.join(d, 'hooks', 'hooks.json');
    if (existsSync(hj)) sources.push({ from: 'hooks/hooks.json', json: JSON.parse(readFileSync(hj, 'utf8').replace(/^\uFEFF/, '')) });
    const pj = path.join(d, '.claude-plugin', 'plugin.json');
    if (existsSync(pj)) { const p = JSON.parse(readFileSync(pj, 'utf8').replace(/^\uFEFF/, '')); if (p.hooks && typeof p.hooks === 'object') sources.push({ from: '.claude-plugin/plugin.json', json: p }); if (typeof p.hooks === 'string') console.log(`  plugin.json hooks → ${p.hooks}(그 파일을 읽는다)`); }
    if (!sources.length) console.log('  훅 없음 — 끄더라도 사라지는 가드는 없다(스킬·에이전트 겹침만 본다)');
    let n = 0;
    for (const s of sources) for (const [ev, groups] of Object.entries(s.json.hooks || {})) for (const g of groups || []) for (const h of g.hooks || []) {
      n++;
      const script = (String(h.command || '').match(/\$\{?CLAUDE_PLUGIN_ROOT\}?[\\/]([^"'\s]+)/) || [])[1];
      console.log(`  ${ev} | ${g.matcher || '*'} | ${h.command}${script ? ` → 읽을 파일 ${posix(path.join(d, script))}${existsSync(path.join(d, script)) ? '' : ' (없음)'}` : ''}`);
    }
    if (n) console.log(`  훅 ${n}개 — 각 스크립트가 이 레포에서 실제로 발동하는지(경로·마커 조건)와 막는 규칙(deny·ask·경고)을 읽어 빈자리 표를 만든다(DECISIONS.md D6-2)`);
  }
}

const table = { precheck, 'settings-snap': settingsSnap, 'settings-eol': settingsEol, 'after-cli': afterCli, 'test-select': testSelect, slots, hooks, 'docs-hookup': docsHookup, 'plugin-hooks': pluginHooks };
if (!table[cmd]) { console.error(USAGE); process.exit(2); }
await table[cmd]();
