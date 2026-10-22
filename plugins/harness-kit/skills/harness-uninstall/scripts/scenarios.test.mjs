#!/usr/bin/env node
// 설치 범위(tier) 시나리오 — node scenarios.test.mjs [작업 디렉토리]
// 임시 레포마다 「설치 흉내 → 영수증(write-manifest) → 걷어내기(uninstall)」를 돌려 확인한다.
//   A 라이트 설치 → 걷어내기 → 설치 전과 같다
//   B 계측 설치 → 걷어내기 → 설치 전과 같다
//   C 계측 → 라이트 범위 낮추기(안내절 통째 바꾸기 · 칸 되돌리기 · 영수증 갱신) → 라이트 설치와 같다 → 다시 걷어내기 → 설치 전과 같다
//   D schema 1 영수증(tier 없음)을 계측으로 읽는다
//   E 여러 줄 배열 칸 — 되돌리기 · docs-setup 표시(여는 줄 · 닫는 줄)
//   F 설치 끝 문서 구조 질문(docs-hookup) 권장 — 진행 · 나중에
//   G CRLF settings.json 이 범위 낮추기 뒤에도 CRLF 다
//   E-2 영수증 없는 걷어내기에서 docs-setup 여러 줄 배열 칸 안의 경로는 보조 파일 후보가 아니다
//   H graft 로컬 연결(D9)이 있는 계측 설치 → 라이트로 낮추기 — .gitignore 의 /graft/ 블록 · settings.local.json 의 graft 훅 · 영수증 local 이 그대로 남는다
// 대상 레포 밖(작업 디렉토리)에만 쓴다. 실패가 하나라도 있으면 종료코드 1.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILLS = path.resolve(HERE, '..', '..');
const UN = path.join(HERE, 'uninstall.mjs');
const WM = path.join(SKILLS, 'harness-install', 'scripts', 'write-manifest.mjs');
const IN = path.join(SKILLS, 'harness-install', 'scripts', 'install.mjs');
const CS = path.join(SKILLS, 'docs-setup', 'scripts', 'config-slots.mjs');
const work = path.resolve(process.argv[2] || os.tmpdir());
mkdirSync(work, { recursive: true });
const records = path.join(mkdtempSync(path.join(work, 'tier-rec-')), 'installed_plugins.json');
writeFileSync(records, JSON.stringify({ version: 2, plugins: {} }), 'utf8');
process.env.HARNESS_UNINSTALL_PLUGINS_JSON = records;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`PASS ${msg}`); } else { fail++; console.log(`FAIL ${msg}`); } };
const run = (script, ...a) => { try { return { code: 0, out: execFileSync(process.execPath, [script, ...a], { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` }; } };
const last = (r) => r.out.trim().split('\n').filter((l) => /failures=|FAIL|^OK|적용|백업/.test(l)).slice(-1)[0] || r.out.trim().split('\n').pop();

// ── 설치 흉내의 재료 — example · 범위별 config · 안내절 · settings ──
const SHA = 'a'.repeat(40);
// example — 원본 harness.config.example.mjs 꼴(칸마다 한 줄 · 꼬리 주석은 칸 줄에)
const EXAMPLE = `// harness-agent ${SHA}
export default {
  dangerGuard: {
    deny: [],
    ask: [],
  },
  testFirst: {
    auditOnStop: false,
  },
  qualityCycle: {
    evidence: [],
  },
  metrics: {
    enabled: false, // 꺼 둔다
  },
  docs: {
    always: [],
    archive: [],
  },
};
`;
// 계측 — 범위 밖 칸(testFirst.auditOnStop · qualityCycle.evidence(여러 줄 배열) · metrics.enabled(꼬리 주석) · docs.always)을 채운다
const CFG_INSTR = `// harness-agent ${SHA}
export default {
  dangerGuard: {
    deny: [{ id: 'rm-root', pattern: /rm -rf \\// }],
    ask: [],
  },
  testFirst: {
    auditOnStop: true,
  },
  qualityCycle: {
    evidence: [
      { type: 'fe-src', pattern: 'src/**' },
      { type: 'hook', pattern: '.harness/**' },
    ],
  },
  metrics: {
    enabled: true, // 계측 로그를 쌓는다
  },
  docs: {
    always: ['README.md'],
    archive: [],
  },
  project: { name: 'demo' },
};
`;
// 라이트 — 같은 설치에서 범위 밖 칸만 example 값이다(범위 낮추기 뒤 config 가 이것과 바이트까지 같아야 한다)
const CFG_LIGHT = `// harness-agent ${SHA}
export default {
  dangerGuard: {
    deny: [{ id: 'rm-root', pattern: /rm -rf \\// }],
    ask: [],
  },
  testFirst: {
    auditOnStop: false,
  },
  qualityCycle: {
    evidence: [],
  },
  metrics: {
    enabled: false, // 꺼 둔다
  },
  docs: {
    always: [],
    archive: [],
  },
  project: { name: 'demo' },
};
`;
const BLOCK = {
  instrumented: '<!-- harness-kit:begin -->\n## 개발 하네스 (`.harness/` · `harness.config.mjs`)\n\n- 범위: 계측 — 훅 5개 · 계측 로그\n- 상태 확인: `node .harness/turn-end.mjs --status`\n<!-- harness-kit:end -->\n',
  light: '<!-- harness-kit:begin -->\n## 개발 하네스 (`.harness/` · `harness.config.mjs`)\n\n- 범위: 라이트 — 실행 전 가드 하나\n- 상태 확인: `node .harness/danger-guard.mjs --status`\n<!-- harness-kit:end -->\n',
};
const CMD = (f, post = '') => `node \\"$CLAUDE_PROJECT_DIR/.harness/${f}\\"${post}`;
const HOOK_JSON = {
  PreToolUse: `    "PreToolUse": [\n      { "matcher": "Bash|PowerShell", "hooks": [{ "type": "command", "command": "${CMD('danger-guard.mjs')}" }] }\n    ]`,
  PostToolUse: `    "PostToolUse": [\n      { "matcher": "Bash|PowerShell", "hooks": [{ "type": "command", "command": "${CMD('danger-guard.mjs', ' --post')}" }] }\n    ]`,
  PostToolUseFailure: `    "PostToolUseFailure": [\n      { "matcher": "Bash|PowerShell", "hooks": [{ "type": "command", "command": "${CMD('danger-guard.mjs', ' --post')}" }] }\n    ]`,
  Stop: `    "Stop": [\n      { "hooks": [{ "type": "command", "command": "${CMD('turn-end.mjs')}" }] }\n    ]`,
  UserPromptSubmit: `    "UserPromptSubmit": [\n      { "hooks": [{ "type": "command", "command": "${CMD('turn-start.mjs')}" }] }\n    ]`,
};
const EVENTS = { light: ['PreToolUse'], instrumented: ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'UserPromptSubmit'] };
const HOOK_ROWS = {
  PreToolUse: { matcher: 'Bash|PowerShell', command: 'node "$CLAUDE_PROJECT_DIR/.harness/danger-guard.mjs"' },
  PostToolUse: { matcher: 'Bash|PowerShell', command: 'node "$CLAUDE_PROJECT_DIR/.harness/danger-guard.mjs" --post' },
  PostToolUseFailure: { matcher: 'Bash|PowerShell', command: 'node "$CLAUDE_PROJECT_DIR/.harness/danger-guard.mjs" --post' },
  Stop: { matcher: null, command: 'node "$CLAUDE_PROJECT_DIR/.harness/turn-end.mjs"' },
  UserPromptSubmit: { matcher: null, command: 'node "$CLAUDE_PROJECT_DIR/.harness/turn-start.mjs"' },
};
const SETTINGS_BASE = '{\n  "permissions": { "allow": ["Bash(git status)"] }\n}\n';
const settingsFor = (tier) => `{\n  "permissions": { "allow": ["Bash(git status)"] },\n  "hooks": {\n${EVENTS[tier].map((e) => HOOK_JSON[e]).join(',\n')}\n  },\n  "extraKnownMarketplaces": { "harness-kit": { "source": { "source": "github", "repo": "surahha-ha/harness-kit" } } },\n  "enabledPlugins": { "harness-kit@harness-kit": true }\n}\n`;

/** 설치 전 레포(커밋 1개) + 그 범위의 설치 흉내(커밋하지 않는다) + 영수증. */
function setup(name, tier, { crlf = false } = {}) {
  const repo = mkdtempSync(path.join(work, `tier-${name}-`));
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  const eol = (t) => (crlf ? t.replace(/\n/g, '\r\n') : t);
  const w = (rel, text) => { mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); writeFileSync(path.join(repo, rel), text, 'utf8'); };
  const r = (rel) => readFileSync(path.join(repo, rel), 'utf8');
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'test'); git('config', 'core.autocrlf', 'false');
  w('README.md', '# demo\n');
  w('CLAUDE.md', '# demo\n\n규칙 한 줄.\n');
  w('.gitignore', 'node_modules/\n');
  w('.claude/settings.json', eol(SETTINGS_BASE));
  git('add', '.'); git('commit', '-q', '-m', 'base');
  // 설치 — 골격은 범위와 무관하게 통째로, 범위가 가르는 것은 훅 · config 칸 · 안내절
  for (const f of ['danger-guard.mjs', 'turn-end.mjs', 'turn-start.mjs']) w(`.harness/${f}`, 'export {};\n');
  w('harness.config.mjs', tier === 'light' ? CFG_LIGHT : CFG_INSTR);
  // 표시 줄은 문단 끝에 붙이고, 블록은 「빈 줄 + 블록」으로 파일 끝에 — 걷어내기가 그 빈 줄까지 지워 설치 전과 같아진다
  w('CLAUDE.md', `${r('CLAUDE.md')}하네스는 「개발 하네스」 절을 본다. <!-- harness-kit:line -->\n\n${BLOCK[tier]}`);
  w('.gitignore', `${r('.gitignore')}# harness-kit:begin\n.harness/*.jsonl\n# harness-kit:end\n`);
  w('.claude/settings.json', eol(settingsFor(tier)));
  const ex = path.join(repo + '-example.mjs');
  writeFileSync(ex, EXAMPLE, 'utf8');
  const draft = path.join(repo + '-draft.json');
  writeFileSync(draft, JSON.stringify({ source: { repo: 'harness-agent', sha: SHA }, tier, decisions: [{ id: 'D0', header: '하네스 설치범위', answer: tier }],
    files: [{ path: '.harness', role: 'skeleton' }, { path: 'harness.config.mjs', role: 'config' }],
    edits: [{ path: 'CLAUDE.md', how: 'line' }, { path: 'CLAUDE.md', how: 'block' }, { path: '.gitignore', how: 'block' }],
    settings: { path: '.claude/settings.json', hooks: EVENTS[tier].map((e) => ({ event: e, ...HOOK_ROWS[e], eventCreated: true })),
      keys: [{ path: ['enabledPlugins', 'harness-kit@harness-kit'], value: true, parentCreated: true },
        { path: ['extraKnownMarketplaces', 'harness-kit'], value: { source: { source: 'github', repo: 'surahha-ha/harness-kit' } }, parentCreated: true }] } }), 'utf8');
  const wm = run(WM, repo, draft, '--example', ex);
  const statePath = () => path.resolve(repo, git('rev-parse', '--git-path', 'harness-uninstall-state.json').trim());
  return { repo, git, w, r, wm, ex, draft, state: () => JSON.parse(readFileSync(statePath(), 'utf8')), hasState: () => existsSync(statePath()) };
}
/** 시나리오 하나 — 도중에 던지면 FAIL 하나로 세고 다음 시나리오로 간다(옛 코드에 돌려도 끝까지 센다). */
const scenario = async (name, fn) => { try { await fn(); } catch (e) { ok(false, `${name} 시나리오가 도중에 멈췄다 — ${String(e && e.message || e).split('\n')[0].slice(0, 160)}`); } };
const U = (t, ...a) => run(UN, a[0], t.repo, ...a.slice(1));
const porcelain = (t) => t.git('status', '--porcelain', '--untracked-files=all').trim();

/** 걷어내기 전 과정(목적 remove · 권장대로) — 끝나면 설치 전과 같아야 한다. */
function removeAll(t, label) {
  const steps = [['scan', '--refresh'], ['answer', 'purpose=remove', '--recommended'], ['backup'], ['apply'], ['plugin'], ['records'], ['verify']];
  for (const s of steps) {
    const r = U(t, ...s);
    if (r.code !== 0) { ok(false, `${label}: ${s[0]} 종료코드 ${r.code} — ${last(r)}`); console.log(r.out); return false; }
  }
  ok(true, `${label}: 걷어내기 scan → verify 모두 종료코드 0`);
  const st = porcelain(t);
  ok(st === '', `${label}: 걷어낸 뒤 작업본 = 설치 전 커밋 (git status ${st ? st.replace(/\n/g, ' / ') : '깨끗함'})`);
  U(t, 'finish');
  return true;
}

// ── A 라이트 설치 → 걷어내기 ──
await scenario('A', async () => {
  const t = setup('a', 'light');
  ok(t.wm.code === 0, `A 라이트 영수증 (${last(t.wm)})`);
  const m = JSON.parse(t.r('harness.install.json'));
  ok(m.schema === 2 && m.tier === 'light' && m.settings.hooks.length === 1 && m.settings.hooks[0].event === 'PreToolUse', 'A 영수증: schema 2 · tier light · 훅은 실행 전 가드 하나');
  const h = run(IN, 'hooks', t.repo);
  ok(h.code === 0 && /hooks: failures=0/.test(h.out), `A install.mjs hooks — 영수증 범위(라이트)로 훅 판정 (${last(h)})`);
  const sc = U(t, 'scan');
  ok(sc.code === 0 && /설치 범위: 라이트 \(영수증 tier\)/.test(sc.out), 'A scan: 범위를 영수증에서 라이트로 읽는다');
  ok(!t.state().plan.warnings.some((w) => /훅\(.+\)이 .+ 에 없다/.test(w)), 'A scan: 라이트에 계측 훅이 없는 것을 경고하지 않는다');
  removeAll(t, 'A 라이트');
});

// ── B 계측 설치 → 걷어내기 ──
await scenario('B', async () => {
  const t = setup('b', 'instrumented');
  ok(t.wm.code === 0, `B 계측 영수증 (${last(t.wm)})`);
  const m = JSON.parse(t.r('harness.install.json'));
  ok(m.tier === 'instrumented' && m.settings.hooks.length === 5, 'B 영수증: tier instrumented · 훅 5개');
  const paths = (m.config && m.config.slots || []).map((s) => `${s.path}:${s.tier}`).sort();
  ok(JSON.stringify(paths) === JSON.stringify(['dangerGuard.deny:light', 'docs.always:instrumented', 'metrics.enabled:instrumented', 'project:light', 'qualityCycle.evidence:instrumented', 'testFirst.auditOnStop:instrumented']),
    `B 영수증 config.slots — 설치가 바꾼 칸마다 범위 (${paths.join(' ')})`);
  const ev = m.config.slots.find((s) => s.path === 'qualityCycle.evidence');
  ok(ev && ev.before === '[]' && ev.beforeNote === '', 'B config.slots: 여러 줄 배열 칸의 설치 전 값 = example 원문 [] · 꼬리 주석 없음');
  const met = m.config.slots.find((s) => s.path === 'metrics.enabled');
  ok(met && met.before === 'false' && met.beforeNote === '// 꺼 둔다', `B config.slots: 꼬리 주석도 설치 전 판으로 적는다(metrics.enabled ${JSON.stringify(met && met.beforeNote)})`);
  removeAll(t, 'B 계측');
});

// ── C · E · G 계측 → 라이트 범위 낮추기 (CRLF settings) ──
await scenario('C', async () => {
  const t = setup('c', 'instrumented', { crlf: true });
  const light = setup('c-ref', 'light', { crlf: true });     // 바로 라이트로 설치한 판 — 범위 낮추기 결과의 기준
  ok(t.wm.code === 0 && light.wm.code === 0, 'C 계측·라이트 영수증');
  const up = U(light, 'scan', '--tier', 'instrumented');
  ok(up.code === 2 && /범위 올리기/.test(up.out), 'C 라이트 → 계측(범위 올리기)은 거절한다');
  const sc = U(t, 'scan', '--tier', 'light');
  ok(sc.code === 0, `C scan --tier light 종료코드 0 (${last(sc)})`);
  const st = t.state();
  ok(st.purpose === 'lower' && st.plan.tier.mode === 'lower' && st.plan.tier.current === 'instrumented' && st.plan.tier.target === 'light', 'C 계획: 목적 lower · 계측 → 라이트');
  const kinds = st.plan.candidates.map((c) => c.kind).sort();
  ok(JSON.stringify(kinds) === JSON.stringify(['hook', 'hook', 'hook', 'hook', 'receipt', 'slot', 'slot', 'slot', 'slot', 'text']), `C 후보: 범위 밖 훅 4 · 칸 4 · 안내절 1 · 영수증 1 (${kinds.join(' ')})`);
  ok(st.plan.candidates.every((c) => !['file', 'files', 'runtime', 'manifest', 'plugin'].includes(c.kind)), 'C 후보: 골격 사본·config 파일·로그·플러그인 키는 후보가 아니다');
  ok(st.plan.tier.keep.length === 1 && st.plan.tier.keep[0].event === 'PreToolUse', 'C 계획: 실행 전 가드는 남는다(tier.keep)');
  const blk = st.plan.candidates.find((c) => c.kind === 'text');
  ok(blk.header === '안내절 교체' && blk.recommend === null, `C 안내절 후보: header 「${blk.header}」 · 새 판 전에는 권장 없음`);
  ok(st.plan.candidates.filter((c) => c.kind === 'slot').every((c) => c.header.startsWith('설정칸 되돌림')), 'C 칸 후보 header 「설정칸 되돌림 n」');
  const noRep = U(t, 'answer', `${blk.id}=replace`);
  ok(noRep.code === 2 && /새 판이 없다/.test(noRep.out), 'C 새 판 없이 「바꿈」 답은 거절한다');
  const badBlock = path.join(t.repo + '-bad.md');
  writeFileSync(badBlock, '## 개발 하네스\n\n- 표시 없음\n', 'utf8');
  const bb = U(t, 'block', blk.id, badBlock);
  ok(bb.code === 1 && /첫 줄이/.test(bb.out), 'C block: 표시 줄 없는 새 판은 받지 않는다');
  const newBlock = path.join(t.repo + '-light-block.md');
  writeFileSync(newBlock, BLOCK.light, 'utf8');
  const b = U(t, 'block', blk.id, newBlock);
  ok(b.code === 0 && /권장 「바꿈」/.test(b.out), `C block: 라이트 판을 받았다 (${last(b)})`);
  const purp = U(t, 'answer', 'purpose=remove');
  ok(purp.code === 2, 'C 범위 낮추기 계획에서 목적을 바꾸지 않는다');
  const an = U(t, 'answer', '--recommended');
  ok(an.code === 0 && Object.values(t.state().answers).every((v) => ['remove', 'revert', 'replace', 'update'].includes(v)), 'C answer --recommended: 훅 지움 · 칸 되돌림 · 안내절 바꿈 · 영수증 갱신');
  ok(U(t, 'backup').code === 0, 'C backup');
  const ap = U(t, 'apply');
  ok(ap.code === 0 && /OK {3}updated harness\.install\.json/.test(ap.out) && /다음: verify/.test(ap.out), `C apply (${last(ap)})`);
  const v = U(t, 'verify');
  ok(v.code === 0 && /failures=0/.test(v.out), `C verify failures=0 (${last(v)})`);
  ok(/설정칸 qualityCycle\.evidence = 설치 전 값/.test(v.out) && /CLAUDE\.md 안내절 = 라이트 판/.test(v.out) && /tier = light/.test(v.out), 'C verify: 칸 · 안내절 · 영수증 범위를 본다');
  // 결과가 바로 라이트로 설치한 판과 같은가
  ok(t.r('harness.config.mjs') === CFG_LIGHT, 'C·E config = 라이트 설치 판(여러 줄 배열 칸 · 꼬리 주석까지 되돌림)');
  ok(t.r('CLAUDE.md') === light.r('CLAUDE.md'), 'C CLAUDE.md = 라이트 설치 판(안내절 통째 바꿈)');
  const sj = t.r('.claude/settings.json');
  ok(JSON.stringify(JSON.parse(sj)) === JSON.stringify(JSON.parse(light.r('.claude/settings.json'))), 'C settings.json 내용 = 라이트 설치 판');
  ok(/\r\n/.test(sj) && !/[^\r]\n/.test(sj), 'G settings.json 은 범위 낮추기 뒤에도 CRLF 다');
  const m = JSON.parse(t.r('harness.install.json'));
  ok(m.tier === 'light' && m.schema === 2 && m.settings.hooks.length === 1 && m.settings.hooks[0].event === 'PreToolUse', 'C 영수증: tier light · 훅 하나');
  ok(JSON.stringify(m.config.slots.map((s) => s.path).sort()) === JSON.stringify(['dangerGuard.deny', 'project']), 'C 영수증: 되돌린 칸은 config.slots 에서 빠졌다');
  ok(m.tierChanges && m.tierChanges.length === 1 && m.tierChanges[0].from === 'instrumented' && m.tierChanges[0].to === 'light', 'C 영수증: tierChanges 한 줄');
  ok(m.decisions.filter((d) => d.id === 'D0').length === 1 && m.decisions.find((d) => d.id === 'D0').answer === 'light', 'C 영수증: D0 답 = light (하나만)');
  const blockEdit = m.edits.find((e) => e.path === 'CLAUDE.md' && e.how === 'block');
  const lightEdit = JSON.parse(light.r('harness.install.json')).edits.find((e) => e.path === 'CLAUDE.md' && e.how === 'block');
  ok(blockEdit.sha256 === lightEdit.sha256 && blockEdit.first === lightEdit.first, 'C 영수증: 바꾼 블록의 해시·첫 줄 = 라이트 설치 영수증');
  const cfgFile = m.files.find((f) => f.path === 'harness.config.mjs');
  ok(cfgFile.sha256 === JSON.parse(light.r('harness.install.json')).files.find((f) => f.path === 'harness.config.mjs').sha256, 'C 영수증: config 해시 = 라이트 설치 영수증');
  ok(run(IN, 'hooks', t.repo).code === 0, 'C install.mjs hooks: 낮춘 뒤 영수증 범위(라이트)와 settings 훅이 맞다');
  U(t, 'finish');
  // 낮춘 판을 다시 걷어내면 설치 전과 같다 — 영수증이 다음 걷어내기의 기준으로 맞는지
  const sc2 = U(t, 'scan');
  ok(sc2.code === 0 && /설치 범위: 라이트 \(영수증 tier\)/.test(sc2.out), 'C 낮춘 뒤 scan: 라이트로 읽는다');
  ok(t.state().plan.candidates.filter((c) => c.status === 'modified').length === 0, 'C 낮춘 뒤 scan: 손댄 것(modified) 후보 0 — 영수증 해시가 맞다');
  removeAll(t, 'C 낮춘 뒤');
});

// ── C-2 범위 낮추기에서 설치 뒤 바뀐 칸은 권장 없음 · docs-setup 표시 칸은 남긴다 ──
await scenario('C-2', async () => {
  const t = setup('c2', 'instrumented');
  const before = t.r('harness.config.mjs');
  const edited = before.replace("    always: ['README.md'],\n", "    always: [\n      'README.md',\n      'docs/README.md',\n    ], // harness-kit:docs-setup — 시험\n")
    .replace("      { type: 'hook', pattern: '.harness/**' },\n", "      { type: 'hook', pattern: '.harness/**' },\n      { type: 'sql', pattern: 'db/**' },\n");
  ok(edited !== before && (edited.match(/harness-kit:docs-setup/g) || []).length === 1 && edited.includes("type: 'sql'"), 'C-2 config 를 고쳤다(docs-setup 표시 칸 · 증거 칸 한 줄 더)');
  t.w('harness.config.mjs', edited);
  ok(U(t, 'scan', '--tier', 'light').code === 0, 'C-2 scan --tier light');
  const cs = t.state().plan.candidates;
  const docs = cs.find((c) => c.id === 'slot:docs.always'), ev = cs.find((c) => c.id === 'slot:qualityCycle.evidence'), tf = cs.find((c) => c.id === 'slot:testFirst.auditOnStop');
  ok(docs && JSON.stringify(docs.options) === '["keep"]' && docs.recommend === 'keep', 'C-2 docs-setup 표시(닫는 줄)가 든 여러 줄 칸은 남김만');
  ok(ev && ev.status === 'modified' && ev.recommend === null, 'C-2 설치 뒤 값이 바뀐 칸은 권장 없음');
  ok(tf && tf.status === 'clean' && tf.recommend === 'revert', 'C-2 그대로인 칸은 권장 되돌림');
});

// ── D schema 1 영수증 → 계측으로 읽는다 ──
await scenario('D', async () => {
  const t = setup('d', 'instrumented');
  const m = JSON.parse(t.r('harness.install.json'));
  delete m.tier; delete m.config; m.schema = 1;
  t.w('harness.install.json', JSON.stringify(m, null, 2) + '\n');
  const sc = U(t, 'scan');
  ok(sc.code === 0 && /설치 범위: 계측 \(영수증 schema 1/.test(sc.out) && /WARN 영수증에 설치 범위가 없다/.test(sc.out), 'D schema 1: 계측으로 읽고 경고한다');
  ok(!t.state().plan.warnings.some((w) => /훅\(.+\)이 .+ 에 없다/.test(w)), 'D schema 1: 계측 훅 5개가 다 있어 빠진 훅 경고 없음');
  ok(run(IN, 'hooks', t.repo).code === 0, 'D install.mjs hooks: schema 1 영수증을 계측으로 판정');
  const lo = U(t, 'scan', '--refresh', '--tier', 'light');
  const cs = t.state().plan.candidates;
  ok(lo.code === 0 && /config\.slots 가 없다\(schema 1\)/.test(lo.out), 'D schema 1 범위 낮추기: 칸 되돌리기 기준이 없다고 경고');
  ok(cs.filter((c) => c.kind === 'hook').length === 4 && !cs.some((c) => c.kind === 'slot'), 'D schema 1 범위 낮추기: 범위 밖 훅 4개 · 칸 후보 없음');
  removeAll(t, 'D schema 1');
});

// ── E 여러 줄 배열 칸 — docs-setup 표시를 여는 줄 · 닫는 줄 어디에 붙여도 칸으로 읽는다 ──
await scenario('E', async () => {
  const { ownedSlots, revertSlot } = await import(new URL('../../docs-setup/scripts/config-slots.mjs', import.meta.url).href);
  const open = "export default {\n  docs: {\n    always: [ // harness-kit:docs-setup — 시험\n      'README.md',\n      'docs/README.md',\n    ],\n  },\n};\n";
  const close = "export default {\n  docs: {\n    always: [\n      'README.md',\n    ], // harness-kit:docs-setup — 시험\n  },\n};\n";
  const o1 = ownedSlots(open), o2 = ownedSlots(close);
  ok(o1.slots.length === 1 && o1.slots[0].path === 'docs.always' && JSON.stringify(o1.slots[0].lines) === '[3,6]', `E ownedSlots: 여는 줄 표시 → docs.always 3–6행 (${JSON.stringify(o1.slots.map((s) => [s.path, s.lines]))})`);
  ok(o2.slots.length === 1 && o2.slots[0].path === 'docs.always' && JSON.stringify(o2.slots[0].lines) === '[3,5]', `E ownedSlots: 닫는 줄 표시 → docs.always 3–5행 (${JSON.stringify(o2.slots.map((s) => [s.path, s.lines]))})`);
  const crlf = close.replace(/\n/g, '\r\n');
  const rv = revertSlot(crlf, 'docs.always', '[]', '');
  ok(rv.action === 'reverted' && rv.text === 'export default {\r\n  docs: {\r\n    always: [],\r\n  },\r\n};\r\n', 'E revertSlot: CRLF 여러 줄 배열 → [] 한 줄, 꼬리 주석은 example 판(없음)으로');
});

// ── E-2 영수증 없는 걷어내기 — config 를 import 하지 못해 글로 읽을 때, docs-setup 의 여러 줄 배열 칸 안 경로는 보조 파일 후보가 아니다 ──
await scenario('E-2', async () => {
  const t = setup('e2', 'light');
  const cfg = t.r('harness.config.mjs').replace("export default {\n", "import missing from './missing-helper.mjs';\nexport default {\n")
    .replace("    always: [],\n", "    always: [\n      'README.md',\n      'docs/harness-notes.md',\n    ], // harness-kit:docs-setup — 시험\n");
  t.w('harness.config.mjs', cfg);
  t.w('docs/harness-notes.md', '# 하네스 메모\n');
  rmSync(path.join(t.repo, 'harness.install.json'));   // 영수증 없는 옛 설치
  const sc = U(t, 'scan');
  ok(sc.code === 0 && /config 를 import 하지 못했다/.test(sc.out), 'E-2 scan: config import 실패 → 글로 읽는 길');
  ok(!t.state().plan.candidates.some((c) => c.id === 'file:docs/harness-notes.md'), 'E-2 여러 줄 docs-setup 칸 안의 문서 경로는 보조 파일 후보가 아니다');
});

// ── F 설치 끝 문서 구조 질문 — 권장 진행 · 나중에 ──
await scenario('F', async () => {
  const t = setup('f1', 'light');
  t.w('docs/plan-a.md', '# 계획 A\n'); t.w('docs/guide.md', '# 안내\n'); t.w('docs/api.md', '# API\n');
  const j1 = path.join(t.repo + '-hookup.json');
  const h1 = run(IN, 'docs-hookup', t.repo, '--json', j1);
  const r1 = existsSync(j1) ? JSON.parse(readFileSync(j1, 'utf8')) : {};
  ok(h1.code === 0 && /^권장: 진행$/m.test(h1.out) && /^권장 이유: /m.test(h1.out) && r1.recommend === 'proceed', `F 문서 3개 · archiveDir 없음 → 권장 진행 (${(h1.out.match(/^권장 이유: .*$/m) || [''])[0].slice(0, 80)})`);
  const u = setup('f2', 'light');
  const j2 = path.join(u.repo + '-hookup.json');
  const h2 = run(IN, 'docs-hookup', u.repo, '--json', j2);
  const r2 = existsSync(j2) ? JSON.parse(readFileSync(j2, 'utf8')) : {};
  ok(h2.code === 0 && /^권장: 나중에$/m.test(h2.out) && /^권장 이유: /m.test(h2.out) && r2.recommend === 'later', 'F 거의 빈 새 레포(문서 0) → 권장 나중에');
});

// ── H graft 로컬 연결(harness-install D9)이 있는 계측 설치 → 라이트로 낮추기 — D9 는 범위와 따로라 그대로 남는다 ──
await scenario('H', async () => {
  const t = setup('h', 'instrumented');
  // D9 흉내 — .gitignore 의 /graft/ 표시 블록(커밋 대상) · settings.local.json 의 graft 훅 · helpers(로컬 전용, info/exclude)
  const GRAFT_BLOCK = '# harness-kit:begin\n# graft 그래프 캐시 — 로컬 산출물이라 커밋하지 않는다\n/graft/\n# harness-kit:end\n';
  t.w('.gitignore', `${t.r('.gitignore')}${GRAFT_BLOCK}`);
  const LOCAL = '{\n  "hooks": {\n    "UserPromptSubmit": [\n      { "hooks": [{ "type": "command", "command": "node \\"$CLAUDE_PROJECT_DIR/.claude/helpers/graft-hooks.cjs\\" prompt", "timeout": 15 }] }\n    ]\n  },\n  "disabledMcpjsonServers": ["graft"]\n}\n';
  t.w('.claude/settings.local.json', LOCAL);
  t.w('.claude/helpers/graft-hooks.cjs', '\n');
  const exclude = path.resolve(t.repo, t.git('rev-parse', '--git-path', 'info/exclude').trim());
  mkdirSync(path.dirname(exclude), { recursive: true });
  writeFileSync(exclude, '/.claude/settings.local.json\n/.claude/helpers/graft-*.cjs\n/graft/\n', 'utf8');
  const local = { graft: { answer: 'local', items: ['.claude/settings.local.json#graft', '.claude/helpers/graft-*.cjs', 'graft/', 'git-path:info/exclude#harness-kit graft-localize'] } };
  const d = JSON.parse(readFileSync(t.draft, 'utf8'));
  d.edits.push({ path: '.gitignore', how: 'block' });
  d.decisions.push({ id: 'D9', answer: '사용 — 이 PC 에서만' });
  d.local = local;
  writeFileSync(t.draft, JSON.stringify(d), 'utf8');
  const wm = run(WM, t.repo, t.draft, '--example', t.ex);
  ok(wm.code === 0, `H 계측 + D9 영수증 — local 과 /graft/ 블록을 받는다 (${last(wm)})`);
  const h = run(IN, 'hooks', t.repo);
  ok(h.code === 0 && /hooks: failures=0/.test(h.out), `H install.mjs hooks — settings.local.json 의 graft 훅은 범위 훅으로 세지 않는다 (${last(h)})`);
  const giBefore = t.r('.gitignore');
  const sc = U(t, 'scan', '--tier', 'light');
  ok(sc.code === 0, `H scan --tier light 종료코드 0 (${last(sc)})`);
  const cands = t.state().plan.candidates;
  ok(!cands.some((c) => /\.gitignore|settings\.local\.json|graft/.test(`${c.id} ${c.title || ''}`)), `H 낮추기 후보에 .gitignore · settings.local.json · graft 가 없다 (${cands.map((c) => c.id).join(' ')})`);
  const blk = cands.find((c) => c.kind === 'text');
  const newBlock = path.join(t.repo + '-light-block.md');
  writeFileSync(newBlock, BLOCK.light, 'utf8');
  ok(U(t, 'block', blk.id, newBlock).code === 0, 'H block: 라이트 판');
  ok(U(t, 'answer', '--recommended').code === 0 && U(t, 'backup').code === 0 && U(t, 'apply').code === 0, 'H answer · backup · apply');
  const v = U(t, 'verify');
  ok(v.code === 0 && /failures=0/.test(v.out), `H verify failures=0 — settings.local.json 의 graft 훅이 백업과 같다 (${last(v)})`);
  ok(t.r('.gitignore') === giBefore, 'H .gitignore(/graft/ 블록 포함)는 낮추기 전과 바이트까지 같다');
  ok(t.r('.claude/settings.local.json') === LOCAL && existsSync(path.join(t.repo, '.claude/helpers/graft-hooks.cjs')), 'H graft 로컬 연결(settings.local.json · helpers)은 그대로다');
  const m = JSON.parse(t.r('harness.install.json'));
  ok(m.tier === 'light' && JSON.stringify(m.local) === JSON.stringify(local) && m.decisions.some((x) => x.id === 'D9'), 'H 갱신한 영수증: tier light · local · D9 답이 남는다');
  U(t, 'finish');
  // 낮춘 뒤 걷어내기 scan — graft 가 아직 연결돼 있으니 /graft/ 블록은 남김을 권한다
  ok(U(t, 'scan').code === 0, 'H 낮춘 뒤 scan');
  const gb = t.state().plan.candidates.find((c) => c.id === 'text:.gitignore#block2');
  ok(gb && gb.recommend === 'keep', `H 낮춘 뒤 걷어내기: .gitignore 의 /graft/ 블록은 남김 권장 (${gb && gb.recommend})`);
});

console.log(`\nscenarios: pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
