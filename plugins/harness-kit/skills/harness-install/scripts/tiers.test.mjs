#!/usr/bin/env node
// 설치 범위(tier) 시험 — node tiers.test.mjs [작업 디렉토리]
//   ① tiers.mjs 표 — 훅 · 칸 범위 · 영수증 범위(schema 1 = 계측)
//   ② install.mjs slots — 라이트면 문서·메모리 칸의 「키 없음」은 DEFER(실패 아님), 계측이면 실패
//   ③ install.mjs hooks — 범위 훅은 정확히 1번, 범위 밖 훅은 0번
//   ④ write-manifest — tier 필수 · 범위와 settings 훅이 어긋나면 실패 · schema 2
//   ⑤ answer-trace — 체크포인트 tier(D0) 필수 · 라이트의 범위 밖 칸은 TIER · 범위 때문에 채운 답은 AUTO · slot file settings.local
//   ⑦ D0 header — SKILL · TEMPLATES · uninstall.mjs 가 같은 문자열
// 대상 레포 밖(작업 디렉토리)에만 쓴다. 실패가 하나라도 있으면 종료코드 1.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hookSpec, hooksFor, tierOfSlot, receiptTier, normTier, deferredInLight, LIGHT_DEFERRED, instrumentedUnder } from './tiers.mjs';
import { ARCHIVE_CYCLE } from '../../docs-setup/scripts/config-slots.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IN = path.join(HERE, 'install.mjs');
const WM = path.join(HERE, 'write-manifest.mjs');
const AT = path.join(HERE, 'answer-trace.mjs');
const work = path.resolve(process.argv[2] || os.tmpdir());
mkdirSync(work, { recursive: true });

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`PASS ${msg}`); } else { fail++; console.log(`FAIL ${msg}`); } };
const run = (script, ...a) => { try { return { code: 0, out: execFileSync(process.execPath, [script, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` }; } };
const newRepo = (name) => {
  const repo = mkdtempSync(path.join(work, `tiers-${name}-`));
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  const w = (rel, text) => { mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); writeFileSync(path.join(repo, rel), text, 'utf8'); };
  return { repo, git, w, gitPath: (p) => path.resolve(repo, git('rev-parse', '--git-path', p).trim()) };
};

// ── ① 표 ──
const pre = 'node "$CLAUDE_PROJECT_DIR/.harness/danger-guard.mjs"';
ok(hookSpec('PreToolUse', pre)?.tier === 'light', '① 실행 전 가드(PreToolUse)는 라이트 훅');
ok(hookSpec('PostToolUse', `${pre} --post`)?.tier === 'instrumented' && hookSpec('Stop', 'node "$CLAUDE_PROJECT_DIR/.harness/turn-end.mjs"')?.tier === 'instrumented', '① 실행 뒤 관찰 · 턴 종료는 계측 훅');
ok(hookSpec('PreToolUse', 'node other/danger-guard.mjs"') === null, '① .harness/ 를 가리키지 않는 훅은 하네스 훅이 아니다');
ok(hooksFor('light').length === 1 && hooksFor('instrumented').length === 5, '① 범위 훅 수 — 라이트 1 · 계측 5');
ok(tierOfSlot('qualityCycle.evidence.types') === 'instrumented' && tierOfSlot('project.docs.archiveDir') === 'instrumented' && tierOfSlot('dangerGuard.deny') === 'light' && tierOfSlot('testFirst.enabled') === 'light' && tierOfSlot('testFirst.auditOnStop') === 'instrumented',
  '① 칸 범위 — 증거·문서 칸은 계측 · 가드 칸과 testFirst(auditOnStop 말고)는 라이트');
ok(tierOfSlot('docsExtra') === 'light', '① 앞머리가 같아도 다른 칸(docsExtra)은 docs 칸이 아니다');
// 시험 설치: 라이트가 project.docs.* · memory.* 를 통째로 docs-setup 에 미뤄, docs-setup 이 채우지 않는 6칸이 키 없이 남았다
const D8_DOC_SLOTS = ['docs.domainIndex', 'docs.screenMap', 'docs.repoMap', 'docs.testGuide', 'docs.uiUxRules', 'memory.policy'];
ok(JSON.stringify([...LIGHT_DEFERRED].map((x) => `project.${x}`).sort()) === JSON.stringify([...ARCHIVE_CYCLE].sort()), `① 라이트에서 키 없이 두는 칸 = docs-setup 이 정하는 칸(config-slots ARCHIVE_CYCLE) (${LIGHT_DEFERRED.join(' · ')})`);
ok(deferredInLight('docs.archiveDir') && deferredInLight('memory.slugs') && D8_DOC_SLOTS.every((p) => !deferredInLight(p)) && !deferredInLight('commands.build'), '① docs-setup 이 채우지 않는 문서·메모리 6칸은 라이트에서도 미루지 않는다');
ok(D8_DOC_SLOTS.every((p) => tierOfSlot(`project.${p}`) === 'light') && tierOfSlot('project.memory.slugs') === 'instrumented', '① D8 문서·메모리 6칸은 라이트 칸 · docs-setup 칸은 계측 칸');
ok(JSON.stringify(instrumentedUnder('project.docs', ['project.docs.domainIndex', 'project.docs.archiveDir', 'project.docsX'])) === '["project.docs.archiveDir"]', '① instrumentedUnder — 객체 칸 아래의 계측 칸만');
const legacy = receiptTier({ schema: 1, files: [] });
ok(legacy.tier === 'instrumented' && legacy.legacy === true, '① schema 1 영수증(tier 없음)은 계측으로 읽는다');
ok(receiptTier({ schema: 2, tier: 'light' }).tier === 'light' && receiptTier(null) === null, '① schema 2 영수증은 tier 를 그대로 · 영수증 없음은 null');
ok(normTier('라이트') === 'light' && normTier('계측') === 'instrumented' && normTier('standard') === null, '① 범위 이름 — 라이트·계측만(표준은 만들지 않는다)');

// ── ② slots ──
{
  const t = newRepo('slots');
  t.w('harness.config.mjs', `export default {
  project: {
    name: 'demo',
    agents: null, // coordinator 가 건너뛴다
    contract: null, // fe-be-trace 가 건너뛴다
    data: null, // data-migration 이 건너뛴다
    e2e: null, // qa-cycle 이 건너뛴다
    git: null, // archive-cycle 이 건너뛴다
    layout: null, // coordinator 가 건너뛴다
    plugin: null, // plugin-sync 가 건너뛴다
    repos: null, // coordinator 가 건너뛴다
    review: null, // review-pending 이 건너뛴다
    risk: null, // coordinator 가 건너뛴다
    sides: null, // coordinator 가 건너뛴다
  },
};
`);
  const fcount = (r) => (r.out.match(/slots: failures=\d+/) || ['?'])[0];
  // 문서·메모리 블록이 통째로 없는 라이트 config(시험 설치의 꼴) — docs-setup 칸 넷만 DEFER, 나머지 6칸은 실패
  const l = run(IN, 'slots', t.repo, '--tier', 'light');
  ok(l.code === 1 && /slots: failures=6/.test(l.out), `② 라이트 + 문서 블록 없음: docs-setup 이 채우지 않는 6칸은 키 없음 실패 (${fcount(l)})`);
  ok(D8_DOC_SLOTS.every((p) => new RegExp(`^FAIL 없음 project\\.${p.replace('.', '\\.')} `, 'm').test(l.out)), '② 라이트: 실패 줄이 칸마다 하나(project.docs 한 줄로 뭉치지 않는다)');
  ok(['docs.archiveDir', 'docs.pathValidator', 'docs.autoloaded', 'memory.slugs'].every((p) => new RegExp(`^DEFER project\\.${p.replace('.', '\\.')} `, 'm').test(l.out)) && /키 없이 둔 칸 4개\(라이트\)/.test(l.out), '② 라이트: DEFER 는 docs-setup 칸 넷 · 「키 없이 둔 칸 4개」');
  // 재설치 — 앞선 걷어내기 백업 config 에 값이 있으면 PREV 로 낸다
  const bk = path.join(t.gitPath('harness-uninstall-backup'), '2026-10-01T00-00-00-000Z', 'files');
  mkdirSync(bk, { recursive: true });
  writeFileSync(path.join(bk, 'harness.config.mjs'), "export default { project: { docs: { domainIndex: 'docs/domain.md' }, memory: { policy: 'docs/backlog.md' } } };\n", 'utf8');
  const lp = run(IN, 'slots', t.repo, '--tier', 'light');
  ok(/^PREV project\.docs\.domainIndex = "docs\/domain\.md" — 앞선 걷어내기 백업\(2026-10-01T00-00-00-000Z\)/m.test(lp.out) && /^PREV project\.memory\.policy = "docs\/backlog\.md"/m.test(lp.out), '② 키 없는 칸에 앞선 백업 config 값이 있으면 PREV 줄');
  // 6칸을 D8 대로 채운(또는 null + 꺼지는 자산) 라이트 config — 실패 0 · DEFER 넷
  t.w('harness.config.mjs', `export default {
  project: {
    name: 'demo',
    agents: null, // coordinator 가 건너뛴다
    contract: null, // fe-be-trace 가 건너뛴다
    data: null, // data-migration 이 건너뛴다
    e2e: null, // qa-cycle 이 건너뛴다
    git: null, // archive-cycle 이 건너뛴다
    layout: null, // coordinator 가 건너뛴다
    plugin: null, // plugin-sync 가 건너뛴다
    repos: null, // coordinator 가 건너뛴다
    review: null, // review-pending 이 건너뛴다
    risk: null, // coordinator 가 건너뛴다
    sides: null, // coordinator 가 건너뛴다
    docs: {
      domainIndex: 'docs/domain.md',
      screenMap: null, // frontend-engineer 가 건너뛴다
      repoMap: null, // frontend-engineer 가 건너뛴다
      testGuide: null, // qa-cycle · change-verifier · unit-test-engineer 가 건너뛴다
      uiUxRules: null, // qa-cycle · ui-ux-guide 가 건너뛴다
    },
    memory: {
      policy: null, // qa-cycle 이 건너뛴다
    },
  },
};
`);
  const l2 = run(IN, 'slots', t.repo, '--tier', 'light');
  ok(l2.code === 0 && /slots: failures=0/.test(l2.out) && /키 없이 둔 칸 4개\(라이트\)/.test(l2.out), `② 라이트 + 6칸 채움: 실패 0 · DEFER 넷 (${fcount(l2)})`);
  const i = run(IN, 'slots', t.repo, '--tier', 'instrumented');
  ok(i.code === 1 && /^FAIL 없음 project\.docs\.archiveDir /m.test(i.out) && /^FAIL 없음 project\.memory\.slugs /m.test(i.out) && /slots: failures=4/.test(i.out), `② 계측: 같은 config 의 docs-setup 칸 키 없음은 실패 4 (${fcount(i)})`);
}

// ── ②-3 사후리뷰 칸(project.review.*) — 라이트 칸 · 키 없음은 실패 · null 주석에 review-pending ──
const REVIEW_KEYS = ['notesRef', 'integrationBranch', 'remote', 'batchAsk'];
ok(REVIEW_KEYS.every((k) => tierOfSlot(`project.review.${k}`) === 'light' && !deferredInLight(`review.${k}`)), '②-3 review 네 칸은 라이트 칸이고 라이트에서도 미루지 않는다(D8 에서 묻는다)');
{
  const t = newRepo('review');
  const base = (review) => `export default {
  project: {
    name: 'demo',
    agents: null, // coordinator 가 건너뛴다
    contract: null, // fe-be-trace 가 건너뛴다
    data: null, // data-migration 이 건너뛴다
    e2e: null, // qa-cycle 이 건너뛴다
    git: null, // archive-cycle 이 건너뛴다
    layout: null, // coordinator 가 건너뛴다
    plugin: null, // plugin-sync 가 건너뛴다
    repos: null, // coordinator 가 건너뛴다
    risk: null, // coordinator 가 건너뛴다
    sides: null, // coordinator 가 건너뛴다
    docs: { domainIndex: null, screenMap: null, repoMap: null, testGuide: null, uiUxRules: null }, // backend-engineer · qa-cycle · frontend-engineer 가 건너뛴다
    memory: { policy: null }, // qa-cycle 이 건너뛴다
${review}  },
};
`;
  const fcount = (r) => (r.out.match(/slots: failures=\d+/) || ['?'])[0];
  t.w('harness.config.mjs', base(''));
  const miss = run(IN, 'slots', t.repo, '--tier', 'light');
  ok(miss.code === 1 && /slots: failures=4/.test(miss.out) && REVIEW_KEYS.every((k) => new RegExp(`^FAIL 없음 project\\.review\\.${k} — 읽는 자산 .*/review-pending`, 'm').test(miss.out)), `②-3 라이트 + review 블록 없음: 네 칸이 칸마다 키 없음 실패 (${fcount(miss)})`);
  t.w('harness.config.mjs', base(`    review: {
      notesRef: 'harness-review',
      integrationBranch: 'main',
      remote: null, // 원격 없음 — review-pending 의 기록 받기·올리기가 건너뛴다
      batchAsk: 5,
    },
`));
  const good = run(IN, 'slots', t.repo, '--tier', 'light');
  ok(good.code === 0 && /slots: failures=0/.test(good.out) && /^NULL project\.review\.remote :\d+ — 원격 없음/m.test(good.out), `②-3 라이트 + review 채움(remote null + review-pending 주석): 실패 0 (${fcount(good)})`);
  t.w('harness.config.mjs', base(`    review: {
      notesRef: 'harness-review',
      integrationBranch: 'main',
      remote: null, // 원격 없음
      batchAsk: 5,
    },
`));
  const nc = run(IN, 'slots', t.repo, '--tier', 'instrumented');
  ok(nc.code === 1 && /^FAIL null 주석에 꺼지는 자산이 없다 project\.review\.remote /m.test(nc.out), `②-3 remote null 주석에 review-pending 이 없으면 실패 (${fcount(nc)})`);
}

// ── ②-2 docs-hookup 문구 — 「키 없음라」 같은 조사 붙임이 없다 ──
{
  const t = newRepo('hookup');
  t.w('harness.config.mjs', "export default { project: { name: 'demo' } };\n");
  for (const f of ['a', 'b', 'c']) t.w(`docs/${f}.md`, `# ${f}\n`);
  const h = run(IN, 'docs-hookup', t.repo);
  const why = (h.out.match(/^권장 이유: .*$/m) || [''])[0];
  ok(h.code === 0 && /^권장: 진행$/m.test(h.out) && /비어 있어\(키 없음\)/.test(why) && !/키 없음라/.test(h.out), `②-2 docs-hookup 권장 이유 문구 (${why.slice(0, 90)})`);
}

// ── ③ hooks ──
const HOOK = (event, command, matcher) => ({ event, matcher, command });
const H = {
  PreToolUse: HOOK('PreToolUse', pre, 'Bash|PowerShell'),
  PostToolUse: HOOK('PostToolUse', `${pre} --post`, 'Bash|PowerShell'),
  PostToolUseFailure: HOOK('PostToolUseFailure', `${pre} --post`, 'Bash|PowerShell'),
  Stop: HOOK('Stop', 'node "$CLAUDE_PROJECT_DIR/.harness/turn-end.mjs"', null),
  UserPromptSubmit: HOOK('UserPromptSubmit', 'node "$CLAUDE_PROJECT_DIR/.harness/turn-start.mjs"', null),
};
const settingsOf = (hs) => {
  const hooks = {};
  for (const h of hs) (hooks[h.event] ||= []).push({ ...(h.matcher ? { matcher: h.matcher } : {}), hooks: [{ type: 'command', command: h.command }] });
  return JSON.stringify({ hooks }, null, 2) + '\n';
};
{
  const t = newRepo('hooks');
  t.w('.claude/settings.json', settingsOf([H.PreToolUse]));
  const l = run(IN, 'hooks', t.repo, '--tier', 'light');
  ok(l.code === 0 && /hooks: failures=0/.test(l.out), '③ 라이트 + 가드 하나 → 통과');
  const i = run(IN, 'hooks', t.repo, '--tier', 'instrumented');
  ok(i.code === 1 && /hooks: failures=4/.test(i.out), `③ 계측 + 가드 하나 → 빠진 계측 훅 4개 실패 (${(i.out.match(/hooks: failures=\d+/) || ['?'])[0]})`);
  t.w('.claude/settings.json', settingsOf(Object.values(H)));
  const l5 = run(IN, 'hooks', t.repo, '--tier', 'light');
  ok(l5.code === 1 && /hooks: failures=4/.test(l5.out), '③ 라이트 + 훅 5개 → 범위 밖 훅 4개 실패');
  ok(run(IN, 'hooks', t.repo, '--tier', 'instrumented').code === 0, '③ 계측 + 훅 5개 → 통과');
  t.w('.claude/settings.json', settingsOf([H.PreToolUse, H.PreToolUse]));
  const dup = run(IN, 'hooks', t.repo, '--tier', 'light');
  ok(dup.code === 1 && /hooks: failures=1/.test(dup.out), '③ 같은 범위 훅이 두 번 → 실패(정확히 1번)');
  t.w('.claude/settings.json', settingsOf([{ ...H.PreToolUse, matcher: 'Bash' }]));
  const pm = run(IN, 'hooks', t.repo, '--tier', 'light');
  ok(pm.code === 1 && /PowerShell/.test(pm.out), '③ matcher 에 PowerShell 이 빠지면 실패');
}

// ── ④ write-manifest ──
{
  const t = newRepo('wm');
  t.w('.harness/danger-guard.mjs', 'export {};\n');
  t.w('harness.config.mjs', "export default {\n  dangerGuard: {\n    deny: ['x'],\n  },\n  metrics: {\n    enabled: true,\n  },\n};\n");
  const ex = path.join(t.repo + '-example.mjs');
  writeFileSync(ex, "export default {\n  dangerGuard: {\n    deny: [],\n  },\n  metrics: {\n    enabled: false,\n  },\n};\n", 'utf8');
  t.w('.claude/settings.json', settingsOf([H.PreToolUse]));
  const draft = (extra) => { const f = path.join(t.repo + `-draft-${Math.random().toString(36).slice(2)}.json`); writeFileSync(f, JSON.stringify({ source: { repo: 'harness-agent', sha: 'a'.repeat(40) }, decisions: [],
    files: [{ path: '.harness', role: 'skeleton' }, { path: 'harness.config.mjs', role: 'config' }],
    settings: { path: '.claude/settings.json', hooks: [{ ...H.PreToolUse, eventCreated: true }], keys: [] }, ...extra }), 'utf8'); return f; };
  const noTier = run(WM, t.repo, draft({}));
  ok(noTier.code === 1 && /tier 가 없거나/.test(noTier.out), '④ tier 없는 초안은 영수증을 쓰지 않는다');
  const mismatch = run(WM, t.repo, draft({ tier: 'instrumented' }));
  ok(mismatch.code === 1 && /계측 범위의 .+ 훅\(PostToolUse\)이 settings\.hooks 에 없다/.test(mismatch.out), '④ 계측인데 settings 훅이 가드 하나 → 실패');
  t.w('.claude/settings.json', settingsOf([H.PreToolUse, H.Stop]));
  const over = run(WM, t.repo, draft({ tier: 'light', settings: { path: '.claude/settings.json', hooks: [{ ...H.PreToolUse, eventCreated: true }, { ...H.Stop, eventCreated: true }], keys: [] } }));
  ok(over.code === 1 && /라이트 범위인데 턴 종료 관찰 훅이 있다/.test(over.out), '④ 라이트인데 턴 종료 훅 → 실패');
  t.w('.claude/settings.json', settingsOf([H.PreToolUse]));
  const good = run(WM, t.repo, draft({ tier: 'light' }), '--example', ex);
  const m = good.code === 0 ? JSON.parse(readFileSync(path.join(t.repo, 'harness.install.json'), 'utf8')) : {};
  ok(good.code === 0 && m.schema === 2 && m.tier === 'light', `④ 라이트 영수증 — schema 2 · tier light (${good.out.trim().split('\n').pop()})`);
  const slots = (m.config && m.config.slots) || [];
  ok(JSON.stringify(slots.map((s) => [s.path, s.tier, s.before])) === JSON.stringify([['dangerGuard.deny', 'light', '[]'], ['metrics.enabled', 'instrumented', 'false']]), `④ config.slots — 바뀐 칸 · 범위 · 설치 전 값 (${JSON.stringify(slots.map((s) => s.path))})`);
  // D6 을 「settings.local.json 에서 끈다」로 답한 키 — 영수증 키에 file 을 남겨 걷어내기가 찾게 한다(인수 시험: 영수증에 없었다)
  const LOCAL_KEY = { path: ['enabledPlugins', 'other-tools@other-market'], value: false, parentCreated: true, decision: 'D6', file: '.claude/settings.local.json' };
  const keysDraft = (keys) => draft({ tier: 'light', settings: { path: '.claude/settings.json', hooks: [{ ...H.PreToolUse, eventCreated: true }], keys } });
  const noLocal = run(WM, t.repo, keysDraft([LOCAL_KEY]));
  ok(noLocal.code === 1 && /의 file \.claude\/settings\.local\.json 이 없다/.test(noLocal.out), '④ settings.local.json 키인데 그 파일이 없다 → 영수증을 쓰지 않는다');
  t.w('.claude/settings.local.json', '{ "enabledPlugins": { "other-tools@other-market": false } }\n');
  const lk = run(WM, t.repo, keysDraft([LOCAL_KEY]));
  const lkKey = lk.code === 0 ? JSON.parse(readFileSync(path.join(t.repo, 'harness.install.json'), 'utf8')).settings.keys[0] : {};
  ok(lk.code === 0 && lkKey.file === '.claude/settings.local.json' && lkKey.decision === 'D6' && lkKey.value === false, `④ settings.local.json 의 D6 키 — 그 파일에서 대조하고 영수증 키에 file 을 남긴다 (${lk.out.trim().split('\n').pop()})`);
  const { file: _drop, ...noFileKey } = LOCAL_KEY;
  const wrong = run(WM, t.repo, keysDraft([noFileKey]));
  ok(wrong.code === 1 && /settings 키 값이 다름: enabledPlugins\.other-tools@other-market = undefined/.test(wrong.out), '④ file 이 없는 키는 settings.json 에서 찾는다 — settings.local.json 에만 있으면 실패');
  const odd = run(WM, t.repo, keysDraft([{ ...LOCAL_KEY, file: '.claude/other.json' }]));
  ok(odd.code === 1 && /settings 키 file 이 settings\.path 도 \.claude\/settings\.local\.json 도 아님/.test(odd.out), '④ 키 file 은 settings.path 또는 settings.local.json 만');
}

// ── ⑤ answer-trace ──
{
  const t = newRepo('at');
  const ex = path.join(t.repo + '-example.mjs');
  writeFileSync(ex, "export default {\n  dangerGuard: { deny: [] },\n  metrics: { enabled: false },\n  testFirst: { enabled: false },\n};\n", 'utf8');
  t.w('harness.config.mjs', "export default {\n  dangerGuard: { deny: ['x'] },\n  metrics: { enabled: false },\n  testFirst: { enabled: false },\n};\n");
  t.w('.claude/settings.json', settingsOf([H.PreToolUse]));
  const state = (o) => writeFileSync(t.gitPath('harness-install-state.json'), JSON.stringify(o), 'utf8');
  const D7 = { id: 'D7', answer: 'off', auto: true, why: '라이트 — 턴 종료 훅이 없어 감사가 돌지 않는다', recs: [{ item: 'auditOnStop', recommended: false, followed: true, basis: '라이트' }] };
  state({ decisions: [D7] });
  const no = run(AT, t.repo, ex);
  ok(no.code === 1 && /체크포인트에 tier 가 없다/.test(no.out), '⑤ 체크포인트 tier(D0) 없음 → 실패');
  state({ tier: 'light', decisions: [D7] });
  const l = run(AT, t.repo, ex);
  ok(l.code === 0 && /^OK {3}설치 범위 라이트/m.test(l.out), '⑤ 라이트 tier → 통과');
  ok(/^TIER metrics\.enabled = false — 의도: 라이트 범위 밖 칸/m.test(l.out) && /^SAME testFirst\.enabled /m.test(l.out), '⑤ 라이트: 범위 밖 칸은 TIER · 범위 안 칸은 SAME');
  ok(/^AUTO D7 — off \(라이트 — /m.test(l.out), '⑤ 범위 때문에 채운 답은 AUTO 로 낸다');
  state({ tier: 'instrumented', decisions: [D7] });
  const i = run(AT, t.repo, ex);
  ok(i.code === 0 && /^SAME metrics\.enabled /m.test(i.out) && !/^TIER /m.test(i.out), '⑤ 계측: 같은 칸이 TIER 가 아니라 SAME');
  // 질문마다 「권장 + 권장 이유」 또는 「권장 없음 + 이유」 — 시험 설치에서 둘 다 없는 질문(원본 위치 · 설치 커밋 등)이 나갔다
  const D5 = { id: 'D5', answer: 'message-only', recs: [{ item: 'commitExecution', recommended: null, followed: null, basis: '' }] };
  state({ tier: 'light', decisions: [D7, D5] });
  const nb = run(AT, t.repo, ex);
  ok(nb.code === 1 && /^FAIL D5 commitExecution 근거 없음/m.test(nb.out), '⑤ 권장 없음인데 이유(basis)가 비었다 → 실패');
  state({ tier: 'light', decisions: [D7], asked: [
    { header: '원본 위치', recommended: null, basis: '' },
    { header: '설치 커밋', basis: 'CLAUDE.md:3 「커밋은 에이전트가」' },
    { header: '설치 커밋 push 여부 확인', recommended: 'ask', basis: 'project.git.push = ask' },
    { header: '설치 브랜치 병합', recommended: 'merge', basis: '설치 브랜치가 develop 에서 닿지 않는다' },
  ] });
  const ak = run(AT, t.repo, ex);
  ok(ak.code === 1 && /^FAIL asked 원본 위치 근거 없음/m.test(ak.out) && /^FAIL asked 설치 커밋 recommended 칸 없음/m.test(ak.out) && /^FAIL asked 설치 커밋 push 여부 확인 header .* 12자 넘음/m.test(ak.out) && !/FAIL asked 설치 브랜치 병합/.test(ak.out),
    '⑤ D 번호 밖 질문(asked) — 근거 없음 · recommended 칸 없음 · header 12자 넘음은 실패, 다 갖춘 질문은 통과');
  state({ tier: 'light', decisions: [{ ...D7, header: 'D7 턴종료 감사' }], docsHookup: { answer: 'later', recommend: 'later', why: '' } });
  const hd = run(AT, t.repo, ex);
  ok(hd.code === 1 && /^FAIL D7 header 「D7 턴종료 감사」 에 D 번호/m.test(hd.out) && /^FAIL docsHookup 권장·권장 이유 없음/m.test(hd.out), '⑤ header 에 D 번호 · 10단계 답에 권장 이유 없음 → 실패');
  // D6 「settings.local.json 에서 끈다」 답 — slot file 'settings.local' 은 그 파일에서 읽는다(인수 시험: 값이 있는데 FAIL 이 났다)
  const D6 = { id: 'D6', answer: '이 레포에서 끈다 — settings.local.json', slots: [{ file: 'settings.local', path: ['enabledPlugins', 'other-tools@other-market'], value: false }],
    recs: [{ item: 'other-tools@other-market', recommended: 'local', followed: true, basis: '같은 이름 스킬 겹침 · worktree 흔적 없음' }] };
  state({ tier: 'light', decisions: [D7, D6] });
  const nl = run(AT, t.repo, ex);
  ok(nl.code === 1 && /^FAIL D6 enabledPlugins\.other-tools@other-market 답=false 값=undefined/m.test(nl.out), '⑤ settings.local 칸인데 settings.local.json 이 없다 → 실패');
  t.w('.claude/settings.local.json', '{ "enabledPlugins": { "other-tools@other-market": false } }\n');
  const lc = run(AT, t.repo, ex);
  ok(lc.code === 0 && /^OK {3}D6 enabledPlugins\.other-tools@other-market$/m.test(lc.out), `⑤ settings.local 칸 — settings.local.json 의 값과 대조해 통과 (${(lc.out.match(/^FAIL .*/m) || ['FAIL 없음'])[0]})`);
  state({ tier: 'light', decisions: [D7, { ...D6, slots: [{ ...D6.slots[0], file: 'settings' }] }] });
  const sj = run(AT, t.repo, ex);
  ok(sj.code === 1 && /^FAIL D6 enabledPlugins\.other-tools@other-market 답=false 값=undefined/m.test(sj.out), '⑤ settings 칸은 settings.json 에서만 읽는다 — settings.local.json 의 값으로 통과하지 않는다');
  state({ tier: 'light', decisions: [D7, { ...D6, slots: [{ ...D6.slots[0], file: 'local' }] }] });
  const uf = run(AT, t.repo, ex);
  ok(uf.code === 1 && /^FAIL D6 enabledPlugins\.other-tools@other-market 모르는 file 「local」/m.test(uf.out), '⑤ 모르는 slot file 은 config 로 읽지 않고 실패');
}

// ── ⑦ D0 header — 질문 꼴 · header 표 · 걷어내기의 범위 낮추기 기록이 같은 문자열(인수 시험: SKILL 과 TEMPLATES 가 달랐다) ──
{
  const D0_HEADER = '하네스 설치범위';   // 대상(하네스) + 정할 것(설치범위) — TEMPLATES §8 header 규칙
  const read = (rel) => readFileSync(path.join(HERE, rel), 'utf8');
  const skill = read('../SKILL.md'), tpl = read('../TEMPLATES.md'), un = read('../../harness-uninstall/scripts/uninstall.mjs');
  ok(new RegExp(`^\\| D0 \\| \`${D0_HEADER}\` \\|`, 'm').test(tpl) && new RegExp(`^header: ${D0_HEADER}$`, 'm').test(tpl), `⑦ TEMPLATES §8 — header 표 D0 줄과 D0 질문 꼴이 「${D0_HEADER}」`);
  ok(skill.includes(`\`${D0_HEADER}\``) && !/`설치범위`/.test(skill), `⑦ SKILL.md header 예 — 「${D0_HEADER}」, 대상 없는 「설치범위」 없음`);
  ok(un.includes(`id: 'D0', header: '${D0_HEADER}'`), `⑦ uninstall.mjs 범위 낮추기가 영수증에 적는 D0 header 가 「${D0_HEADER}」`);
}

// ── ⑥ commit-where — 설치가 만든 worktree·브랜치의 커밋이 작업 브랜치에서 닿는가 · 다음 할 일 ──
{
  const t = newRepo('where');
  t.git('config', 'user.email', 'test@example.com'); t.git('config', 'user.name', 'test');
  t.w('README.md', '# demo\n');
  t.git('add', '.'); t.git('commit', '-q', '-m', 'base');
  t.git('branch', '-m', 'develop');
  const wt = `${t.repo}-wt`;
  t.git('worktree', 'add', '-q', '-b', 'chore/harness-install-light', wt);
  writeFileSync(path.join(wt, 'harness.install.json'), '{}\n', 'utf8');
  execFileSync('git', ['-C', wt, 'add', 'harness.install.json'], { encoding: 'utf8' });
  execFileSync('git', ['-C', wt, 'commit', '-q', '-m', 'install'], { encoding: 'utf8' });
  const j = `${t.repo}-where.json`;
  const w = run(IN, 'commit-where', wt, '--json', j);
  const r = w.code === 0 ? JSON.parse(readFileSync(j, 'utf8')) : {};
  ok(w.code === 0 && r.linked === true && r.branch === 'chore/harness-install-light' && r.base === 'develop' && r.reachable === false && r.aheadOfBase === 1, `⑥ 연결 worktree 의 설치 커밋 — 작업 브랜치(메인 트리의 develop)에서 닿지 않는다 (${JSON.stringify({ linked: r.linked, base: r.base, reachable: r.reachable })})`);
  ok(/^커밋 위치: 브랜치 chore\/harness-install-light .* \(연결 worktree — 메인 트리 /m.test(w.out) && /닿지 않는다 — develop 에 없는 커밋 1개/.test(w.out) && /upstream 이 없다/.test(w.out), '⑥ 보고 줄 — 브랜치 · worktree · 작업 브랜치에서 닿는가 · 원격');
  ok(/merge --ff-only chore\/harness-install-light/.test(w.out) && /worktree remove/.test(w.out) && /branch -d chore\/harness-install-light/.test(w.out) && /rev-parse --abbrev-ref HEAD\)" = "develop" \]/.test(w.out), '⑥ 다음 할 일 — 브랜치 조건 건 병합 · worktree 정리 · 브랜치 정리');
  const m = run(IN, 'commit-where', t.repo, '--json', j);
  const rm = m.code === 0 ? JSON.parse(readFileSync(j, 'utf8')) : {};
  ok(m.code === 0 && rm.linked === false && rm.reachable === true && /push -u origin develop/.test(m.out) && !/worktree remove/.test(m.out), '⑥ 메인 트리의 커밋 — 닿는다 · upstream 이 없어 push 를 다음 할 일로');
}

console.log(`\ntiers: pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
