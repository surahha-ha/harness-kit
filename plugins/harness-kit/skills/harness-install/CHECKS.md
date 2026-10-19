# 정적 확인 · 발동 확인 안내

스크립트는 **scratchpad 에 둔다**(대상 레포에 파일을 만들지 않는다). 셸 인자에는 레포 경로만 넘기고, 판정할 명령 문자열은 파일 안에 둔다 — 셸 인자로 넘기면 실행 전 훅이 그 문자열을 보고 막는다.

## §1 settings.json — 파싱 · 키 중복 · 경로 · 대조

`settings-check.mjs` — 사용: `node settings-check.mjs <레포 루트> [--before <백업>] [--parents <부모1 settings> <부모2 settings>]`
(부모 판은 `git show <커밋>:.claude/settings.json` 을 리다이렉션으로 scratchpad 에 받아 둔다.)

```js
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const [root, ...rest] = process.argv.slice(2);
const opt = (name, n = 1) => { const i = rest.indexOf(name); return i < 0 ? null : rest.slice(i + 1, i + 1 + n); };
let fail = 0;
const bad = (msg) => { fail++; console.log(`FAIL ${msg}`); };

/** 객체마다 같은 키가 두 번 나오는지 본다 — JSON.parse 는 중복을 말없이 뒤쪽으로 덮는다. */
function dupKeys(text) {
  const dups = [], stack = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1, s = '';
      while (text[j] !== '"') { if (text[j] === '\\') { s += text[j] + text[j + 1]; j += 2; } else s += text[j++]; }
      let k = j + 1; while (/\s/.test(text[k])) k++;
      const top = stack[stack.length - 1];
      if (top && top.type === '{' && text[k] === ':') { if (top.keys.has(s)) dups.push(`${top.path}.${s}`); top.keys.add(s); top.last = s; }
      i = j; continue;
    }
    if (c === '{' || c === '[') {
      const p = stack[stack.length - 1];
      stack.push({ type: c, keys: new Set(), last: null, path: !p ? '$' : p.type === '{' ? `${p.path}.${p.last}` : `${p.path}[]` });
    } else if (c === '}' || c === ']') stack.pop();
  }
  return dups;
}

/** 훅 항목을 "이벤트 | matcher | 명령" 문자열 목록으로 편다. */
function entries(json) {
  const out = [];
  for (const [ev, groups] of Object.entries(json.hooks || {}))
    for (const g of groups) for (const h of g.hooks || []) out.push(`${ev} | ${g.matcher || '*'} | ${h.command}`);
  return out;
}
const load = (p) => { const t = readFileSync(p, 'utf8'); return { text: t, json: JSON.parse(t) }; };

const cur = load(path.join(root, '.claude/settings.json'));
const d = dupKeys(cur.text);
d.length ? bad(`중복 키 ${d.join(', ')}`) : console.log('OK   중복 키 0');

const list = entries(cur.json);
for (const e of list) {
  const m = e.match(/\$\{?CLAUDE_PROJECT_DIR(?::-[^}]*)?\}?\/([^"'\s]+)/);
  if (m && !existsSync(path.join(root, m[1]))) bad(`경로 없음 ${m[1]} :: ${e}`);
}
console.log(`INFO 훅 ${list.length}개`);

const want = [
  ['PreToolUse', 'danger-guard.mjs"'], ['PostToolUse', 'danger-guard.mjs" --post'],
  ['PostToolUseFailure', 'danger-guard.mjs" --post'], ['Stop', 'turn-end.mjs"'], ['UserPromptSubmit', 'turn-start.mjs"'],
];
for (const [ev, tail] of want) {
  const n = list.filter((e) => e.startsWith(`${ev} |`) && e.includes('/.harness/') && e.endsWith(tail)).length;
  n === 1 ? console.log(`OK   ${ev} 하네스 훅 1개`) : bad(`${ev} 하네스 훅 ${n}개`);
  if (ev.startsWith('Pre') || ev.startsWith('Post')) {
    const g = (cur.json.hooks[ev] || []).find((x) => (x.hooks || []).some((h) => h.command.includes('/.harness/')));
    if (!g || !/Bash/.test(g.matcher || '') || !/PowerShell/.test(g.matcher || '')) bad(`${ev} matcher 가 Bash·PowerShell 둘 다가 아님`);
  }
}

const before = opt('--before');
if (before) {
  const b = load(before[0]);
  for (const e of entries(b.json)) if (!list.includes(e)) bad(`기존 훅 사라짐 :: ${e}`);
  const skip = new Set(['hooks', 'enabledPlugins', 'extraKnownMarketplaces']);
  for (const k of new Set([...Object.keys(b.json), ...Object.keys(cur.json)]))
    if (!skip.has(k) && JSON.stringify(b.json[k]) !== JSON.stringify(cur.json[k])) bad(`최상위 키 달라짐 ${k}`);
}

const parents = opt('--parents', 2);
if (parents) {
  const union = new Set([...entries(load(parents[0]).json), ...entries(load(parents[1]).json)]);
  for (const e of union) if (!list.includes(e)) bad(`병합 누락 :: ${e}`);
  for (const e of list) if (!union.has(e)) bad(`병합 초과 :: ${e}`);
  if (new Set(list).size !== list.length) bad('병합본에 같은 항목 중복');
  console.log(`INFO 합집합 ${union.size} · 병합본 ${list.length}`);
}
console.log(`failures=${fail}`);
process.exit(fail ? 1 : 0);
```

## §2 `--status` 기대값

레포 루트에서 하나씩 실행하고 종료코드를 직접 본다(파이프 금지). 어느 줄에서든 모듈 오류가 나면 복사가 통째가 아니다.

| 명령 | 설치 직후 기대 | 종료코드 |
| - | - | - |
| `node .harness/danger-guard.mjs --status` | 「활성 — deny N · ask M」 + 공유자원·프로브 설정 표기 | 0 |
| `node .harness/test-first.mjs --status` | `enabled:false` 면 「꺼짐」 | 1 (의도) |
| `node .harness/drift-watch.mjs --status` | 미러를 비웠으면 「미러 없음」 | 1 (의도) |
| `node .harness/turn-end.mjs --status` | 발동 전 「stop 이벤트 없음」 · 증거 슬롯을 채웠으면 그 유형 수 | 1 (발동 전 정상) |
| `node .harness/turn-start.mjs --status` | 발동 전 「이벤트 없음」 | 1 (발동 전 정상) |

config 를 채우기 **전**(example 복사 직후)의 danger-guard 는 「설정됨 · 규칙 없음」(1)이어야 한다 — 4단계에서 한 번 본다.

## §3 발동 확인 안내문 — 사용자에게 그대로 건넨다

`<토큰>` 자리에 config `dangerGuard.probe.token` 값을 **문자 그대로** 넣는다.

> 1. 설치한 트리에서 새 대화형 세션을 엽니다(`claude`, 작업 폴더 = 그 트리). 폴더 신뢰를 물어 오면 승인합니다.
> 2. 에이전트에게 이렇게 요청합니다: 「Bash 도구로 `echo <토큰>` 을 실행하고, 이어서 PowerShell 도구로 같은 명령을 실행해 줘」.
>    두 번 모두 「차단됨 — 검증 전용 프로브 규칙입니다…」 서명이 뜨면 성공입니다. 그냥 출력되면 그 셸 경로에 훅이 안 걸린 것입니다.
>    PowerShell 도구가 없는 환경이면 Bash 만 확인하고 그렇다고 적습니다.
> 3. 같은 세션에서 `node .harness/turn-end.mjs --status` 와 `node .harness/turn-start.mjs --status` 를 실행해 이벤트가 1건 이상인지 봅니다.
> 4. `/plugin` 에서 harness-kit 이 켜져 있고, 이 레포에서 끄기로 한 플러그인이 꺼져 있는지 봅니다.
> 5. 헤드리스(`claude -p`)나 `!` 로 직접 친 명령은 훅을 타지 않으므로 확인으로 치지 않습니다.

## §4 패턴 판정 — `evaluate` import

`pattern-check.mjs` — 사용: `node pattern-check.mjs <레포 루트>`

```js
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const { evaluate } = await import(pathToFileURL(`${root}/.harness/danger-guard.mjs`).href);
const config = (await import(pathToFileURL(`${root}/harness.config.mjs`).href)).default;

// [명령, 기대 규칙 id(차단·확인) 또는 null(통과)] — 레포 문서의 실제 명령 줄은 원문 그대로 넣는다.
const cases = [
  // 프로브: [`echo ${config.dangerGuard.probe.token}`, 'probe'],
  // deny 규칙마다: 차단 기대 1건 이상 + 그 규칙 recover 에 적은 명령(통과 기대)
  // 출력 파이프: '<명령> | tail' · '<명령> 2>&1 | tail' · '<명령> 2>&1 | Select-Object -Last 20' → 차단 / '<명령> > out.txt 2>&1' → null
  // 공유 자원: 공유 호스트 + 쓰기 구문 → 'shared' / 같은 호스트 조회 → null / 로컬 호스트 쓰기 → null
  // 오탐 방지: 커밋 메시지·grep 인자 속 차단 문구 → null
];

let fail = 0;
for (const [cmd, want] of cases) {
  const hit = evaluate(cmd, config);
  const got = hit ? hit.rule : null;
  if (got !== want) fail++;
  console.log(`${got === want ? 'OK  ' : 'FAIL'} want=${want} got=${got} :: ${cmd}`);
}

// 증거 슬롯을 채웠으면: [유형 id, 명령, 기대 true/false] — 인정해야 할 실행과 인정하면 안 되는 실행(테스트 제외 빌드·watch·파이프)
const evidenceCases = [];
for (const [id, cmd, want] of evidenceCases) {
  const t = config.qualityCycle.evidence.types.find((x) => x.id === id);
  const got = t.evidence.some((e) => new RegExp(e.pattern.source, e.pattern.flags.replace('g', '')).test(cmd));
  if (got !== want) fail++;
  console.log(`${got === want ? 'OK  ' : 'FAIL'} evidence ${id} want=${want} got=${got} :: ${cmd}`);
}
console.log(`failures=${fail}`);
process.exit(fail ? 1 : 0);
```
