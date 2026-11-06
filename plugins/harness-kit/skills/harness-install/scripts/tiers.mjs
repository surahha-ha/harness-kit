/**
 * 설치 범위(tier) — harness-install · harness-uninstall 이 함께 쓰는 표.
 *
 * 범위는 둘이다. 골격 파일은 범위와 무관하게 통째로 복사한다 — 범위가 가르는 것은
 * settings.json 에 거는 훅 · config 에 채우는 칸 · CLAUDE.md 「개발 하네스」 절의 판 셋뿐이다.
 *   light        라이트 — 실행 전 가드(PreToolUse) 하나 + 사고 근거가 있는 deny·ask·공유 자원 규칙
 *   instrumented 계측   — 지금까지의 전체 설치(훅 5개 · 계측 로그·지표 · 증거 슬롯 …). 하네스 개발 설치처용
 * 표준(standard)은 만들지 않는다(2026-11-05 결정 · 다시 여는 조건은 DECISIONS D0). 이 표에 넣지 않는다.
 * 행동을 바꾸는 수단은 두 범위에 함께 넣는다 — 계측에만 두는 것은 출력이 없는 관찰·기록이다.
 *
 * 영수증 schema 1(tier 칸 없음)은 계측으로 읽는다 — 그때까지의 설치는 모두 전체 설치였다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const TIERS = ['light', 'instrumented'];
export const RANK = { light: 1, instrumented: 2 };
export const LABEL = { light: '라이트', instrumented: '계측' };

/** 'light'·'라이트' → 'light' · 'instrumented'·'계측' → 'instrumented' · 그 밖은 null. */
export function normTier(x) {
  const s = String(x ?? '').trim().toLowerCase();
  if (s === 'light' || s === '라이트') return 'light';
  if (s === 'instrumented' || s === '계측') return 'instrumented';
  return null;
}

/** 하네스 훅 — 범위마다 거는 것. tail 은 command 의 끝(TEMPLATES §1 꼴). */
export const HOOKS = [
  { event: 'PreToolUse', matcher: 'Bash|PowerShell', tail: 'danger-guard.mjs"', tier: 'light', what: '실행 전 가드' },
  { event: 'PostToolUse', matcher: 'Bash|PowerShell', tail: 'danger-guard.mjs" --post', tier: 'instrumented', what: '실행 뒤 관찰' },
  { event: 'PostToolUseFailure', matcher: 'Bash|PowerShell', tail: 'danger-guard.mjs" --post', tier: 'instrumented', what: '실패한 실행 관찰' },
  { event: 'Stop', matcher: null, tail: 'turn-end.mjs"', tier: 'instrumented', what: '턴 종료 관찰' },
  { event: 'UserPromptSubmit', matcher: null, tail: 'turn-start.mjs"', tier: 'instrumented', what: '턴 시작 관찰' },
];

/** 그 훅 항목(event·command)이 표의 어느 하네스 훅인가 — .harness/ 를 가리키지 않거나 표에 없으면 null. */
export function hookSpec(event, command) {
  if (!/[\/\\]\.harness[\/\\]/.test(String(command || ''))) return null;
  return HOOKS.find((h) => h.event === event && String(command).endsWith(h.tail)) || null;
}

/** 그 범위에 걸려 있어야 하는 훅. */
export const hooksFor = (tier) => HOOKS.filter((h) => RANK[h.tier] <= RANK[tier]);

/**
 * 라이트에서 키 없이 두는 kit 칸(`project` 기준 경로) — docs-setup 이 정하는 칸과 정확히 같다
 * (docs-setup `config-slots.mjs` 의 `ARCHIVE_CYCLE`, 시험이 둘이 같은지 본다).
 * 키가 없으면 읽는 자산(archive-cycle)이 쓸 때 멈추고 묻는다 — null 과 달리 말없이 건너뛰지 않는다.
 * 설치 끝의 문서 구조 질문(docs-setup)이 이 칸을 채운다.
 * 그 밖의 kit 문서·메모리 칸(`docs.domainIndex`·`screenMap`·`repoMap`·`testGuide`·`uiUxRules`·`memory.policy`)은
 * docs-setup 이 채우지 않는다 — 두 범위 모두 D8 에서 묻는다(시험 설치에서 6칸이 키 없이 남아 읽는 자산이 멈췄다).
 */
export const LIGHT_DEFERRED = ['docs.archiveDir', 'docs.pathValidator', 'docs.autoloaded', 'memory.slugs'];
const under = (p, prefix) => p === prefix || p.startsWith(`${prefix}.`);
export const deferredInLight = (projectPath) => LIGHT_DEFERRED.some((x) => under(projectPath, x));

/**
 * 계측에서만 채우는 config 칸(앞머리). 라이트에서는 example 기본값 그대로(게이트 칸)이거나 키 없음(docs-setup 이 정하는 kit 칸)이다.
 * `testFirst` 는 범위 표에 들지 않는다 — `auditOnStop` 만 턴 종료 훅이 있어야 돌아 계측에 둔다.
 * kit `project.review.*`(사후리뷰 설정)도 넣지 않는다 — review-pending 은 관찰 훅·계측 로그 없이 git 과 config 만 읽는 라이트 칸이다.
 */
export const INSTRUMENTED_SLOTS = [
  'testFirst.auditOnStop', 'qualityCycle.evidence', 'drift', 'metrics', 'promotion',
  'docs.always', 'docs.archive', ...LIGHT_DEFERRED.map((x) => `project.${x}`),
];
/** config 칸 경로(최상위 기준, kit 칸은 `project.` 로 시작)가 어느 범위의 칸인가. */
export const tierOfSlot = (p) => (INSTRUMENTED_SLOTS.some((x) => under(p, x)) ? 'instrumented' : 'light');
/**
 * 객체 칸(`project.docs` 처럼 example 에 없던 블록을 통째로 적은 영수증 칸) 아래 칸 가운데 계측 칸.
 * 범위 낮추기는 그 블록에 라이트 칸(D8 답)이 섞여 있으면 블록을 통째로 지우지 않고 이 칸만 되돌린다.
 */
export const instrumentedUnder = (objPath, leaves) => leaves.filter((p) => p !== objPath && under(p, objPath) && tierOfSlot(p) === 'instrumented');

/** 영수증의 범위 — tier 칸이 없으면(schema 1) 계측으로 본다. 영수증이 없으면 null. */
export function receiptTier(manifest) {
  if (!manifest) return null;
  const t = normTier(manifest.tier);
  if (t) return { tier: t, legacy: false, from: `영수증 tier` };
  return { tier: 'instrumented', legacy: true, from: `영수증 schema ${manifest.schema ?? 1} — 범위 칸이 없어 계측으로 본다(그때까지의 설치는 모두 전체 설치였다)` };
}

/**
 * 지금 레포의 범위를 정한다 — `--tier` > 설치 체크포인트의 tier > 영수증 > 기록 없음(계측).
 * @returns {{ tier: 'light'|'instrumented', from: string }}
 */
export function resolveTier(root, argTier = null) {
  if (argTier != null) {
    const t = normTier(argTier);
    if (!t) throw new Error(`--tier 는 light(라이트)·instrumented(계측) 중 하나: ${argTier}`);
    return { tier: t, from: '--tier' };
  }
  try {
    const sp = path.resolve(root, execFileSync('git', ['-C', root, 'rev-parse', '--git-path', 'harness-install-state.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
    if (existsSync(sp)) {
      const t = normTier(JSON.parse(readFileSync(sp, 'utf8')).tier);
      if (t) return { tier: t, from: '설치 체크포인트 tier' };
    }
  } catch { /* git 밖 · 깨진 체크포인트 — 다음 근거로 */ }
  const mf = path.join(root, 'harness.install.json');
  if (existsSync(mf)) {
    try { const r = receiptTier(JSON.parse(readFileSync(mf, 'utf8').replace(/^\uFEFF/, ''))); return { tier: r.tier, from: r.from }; } catch { /* 깨진 영수증 */ }
  }
  return { tier: 'instrumented', from: '체크포인트·영수증에 범위 기록 없음 — 계측으로 본다(옛 설치와 같은 기준)' };
}
