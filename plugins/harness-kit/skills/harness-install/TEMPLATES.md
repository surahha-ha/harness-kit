# 꼴 — settings.json · .gitignore · CLAUDE.md · 커밋 명령 · config 머리 줄 · 체크포인트 · 결정 질문

## §1 훅 5개 (`.claude/settings.json` 의 `hooks`)

이벤트 키가 이미 있으면 **그 배열에 그룹 하나를 더한다.** 같은 이벤트 키를 하나 더 만들지 않는다. timeout 단위는 초다.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash|PowerShell",
        "hooks": [{ "type": "command", "shell": "bash", "timeout": 10,
                    "command": "node \"$CLAUDE_PROJECT_DIR/.harness/danger-guard.mjs\"" }] }
    ],
    "PostToolUse": [
      { "matcher": "Bash|PowerShell",
        "hooks": [{ "type": "command", "shell": "bash", "timeout": 10,
                    "command": "node \"$CLAUDE_PROJECT_DIR/.harness/danger-guard.mjs\" --post" }] }
    ],
    "PostToolUseFailure": [
      { "matcher": "Bash|PowerShell",
        "hooks": [{ "type": "command", "shell": "bash", "timeout": 10,
                    "command": "node \"$CLAUDE_PROJECT_DIR/.harness/danger-guard.mjs\" --post" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "shell": "bash", "timeout": 10,
                    "command": "node \"$CLAUDE_PROJECT_DIR/.harness/turn-end.mjs\"" }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "shell": "bash", "timeout": 10,
                    "command": "node \"$CLAUDE_PROJECT_DIR/.harness/turn-start.mjs\"" }] }
    ]
  }
}
```

- 레포의 기존 훅이 다른 `shell`·경로 표기를 쓰면 그 관례를 따른다. 기존 항목은 고치지 않는다.
- Stop 의 timeout 은 `qualityCycle.evidence.scanTimeoutMs`(기본 5초)보다 길게 둔다.

## §2 플러그인 키 (project scope)

```json
{
  "extraKnownMarketplaces": {
    "harness-kit": { "source": { "source": "github", "repo": "surahha-ha/harness-kit" } }
  },
  "enabledPlugins": {
    "harness-kit@harness-kit": true
  }
}
```

- D6 에서 「커밋되는 settings 에서 끈다」로 정한 플러그인만 `"<이름>@<마켓>": false` 를 더한다.
- 이미 `enabledPlugins` 가 있으면 그 객체에 키를 더한다.

## §3 `.gitignore`

```
# 하네스 계측 로그 · 승격 레코드 — 커밋하지 않는다
.harness/log.jsonl
.harness/promotions.jsonl
```

미커밋 변경과 같은 자리(파일 끝)를 피할 수 있으면 피한다 — 나중 병합이 쉬워진다.

## §4 CLAUDE.md 「개발 하네스」 절

값은 이 레포의 config 에서 옮긴다. 하네스 원본 SHA 는 config 머리 줄(§6)과 커밋 메시지에 두고 여기에는 적지 않는다(갱신 때마다 낡는다).

```markdown
## 개발 하네스 (`.harness/` · `harness.config.mjs`)

에이전트 훅(`.claude/settings.json`)으로 자동으로 돈다. 규칙·명령의 기준은 `harness.config.mjs` 다.

- **실행 전 가드(Bash·PowerShell)** — 막는 것: {deny 규칙마다 한 구절 + 이유}. 확인받는 것: {ask·공유 자원}. 막히면 판정 메시지의 `→` 뒤 복구 방법을 따른다.
- **테스트 명령** — {바뀐 명령}. {선행 조건: 컨테이너 기동 등 · 실행 전 대상 환경 확인}. 출력은 파이프로 넘기지 않는다.
- **관찰만 하는 것** — 턴 시작·종료{, 증거 슬롯을 채웠으면 그 유형}. 아무것도 막지 않는다. 결과는 `node .harness/metrics.mjs` 로 본다.
- 상태 확인: `node .harness/danger-guard.mjs --status` · `node .harness/turn-end.mjs --status`. 계측 로그 `.harness/log.jsonl` 은 커밋하지 않는다.
- **플러그인** — `harness-kit` 은 `.claude/settings.json` 으로 project scope 에서 켜져 있다{, 끈 플러그인과 이유}. 처음 쓰는 PC 에서는 한 번: `claude plugin marketplace add surahha-ha/harness-kit` → `claude plugin install harness-kit@harness-kit --scope project` → 이 명령이 `.claude/settings.json` 을 다시 쓰므로 직후 `git restore .claude/settings.json`(설치 기록은 남는다). 같은 PC 의 새 worktree 는 다시 설치하지 않아도 된다.
```

레포 `CLAUDE.md` 에 작업 라우팅 표가 있으면 이 절을 가리키는 한 줄을 건다.

## §5 커밋 명령

메시지는 scratchpad 파일로 쓴다(Write). 브랜치·toplevel 조건과 커밋을 한 명령에 둔다.

```bash
R=<레포 루트>; B=<설치 브랜치>
[ "$(git -C "$R" rev-parse --show-toplevel)" = "$R" ] \
  && [ "$(git -C "$R" rev-parse --abbrev-ref HEAD)" = "$B" ] \
  && [ ! -e "$R/.git/index.lock" ] \
  && git -C "$R" add -N -- <신규 파일·디렉토리…> \
  && git -C "$R" commit -F <메시지 파일> -- <경로…>
```

- worktree 에서는 `.git` 이 파일이라 `index.lock` 경로가 다르다 — `git -C "$R" rev-parse --git-path index.lock` 으로 구한다.
- 커밋 뒤 `git -C "$R" status --short` 와 `git -C "$R" show --stat HEAD` 로 남은 변경·포함 파일을 본다.

## §6 config 머리 줄 (3단계 6번)

example 을 복사한 직후 **첫 줄 앞에** 한 줄을 넣는다(Edit). 정확히 한 줄이어야 CHECKS.md §5 의 「머리 줄을 뺀 본문」 비교가 맞는다.

```js
// 하네스 원본: https://github.com/surahha-ha/harness-agent @ <40자 SHA> — harness-install 이 harness.config.example.mjs 에서 시작 (<YYYY-MM-DD>)
```

- 로컬 클론을 썼어도 **공개 저장소 주소**를 적는다(로컬 경로는 반출 위반). 그 SHA 가 공개 저장소에 없거나 원본에 미커밋 변경이 있었으면 줄 끝에 ` · 미공개 커밋` / ` · 미커밋 변경 있음` 을 붙인다.
- 4단계에서 이 줄은 고치지 않는다. 나중 갱신 설치가 이 줄을 새 SHA 로 바꾼다.

## §7 체크포인트 (`git rev-parse --git-path harness-install-state.json`)

대상 트리에서 위 명령이 돌려주는 경로(worktree 면 그 worktree 전용 git 디렉토리 아래)에 Write 로 쓴다. 커밋되지 않으므로 로컬 경로를 적어도 된다.

```json
{
  "skill": "harness-install",
  "source": { "repo": "https://github.com/surahha-ha/harness-agent", "local": "<로컬 클론 또는 임시 clone 경로>", "sha": "<40자 SHA>", "dirty": false },
  "done": [2, 3],
  "decisions": [
    { "id": "D5", "answer": "커밋하지 않고 메시지만 · push 확인 · trailer 없음 · 리뷰 문턱 미정",
      "slots": [
        { "file": "config", "path": ["project", "git", "commitExecution"], "value": "message-only" },
        { "file": "config", "path": ["project", "git", "reviewThreshold"], "value": null }
      ],
      "recs": [
        { "item": "commitExecution", "recommended": "message-only", "basis": "CLAUDE.md:<행> 「커밋은 하지 않고 메시지만」", "followed": true },
        { "item": "reviewThreshold", "recommended": null, "basis": "레포 문서에 리뷰 문턱 없음", "followed": null }
      ] },
    { "id": "D4", "answer": "deny 2개 — …",
      "slots": [{ "file": "config", "path": ["dangerGuard", "deny", "*", "id"], "value": ["<규칙 id>", "<규칙 id>"] }] },
    { "id": "D6", "answer": "커밋되는 settings 에서 끈다",
      "slots": [{ "file": "settings", "path": ["enabledPlugins", "<이름>@<마켓>"], "value": false }] }
  ],
  "nulls": [{ "path": "project.commands.fe.lint", "why": "lint 도구 없음 — 도입하면 채운다" }],
  "updated": "<ISO 시각>"
}
```

- `done` 에는 완료 기준을 통과한 단계 번호만 넣는다. 0·1단계는 읽기뿐이라 적지 않는다 — 재개 때 다시 한다.
- `slots` 는 그 답이 정하는 슬롯 값이다. `"*"` 는 배열의 모든 원소, 정규식 값은 `String(re)` 꼴(`"/…/i"`) 문자열로 적는다. CHECKS.md §6 스크립트가 이것을 config·settings 와 대조한다.
- `recs` 는 그 D 의 항목마다 권장(DECISIONS.md 「권장」)이다. `recommended: null` 은 「판단 근거 부족」이고 그때 `followed` 도 `null` 이다. 권장과 다르게 고르면 `followed: false` — CHECKS.md §6 ⑤ 와 보고의 「권장과 다름」이 이것을 읽는다.
- 쓰기가 권한 확인에 걸리면 사용자에게 위치와 이유를 말하고 승인받는다. 끝내 쓸 수 없으면 「체크포인트 없음 — 끊기면 재개 불가」를 보고에 적고 진행할지 묻는다.

## §8 결정 질문 (2단계)

한 번에 질문 하나. 한 D 에 항목이 여럿이면 항목마다 따로 묻는다. 꺾쇠 자리는 이 레포의 1단계 관찰로 채운다.

```text
header: 단위테스트 범위
D3-1. 단위 테스트 명령에 로컬 컨테이너 통합 테스트까지 넣을까? (commands.unitTest)
근거: <기반 클래스 파일:행> 을 상속하는 통합 테스트 <N>개 · 대상 localhost:<포트> 컨테이너(<compose 파일>) · 거를 이름 관습·태그 없음

1. 통합 테스트 포함 (권장)
   바뀌는 것: commands.unitTest·project.commands.be.testAll 이 통합까지 돈다. 컨테이너가 없으면 무관한 레드 — config 주석·CLAUDE.md 에 「실행 전 컨테이너 기동 · 대상 환경 확인」
2. 통합 테스트 제외
   바뀌는 것: 같은 명령에 제외 필터. 이름 관습·태그가 없어 클래스 목록을 박아야 하고, 새 통합 테스트는 목록에서 빠진다

header: 공유DB테스트 제외
D3-2. 공유 DB 에 직접 붙는 테스트를 어떤 방법으로 뺄까?
근거: <테스트 파일:행> 이 공유 호스트에 하드코딩 접속해 쓰기 구문 실행 · 빌드 설정의 test 작업에 제외 없음

1. 테스트 소스 무수정 (권장)
   바뀌는 것: .harness/ 밖 init script 1개 + 테스트 명령에 --init-script <경로>. 레포 코드 변경 0
2. 테스트 소스 수정 — 레포 코드를 바꾼다
   바뀌는 것: 테스트 소스에 태그 + 필터. 설치 커밋에 테스트 코드 변경이 섞이고 레포 소유자 리뷰 대상

header: 테스트DB 볼륨삭제
D4-3. 테스트 DB 볼륨을 지우는 명령을 막을까? (docker compose … down -v · docker volume rm …)
근거: <compose 파일:행> 의 볼륨 데이터를 다시 만드는 init 스크립트가 없다 · 지우면 5분 안에 되돌릴 수단이 없다

1. 차단 (deny) (권장)
   바뀌는 것: dangerGuard.deny 원소 하나. 맞는 명령은 실행 전에 막히고 recover 에 적은 명령이 안내된다
2. 실행 전 확인 (ask)
   바뀌는 것: dangerGuard.ask 원소 하나. 승인을 거친 뒤 실행된다
3. 막지 않음
   바뀌는 것: 규칙이 들어가지 않는다. 그 명령은 묻지 않고 실행된다
```

**header(질문 chip, 12자 이하)** — 대상 + 동작 명사구로 쓴다.

- D 번호는 header 에 넣지 않는다. 번호는 `question` 맨 앞(`D4-3.`)에 그대로 둔다 — 12자 중 3~5자를 번호가 먹으면 대상이 빠진다.
- 12자 안에서 **대상을 먼저** 채우고 남는 자리에 동작을 붙인다. 대상이 길면 줄여 쓰되(`단위테스트`·`공유DB`) 빼지 않는다. 동작만 있는 header(`범위`·`제외`·`간접`·`데몬`)는 쓰지 않는다.
- 대상 명사는 이 레포의 관찰에서 가져온다 — 공유 자원이 DB 가 아니면 그 자원의 일반 이름을 쓴다.
- 넣기 전에 공백을 포함해 글자 수를 센다.

| 항목 | header | 글자 수 |
| - | - | - |
| D1 | `설치 위치` | 5 |
| D2 | `공유DB 승인방식` | 9 |
| D2 (간접 접근) | `공유DB 간접접근` | 9 |
| D3-1 | `단위테스트 범위` | 8 |
| D3-2 | `공유DB테스트 제외` | 10 |
| D4 (전체 테스트) | `전체테스트 차단` | 8 |
| D4 (출력 파이프) | `빌드출력 파이프` | 8 |
| D4 (볼륨 삭제) | `테스트DB 볼륨삭제` | 10 |
| D4 (데몬 종료) | `Gradle 데몬종료` | 11 |

**question 첫 문장** — 대상과 할 일을 평이한 말로 쓴다(`D4-3. 테스트 DB 볼륨을 지우는 명령을 막을까?`). 명령어·경로·슬롯 이름은 괄호 안에 넣거나 근거 줄로 보낸다.

**선택지 라벨** — 라벨만 읽어도 뜻이 통해야 한다. 라벨은 DECISIONS.md 의 선택지 굵은 이름을 쓴다.

- `넣지 않음` 대신 `막지 않음`, `ask` 대신 `실행 전 확인 (ask)`, `deny` 대신 `차단 (deny)`.
- 권장 표시 「(권장)」 은 라벨 끝에 그대로 붙인다(`차단 (deny) (권장)`).

**근거 부족 · AskUserQuestion**

- 근거가 모자라면 근거 줄에 무엇을 찾지 못했는지 적고, 그 아래 「판단 근거 부족 — 직접 골라 주세요」를 둔다. 어느 선택지에도 「(권장)」을 붙이지 않는다.
- AskUserQuestion 을 쓰면 `header` 에 위 header 를, `question` 에 질문과 근거 한 줄을, 권장 선택지를 `options` 의 첫 번째에 두고 `label` 끝에 「(권장)」을, 각 `description` 에 바뀌는 것을 넣는다. 「판단 근거 부족」이면 `question` 끝에 그 문구를 붙인다.
