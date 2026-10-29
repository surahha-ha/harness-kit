// review-pending.mjs 시험 — 임시 git 레포에 커밋·브랜치·notes 를 만들고 config · unreviewed · note 를 돌린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { pickDefaultRange, countNumstat, overThreshold, formatNote, parseNote } from '../plugins/harness-kit/scripts/review-pending.mjs';

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
