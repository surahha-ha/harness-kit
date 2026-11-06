#!/usr/bin/env node
/**
 * harness-install 6단계 — 답을 바꾼 흔적 점검(CHECKS.md §6).
 *
 * 사용: node answer-trace.mjs <레포 루트> <example 사본>
 *   example 사본은 원본의 harness.config.example.mjs 를 그 SHA 판으로 scratchpad 에 꺼낸 것(CHECKS.md §5 ②).
 *   체크포인트는 대상 트리의 `git rev-parse --git-path harness-install-state.json` 에서 읽는다.
 *
 * ① 체크포인트 답 ↔ config·settings·settings.local 값(slot 의 file)  ② 같은 규칙 중복  ③ example 과 값이 같은 칸(목록만)
 * ④ 「미확정」 주석인데 값이 있는 줄  ⑤ 권장과 다른 답 · 권장 없음(목록만, recs 누락은 실패)
 *    질문마다 basis(권장 이유 또는 권장 없음의 이유)가 비면 실패 · header 가 12자를 넘거나 D 번호로 시작하면 실패.
 *    D 번호 밖 질문은 체크포인트 `asked`(header · recommended · basis)에서 같은 것을 본다
 * ⑥ 설치 범위 — 체크포인트 tier(D0)가 없으면 실패. 라이트면 ③ 의 범위 밖 칸(계측 칸)은 SAME 대신 TIER(의도 — 범위 밖
 *    example 기본값)로 내고, 범위 때문에 묻지 않고 채운 답(auto)은 AUTO 로 낸다.
 * 읽기만 한다 — 대상 레포에 파일을 만들지 않는다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LABEL, normTier, tierOfSlot } from './tiers.mjs';

if (process.argv.length < 4) { console.error('사용: node answer-trace.mjs <레포 루트> <example 사본>'); process.exit(2); }
const root = path.resolve(process.argv[2]);
const load = async (p) => (await import(pathToFileURL(p).href)).default;
const config = await load(path.join(root, 'harness.config.mjs'));
const example = await load(path.resolve(process.argv[3]));
const readJson = (rel) => { const p = path.join(root, rel); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) : null; };
const settings = readJson('.claude/settings.json');
// D6 「이 레포에서 끈다 — settings.local.json」 답은 개인 설정 파일에 적힌다. 그 파일이 없으면 칸 값은 undefined 로 대조한다
const settingsLocal = readJson('.claude/settings.local.json');
const SLOT_FILES = { config, settings, 'settings.local': settingsLocal };
const statePath = path.resolve(root, execFileSync('git', ['-C', root, 'rev-parse', '--git-path', 'harness-install-state.json'], { encoding: 'utf8' }).trim());
const state = JSON.parse(readFileSync(statePath, 'utf8'));
let fail = 0;
const bad = (m) => { fail++; console.log(`FAIL ${m}`); };

// ⑥ 설치 범위 — D0 답이 체크포인트 tier 에 있어야 뒤 질문의 생략·자동 답을 가를 수 있다
const tier = normTier(state.tier);
tier ? console.log(`OK   설치 범위 ${LABEL[tier]} (체크포인트 tier)`) : bad(`체크포인트에 tier 가 없다(${JSON.stringify(state.tier ?? null)}) — D0(하네스 설치범위)를 묻고 light|instrumented 로 적는다`);
for (const d of state.decisions || []) if (d.auto) console.log(`AUTO ${d.id} — ${d.answer}${d.why ? ` (${d.why})` : ''}`);
const canon = (v) => JSON.stringify(v, (_, x) => (x instanceof RegExp ? String(x) : x));
const pick = (o, [k, ...rest]) => k === undefined ? o
  : k === '*' ? (Array.isArray(o) ? o.map((x) => pick(x, rest)) : undefined)
  : o == null ? undefined : pick(o[k], rest);

// ① 체크포인트 답 ↔ 값 (정규식 값은 체크포인트에 String(re) 꼴로 적혀 있다)
for (const d of state.decisions || []) for (const s of d.slots || []) {
  const file = s.file ?? 'config';
  if (!(file in SLOT_FILES)) { bad(`${d.id} ${s.path.join('.')} 모르는 file 「${file}」 — config · settings · settings.local 가운데 하나(TEMPLATES §7)`); continue; }
  const got = pick(SLOT_FILES[file], s.path);
  canon(got) === canon(s.value) ? console.log(`OK   ${d.id} ${s.path.join('.')}`)
    : bad(`${d.id} ${s.path.join('.')} 답=${canon(s.value)} 값=${canon(got)}`);
}

// ② 같은 규칙 중복
const g = config.dangerGuard || {};
const seen = new Map();
for (const [kind, r] of [...(g.deny || []).map((r) => ['deny', r]), ...(g.ask || []).map((r) => ['ask', r])]) {
  for (const key of [r.id && `id ${r.id}`, `pattern ${String(r.pattern)}`].filter(Boolean)) {
    seen.has(key) ? bad(`규칙 중복 ${key} — ${seen.get(key)} · ${kind}`) : seen.set(key, kind);
  }
}

// ③ example 과 값이 같은 칸 — 배열·정규식은 한 칸으로 본다
const walk = (v, p, out) => {
  if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof RegExp)) for (const k of Object.keys(v)) walk(v[k], [...p, k], out);
  else out.push([p, v]);
  return out;
};
// 라이트 — 계측 칸이 example 기본값인 것은 의도다(범위 밖). 흔적 점검의 「고침 / 의도」 판정을 손으로 하지 않게 따로 낸다
for (const [p, v] of walk(example, [], [])) if (v != null && canon(pick(config, p)) === canon(v)) {
  const k = p.join('.');
  if (tier === 'light' && tierOfSlot(k) === 'instrumented') console.log(`TIER ${k} = ${canon(v).slice(0, 60)} — 의도: 라이트 범위 밖 칸(example 기본값)`);
  else console.log(`SAME ${k} = ${canon(v).slice(0, 60)}`);
}

// ④ 「미확정」 주석인데 값이 있는 줄
readFileSync(path.join(root, 'harness.config.mjs'), 'utf8').split(/\r?\n/).forEach((l, i) => {
  if (/미확정/.test(l) && /:\s*(?!null\b)\S/.test(l.split('//')[0])) bad(`미확정인데 값이 있음 :${i + 1} ${l.trim()}`);
});

// ⑤ 권장과 다른 답 · 권장 없음 — 목록만(recs 누락은 실패)
//   질문마다 「권장 + 권장 이유」 또는 「권장 없음 + 그 이유」가 있어야 한다 — basis 가 비면 실패(시험에서 둘 다 없는 질문이 여섯 번 나갔다)
const noBasis = (r) => r.basis == null || !String(r.basis).trim();
const headerBad = (h) => (typeof h !== 'string' || !h.trim() ? 'header 없음' : [...h].length > 12 ? `header 「${h}」 12자 넘음` : /^D\d/.test(h) ? `header 「${h}」 에 D 번호` : null);
for (const d of state.decisions || []) {
  if (!Array.isArray(d.recs) || !d.recs.length) { bad(`${d.id} recs 없음 — 권장·따름 여부 미기록`); continue; }
  if (d.header !== undefined && headerBad(d.header)) bad(`${d.id} ${headerBad(d.header)} — 대상 + 결정 명사구(TEMPLATES §8)`);
  for (const r of d.recs) {
    if (noBasis(r)) bad(`${d.id} ${r.item} 근거 없음 — 권장이면 「권장 이유」, 권장이 없으면 「권장 없음」의 이유를 basis 에 적는다`);
    if (r.recommended == null) console.log(`NOREC ${d.id} ${r.item} — ${r.basis}`);
    else if (r.followed === false) console.log(`DIFF ${d.id} ${r.item} 권장=${canon(r.recommended)} 답=${d.answer} — ${r.basis}`);
  }
}
// ⑤-2 D 번호 밖 질문(원본 위치 · 커밋규칙 문구 · 서버 기동 안내 · 설치 커밋 · push·병합) — 체크포인트 asked · 10단계 docsHookup
for (const q of state.asked || []) {
  const id = q.header || q.id || '(이름 없음)';
  if (headerBad(q.header)) bad(`asked ${id} ${headerBad(q.header)}`);
  if (!('recommended' in q)) bad(`asked ${id} recommended 칸 없음 — 권장 값 또는 null(권장 없음)을 적는다`);
  if (noBasis(q)) bad(`asked ${id} 근거 없음 — 「권장 이유」 또는 「권장 없음」의 이유를 basis 에 적는다`);
  else if (q.recommended == null) console.log(`NOREC asked ${id} — ${q.basis}`);
}
if (state.docsHookup && state.docsHookup.answer !== 'skip' && (!state.docsHookup.recommend || noBasis({ basis: state.docsHookup.why }))) bad('docsHookup 권장·권장 이유 없음 — docs-hookup 의 「권장:」·「권장 이유:」 줄을 적는다');
console.log(`failures=${fail}`);
process.exit(fail ? 1 : 0);
