# 정적 확인 · 발동 확인 안내 · 설치 진행 판정 · 영수증 · 테스트 제외 확인

스크립트는 **scratchpad 에 둔다**(대상 레포에 파일을 만들지 않는다). 케이스를 이 레포 값으로 채워야 하는 판정(§1·§4)은 아래 꼴을 scratchpad 에 Write 해 쓰고, 고정된 판정은 스킬의 `scripts/` 를 그대로 부른다(`install.mjs` · `answer-trace.mjs` · `write-manifest.mjs`). 셸 인자에는 레포 경로만 넘기고, 판정할 명령 문자열은 파일 안에 둔다 — 셸 인자로 넘기면 실행 전 훅이 그 문자열을 보고 막는다.

## §1 settings.json — 파싱 · 키 중복 · 경로 · 대조

`settings-check.mjs` — 사용: `node settings-check.mjs <레포 루트> [--before <백업>] [--parents <부모1 settings> <부모2 settings>]`
(부모 판은 `git show <커밋>:.claude/settings.json` 을 리다이렉션으로 scratchpad 에 받아 둔다. `--before` 에는 5단계 before 스냅숏 `$(git rev-parse --git-path harness-install-settings/before)/files/.claude/settings.json` 을 준다 — 훅·최상위 키에 더해 줄끝·BOM 도 편집 전과 대조한다.)

**하네스 훅은 범위대로 따로 본다:** `node "${CLAUDE_SKILL_DIR}/scripts/install.mjs" hooks <레포 루트>` — 그 범위(`--tier` 가 없으면 체크포인트 `tier` → 영수증 `tier` → 계측)의 훅이 각 이벤트에 정확히 1번, 범위 밖 하네스 훅 0번, PreToolUse·PostToolUse·PostToolUseFailure matcher 에 Bash·PowerShell 이 둘 다 있는지. 표에 없는 하네스 훅(`.harness/` 를 가리키는데 끝이 TEMPLATES §1 꼴이 아님)도 실패다. 끝 줄 `hooks: failures=N`.

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
const load = (p) => { const t = readFileSync(p, 'utf8'); return { text: t, json: JSON.parse(t.replace(/^\uFEFF/, '')) }; };
const shape = (p) => { const b = readFileSync(p), s = b.toString('utf8'), crlf = (s.match(/\r\n/g) || []).length, lf = (s.match(/\n/g) || []).length - crlf;
  return `${crlf && lf ? 'MIXED' : crlf ? 'CRLF' : 'LF'}${b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? '+BOM' : ''}`; };

const cur = load(path.join(root, '.claude/settings.json'));
const d = dupKeys(cur.text);
d.length ? bad(`중복 키 ${d.join(', ')}`) : console.log('OK   중복 키 0');

const list = entries(cur.json);
for (const e of list) {
  const m = e.match(/\$\{?CLAUDE_PROJECT_DIR(?::-[^}]*)?\}?\/([^"'\s]+)/);
  if (m && !existsSync(path.join(root, m[1]))) bad(`경로 없음 ${m[1]} :: ${e}`);
}
console.log(`INFO 훅 ${list.length}개`);

// 하네스 훅의 수·범위·matcher 는 여기서 보지 않는다 — `install.mjs hooks <레포 루트>` 가 설치 범위(체크포인트 tier)대로 본다.
// 라이트에서 관찰 훅 넷이 없는 것은 실패가 아니고, 계측에서는 다섯 다 정확히 1번이어야 한다.

const before = opt('--before');
if (before) {
  const b = load(before[0]);
  const sb = shape(before[0]), sc = shape(path.join(root, '.claude/settings.json'));
  sb === sc ? console.log(`OK   줄끝·BOM ${sc} 이 편집 전과 같다`) : bad(`줄끝·BOM 이 바뀜 ${sb} → ${sc} — install.mjs settings-eol 로 되돌린다`);
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

범위마다 기대가 다른 줄 — 라이트는 골격을 통째로 복사했지만 관찰 훅을 걸지 않았다.

| 명령 | 라이트 | 계측 |
| - | - | - |
| `danger-guard.mjs --status` | 위와 같다 | 위와 같다 |
| `turn-end.mjs --status` · `turn-start.mjs --status` | 「이벤트 없음」(1)이 **계속** 정상이다 — 훅이 없어 쌓이지 않는다. 모듈 오류만 보면 된다 | 발동 전 1 · 7단계 뒤 이벤트 1건 이상 |
| `test-first.mjs --status` · `drift-watch.mjs --status` | 위와 같다(꺼짐 · 미러 없음) | 2단계 답대로 |

config 를 채우기 **전**(3단계 끝, example 복사 직후)의 danger-guard 는 「설정됨 · 규칙 없음」(1)이어야 한다. 4단계 뒤에도 이 줄이면 config 가 안 채워진 것이다.

## §3 발동 확인 안내문 — 사용자에게 그대로 건넨다

`<토큰>` 자리에 config `dangerGuard.probe.token` 값을 **문자 그대로** 넣는다.

> 1. 설치한 트리에서 새 대화형 세션을 엽니다(`claude`, 작업 폴더 = 그 트리). 폴더 신뢰를 물어 오면 승인합니다.
> 2. 에이전트에게 이렇게 요청합니다: 「Bash 도구로 `echo <토큰>` 을 실행하고, 이어서 PowerShell 도구로 같은 명령을 실행해 줘」.
>    두 번 모두 「차단됨 — 검증 전용 프로브 규칙입니다…」 서명이 뜨면 성공입니다. 그냥 출력되면 그 셸 경로에 훅이 안 걸린 것입니다.
>    PowerShell 도구가 없는 환경이면 Bash 만 확인하고 그렇다고 적습니다.
> 3. (계측만) 같은 세션에서 `node .harness/turn-end.mjs --status` 와 `node .harness/turn-start.mjs --status` 를 실행해 이벤트가 1건 이상인지 봅니다. 라이트는 이 훅을 걸지 않아 이 줄을 건넨 안내문에서 뺍니다.
> 4. `/plugin` 에서 harness-kit 이 켜져 있고, 이 레포에서 끄기로 한 플러그인이 꺼져 있는지 봅니다.
> 5. 헤드리스(`claude -p`)나 `!` 로 직접 친 명령은 훅을 타지 않으므로 확인으로 치지 않습니다.

## §4 패턴 판정 — `evaluate` import · 래퍼 · 와일드카드

`pattern-check.mjs` — 사용: `node pattern-check.mjs <레포 루트>`

케이스는 규칙마다 아래 넷을 채운다. 시험 설치의 전체 테스트 규칙은 맨 명령만 케이스로 두어, 와일드카드 `--tests` 와 `bash -c "…"` 래퍼가 통과하는 것을 6단계가 잡지 못했다.

1. **차단 기대 · 통과 기대** — 규칙마다 1건 이상. 통과 기대에는 그 규칙 `recover` 에 적은 명령을 넣는다.
2. **도구 경로 변형** — 같은 도구를 부르는 꼴마다 하나: `./gradlew` · `gradlew` · `gradlew.bat` · `.\gradlew.bat` · `<하위>/gradlew` · `"./gradlew"`(따옴표) · `cd <하위> && ./gradlew …` · `npx <도구>` ↔ `./node_modules/.bin/<도구>` · `npm run <스크립트>`. 레포 문서·스크립트에 실제로 나오는 꼴은 원문 그대로.
3. **와일드카드 · glob** — 인자에 `*` 가 뜻을 갖는 규칙이면: `--tests '*'` · `--tests '<패키지>.*'` · `--tests *<클래스 일부>*` · 정확한 공유 테스트 이름(좁힌 것처럼 보이는 차단 대상) · `rm -rf build/*` · `docker volume rm $(docker volume ls -q)`. 「좁힌 실행은 통과」 예외가 있는 규칙은 `*` 가 든 꼴이 그 예외를 타지 않는지 본다.
4. **래퍼 변형** — 스크립트가 차단 기대 케이스마다 자동으로 만든다(아래 `WRAPS`). 감싼 판이 다른 판정이면 `HOLE` 로 세고 실패다. 고치려면 규칙의 머리를 래퍼 뒤에서도 시작되게(`\b(?:bash|sh|cmd|powershell|pwsh)(?:\.exe)?\s+(?:[-\/]\w+\s+)*["']{0,2}`), 끝 조건에 따옴표를 넣는다(`(?=[\s;&|)"']|$)`). 고치지 않고 남기면 그 구멍을 사용자에게 보이고 답을 보고에 적는다.

D6-2 에서 다룬 명령(끈 플러그인이 막던 것)도 같은 표에 넣는다 — 답이 deny·ask 면 그 규칙 id, 「막지 않음」이면 `null`(보고의 빈자리 목록과 같아야 한다).

```js
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const { evaluate } = await import(pathToFileURL(`${root}/.harness/danger-guard.mjs`).href);
const config = (await import(pathToFileURL(`${root}/harness.config.mjs`).href)).default;

// [명령, 기대 규칙 id(차단·확인) 또는 null(통과)] — 레포 문서의 실제 명령 줄은 원문 그대로 넣는다.
const cases = [
  // 프로브: [`echo ${config.dangerGuard.probe.token}`, 'probe'],
  // deny·ask 규칙마다: 차단 기대 1건 이상 + 그 규칙 recover 에 적은 명령(통과 기대)
  // 도구 경로 변형: './gradlew …' · 'gradlew.bat …' · '.\\gradlew.bat …' · '"./gradlew" …' · 'cd <하위> && ./gradlew …' · 'npx <도구> …'
  // 와일드카드: "<명령> --tests '*'" · "<명령> --tests '<패키지>.*'" · '<명령> --tests *<일부>*' · '<명령> --tests <공유 테스트 FQN>'
  // 출력 파이프: '<명령> | tail' · '<명령> 2>&1 | tail' · '<명령> 2>&1 | Select-Object -Last 20' → 차단 / '<명령> > out.txt 2>&1' → null
  // 공유 자원: 공유 호스트 + 쓰기 구문 → 'shared' / 같은 호스트 조회 → null / 로컬 호스트 쓰기 → null
  // 서버 기동(D2-2): '<기동 명령>' · 'cd <하위> && <기동 명령>' · '<시작 스크립트>' · 'cmd /c <시작 스크립트>' · '& .\\<시작 스크립트>'
  // D6-2: 끈 플러그인이 막던 명령마다 → 답대로 규칙 id 또는 null
  // 오탐 방지: 커밋 메시지·grep 인자 속 차단 문구 → null
];

// 래퍼 변형 — 막혀야 하는 케이스마다 셸·실행기로 감싼 판도 같은 판정이어야 한다. 감싼 판이 통과하면 그것이 구멍이다.
const WRAPS = [
  ['bash -c "…"', (c) => !c.includes('"') && `bash -c "${c}"`],
  ["bash -lc '…'", (c) => !c.includes("'") && `bash -lc '${c}'`],
  ['sh -c "…"', (c) => !c.includes('"') && `sh -c "${c}"`],
  ['cmd /c …', (c) => `cmd /c ${c}`],
  ['cmd.exe /c "…"', (c) => !c.includes('"') && `cmd.exe /c "${c}"`],
  ['powershell -Command "…"', (c) => !c.includes('"') && `powershell -Command "${c}"`],
  ['pwsh -c "…"', (c) => !c.includes('"') && `pwsh -c "${c}"`],
  ['( … )', (c) => `(${c})`],
  ['앞 줄 + 개행', (c) => `echo start\n${c}`],
];

let fail = 0;
const judge = (cmd) => { const hit = evaluate(cmd, config); return hit ? hit.rule : null; };
for (const [cmd, want] of cases) {
  const got = judge(cmd);
  if (got !== want) fail++;
  console.log(`${got === want ? 'OK  ' : 'FAIL'} want=${want} got=${got} :: ${cmd}`);
  if (!want || want === 'probe') continue;
  for (const [name, wrap] of WRAPS) {
    const w = wrap(cmd);
    if (!w) continue;
    const g = judge(w);
    if (g !== want) { fail++; console.log(`HOLE want=${want} got=${g} [${name}] :: ${w.replace(/\n/g, '\\n')}`); }
  }
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

- `OK`·`FAIL` 은 케이스 표 그대로의 판정이고, `HOLE` 은 래퍼 변형의 구멍이다. 래퍼 안에 같은 따옴표가 든 케이스는 그 변형을 건너뛴다(셸에서도 그대로는 안 되는 꼴이다).
- 실행 전 가드는 이 스크립트를 셸 인자로 부르지 않으므로 스스로 막히지 않는다. 케이스 문자열은 이 파일 안에만 둔다.

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

## §6 답을 바꾼 흔적 — 6단계

답을 여러 번 바꾼 설치에서는 옛 답의 값·주석이 남는다. 아래 1~4 를 보고 항목마다 「고침 / 의도(근거)」를 적고, 5·6 은 보고에 옮긴다.

1. **체크포인트 답 ↔ config·settings 값** — 스크립트 ①. 다르면 어느 쪽이 최종 답인지 사용자에게 묻는다.
2. **같은 규칙 중복** — deny·ask 안에서 같은 `id` 나 같은 패턴. 스크립트 ②.
3. **example 기본값이 남은 슬롯** — example 과 값이 같은 칸. 스크립트 ③ 이 목록만 낸다(실패로 세지 않음). 각 칸이 「답이 기본 유지」인지 「옛 답에서 못 바꾼 것」인지 가린다.
4. **주석 ↔ 값** — 「미확정」 주석인데 값이 있는 줄은 스크립트 ④ 가 잡는다. 그 밖(「끔」이라 적고 `true`, ask 라 적힌 규칙이 deny 배열에 있음 등)은 `diff --strip-trailing-cr "$T/example.mjs" harness.config.mjs` 의 바뀐 덩어리마다 바로 위 주석을 읽어 본다.
5. **권장과 다른 답** — 스크립트 ⑤ 가 체크포인트 `recs` 의 「권장과 다름」·「권장 없음」을 목록으로 낸다(실패로 세지 않음). 보고의 결정 표 「권장」 열과 같아야 한다. `recs` 가 없는 답은 2단계 기록 누락이라 실패로 센다.
6. **질문 형식** — 2단계에서 낸 질문마다 아래를 눈으로 본다(TEMPLATES.md §8, 스크립트 밖). 어긋난 질문은 D 번호와 함께 보고에 적는다. 이전 세션에서 물어 이 세션 대화에 질문이 남아 있지 않으면 「확인 불가」로 적는다.
   - **header** — 12자 이하 · D 번호가 없고 대상 명사가 들어 있다(`테스트DB 볼륨삭제` ○ · `D4-3 볼륨삭제` ×) · 동작만 있는 header(`범위`·`제외`·`데몬`) 없음 · 한 번에 낸 질문끼리 겹치지 않음.
   - **선택지 라벨** — 질문을 보지 않고 라벨만 읽어도 뜻이 통한다(`막지 않음`·`차단 (deny)` ○ · `넣지 않음`·`deny` ×).
   - **권장 표시** — 권장이 있으면 첫 선택지 라벨 끝에 「(권장)」, 그 설명 첫 줄에 「권장 이유: …」(규칙표 인용이 아니라 이 레포의 관찰). 권장이 없으면 질문에 「권장 없음 — …」이 있고 「(권장)」이 어디에도 없다.
   - **쉬운 말** — 질문 첫 문장에 풀이표 왼쪽의 말(`deny`·`trailer`·`간접`·`빈자리`·`--stop`)이 풀이 없이 나오지 않는다. 사용자가 되물은 질문은 그 용어와 함께 적는다.

`node "${CLAUDE_SKILL_DIR}/scripts/answer-trace.mjs" <레포 루트> <example 사본>` — ①~⑥ 을 돈다. example 사본은 §5 ② 에서 꺼낸 `$T/example.mjs` 다. 체크포인트는 대상 트리의 `git rev-parse --git-path harness-install-state.json` 에서 읽고, 대상 레포에는 아무것도 쓰지 않는다. 출력 줄: `OK`(답 = 값 · 설치 범위) · `FAIL`(①②④ 어긋남 · recs 누락 · 체크포인트 `tier` 없음) · `SAME`(③) · `TIER`(③ 중 라이트의 범위 밖 칸 — example 기본값이 의도다. 「고침 / 의도」를 따로 가리지 않아도 된다) · `AUTO`(범위 때문에 묻지 않고 채운 답 — 보고의 결정 표에 「범위로 정함」) · `NOREC`·`DIFF`(⑤). 종료코드는 FAIL 이 있을 때만 1.

- ⑥ **설치 범위** — 체크포인트 `tier`(D0 답)가 없으면 실패다. 라이트면 ③ 의 계측 칸(`scripts/tiers.mjs` 의 `INSTRUMENTED_SLOTS`)이 `SAME` 이 아니라 `TIER` 로 나온다. 범위 안 칸의 `SAME` 은 그대로 가린다.

## §7 영수증 — 9단계

`node "${CLAUDE_SKILL_DIR}/scripts/write-manifest.mjs" <레포 루트> <초안>` 이 대조하는 것(하나라도 어긋나면 영수증을 쓰지 않고 종료코드 1):

- `files` 의 경로가 상대경로이고 실제로 있다 · 디렉토리는 파일로 펴서 해시를 채운다(`.harness/*.jsonl` 제외)
- 파일마다 `edits` 의 block·line 수가 그 파일의 표시 수와 같다 · 닫히지 않은 시작 표시가 없다
- `replace` 의 `after` 가 그 파일에 `count` 번 나온다(줄끝은 파일 것을 따른다)
- `settings.hooks` 의 훅이 그 이벤트·matcher·명령 그대로 있고, `settings.keys` 의 값이 settings.json 의 값과 같다
- 초안에 `tier`(`light` · `instrumented`)가 있고, `settings.hooks` 가 그 범위의 훅과 맞다 — 범위 밖 훅이 있거나 범위 훅이 빠지면 실패
- `--example <example 사본>` 을 넘기면 설치가 바꾼 config 칸마다 설치 전 값을 `config.slots` 에 적는다(그 칸 값을 읽지 못하면 실패). 넘기지 않으면 `INFO` 한 줄 — 범위 낮추기에서 칸을 되돌릴 기준이 없다
- 문자열 값에 드라이브 경로 · `/Users/`·`/home/` · 사용자 홈이 없다 · `source.sha` 가 40자 SHA 다

출력 `OK harness.install.json — 범위 <라이트|계측> · 파일 N · 고친 곳 M · 훅 K · 키 L · config 칸 C(계측 칸 I)` 의 N 이 `.harness/`(런타임 산출물 제외)·config·보조 파일 수의 합과 같아야 한다.

## §8 테스트 제외 확인 — 「빠질 것만 빠지고, 돌 것은 돌았나」

D3 에서 공유 자원 테스트를 명령줄 제외(init script·필터)로 뺐으면 두 번 본다. 「빼려던 것이 빠졌나」만 보면 제외가 넓은 것을 놓친다 — 시험 설치의 첫 init script 는 루트 패키지 직속 3개를 빼려다 하위 패키지까지 모두 빼, 결과 파일이 72개 대신 7개였는데 「공유 DB 테스트가 결과에 없음」만 보고 통과로 읽힐 뻔했다.

`I=node "${CLAUDE_SKILL_DIR}/scripts/install.mjs"` 라 할 때:

**① 정적 — 6단계.** 실행 없이 소스 트리에 제외 규칙을 대어 무엇이 빠지는지 펼친다. 빌드 도구는 제외 패턴을 디렉토리에도 맞추므로(디렉토리가 맞으면 그 아래 전체가 빠진다) 스크립트도 그렇게 본다.

```bash
$I test-select <레포 루트> --src <테스트 소스 루트> --exclude '<init script 의 exclude 패턴>' \
   --expect-excluded <빼려던 FQN> [--expect-excluded <FQN>…]
# 필터(excludeTestsMatching · --tests 제외)를 썼으면 --exclude 대신 --filter-exclude '<패턴>' — 이 * 는 점을 넘어 하위 패키지까지 맞는다
```

- `빠짐` 목록이 빼려던 것과 같고 `failures=0` 이어야 한다. `의도 밖 제외` 가 나오면 패턴을 좁힌다(`<패키지 경로>/*` → `<패키지 경로>/*.class` 또는 클래스 이름).
- `--expect-excluded` 없이 돌리면 대조는 하지 않고 목록만 낸다 — 그 목록을 사용자에게 보이고 의도와 같은지 묻는다.
- 추상 클래스(`abstract class`)는 원래 돌지 않으므로 「돌아야 할 것」에서 뺀다.

**② 실행 — 7단계, 사용자가 직접.** 판정용 테스트 명령은 공유 자원 경로를 막아도 로컬 컨테이너 등에 쓸 수 있어, 대상 환경을 확인한 사람이 돌린다. 아래 안내문을 이 레포의 값으로 채워 건넨다.

> 1. 테스트가 쓸 로컬 컨테이너를 띄웁니다({컨테이너 기동 명령}). 공유 DB 가 아닌지 한 번 더 봅니다.
> 2. 지난 결과가 섞이지 않게 결과를 비우고 판정용 명령을 돌립니다(파이프 없이): `{결과 비우기 작업} {commands.unitTest 명령}` — 예: Gradle 은 `cleanTest test --init-script <경로>`.
> 3. 끝나면 결과 디렉토리({JUnit XML 디렉토리})를 알려 주세요. BUILD FAILED 여도 괜찮습니다 — 결과 파일은 남습니다.

결과를 받으면:

```bash
$I test-select <레포 루트> --src <테스트 소스 루트> --exclude '<패턴>' --expect-excluded <FQN>… --results <JUnit XML 디렉토리>
```

| 출력 | 판정 |
| - | - |
| `failures=0` · 결과 없음 0 · 빠져야 할 것 중 돈 것 0 | 성공 — 빠질 것만 빠지고 나머지는 돌았다 |
| `결과 없음 N` | 제외가 넓거나 결과가 이전 실행 판이다. 패턴을 고치거나 결과를 비우고 다시 |
| `빠져야 할 … 가 돌았다` | 제외 실패 — 공유 자원에 닿았을 수 있다. 바로 사용자에게 알리고 그 테스트가 무엇을 바꿨는지 함께 본다 |
| `결과 파일이 0개` | 실행이 안 됐거나 디렉토리가 틀렸다 |

- 결과 파일 이름은 JUnit XML 관례(`TEST-<FQN>.xml`)를 따른다고 본다 — Gradle·Maven 은 그렇다. 다른 러너면 클래스 목록을 손으로 뽑아 같은 대조를 한다.
- 보고에는 「테스트 클래스 N · 빠짐 M(이름) · 실행 결과 K」 세 수를 적는다.
