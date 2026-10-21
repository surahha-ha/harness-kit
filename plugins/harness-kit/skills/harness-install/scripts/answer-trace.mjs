#!/usr/bin/env node
/**
 * harness-install 6단계 — 답을 바꾼 흔적 점검(CHECKS.md §6).
 *
 * 사용: node answer-trace.mjs <레포 루트> <example 사본>
 *   example 사본은 원본의 harness.config.example.mjs 를 그 SHA 판으로 scratchpad 에 꺼낸 것(CHECKS.md §5 ②).
 *   체크포인트는 대상 트리의 `git rev-parse --git-path harness-install-state.json` 에서 읽는다.
 *
 * ① 체크포인트 답 ↔ config·settings 값  ② 같은 규칙 중복  ③ example 과 값이 같은 칸(목록만)
 * ④ 「미확정」 주석인데 값이 있는 줄  ⑤ 권장과 다른 답 · 권장 없음(목록만, recs 누락은 실패)
 * 읽기만 한다 — 대상 레포에 파일을 만들지 않는다.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.argv.length < 4) { console.error('사용: node answer-trace.mjs <레포 루트> <example 사본>'); process.exit(2); }
const root = path.resolve(process.argv[2]);
const load = async (p) => (await import(pathToFileURL(p).href)).default;
const config = await load(path.join(root, 'harness.config.mjs'));
const example = await load(path.resolve(process.argv[3]));
const settings = JSON.parse(readFileSync(path.join(root, '.claude/settings.json'), 'utf8').replace(/^\uFEFF/, ''));
const statePath = path.resolve(root, execFileSync('git', ['-C', root, 'rev-parse', '--git-path', 'harness-install-state.json'], { encoding: 'utf8' }).trim());
const state = JSON.parse(readFileSync(statePath, 'utf8'));
let fail = 0;
const bad = (m) => { fail++; console.log(`FAIL ${m}`); };
const canon = (v) => JSON.stringify(v, (_, x) => (x instanceof RegExp ? String(x) : x));
const pick = (o, [k, ...rest]) => k === undefined ? o
  : k === '*' ? (Array.isArray(o) ? o.map((x) => pick(x, rest)) : undefined)
  : o == null ? undefined : pick(o[k], rest);

// ① 체크포인트 답 ↔ 값 (정규식 값은 체크포인트에 String(re) 꼴로 적혀 있다)
for (const d of state.decisions || []) for (const s of d.slots || []) {
  const got = pick(s.file === 'settings' ? settings : config, s.path);
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
for (const [p, v] of walk(example, [], [])) if (v != null && canon(pick(config, p)) === canon(v)) console.log(`SAME ${p.join('.')} = ${canon(v).slice(0, 60)}`);

// ④ 「미확정」 주석인데 값이 있는 줄
readFileSync(path.join(root, 'harness.config.mjs'), 'utf8').split(/\r?\n/).forEach((l, i) => {
  if (/미확정/.test(l) && /:\s*(?!null\b)\S/.test(l.split('//')[0])) bad(`미확정인데 값이 있음 :${i + 1} ${l.trim()}`);
});

// ⑤ 권장과 다른 답 · 권장 없음 — 목록만(recs 누락은 실패)
for (const d of state.decisions || []) {
  if (!Array.isArray(d.recs) || !d.recs.length) { bad(`${d.id} recs 없음 — 권장·따름 여부 미기록`); continue; }
  for (const r of d.recs) {
    if (r.recommended == null) console.log(`NOREC ${d.id} ${r.item} — ${r.basis}`);
    else if (r.followed === false) console.log(`DIFF ${d.id} ${r.item} 권장=${canon(r.recommended)} 답=${d.answer} — ${r.basis}`);
  }
}
console.log(`failures=${fail}`);
process.exit(fail ? 1 : 0);
