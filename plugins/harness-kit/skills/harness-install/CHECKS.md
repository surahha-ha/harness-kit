# 정적 확인 · 발동 확인 안내 · 설치 진행 판정 · 영수증

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
| `node .harness/danger-guard.mjs --status` | 「활성 — deny N · ask M · 공유자원 규칙 … · 프로브 설정됨」(deny·ask·공유자원 중 1개 이상) | 0 |
| `node .harness/test-first.mjs --status` | `enabled:false` 면 「꺼짐」 | 1 (의도) |
| `node .harness/drift-watch.mjs --status` | 미러를 비웠으면 「미러 없음」 | 1 (의도) |
| `node .harness/turn-end.mjs --status` | 발동 전 「stop 이벤트 없음」 · 증거 슬롯을 채웠으면 그 유형 수 | 1 (발동 전 정상) |
| `node .harness/turn-start.mjs --status` | 발동 전 「이벤트 없음」 | 1 (발동 전 정상) |

config 를 채우기 **전**(3단계 끝, example 복사 직후)의 danger-guard 는 「설정됨 · 규칙 없음」(1)이어야 한다. 4단계 뒤에도 이 줄이면 config 가 안 채워진 것이다.

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

## §5 설치 진행 판정 · `.harness/` 비교 — 0·3·4단계

**줄끝은 무시하고 비교한다.** autocrlf 트리에서는 원본 클론·대상 트리의 작업본이 CRLF 일 수 있고, `git show`·`git archive` 로 꺼낸 판은 index 그대로(보통 LF)다. 그대로 `diff -r` 하면 모든 줄이 거짓 차이로 뜬다(PITFALLS §3).

```bash
R=<대상 트리>; O=<원본 클론>; S=<원본 SHA>; T=<scratchpad>
# ① .harness/ ↔ 원본 skeletons — 출력 0줄이면 같다(계측 로그는 대상 쪽에만 있다)
diff -r --strip-trailing-cr -x log.jsonl -x promotions.jsonl "$O/skeletons" "$R/.harness"
#    원본 작업본이 S 판과 다를 수 있으면 S 판을 풀어 비교한다
mkdir -p "$T/src-$S" && git -C "$O" archive "$S" skeletons | tar -x -C "$T/src-$S"
# ② config 가 아직 example 그대로인가 — 종료코드 0 = 그대로(미완) · 1 = 채워짐
git -C "$O" show "$S:harness.config.example.mjs" > "$T/example.mjs"
tail -n +2 "$R/harness.config.mjs" | diff -q --strip-trailing-cr - "$T/example.mjs"
#    첫 줄이 머리 줄(TEMPLATES §6)이 아니면 tail 없이 파일 전체를 비교한다
# ③ HEAD 에는 있는데 작업본에서 지워졌나 — 앞 줄이 비어 있지 않고 뒤 줄에 " D" 가 있으면 그렇다
git -C "$R" ls-tree --name-only HEAD -- .harness harness.config.mjs
git -C "$R" status --short -- .harness harness.config.mjs
```

- 커밋된 `.harness/` 는 index 기준으로도 본다: `git -C "$R" ls-tree -r HEAD -- .harness` 와 `git -C "$O" ls-tree -r "$S" -- skeletons` 의 blob SHA 가 경로 앞머리만 빼고 같아야 한다. 줄끝 정규화 뒤의 값이라 CR 에 흔들리지 않는다.
- 원본 SHA 는 체크포인트 → config 머리 줄 순으로 찾고, 둘 다 없으면 묻는다.

재개 판정 — 위에서부터 처음 맞는 줄을 고른다.

| 관찰 | 판정 | 할 일 |
| - | - | - |
| 체크포인트 있음 | 중단된 설치 | `done`·답을 보이고 「재개 / 초기화」를 묻는다 |
| ③ 이 「지워짐」 | 지워진 설치 | 멈추고 보고 → 「의도적 재설치인가」. 그렇다면 새 설치로 진행하고, HEAD 판은 9단계 전 `git diff HEAD -- <설치 파일>` 대조 기준으로 쓴다 |
| `.harness/` 있음 · config 없음, 또는 ② 가 「그대로」, 또는 `--status` 가 「규칙 없음」 | 중단된 설치(체크포인트 없음) | 같은 질문. 재개면 답은 2단계에서 다시 묻는다 |
| 영수증(`harness.install.json`) 있음, 또는 config 채워짐 · `--status` 활성 · 체크포인트 없음 | 끝난 설치 | 멈추고 보고(업그레이드는 범위 밖). 다시 설치하려면 `harness-uninstall` → 새 세션 → 이 스킬이라고 안내한다 |
| 아무것도 없음 | 새 설치 | 1단계로 |

- **재개** — 0·1단계는 다시 한다. `done` 의 각 단계는 완료 기준을 한 번 더 확인하고(끊긴 쪽이 기록 뒤에 파일을 바꿨을 수 있다), 틀린 첫 단계부터 잇는다.
- **초기화** — 설치가 만든 것만 지운다: 체크포인트 `created`·`edits`·`settings` 에 적힌 것(`.harness/` · `harness.config.mjs` · `.gitignore` 표시 블록 · 보조 파일 · 5단계를 지났으면 settings.json 의 하네스 훅·플러그인 키 · 8단계를 지났으면 `CLAUDE.md` 표시 블록·줄과 고친 줄) · 체크포인트. 지울 목록을 먼저 보이고 승인받는다. 블록·키 단위로 지우고 `git restore`·`git checkout` 으로 되돌리지 않는다. 설치 전부터 있던 미커밋 변경은 건드리지 않는다.

## §7 영수증 — 9단계

`node "${CLAUDE_SKILL_DIR}/scripts/write-manifest.mjs" <레포 루트> <초안>` 이 대조하는 것(하나라도 어긋나면 영수증을 쓰지 않고 종료코드 1):

- `files` 의 경로가 상대경로이고 실제로 있다 · 디렉토리는 파일로 펴서 해시를 채운다(`.harness/*.jsonl` 제외)
- 파일마다 `edits` 의 block·line 수가 그 파일의 표시 수와 같다 · 닫히지 않은 시작 표시가 없다
- `replace` 의 `after` 가 그 파일에 `count` 번 나온다(줄끝은 파일 것을 따른다)
- `settings.hooks` 의 훅이 그 이벤트·matcher·명령 그대로 있고, `settings.keys` 의 값이 settings.json 의 값과 같다
- 문자열 값에 드라이브 경로 · `/Users/`·`/home/` · 사용자 홈이 없다 · `source.sha` 가 40자 SHA 다

출력 `OK harness.install.json — 파일 N · 고친 곳 M · 훅 K · 키 L` 의 N 이 `.harness/`(런타임 산출물 제외)·config·보조 파일 수의 합과 같아야 한다.

## §6 답을 바꾼 흔적 — 6단계

답을 여러 번 바꾼 설치에서는 옛 답의 값·주석이 남는다. 아래 1~4 를 보고 항목마다 「고침 / 의도(근거)」를 적고, 5·6 은 보고에 옮긴다.

1. **체크포인트 답 ↔ config·settings 값** — 스크립트 ①. 다르면 어느 쪽이 최종 답인지 사용자에게 묻는다.
2. **같은 규칙 중복** — deny·ask 안에서 같은 `id` 나 같은 패턴. 스크립트 ②.
3. **example 기본값이 남은 슬롯** — example 과 값이 같은 칸. 스크립트 ③ 이 목록만 낸다(실패로 세지 않음). 각 칸이 「답이 기본 유지」인지 「옛 답에서 못 바꾼 것」인지 가린다.
4. **주석 ↔ 값** — 「미확정」 주석인데 값이 있는 줄은 스크립트 ④ 가 잡는다. 그 밖(「끔」이라 적고 `true`, ask 라 적힌 규칙이 deny 배열에 있음 등)은 `diff --strip-trailing-cr "$T/example.mjs" harness.config.mjs` 의 바뀐 덩어리마다 바로 위 주석을 읽어 본다.
5. **권장과 다른 답** — 스크립트 ⑤ 가 체크포인트 `recs` 의 「권장과 다름」·「권장 없음」을 목록으로 낸다(실패로 세지 않음). 보고의 결정 표 「권장」 열과 같아야 한다. `recs` 가 없는 답은 2단계 기록 누락이라 실패로 센다.
6. **질문 형식** — 2단계에서 낸 질문마다 두 가지를 눈으로 본다(TEMPLATES.md §8, 스크립트 밖). 어긋난 질문은 D 번호와 함께 보고에 적는다. 이전 세션에서 물어 이 세션 대화에 질문이 남아 있지 않으면 「확인 불가」로 적는다.
   - **header** — D 번호가 없고 대상 명사가 들어 있다(`테스트DB 볼륨삭제` ○ · `D4-3 볼륨삭제` ×). 동작만 있는 header(`범위`·`제외`·`데몬`)는 어긋남이다.
   - **선택지 라벨** — 질문을 보지 않고 라벨만 읽어도 뜻이 통한다(`막지 않음`·`차단 (deny)` ○ · `넣지 않음`·`deny` ×).

`answer-trace.mjs` — 사용: `node answer-trace.mjs <레포 루트> <example 사본>`

```js
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.argv[2]);
const load = async (p) => (await import(pathToFileURL(p).href)).default;
const config = await load(path.join(root, 'harness.config.mjs'));
const example = await load(path.resolve(process.argv[3]));
const settings = JSON.parse(readFileSync(path.join(root, '.claude/settings.json'), 'utf8'));
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
```
