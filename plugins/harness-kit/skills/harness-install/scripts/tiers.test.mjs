#!/usr/bin/env node
// 설치 범위(tier) 시험 — node tiers.test.mjs [작업 디렉토리]
//   ① tiers.mjs 표 — 훅 · 칸 범위 · 영수증 범위(schema 1 = 계측)
//   ② install.mjs slots — 라이트면 문서·메모리 칸의 「키 없음」은 DEFER(실패 아님), 계측이면 실패
//   ③ install.mjs hooks — 범위 훅은 정확히 1번, 범위 밖 훅은 0번
//   ④ write-manifest — tier 필수 · 범위와 settings 훅이 어긋나면 실패 · schema 2
//   ⑤ answer-trace — 체크포인트 tier(D0) 필수 · 라이트의 범위 밖 칸은 TIER · 범위 때문에 채운 답은 AUTO
// 대상 레포 밖(작업 디렉토리)에만 쓴다. 실패가 하나라도 있으면 종료코드 1.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hookSpec, hooksFor, tierOfSlot, receiptTier, normTier, deferredInLight } from './tiers.mjs';

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
ok(deferredInLight('docs.archiveDir') && deferredInLight('memory') && !deferredInLight('commands.build'), '① 라이트에서 키 없이 두는 칸 — docs.* · memory.*');
const legacy = receiptTier({ schema: 1, files: [] });
ok(legacy.tier === 'instrumented' && legacy.legacy === true, '① schema 1 영수증(tier 없음)은 계측으로 읽는다');
ok(receiptTier({ schema: 2, tier: 'light' }).tier === 'light' && receiptTier(null) === null, '① schema 2 영수증은 tier 를 그대로 · 영수증 없음은 null');
ok(normTier('라이트') === 'light' && normTier('계측') === 'instrumented' && normTier('standard') === null, '① 범위 이름 — 라이트·계측만(표준은 아직 없다)');

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
    risk: null, // coordinator 가 건너뛴다
    sides: null, // coordinator 가 건너뛴다
  },
};
`);
  const l = run(IN, 'slots', t.repo, '--tier', 'light');
  ok(l.code === 0 && /slots: failures=0/.test(l.out), `② 라이트: 문서·메모리 칸 키 없음은 실패가 아니다 (${(l.out.match(/slots: failures=\d+/) || ['?'])[0]})`);
  ok(/^DEFER project\.docs /m.test(l.out) && /^DEFER project\.memory /m.test(l.out) && /키 없이 둔 칸 2개\(라이트\)/.test(l.out), '② 라이트: DEFER 두 줄 · 「키 없이 둔 칸 2개」');
  const i = run(IN, 'slots', t.repo, '--tier', 'instrumented');
  ok(i.code === 1 && /^FAIL 없음 project\.docs /m.test(i.out) && /^FAIL 없음 project\.memory /m.test(i.out) && /slots: failures=2/.test(i.out), '② 계측: 같은 config 의 문서·메모리 칸 키 없음은 실패 2');
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
}

console.log(`\ntiers: pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
