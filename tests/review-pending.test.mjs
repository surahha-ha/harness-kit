// review-pending.mjs 시험 — 임시 git 레포에 커밋·브랜치·notes 를 만들고 config · unreviewed · note 를 돌린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { pickDefaultRange, countNumstat, overThreshold, formatNote, parseNote, pickLanes, parseDiff } from '../plugins/harness-kit/scripts/review-pending.mjs';

// 이 PC 의 git 전역·시스템 설정이 판정에 섞이지 않게 비운다 — 스크립트를 띄우는 자식에도 물려준다
const EMPTY_GITCONFIG = path.join(mkdtempSync(path.join(os.tmpdir(), 'hk-gitcfg-')), 'gitconfig');
writeFileSync(EMPTY_GITCONFIG, '');
process.env.GIT_CONFIG_GLOBAL = EMPTY_GITCONFIG;
process.env.GIT_CONFIG_NOSYSTEM = '1';

const SCRIPT = fileURLToPath(new URL('../plugins/harness-kit/scripts/review-pending.mjs', import.meta.url));
const REVIEW = { notesRef: 'harness-review', integrationBranch: 'main', remote: 'origin', batchAsk: 5 };

/** project 블록 config 글. 값을 undefined 로 준 칸은 키째 뺀다(주지 않으면 review = REVIEW · threshold = null). */
function cfgText(o = {}) {
  const review = 'review' in o ? o.review : REVIEW;
  const threshold = 'threshold' in o ? o.threshold : null;
  const extra = o.extra || '';
  const r = review === null ? '    review: null, // review-pending 이 건너뛴다\n'
    : review === undefined ? ''
      : `    review: ${JSON.stringify(review)},\n`;
  const g = threshold === undefined ? '' : `    git: { reviewThreshold: ${JSON.stringify(threshold)} },\n`;
  return `export default {\n  project: {\n    name: 'demo',\n${extra}${r}${g}  },\n};\n`;
}

function repo(config = cfgText(), dir = null) {
  const root = dir || mkdtempSync(path.join(os.tmpdir(), 'hk-rp-'));
  mkdirSync(root, { recursive: true });
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  writeFileSync(path.join(root, 'harness.config.mjs'), config);
  writeFileSync(path.join(root, 'README.md'), '# demo\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  /** 파일마다 줄 수만큼 새 줄을 써서 커밋한다. 커밋 sha 를 돌려준다. */
  const commit = (msg, files) => {
    for (const [f, n] of Object.entries(files)) writeFileSync(path.join(root, f), Array.from({ length: n }, (_, i) => `${msg} ${i}`).join('\n') + '\n');
    git('add', '-A');
    git('commit', '-qm', msg);
    return git('rev-parse', 'HEAD');
  };
  const run = (...a) => { const r = spawnSync(process.execPath, [SCRIPT, ...a], { cwd: root, encoding: 'utf8' }); return { code: r.status, out: r.stdout, err: r.stderr }; };
  const json = (...a) => { const r = run(...a, '--json'); return { ...r, j: r.out.trim() ? JSON.parse(r.out) : null }; };
  return { root, git, commit, run, json };
}

test('순수 — 기본 범위 고르기 · numstat · 임계 · note 꼴', () => {
  assert.deepEqual(pickDefaultRange({ integrationBranch: 'main', remote: 'origin', branch: 'feat', integrationRefExists: true }).args, ['HEAD', '--not', 'origin/main']);
  assert.deepEqual(pickDefaultRange({ integrationBranch: 'main', remote: 'origin', branch: 'main', integrationRefExists: true }).args, ['HEAD', '--not', 'origin/main'], '원격이 있으면 통합 브랜치 위에서도 push 안 한 커밋을 본다');
  assert.deepEqual(pickDefaultRange({ integrationBranch: 'main', remote: null, branch: 'main', integrationRefExists: true, hasUpstream: true }).args, ['@{upstream}..HEAD']);
  assert.equal(pickDefaultRange({ integrationBranch: null, remote: 'origin', hasUpstream: false }).args, null);
  assert.deepEqual(countNumstat('3\t1\ta.txt\n-\t-\timg.png\n\n'), { files: 2, lines: 4 }, '바이너리는 0 줄로 센다(save awk 와 같다)');
  assert.deepEqual(overThreshold({ files: 2, lines: 4 }, { files: 1, lines: 5 }), ['files 2 > 1']);
  assert.deepEqual(overThreshold({ files: 1, lines: 5 }, { files: 1, lines: 5 }), [], '같으면 넘지 않는다(초과만)');
  const n = formatNote({ verdict: 'fail', reviewedAt: '2026-10-29T00:00:00.000Z', reviewer: 'a\nb', summary: '발견 1건 —\n x' });
  assert.equal(n, 'Review: fail\nReviewed-At: 2026-10-29T00:00:00.000Z\nReviewer: a b\nSummary: 발견 1건 — x\n');
  assert.deepEqual(parseNote(n), { review: 'fail', reviewedAt: '2026-10-29T00:00:00.000Z', reviewer: 'a b', summary: '발견 1건 — x' });
});

test('범위 — 통합 브랜치 원격 ref 가 있으면 HEAD --not <remote>/<branch>', () => {
  const t = repo();
  t.git('update-ref', 'refs/remotes/origin/main', 'main');
  t.git('checkout', '-qb', 'feat');
  const a = t.commit('a', { 'a.txt': 2 });
  const b = t.commit('b', { 'b.txt': 2 });
  const r = t.json('unreviewed');
  assert.equal(r.code, 1, r.err);
  assert.equal(r.j.range, 'HEAD --not origin/main');
  assert.equal(r.j.rangeNote, null);
  assert.deepEqual(r.j.commits.map((c) => c.sha), [b, a]);
  assert.deepEqual(r.j.commits.map((c) => c.subject), ['b', 'a']);
});

test('범위 — 통합 브랜치 ref 가 없으면 @{upstream}..HEAD 로 폴백하고 사유를 낸다', () => {
  const t = repo(cfgText({ review: { ...REVIEW, integrationBranch: 'develop' } }));
  t.git('checkout', '-qb', 'feat');
  t.git('branch', '-q', '-u', 'main');
  const a = t.commit('a', { 'a.txt': 2 });
  const r = t.json('unreviewed');
  assert.equal(r.code, 1, r.err);
  assert.equal(r.j.range, '@{upstream}..HEAD');
  assert.match(r.j.rangeNote, /origin\/develop/);
  assert.match(r.err, /기본 범위를 @\{upstream\}\.\.HEAD 로 쓴다/);
  assert.deepEqual(r.j.commits.map((c) => c.sha), [a]);
});

test('범위 — 통합 ref 도 upstream 도 없으면 종료 2 와 분명한 안내', () => {
  const t = repo(cfgText({ review: { ...REVIEW, integrationBranch: 'develop' } }));
  t.git('checkout', '-qb', 'feat');
  t.commit('a', { 'a.txt': 2 });
  const r = t.run('unreviewed', '--json');
  assert.equal(r.code, 2);
  assert.match(r.err, /기본 범위를 정하지 못했다 — upstream 도 없다\. 범위를 인자로 준다/);
  assert.equal(r.out, '');
  // 인자로 준 범위는 그대로 쓴다
  const g = t.json('unreviewed', 'main..HEAD');
  assert.equal(g.code, 1, g.err);
  assert.equal(g.j.range, 'main..HEAD');
});

test('임계 — git.reviewThreshold 를 넘는 커밋만 · null 이면 전부(all) · 키가 없으면 전부(unknown)', () => {
  const setup = (threshold) => {
    const t = repo(cfgText({ threshold }));
    t.git('update-ref', 'refs/remotes/origin/main', 'main');
    t.git('checkout', '-qb', 'feat');
    const small = t.commit('small', { 's.txt': 2 });
    const wide = t.commit('wide', { 'w1.txt': 1, 'w2.txt': 1 });
    const long = t.commit('long', { 'l.txt': 10 });
    return { t, small, wide, long };
  };
  const v = setup({ files: 1, lines: 5 });
  const rv = v.t.json('unreviewed');
  assert.equal(rv.code, 1, rv.err);
  assert.deepEqual(rv.j.threshold, { files: 1, lines: 5 });
  assert.deepEqual(rv.j.commits.map((c) => [c.sha, c.grade, c.rules]), [[v.long, 'over', ['lines 10 > 5']], [v.wide, 'over', ['files 2 > 1']]]);
  const n = setup(null);
  const rn = n.t.json('unreviewed');
  assert.equal(rn.j.threshold, 'null');
  assert.deepEqual(rn.j.commits.map((c) => [c.sha, c.grade]), [[n.long, 'all'], [n.wide, 'all'], [n.small, 'all']]);
  const m = setup(undefined);
  const rm = m.t.json('unreviewed');
  assert.equal(rm.j.threshold, 'missing');
  assert.deepEqual(rm.j.commits.map((c) => c.grade), ['unknown', 'unknown', 'unknown']);
  assert.match(rm.err, /reviewThreshold 키가 없다/);
});

test('병합 커밋은 빼고, 병합해 온 커밋은 각자 잡는다', () => {
  const t = repo();
  t.git('update-ref', 'refs/remotes/origin/main', 'main');
  t.git('checkout', '-qb', 'feat');
  const a = t.commit('a', { 'a.txt': 2 });
  t.git('checkout', '-qb', 'side', 'main');
  const c = t.commit('c', { 'c.txt': 2 });
  t.git('checkout', '-q', 'feat');
  t.git('merge', '-q', '--no-ff', '-m', 'merge side', 'side');
  const merge = t.git('rev-parse', 'HEAD');
  const r = t.json('unreviewed');
  const shas = r.j.commits.map((x) => x.sha);
  assert.equal(shas.length, 2, JSON.stringify(r.j.commits));
  assert.ok(shas.includes(a) && shas.includes(c));
  assert.ok(!shas.includes(merge));
});

test('리뷰 기록이 있는 커밋은 빠진다 — 로컬 ref 든 원격에서 받은 ref 든', () => {
  const t = repo();
  t.git('update-ref', 'refs/remotes/origin/main', 'main');
  t.git('checkout', '-qb', 'feat');
  const a = t.commit('a', { 'a.txt': 2 });
  const b = t.commit('b', { 'b.txt': 2 });
  const c = t.commit('c', { 'c.txt': 2 });
  assert.equal(t.run('note', a, 'fail', '--by', 'tester').code, 0);
  // 다른 PC 가 남긴 기록 — fetch 가 refs/notes/<notesRef>-<remote> 로 받아 둔 꼴
  t.git('notes', '--ref=refs/notes/harness-review-origin', 'add', '-m', 'Review: pass', b);
  const r = t.json('unreviewed');
  assert.equal(r.code, 1, r.err);
  assert.deepEqual(r.j.commits.map((x) => x.sha), [c]);
  assert.deepEqual(r.j.refs, { notes: 'refs/notes/harness-review', tracking: 'refs/notes/harness-review-origin' });
  assert.equal(t.run('note', c, 'pass').code, 0);
  const none = t.json('unreviewed');
  assert.equal(none.code, 0, '대상이 없으면 종료 0');
  assert.deepEqual(none.j.commits, []);
});

test('note — 구조화된 꼴로 쓰고, 같은 커밋에 다시 쓰면 바꾼다', () => {
  const t = repo();
  const head = t.git('rev-parse', 'HEAD');
  const w = t.run('note', 'HEAD', 'pass', '--by', 'save');
  assert.equal(w.code, 0, w.err);
  assert.match(w.out, /^기록: refs\/notes\/harness-review [0-9a-f]{9} pass$/m);
  const first = t.git('notes', '--ref=harness-review', 'show', head);
  assert.match(first, /^Review: pass\nReviewed-At: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\nReviewer: save$/);
  assert.equal(t.run('note', head, 'fail', '--summary', '발견 2건 —\n널 확인 빠짐').code, 0);
  const second = t.git('notes', '--ref=harness-review', 'show', head);
  assert.match(second, /^Review: fail\nReviewed-At: .+\nReviewer: review-pending\nSummary: 발견 2건 — 널 확인 빠짐$/);
  assert.equal(second.match(/^Review:/gm).length, 1, '바꿔 쓴다 — 줄이 덧붙지 않는다');
  assert.equal(t.run('note', head, 'maybe').code, 2, 'verdict 는 pass·fail 뿐');
  assert.equal(t.run('note', 'nope', 'pass').code, 2, '커밋이 아니면 종료 2');
});

test('원격 없음(review.remote null) — 통합 브랜치를 로컬 브랜치로 보고 tracking ref 가 없다', () => {
  const t = repo(cfgText({ review: { ...REVIEW, remote: null } }));
  const c = t.run('config');
  assert.equal(c.code, 0, c.err);
  const cfg = JSON.parse(c.out);
  assert.equal(cfg.review.remote, null);
  assert.deepEqual(cfg.refs, { notes: 'refs/notes/harness-review', tracking: null });
  t.git('checkout', '-qb', 'feat');
  const a = t.commit('a', { 'a.txt': 2 });
  const r = t.json('unreviewed');
  assert.equal(r.j.range, 'HEAD --not main');
  assert.deepEqual(r.j.commits.map((x) => x.sha), [a]);
  // 통합 브랜치 자신 위에서는 `HEAD --not main` 이 늘 비어 upstream 으로 간다 — upstream 이 없으면 종료 2
  t.git('checkout', '-q', 'main');
  const m = t.run('unreviewed');
  assert.equal(m.code, 2);
  assert.match(m.err, /통합 브랜치\(main\) 자신이고 원격이 없어/);
});

test('꺼짐(review null) — unreviewed 0건 · note 는 쓰지 않는다', () => {
  const t = repo(cfgText({ review: null }));
  const r = t.json('unreviewed');
  assert.equal(r.code, 0);
  assert.equal(r.j.disabled, true);
  const n = t.run('note', 'HEAD', 'pass');
  assert.equal(n.code, 0);
  assert.match(n.err, /꺼져 있어 기록하지 않는다/);
  assert.equal(spawnSync('git', ['-C', t.root, 'rev-parse', '--verify', '--quiet', 'refs/notes/harness-review']).status, 1, 'notes ref 가 생기지 않았다');
});

test('키 없는 칸 — config 는 missing 에 적고 종료 1, unreviewed 는 종료 2', () => {
  const t = repo(cfgText({ review: { notesRef: 'harness-review' }, threshold: undefined }));
  const c = t.run('config');
  assert.equal(c.code, 1);
  assert.deepEqual(JSON.parse(c.out).missing, ['project.review.integrationBranch', 'project.review.remote', 'project.review.batchAsk', 'project.git.reviewThreshold']);
  const u = t.run('unreviewed');
  assert.equal(u.code, 2);
  assert.match(u.err, /키 없는 칸: project\.review\.integrationBranch · project\.review\.remote/);
  assert.equal(t.run('note', 'HEAD', 'pass').code, 0, 'note 는 notesRef 만 있으면 쓴다');
});

test('config — BOM·CRLF config 를 다른 kit 스크립트처럼 읽는다', () => {
  const t = repo('﻿' + cfgText({ threshold: { files: 3, lines: 100 } }).replace(/\n/g, '\r\n'));
  const c = t.run('config');
  assert.equal(c.code, 0, c.err);
  const cfg = JSON.parse(c.out);
  assert.deepEqual(cfg.review, REVIEW);
  assert.deepEqual(cfg.threshold, { files: 3, lines: 100 });
  assert.deepEqual(cfg.missing, []);
});

test('config — 짝 레포는 자기 config 에 없는 칸을 pairOwner 주 레포 config 에서 읽는다', () => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'hk-rp-pair-'));
  repo(cfgText({ threshold: { files: 2, lines: 50 } }), path.join(base, 'api'));
  const web = repo(cfgText({ review: { ...REVIEW, remote: 'upstream' }, threshold: undefined, extra: "    pairOwner: '../api',\n" }), path.join(base, 'web'));
  const c = web.run('config');
  assert.equal(c.code, 0, c.err);
  const cfg = JSON.parse(c.out);
  assert.equal(cfg.review.remote, 'upstream');
  assert.equal(cfg.from['review.remote'], 'self');
  assert.deepEqual(cfg.threshold, { files: 2, lines: 50 });
  assert.equal(cfg.from['git.reviewThreshold'], 'pairOwner');
});

// ── lanes — 리뷰 갈래 고르기 ─────────────────────────────────────────────────

/** 파일 하나의 -U0 diff 글. added·removed 는 줄 배열. */
function udiff(file, added = [], removed = [], start = 10) {
  const body = [...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`)].join('\n');
  return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -${start},${removed.length} +${start},${added.length} @@\n${body}\n`;
}
const reasonOf = (r, lane) => r.reasons[lane].map((x) => `${x.file}${x.line ? `:${x.line}` : ''} ${x.kind} ${x.pattern}`);

test('lanes 순수 — 평범한 변경은 A 하나만 켠다', () => {
  const r = pickLanes(udiff('src/order/total.js', ['const sum = items.reduce((a, b) => a + b.price, 0);', '// select the cheapest item from the list']));
  assert.deepEqual(r.lanes, ['A']);
  assert.deepEqual(r.reasons, { B: [], C: [] }, '주석 속 소문자 select … from 은 SQL 로 보지 않는다');
});

test('lanes 순수 — B 는 경로 낱말 · SQL 문자열 결합 · 비밀값 리터럴 · 지운 인가 검사로 켜고 이유를 낸다', () => {
  const r = pickLanes(
    udiff('src/web/LoginController.java', ['return ok();'])
    + udiff('src/user/find.js', ['const q = "SELECT * FROM users WHERE id = " + id;'])
    + udiff('src/conf/app.js', ['const apiKey = "sk_live_abcdef123";', 'const password = "<password>";'])
    + udiff('src/admin/Panel.java', [], ['    @PreAuthorize("hasRole(\'ADMIN\')")'], 40),
  );
  assert.deepEqual(r.lanes, ['A', 'B', 'C']);
  assert.deepEqual(reasonOf(r, 'B'), [
    'src/web/LoginController.java path path:login',
    'src/user/find.js:10 added sql-concat',
    'src/conf/app.js:10 added secret-literal',
    'src/admin/Panel.java:40 removed auth-check-removed',
  ], 'camelCase 경로를 끊어 login 을 찾고, 자리표시 값(<password>)은 비밀값으로 세지 않는다');
  const secret = r.reasons.B.find((x) => x.pattern === 'secret-literal');
  assert.equal(secret.text, '<값 가림>', '비밀값 원문을 이유에 옮기지 않는다');
  assert.deepEqual(reasonOf(r, 'C'), ['src/user/find.js:10 added sql'], 'SQL 문은 C 도 켠다');
});

test('lanes 순수 — C 는 반복문 몸통 안의 IO·질의·정렬만 본다(반복 대상 식 · 몸통 밖 줄은 아니다)', () => {
  const inLoop = pickLanes(udiff('src/order/sync.js', ['for (const id of ids) {', '  const row = await db.query(sql, [id]);', '}']));
  assert.deepEqual(reasonOf(inLoop, 'C'), ['src/order/sync.js:11 added orm-call', 'src/order/sync.js:11 added io-in-loop'], '질의 호출 자체와 반복 안 호출을 둘 다 이유로 낸다');
  const header = pickLanes(udiff('src/order/count.js', ["for (const l of readFileSync(f, 'utf8').split('\\n')) n++;"]));
  assert.deepEqual(header.lanes, ['A'], '반복 대상 식은 한 번만 돈다');
  const after = pickLanes(udiff('src/order/after.js', ['for (const x of xs) n += x;', 'const cfg = await load();']));
  assert.deepEqual(after.lanes, ['A'], '같은 들여쓰기의 다음 줄은 몸통이 아니다');
  const sorted = pickLanes(udiff('src/order/rank.js', ['while (queue.length) {', '  queue.sort((a, b) => a.p - b.p);', '}']));
  assert.deepEqual(reasonOf(sorted, 'C'), ['src/order/rank.js:11 added sort-in-loop']);
  const chain = pickLanes(udiff('src/order/view.js', ['const top = rows.filter((r) => r.ok).map((r) => r.id).sort();']));
  assert.deepEqual(chain.lanes, ['A'], 'filter·map·sort 사슬은 반복문으로 보지 않는다');
  const repoPath = pickLanes(udiff('src/order/OrderRepository.java', ['return list;']));
  assert.deepEqual(reasonOf(repoPath, 'C'), ['src/order/OrderRepository.java path path:repository']);
});

test('lanes 순수 — B 는 직접 만든 권한 판정의 선언·호출과 범위·마스킹 경로 낱말로도 켠다', () => {
  const r = pickLanes(udiff('src/flow/StepService.java', [
    '        if (isFinalApprover(step.getApprover())) {',
    '    private boolean isFinalApprover(User approver) {',
    '        validateApprover(step, user);',
  ]));
  assert.deepEqual(reasonOf(r, 'B'), [
    'src/flow/StepService.java:10 added authz-helper',
    'src/flow/StepService.java:11 added authz-helper',
    'src/flow/StepService.java:12 added authz-helper',
  ], '경로 낱말이 없어도 is·validate 뒤에 권한 낱말이 이어지는 식별자면 켠다');
  const plain = pickLanes(udiff('src/flow/List.js', ['if (isEmpty(xs)) return;', 'if (obj.hasOwnProperty(k)) n++;', 'checkLength(name);']));
  assert.deepEqual(plain.lanes, ['A'], '권한 낱말이 없는 is·has·check 식별자는 켜지 않는다');
  const known = pickLanes(udiff('src/flow/Menu.vue', ['<li v-if="auth.hasPermission(\'EDIT\')">']));
  assert.deepEqual(reasonOf(known, 'B'), ['src/flow/Menu.vue:10 added auth-check'], '이미 아는 인가 호출은 auth-check 하나로만 센다');
  const paths = pickLanes(
    udiff('src/approval/StepView.vue', ['<span>{{ label }}</span>'])
    + udiff('src/audit/SensitiveValueMasker.java', ['return value;'])
    + udiff('src/log/mask.js', ['export const keep = 4;'])
    + udiff('src/report/ScopeFilter.java', ['return ids;']),
  );
  assert.deepEqual(reasonOf(paths, 'B'), [
    'src/audit/SensitiveValueMasker.java path path:sensitive',
    'src/log/mask.js path path:mask',
    'src/report/ScopeFilter.java path path:scope',
  ], '도메인 낱말(approval)은 경로 낱말로 세지 않는다');
});

test('lanes 순수 — C 는 반복 몸통 안의 저장소 쓰기 호출도 본다(긴 몸통 포함 · 목록·Map 의 쓰기는 아니다)', () => {
  const body = ['for (Change c : changed) {', '    Row row = Row.builder()'];
  for (let i = 0; i < 12; i++) body.push(`            .f${i}(c.v${i}())`);
  body.push('            .build();', '    rowRepository.save(row);', '}');
  const longLoop = pickLanes(udiff('src/flow/Writer.java', body));
  assert.deepEqual(reasonOf(longLoop, 'C'), ['src/flow/Writer.java:25 added io-in-loop'], '빌더 사슬로 몸통이 길어도 그 안의 save 를 찾는다');
  const qualified = pickLanes(udiff('src/flow/Sync.java', ['for (Item it : items) {', '    itemMapper.update(it);', '}']));
  assert.deepEqual(reasonOf(qualified, 'C'), ['src/flow/Sync.java:11 added io-in-loop'], '받는 쪽이 저장소면 update 도 쓰기다');
  const local = pickLanes(udiff('src/flow/Seen.js', ['for (const k of keys) {', '  seen.delete(k);', '  counts.merge(k, 1);', '  order.insert(0, k);', '}']));
  assert.deepEqual(local.lanes, ['A'], 'Set·Map·목록의 delete · merge · insert 는 쓰기 호출이 아니다');
  const canvas = pickLanes(udiff('src/view/draw.js', ['for (const s of shapes) {', '  ctx.save();', '  ctx.fill(s.path);', '  ctx.restore();', '}']));
  assert.deepEqual(canvas.lanes, ['A'], '받는 쪽이 저장소가 아닌 save(캔버스 ctx.save)는 쓰기 호출이 아니다');
});

test('lanes 순수 — 문서 · 시험은 보지 않는다. .env 는 늘 B 다', () => {
  const r = pickLanes(
    udiff('docs/auth.md', ['"SELECT * FROM t WHERE a = " + b'])
    + udiff('tests/login.test.js', ['const password = "hunter2hunter2";'])
    + udiff('src/order/__tests__/sync.spec.ts', ['for (const id of ids) {', '  await db.query(sql);', '}']),
  );
  assert.deepEqual(r.lanes, ['A']);
  assert.deepEqual(r.skipped, ['docs/auth.md', 'tests/login.test.js', 'src/order/__tests__/sync.spec.ts']);
  assert.deepEqual(reasonOf(pickLanes(udiff('.env.local', ['DB_HOST=db'])), 'B'), ['.env.local path path:file']);
});

test('lanes 순수 — 문서 폴더의 .sql 은 보지 않는다. 그 밖의 .sql 은 C 다', () => {
  for (const p of ['docs/schema.sql', 'doc/db/init.sql', 'src/docs/sample.sql']) {
    const r = pickLanes(udiff(p, ['INSERT INTO t VALUES (1);']));
    assert.deepEqual(r.lanes, ['A'], `${p} 는 문서다`);
    assert.deepEqual(r.skipped, [p]);
  }
  for (const p of ['db/schema.sql', 'src/mydocs/init.sql', 'docs.sql']) {
    const r = pickLanes(udiff(p, ['-- 주석']));
    assert.deepEqual(r.lanes, ['A', 'C'], `${p} 는 문서 폴더가 아니다`);
    assert.deepEqual(reasonOf(r, 'C'), [`${p} path path:sql`]);
    assert.deepEqual(r.skipped, []);
  }
});

test('lanes 순수 — @RequirePermission 을 더하거나 지우면 B 를 켠다', () => {
  const file = 'src/deploy/DeployController.java';
  const added = pickLanes(udiff(file, ['    @RequirePermission("DEPLOY_WRITE")']));
  assert.deepEqual(added.lanes, ['A', 'B']);
  assert.deepEqual(reasonOf(added, 'B'), [`${file}:10 added auth-check`]);
  const removed = pickLanes(udiff(file, [], ['    @RequirePermission("DEPLOY_WRITE")']));
  assert.deepEqual(removed.lanes, ['A', 'B']);
  assert.deepEqual(reasonOf(removed, 'B'), [`${file}:10 removed auth-check-removed`]);
  const longer = pickLanes(udiff(file, ['    @RequirePermissionLogged("x")']));
  assert.deepEqual(longer.lanes, ['A'], '이름이 더 긴 다른 어노테이션은 켜지 않는다');
});

test('lanes 순수 — parseDiff 는 지운 줄의 "-- " 내용을 머리줄로 읽지 않고 줄 번호를 센다', () => {
  const text = 'diff --git a/q.sql b/q.sql\n--- a/q.sql\n+++ b/q.sql\n@@ -3,2 +3,1 @@\n--- old comment\n-select 1\n+select 2\n';
  const [f] = parseDiff(text);
  assert.equal(f.path, 'q.sql');
  assert.deepEqual(f.removed, [{ line: 3, text: '-- old comment', hunk: 1 }, { line: 4, text: 'select 1', hunk: 1 }]);
  assert.deepEqual(f.added, [{ line: 3, text: 'select 2', hunk: 1 }]);
});

test('lanes 명령 — 커밋 sha · 커밋 전 diff(미추적 파일 포함) · 잘못된 인자', () => {
  const t = repo();
  mkdirSync(path.join(t.root, 'src', 'auth'), { recursive: true });
  const plain = t.commit('plain', { 'note.js': 2 });
  writeFileSync(path.join(t.root, 'src', 'auth', 'guard.js'), 'export const ok = 1;\n');
  t.git('add', '-A');
  t.git('commit', '-qm', 'auth');
  const auth = t.git('rev-parse', 'HEAD');

  const a = t.json('lanes', plain);
  assert.equal(a.code, 0, a.err);
  assert.deepEqual(a.j.lanes, ['A']);
  const b = t.json('lanes', auth);
  assert.equal(b.code, 0, b.err);
  assert.deepEqual(b.j.lanes, ['A', 'B']);
  assert.deepEqual(b.j.reasons.B.map((x) => `${x.file} ${x.pattern}`), ['src/auth/guard.js path:auth']);
  const text = t.run('lanes', auth);
  assert.equal(text.code, 0, text.err);
  assert.match(text.out, /^갈래: A\(정확성\) · B\(보안\)\nA: 늘 켠다\nB: src\/auth\/guard\.js — 경로 path:auth\nC: 꺼짐\n$/);

  writeFileSync(path.join(t.root, 'src', 'order.js'), 'for (const id of ids) {\n  await fetch(url + id);\n}\n');
  const w = t.json('lanes', '--worktree', '--', 'src/order.js');
  assert.equal(w.code, 0, w.err);
  assert.equal(w.j.source, 'worktree -- src/order.js');
  assert.deepEqual(w.j.reasons.C.map((x) => `${x.file}:${x.line} ${x.pattern}`), ['src/order.js:2 io-in-loop'], '미추적 새 파일도 본다');

  assert.equal(t.run('lanes').code, 2, 'sha 도 --worktree 도 없으면 종료 2');
  assert.equal(t.run('lanes', 'nope123').code, 2, '커밋이 아니면 종료 2');
});
