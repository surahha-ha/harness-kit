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
 *   lanes <sha> [--json]              그 커밋 diff 로 리뷰 갈래를 고른다. A(정확성)는 늘 켠다. B(보안)·C(성능)는 켠 이유와 함께 낸다
 *   lanes --worktree [-- <경로…>] [--json]
 *                                     커밋 전 diff(git diff HEAD -- <경로…>, 미추적 파일 포함)로 고른다 — save 「diff 리뷰 게이트」용
 *                                     종료 0 = 골랐다 · 2 = 오류. config 를 읽지 않는다
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

// ── 리뷰 갈래 고르기(lanes) ───────────────────────────────────────────────────
// 정밀도 우선이다. 대부분 커밋은 A 하나만 돌아야 한다 — 패턴이 넓어 B·C 가 늘 켜지면 갈래를 나눈 뜻이 없다.
// 문서·시험·잠금 파일은 보지 않는다. 내용 패턴은 추가 줄만 본다(인가 검사는 지운 줄도 본다).

/** 갈래 고르기에서 빼는 파일 — 문서 · 시험 · 잠금 · 압축본 */
export const LANE_SKIP = /\.(md|mdx|markdown|txt|rst|adoc)$|(^|\/)(tests?|__tests__|specs?|fixtures?)\/|[._-](test|spec)\.[^/]+$|Test\.(java|kt)$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|\.min\.(js|css)$/i;

const SQL_I = /\b(select\b[^;]*?\bfrom|insert\s+into|update\s+\S+\s+set|delete\s+from|merge\s+into)\b/i;
const SQL_UPPER = /\b(SELECT\b[^;]*?\bFROM|INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM|MERGE\s+INTO)\b/;
/** SQL 문 — 대문자 키워드, SQL·XML 파일, 따옴표 안의 소문자 키워드. 주석 속 영어 낱말(select … from)은 잡지 않는다. */
function sqlHit(text, file) {
  if (SQL_UPPER.test(text)) return true;
  const m = SQL_I.exec(text);
  return !!m && (/\.(sql|xml)$/i.test(file) || /["'`]/.test(text.slice(0, m.index)));
}
/** 낱말 패턴용 — camelCase 를 _ 로 끊고 소문자로 */
const norm = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const word = (alt) => new RegExp(`(?<![a-z0-9])(${alt})(?![a-z0-9])`);

const CONCAT = /["'`]\s*\+\s*\w|\w\s*\+\s*["'`]|\$\{|%s|\.format\(|\bf["']/;
const SECRET_NAME = /(password|passwd|secret|api_?key|access_?key|private_?key|client_?secret|auth_?token)\w*["']?\s*[:=]\s*["']([^"'\s]{6,})["']/;
const PLACEHOLDER = /^(<.*>|\$\{.*\}|x+|\*+)$|example|changeme|dummy|placeholder|your_/i;
const PII = word('ssn|social_?security(_?(no|number))?|resident_?(registration|reg)_?(no|number)|birth_?date|date_?of_?birth|passport_?(no|number)|credit_?card|card_?(no|number)|account_?(no|number)|bank_?account');
const LOG_CALL = /\b(console\.(log|info|warn|error|debug)|log(ger)?\.(info|warn|error|debug|trace)|logging\.\w+|print(ln|f)?)\s*\(/;
const SENSITIVE = word('password|passwd|secret|token|api_?key|ssn|email|phone|card_?(no|number)');
const AUTH_CHECK = /@(PreAuthorize|PostAuthorize|Secured|RolesAllowed|PermitAll|DenyAll)\b|\b(permitAll|hasRole|hasAnyRole|hasAuthority|hasPermission|isAuthenticated|checkPermission|requireAuth\w*)\s*\(/;
// 직접 만든 권한 판정 — validate·is·has… 뒤에 대문자로 이어지고 권한 낱말을 품은 식별자의 선언·호출(isFinalApprover · validateApprover · canAccessOrder)
const AUTHZ_NAME = /\b(?:validate|verify|check|ensure|require|is|has|can)(?=[A-Z])\w*?(?:Approv|Permission|Owner|Role|Access|Auth|Scope|Admin|Privilege|Grant)\w*\s*\(/;
const UNSAFE = /\beval\s*\(|\bnew\s+Function\s*\(|shell\s*=\s*True|Runtime\.getRuntime\(\)\.exec|\.innerHTML\s*=|dangerouslySetInnerHTML|\bv-html\b/;
const ORM = /\.(findAll|findMany|findUnique|findFirst|findBy\w+|selectList|selectOne|selectMap|createQuery|createNativeQuery|executeQuery|executeUpdate|batchUpdate|queryFor\w+|query)\s*\(|\b(jdbcTemplate|entityManager|knex|sequelize|prisma)\.\w+/;
const UNBOUNDED = /\.(findAll|selectList)\s*\(\s*\)/;
// 쓰기 호출 — 저장소 메서드 이름(persist · insertUser · upsert…)과, 받는 쪽이 저장소·DB 인 save · insert · update · delete · remove · merge.
// 캔버스의 save, 목록의 insert, Map·Set 의 delete · merge 는 받는 쪽이 저장소가 아니라 잡지 않는다
const WRITE = /\.(persist|persistAndFlush|insert[A-Z]\w*|upsert\w*|bulkCreate|bulkWrite)\s*\(|\b\w*(?:Repository|Repo|Dao|Mapper|repository|repo|dao|mapper|entityManager|db|knex)\.(save\w*|insert|update\w*|delete\w*|remove\w*|merge)\s*\(/;
// 반복문 — 문장 반복(for · while)과 몸통이 도는 콜백(forEach · map(async …)). filter·sort 사슬은 반복문으로 보지 않는다
const LOOP = /^\s*(\}\s*)?(for|while)\b|\.forEach\s*\(|\.(map|flatMap)\s*\(\s*async\b/;
const IO = /\bawait\b|\bfetch\s*\(|\baxios\.|\bhttps?\.(get|request)\s*\(|\b(read|write)FileSync\s*\(|\b(exec|execFile|spawn)Sync\s*\(|\brequests\.(get|post)\s*\(/;
const SORT = /\.sort\s*\(|\bsorted\s*\(|Collections\.sort\s*\(/;
const LOOP_WINDOW = 24;

/** 기본 패턴 목록. 경로 낱말은 camelCase 와 / . _ - 로 끊은 낱말과 맞춘다. */
export const LANE_RULES = {
  B: {
    pathWords: ['auth', 'authn', 'authz', 'authentication', 'authorization', 'login', 'logout', 'oauth', 'jwt', 'token', 'password', 'passwd', 'secret', 'secrets', 'credential', 'credentials', 'permission', 'permissions', 'acl', 'role', 'roles', 'session', 'sessions', 'cookie', 'cookies', 'crypto', 'cipher', 'scope', 'scopes', 'owner', 'owners', 'ownership', 'grant', 'grants', 'privilege', 'privileges', 'mask', 'masking', 'masker', 'sensitive', 'privacy'],
    pathFile: /(^|\/)\.env(\.[^/]*)?$|\.(pem|p12|pfx|jks|keystore)$|(^|\/)id_(rsa|ed25519|ecdsa)$/i,
    added: {
      'sql-concat': (t, f) => sqlHit(t, f) && CONCAT.test(t),
      'secret-literal': (t) => { const m = SECRET_NAME.exec(norm(t)); return !!m && !PLACEHOLDER.test(m[2]); },
      'pii-field': (t) => PII.test(norm(t)),
      'sensitive-log': (t) => LOG_CALL.test(t) && SENSITIVE.test(norm(t)),
      'auth-check': (t) => AUTH_CHECK.test(t),
      'authz-helper': (t) => !AUTH_CHECK.test(t) && AUTHZ_NAME.test(t),
      'unsafe-exec': (t) => UNSAFE.test(t),
    },
    removed: { 'auth-check-removed': (t) => AUTH_CHECK.test(t) },
  },
  C: {
    pathWords: ['mapper', 'mappers', 'repository', 'repositories', 'dao', 'query', 'queries', 'sql'],
    pathFile: /\.sql$/i,
    added: {
      'sql': (t, f) => sqlHit(t, f),
      'orm-call': (t) => ORM.test(t),
      'unbounded-read': (t) => UNBOUNDED.test(t),
    },
    removed: {},
    // 그 밖에 반복문 창(loopHits): io-in-loop · sort-in-loop · nested-loop
  },
};

const unquote = (p) => (p.startsWith('"') && p.endsWith('"') ? p.slice(1, -1).replace(/\\(.)/g, '$1') : p);
const stripSide = (p) => { const s = unquote(p.replace(/\t.*$/, '')); return s === '/dev/null' ? null : s.replace(/^[ab]\//, ''); };

/** unified diff → [{ path, added:[{line,text,hunk}], removed:[…] }]. 순수. */
export function parseDiff(text) {
  const files = [];
  let cur = null, inHunk = false, hunk = 0, oldLn = 0, newLn = 0;
  for (const raw of String(text).split('\n')) {
    const l = raw.replace(/\r$/, '');
    if (l.startsWith('diff --git ')) {
      const m = / b\/(.*)$/.exec(l);
      cur = { path: m ? unquote(m[1]) : null, added: [], removed: [] };
      files.push(cur); inHunk = false; continue;
    }
    if (!cur) continue;
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) { inHunk = true; hunk++; oldLn = Number(h[1]); newLn = Number(h[2]); continue; }
    if (!inHunk) {
      if (l.startsWith('+++ ')) { const p = stripSide(l.slice(4)); if (p) cur.path = p; }
      else if (l.startsWith('--- ')) { const p = stripSide(l.slice(4)); if (p && !cur.path) cur.path = p; }
      continue;
    }
    if (l.startsWith('+')) cur.added.push({ line: newLn++, text: l.slice(1), hunk });
    else if (l.startsWith('-')) cur.removed.push({ line: oldLn++, text: l.slice(1), hunk });
    else if (l.startsWith(' ')) { oldLn++; newLn++; }
  }
  return files.filter((f) => f.path);
}

const pathWords = (p) => norm(p).split(/[^a-z0-9]+/).filter(Boolean);
const snip = (s) => { const t = s.trim(); return t.length > 80 ? `${t.slice(0, 77)}…` : t; };

const indentOf = (s) => /^\s*/.exec(s)[0].replace(/\t/g, '    ').length;

/** 반복문 줄에서 몸통이 시작하는 곳 — `for (…)`·`while (…)` 는 짝 괄호 뒤, `for x in y:` 는 `:` 뒤, 콜백은 `=>`·`{` 뒤. 순수. */
function bodyStart(text) {
  const kw = /^\s*(?:\}\s*)?(?:for|while)\s*\(/.exec(text);
  if (kw) {
    let depth = 0;
    for (let i = kw[0].length - 1; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')' && --depth === 0) return i + 1;
    }
    return text.length;
  }
  const py = /^\s*(?:for|while)\b[^:]*:/.exec(text);
  if (py) return py[0].length;
  const cb = /\.forEach\s*\(|\.(?:map|flatMap)\s*\(\s*async\b/.exec(text);
  const arrow = cb ? /=>|\{/.exec(text.slice(cb.index)) : null;
  return arrow ? cb.index + arrow.index + arrow[0].length : text.length;
}

/**
 * C 의 반복문 몸통 — 반복문 줄의 머리 뒤(bodyStart)와, 바로 이어지는 더 깊게 들여 쓴 추가 줄 LOOP_WINDOW 개.
 * 반복 대상 식(머리)은 한 번만 돌므로 보지 않는다. 몸통에 IO·질의·쓰기 호출·정렬이 있으면 낸다. 순수.
 */
function loopHits(file, added) {
  const out = [];
  for (let i = 0; i < added.length; i++) {
    const a = added[i];
    if (!LOOP.test(a.text)) continue;
    const body = [{ ...a, text: a.text.slice(bodyStart(a.text)) }];
    const base = indentOf(a.text);
    for (let j = i + 1, prev = a.line; j < added.length && body.length <= LOOP_WINDOW; j++) {
      const b = added[j];
      if (b.hunk !== a.hunk || b.line !== prev + 1) break;
      prev = b.line;
      if (b.text.trim() && indentOf(b.text) <= base) break;
      body.push(b);
    }
    const io = body.find((w) => IO.test(w.text) || ORM.test(w.text) || WRITE.test(w.text) || sqlHit(w.text, file));
    if (io) out.push({ pattern: 'io-in-loop', at: added.find((x) => x.line === io.line) });
    const so = body.find((w) => SORT.test(w.text));
    if (so) out.push({ pattern: 'sort-in-loop', at: added.find((x) => x.line === so.line) });
  }
  return out;
}

/**
 * diff 글 → 켤 갈래와 이유. A 는 늘 켠다. 순수.
 * @returns {{ lanes: string[], reasons: { B: object[], C: object[] }, skipped: string[] }}
 *   이유 하나 = { file, line|null, kind: 'path'|'added'|'removed', pattern, text }
 */
export function pickLanes(diffText) {
  const reasons = { B: [], C: [] }, skipped = [];
  const seen = new Set();
  const push = (lane, r) => { const k = `${lane}|${r.file}|${r.line}|${r.pattern}`; if (!seen.has(k)) { seen.add(k); reasons[lane].push(r); } };
  for (const f of parseDiff(diffText)) {
    if (LANE_SKIP.test(f.path) && !LANE_RULES.B.pathFile.test(f.path)) { skipped.push(f.path); continue; }
    const words = pathWords(f.path);
    for (const lane of ['B', 'C']) {
      const R = LANE_RULES[lane];
      const w = words.find((x) => R.pathWords.includes(x));
      if (w) push(lane, { file: f.path, line: null, kind: 'path', pattern: `path:${w}`, text: '' });
      else if (R.pathFile.test(f.path)) push(lane, { file: f.path, line: null, kind: 'path', pattern: 'path:file', text: '' });
      for (const [kind, list, rules] of [['added', f.added, R.added], ['removed', f.removed, R.removed]]) {
        for (const a of list) {
          for (const [id, hit] of Object.entries(rules)) {
            if (hit(a.text, f.path)) push(lane, { file: f.path, line: a.line, kind, pattern: id, text: id === 'secret-literal' ? '<값 가림>' : snip(a.text) });
          }
        }
      }
    }
    for (const h of loopHits(f.path, f.added)) push('C', { file: f.path, line: h.at.line, kind: 'added', pattern: h.pattern, text: snip(h.at.text) });
  }
  const lanes = ['A', ...['B', 'C'].filter((l) => reasons[l].length)];
  return { lanes, reasons, skipped };
}

const DIFF_OPTS = ['-c', 'core.quotePath=false', '-c', 'diff.noprefix=false'];
const DIFF_FLAGS = ['-U0', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'];

/** 커밋 하나의 diff(첫 부모 대비, 뿌리 커밋은 빈 트리 대비) */
export function commitDiff(root, sha) {
  const full = (tryGit(root, ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`]) || '').trim();
  if (!full) throw new Error(`커밋이 아니다: ${sha}`);
  const parent = tryGit(root, ['rev-parse', '--verify', '--quiet', `${full}^`]);
  return parent
    ? git(root, [...DIFF_OPTS, 'diff', ...DIFF_FLAGS, parent.trim(), full])
    : git(root, [...DIFF_OPTS, 'show', '--format=', ...DIFF_FLAGS, full]);
}

/** 커밋 전 diff — git diff HEAD -- <경로…> 와 그 경로 안 미추적 파일(빈 파일 대비) */
export function worktreeDiff(root, paths) {
  let out = git(root, [...DIFF_OPTS, 'diff', ...DIFF_FLAGS, 'HEAD', '--', ...paths]);
  const others = git(root, ['-c', 'core.quotePath=false', 'ls-files', '--others', '--exclude-standard', '-z', '--', ...paths]).split('\0').filter(Boolean);
  for (const f of others) {
    // --no-index 는 차이가 있으면 종료 1 이 정상이다 — 출력은 그대로 쓴다
    try { out += git(root, [...DIFF_OPTS, 'diff', '--no-index', ...DIFF_FLAGS, '/dev/null', f]); } catch (e) { if (e.status === 1) out += e.stdout; else throw e; }
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

const LANE_NAME = { A: '정확성', B: '보안', C: '성능' };

async function cmdLanes(root, args) {
  const json = args.includes('--json');
  const dd = args.indexOf('--');
  const paths = dd >= 0 ? args.slice(dd + 1).filter((a) => a !== '--json') : [];
  const head = (dd >= 0 ? args.slice(0, dd) : args).filter((a) => a !== '--json');
  const worktree = head.includes('--worktree');
  const sha = head.find((a) => a !== '--worktree');
  if (worktree === !!sha) { err('사용: lanes <sha> [--json] | lanes --worktree [-- <경로…>] [--json]'); return 2; }
  let diff;
  try { diff = worktree ? worktreeDiff(root, paths) : commitDiff(root, sha); } catch (e) { err(`diff 를 읽지 못했다 — ${String(e.stderr || e.message).trim().split('\n')[0]}`); return 2; }
  const r = pickLanes(diff);
  const source = worktree ? `worktree${paths.length ? ` -- ${paths.join(' ')}` : ''}` : sha;
  if (json) { console.log(JSON.stringify({ source, ...r }, null, 2)); return 0; }
  console.log(`갈래: ${r.lanes.map((l) => `${l}(${LANE_NAME[l]})`).join(' · ')}`);
  console.log('A: 늘 켠다');
  for (const l of ['B', 'C']) {
    const rs = r.reasons[l];
    if (!rs.length) { console.log(`${l}: 꺼짐`); continue; }
    for (const x of rs.slice(0, 5)) console.log(`${l}: ${x.file}${x.line ? `:${x.line}` : ''} — ${x.kind === 'path' ? '경로' : x.kind === 'removed' ? '지운 줄' : '추가 줄'} ${x.pattern}${x.text ? ` · ${x.text}` : ''}`);
    if (rs.length > 5) console.log(`${l}: 외 ${rs.length - 5}건`);
  }
  if (r.skipped.length) console.log(`보지 않음(문서·시험·잠금): ${r.skipped.length}개 파일`);
  return 0;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const top = tryGit(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (!top) { err('git 레포 안에서 돌린다'); return 2; }
  const root = path.resolve(top.trim());
  const table = { config: () => cmdConfig(root), unreviewed: () => cmdUnreviewed(root, args), note: () => cmdNote(root, args), lanes: () => cmdLanes(root, args) };
  if (!table[cmd]) { err('사용: node review-pending.mjs <config|unreviewed|note|lanes> [인자…]'); return 2; }
  try { return await table[cmd](); } catch (e) { err(String(e.message || e).split('\n')[0]); return 2; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then((c) => { process.exitCode = c; });
