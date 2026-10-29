#!/usr/bin/env node
/**
 * 사후리뷰 보조 스크립트 — `/harness-kit:review-pending` 과 `/harness-kit:save` 가 부른다.
 *
 * 사용: node review-pending.mjs <명령> [인자…]      (지금 디렉토리가 든 git 레포를 대상으로 한다)
 *   config                            리뷰 설정을 풀어 JSON 으로 낸다. 종료 0 = 칸 모두 있음 · 1 = 키 없는 칸 있음(missing) · 2 = config 를 읽지 못함
 *   unreviewed [범위…] [--json]       범위 안의 병합 아닌 커밋 가운데 리뷰 기록(note)이 없는 것. 종료 0 = 대상 없음 · 1 = 대상 있음 · 2 = 오류
 *                                     범위를 주지 않으면 `HEAD --not <remote>/<integrationBranch>` → 그 ref 가 없으면 `@{upstream}..HEAD`
 *   note <sha> pass|fail [--by <누가>] [--summary <한 줄>]
 *                                     그 커밋의 리뷰 기록을 notes ref 에 쓴다(있으면 바꾼다). 종료 0 = 씀 또는 꺼짐(review null) · 2 = 오류
 *
 * 읽는 칸(레포 harness.config.mjs 의 project, 없으면 project.pairOwner 가 가리키는 주 레포 config):
 *   review.notesRef · review.integrationBranch · review.remote · review.batchAsk · git.reviewThreshold
 * - 키가 없으면 지어내지 않는다 — config 는 missing 에 적고, unreviewed·note 는 필요한 칸이 없으면 종료 2.
 *   예외: git.reviewThreshold 는 키가 없어도 돈다(전부 대상 · grade unknown). null 이면 전부 대상 · grade all.
 * - review 가 null 이거나 review.notesRef 가 null 이면 사후리뷰가 꺼진 것이다 — unreviewed 는 0건, note 는 쓰지 않는다.
 * - review.remote 가 null 이면 원격이 없는 레포다 — 통합 브랜치는 로컬 브랜치로 본다. fetch·push 는 커맨드가 건너뛴다.
 *
 * 이 스크립트는 notes ref 말고는 git 에 쓰지 않는다 — 코드·커밋·워킹트리를 바꾸지 않고, fetch·push 도 하지 않는다.
 */
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const CONFIG = 'harness.config.mjs';
export const REVIEW_KEYS = ['notesRef', 'integrationBranch', 'remote', 'batchAsk'];
const MISSING = Symbol('missing');

const git = (root, args, opts = {}) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['pipe', 'pipe', 'pipe'], ...opts });
const tryGit = (root, args) => { try { return git(root, args); } catch { return null; } };
const has = (o, k) => o != null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

/** config 파일을 import 한다 — 다른 kit 스크립트와 같은 방식(BOM·CRLF 는 Node 가 처리한다). 없으면 null. */
async function loadConfig(file) {
  if (!existsSync(file)) return null;
  return (await import(pathToFileURL(file).href + `?t=${Date.now()}${Math.random()}`)).default || {};
}

/** project 아래 경로의 값 — 키가 없으면 MISSING. 경로 중간이 null 이면 null(그 블록이 꺼짐). */
function pick(project, parts) {
  let o = project;
  for (const k of parts) {
    if (o === null) return null;
    if (!has(o, k)) return MISSING;
    o = o[k];
  }
  return o;
}

/**
 * 리뷰 설정을 푼다. 칸마다 자기 config → pairOwner config 순으로 찾는다(README 읽기 규칙 3).
 * @returns {{ root, configFile, owner, review:{notesRef,integrationBranch,remote,batchAsk}, threshold, from, missing, disabled, refs }}
 */
export async function resolveConfig(root) {
  const configFile = path.join(root, CONFIG);
  const self = await loadConfig(configFile);
  if (!self) throw new Error(`${CONFIG} 가 없다(${root.replace(/\\/g, '/')}) — 하네스 설치(harness-install) 뒤에 돌린다`);
  const sp = self.project || {};
  let owner = null, ownerFile = null;
  if (typeof sp.pairOwner === 'string' && sp.pairOwner) {
    ownerFile = path.join(path.resolve(root, sp.pairOwner), CONFIG);
    owner = await loadConfig(ownerFile);
  }
  const op = (owner && owner.project) || null;
  const from = {}, missing = [];
  const get = (parts) => {
    const key = parts.join('.');
    let v = pick(sp, parts);
    from[key] = 'self';
    if (v === MISSING && op) { v = pick(op, parts); from[key] = 'pairOwner'; }
    if (v === MISSING) { from[key] = 'missing'; missing.push(`project.${key}`); return undefined; }
    return v;
  };
  const review = Object.fromEntries(REVIEW_KEYS.map((k) => [k, get(['review', k])]));
  const threshold = get(['git', 'reviewThreshold']);
  const disabled = review.notesRef === null;
  const refs = disabled || review.notesRef === undefined ? null : {
    notes: `refs/notes/${review.notesRef}`,
    tracking: review.remote ? `refs/notes/${review.notesRef}-${review.remote}` : null,
  };
  return {
    root: root.replace(/\\/g, '/'), configFile: configFile.replace(/\\/g, '/'), owner: ownerFile && ownerFile.replace(/\\/g, '/'),
    review, threshold: threshold === undefined ? null : threshold, thresholdState: threshold === undefined ? 'missing' : threshold === null ? 'null' : 'value',
    from, missing, disabled, refs,
  };
}

/**
 * 범위를 주지 않았을 때의 기본 범위. 순수.
 * 통합 브랜치에 아직 없는 이 브랜치 커밋을 본다 — `@{upstream}..HEAD` 는 push 하자마자 비어서 둘째 자리다.
 * @param {{ integrationBranch?: string|null, remote?: string|null, branch?: string, integrationRefExists?: boolean, hasUpstream?: boolean }} s
 * @returns {{ args: string[]|null, note: string|null }} args 가 null 이면 범위를 정하지 못했다(note 가 이유)
 */
export function pickDefaultRange({ integrationBranch = null, remote = null, branch = '', integrationRefExists = false, hasUpstream = false } = {}) {
  const ref = integrationBranch ? (remote ? `${remote}/${integrationBranch}` : integrationBranch) : null;
  // 원격이 없으면 통합 브랜치는 로컬 브랜치다 — 그 브랜치 위에서는 `HEAD --not <자기>` 가 늘 비어 둘째 자리로 간다
  const self = !remote && branch === integrationBranch;
  if (ref && integrationRefExists && !self) return { args: ['HEAD', '--not', ref], note: null };
  let why;
  if (!integrationBranch) why = 'project.review.integrationBranch 가 null 이라';
  else if (self) why = `지금 브랜치가 통합 브랜치(${integrationBranch}) 자신이고 원격이 없어`;
  else why = `통합 브랜치 ref(${ref})가 없어${remote ? '(fetch 전이면 받은 뒤 다시 돌린다)' : ''}`;
  if (hasUpstream) return { args: ['@{upstream}..HEAD'], note: `${why} 기본 범위를 @{upstream}..HEAD 로 쓴다` };
  return { args: null, note: `${why} 기본 범위를 정하지 못했다 — upstream 도 없다. 범위를 인자로 준다(예: main..HEAD)` };
}

/** numstat 줄 → { files, lines }. save 「diff 리뷰 게이트」의 awk 와 같다 — 바이너리(`-`)는 0 줄로 센다. 순수. */
export function countNumstat(text) {
  let files = 0, lines = 0;
  for (const l of String(text).split(/\r?\n/)) {
    const m = /^(\S+)\t(\S+)\t/.exec(l);
    if (!m) continue;
    files++;
    lines += (Number(m[1]) || 0) + (Number(m[2]) || 0);
  }
  return { files, lines };
}

/** 임계 판정 — 파일 수 초과 또는 추가+삭제 줄 수 초과(save 와 같다). 넘은 쪽을 rules 로 낸다. 순수. */
export function overThreshold({ files, lines }, t) {
  const rules = [];
  if (t && Number.isFinite(t.files) && files > t.files) rules.push(`files ${files} > ${t.files}`);
  if (t && Number.isFinite(t.lines) && lines > t.lines) rules.push(`lines ${lines} > ${t.lines}`);
  return rules;
}

/** 리뷰 기록이 있는 커밋 sha — 로컬 notes ref 와 원격에서 받은 ref 의 합집합. verdict 는 보지 않는다(fail 도 리뷰한 커밋). 없는 ref 는 빈 집합. */
export function notedCommits(root, refs) {
  const out = new Set();
  for (const ref of [refs.notes, refs.tracking].filter(Boolean)) {
    if (tryGit(root, ['rev-parse', '--verify', '--quiet', ref]) === null) continue;
    const list = tryGit(root, ['notes', `--ref=${ref}`, 'list']) || '';
    for (const l of list.split(/\r?\n/)) { const sha = l.trim().split(/\s+/)[1]; if (sha) out.add(sha); }
  }
  return out;
}

/** note 본문. 값의 줄바꿈은 공백으로 접는다(한 키 한 줄). 순수. */
export function formatNote({ verdict, reviewedAt, reviewer, summary }) {
  const one = (s) => String(s).replace(/\s*\r?\n\s*/g, ' ').trim();
  return [
    `Review: ${verdict}`,
    `Reviewed-At: ${reviewedAt}`,
    `Reviewer: ${one(reviewer)}`,
    ...(summary ? [`Summary: ${one(summary)}`] : []),
  ].join('\n') + '\n';
}

/** note 본문 → { review, reviewedAt, reviewer, summary }. 키마다 마지막 줄을 읽는다. 순수. */
export function parseNote(text) {
  const keys = { 'review': 'review', 'reviewed-at': 'reviewedAt', 'reviewer': 'reviewer', 'summary': 'summary' };
  const out = {};
  for (const l of String(text || '').split(/\r?\n/)) {
    const m = /^([A-Za-z-]+):\s?(.*)$/.exec(l);
    if (m && keys[m[1].toLowerCase()]) out[keys[m[1].toLowerCase()]] = m[2].trim();
  }
  return out;
}

/** 범위 안의 병합 아닌 커밋 가운데 리뷰 기록이 없고 임계를 넘는(임계가 없으면 전부) 것. */
export function findUnreviewed(root, cfg, revArgs) {
  const log = git(root, ['-c', 'core.quotePath=false', 'log', '--no-merges', '--format=%H%x1f%s%x1e', ...revArgs]);
  const noted = notedCommits(root, cfg.refs);
  const t = cfg.thresholdState === 'value' ? cfg.threshold : null;
  const out = [];
  for (const rec of log.split('\x1e')) {
    const [sha, subject] = rec.replace(/^\s+/, '').split('\x1f');
    if (!sha || noted.has(sha)) continue;
    const size = countNumstat(git(root, ['-c', 'core.quotePath=false', 'show', '--numstat', '--format=', '--no-color', sha]));
    if (t) {
      const rules = overThreshold(size, t);
      if (!rules.length) continue;
      out.push({ sha, subject: subject || '', grade: 'over', rules, ...size });
    } else out.push({ sha, subject: subject || '', grade: cfg.thresholdState === 'null' ? 'all' : 'unknown', rules: [], ...size });
  }
  return out;
}

// ── 명령 ───────────────────────────────────────────────────────────────────

const err = (m) => { process.stderr.write(`[review-pending] ${m}\n`); };
const needKeys = (cfg, keys) => {
  const want = keys.map((k) => `project.review.${k}`);
  const gone = cfg.missing.filter((k) => want.includes(k));
  if (gone.length) throw new Error(`키 없는 칸: ${gone.join(' · ')} — 지어내지 않는다. config 에 값이나 null + 주석을 적는다(harness-install D8)`);
};

async function cmdConfig(root) {
  const cfg = await resolveConfig(root);
  console.log(JSON.stringify(cfg, null, 2));
  return cfg.missing.length ? 1 : 0;
}

async function cmdUnreviewed(root, args) {
  const json = args.includes('--json');
  const revs = args.filter((a) => a !== '--json');
  const cfg = await resolveConfig(root);
  if (cfg.disabled) {
    err('project.review(.notesRef) 가 null — 사후리뷰가 꺼져 있다. 대상 0건');
    if (json) console.log(JSON.stringify({ disabled: true, range: null, commits: [] }));
    return 0;
  }
  needKeys(cfg, revs.length ? ['notesRef', 'remote'] : ['notesRef', 'remote', 'integrationBranch']);
  if (cfg.thresholdState === 'missing') err('project.git.reviewThreshold 키가 없다 — 임계 없이 전부 대상으로 본다(grade unknown)');
  let range = revs, rangeNote = null;
  if (!revs.length) {
    const { integrationBranch, remote } = cfg.review;
    const branch = (tryGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']) || '').trim();
    const ref = integrationBranch ? (remote ? `refs/remotes/${remote}/${integrationBranch}` : `refs/heads/${integrationBranch}`) : null;
    const pickd = pickDefaultRange({
      integrationBranch, remote, branch,
      integrationRefExists: !!ref && tryGit(root, ['rev-parse', '--verify', '--quiet', ref]) !== null,
      hasUpstream: tryGit(root, ['rev-parse', '--verify', '--quiet', '@{upstream}']) !== null,
    });
    if (!pickd.args) { err(pickd.note); return 2; }
    range = pickd.args; rangeNote = pickd.note;
    if (rangeNote) err(rangeNote);
  }
  let commits;
  try { commits = findUnreviewed(root, cfg, range); } catch (e) { err(`범위를 읽지 못했다(${range.join(' ')}) — ${String(e.stderr || e.message).trim().split('\n')[0]}`); return 2; }
  const out = { range: range.join(' '), rangeNote, threshold: cfg.thresholdState === 'value' ? cfg.threshold : cfg.thresholdState, refs: cfg.refs, commits };
  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`범위: ${out.range}${rangeNote ? ` (${rangeNote})` : ''}`);
    console.log(`대상 ${commits.length}건`);
    for (const c of commits) console.log(`  ${c.sha.slice(0, 9)} ${c.grade}${c.rules.length ? ` (${c.rules.join(' · ')})` : ''} ${c.subject}`);
  }
  return commits.length ? 1 : 0;
}

async function cmdNote(root, args) {
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const [shaArg, verdict] = args;
  if (!shaArg || !['pass', 'fail'].includes(verdict)) { err('사용: note <sha> pass|fail [--by <누가>] [--summary <한 줄>]'); return 2; }
  const cfg = await resolveConfig(root);
  if (cfg.disabled) { err('project.review(.notesRef) 가 null — 사후리뷰가 꺼져 있어 기록하지 않는다'); return 0; }
  needKeys(cfg, ['notesRef']);
  const sha = (tryGit(root, ['rev-parse', '--verify', '--quiet', `${shaArg}^{commit}`]) || '').trim();
  if (!sha) { err(`커밋이 아니다: ${shaArg}`); return 2; }
  const body = formatNote({ verdict, reviewedAt: new Date().toISOString(), reviewer: opt('--by') || 'review-pending', summary: opt('--summary') });
  try { git(root, ['notes', `--ref=${cfg.refs.notes}`, 'add', '-f', '-F', '-', sha], { input: body }); } catch (e) { err(`기록하지 못했다 — ${String(e.stderr || e.message).trim().split('\n')[0]}`); return 2; }
  console.log(`기록: ${cfg.refs.notes} ${sha.slice(0, 9)} ${verdict}`);
  return 0;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const top = tryGit(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (!top) { err('git 레포 안에서 돌린다'); return 2; }
  const root = path.resolve(top.trim());
  const table = { config: () => cmdConfig(root), unreviewed: () => cmdUnreviewed(root, args), note: () => cmdNote(root, args) };
  if (!table[cmd]) { err('사용: node review-pending.mjs <config|unreviewed|note> [인자…]'); return 2; }
  try { return await table[cmd](); } catch (e) { err(String(e.message || e).split('\n')[0]); return 2; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then((c) => { process.exitCode = c; });
