# 꼴 — settings.json · .gitignore · CLAUDE.md · 커밋 명령 · config 머리 줄 · 체크포인트 · 결정 질문 · 영수증

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
# harness-kit:begin
# 하네스 계측 로그 · 승격 레코드 — 커밋하지 않는다
.harness/log.jsonl
.harness/promotions.jsonl
# harness-kit:end
```

- 시작·끝 표시 줄(`# harness-kit:begin` · `# harness-kit:end`)은 줄 전체가 그 문자열이어야 한다. `.gitignore` 는 줄 끝 주석이 없어 한 줄 표시를 쓰지 않는다 — 넣는 줄은 늘 블록으로 감싼다.
- 블록 앞뒤에 빈 줄을 하나씩 두면, harness-uninstall 이 블록을 지울 때 빈 줄 하나만 남겨 원래 모양으로 돌아간다.
- 미커밋 변경과 같은 자리(파일 끝)를 피할 수 있으면 피한다 — 나중 병합이 쉬워진다.
- D9(graft 사용)의 `/graft/` 줄은 따로 블록 하나다 — `graft-localize.mjs prepare` 가 파일 끝에 넣는다(graft 가 인정하는 줄 `/graft/`·`graft/`·`graft` 가 이미 있으면 넣지 않는다). 하네스 로그 블록과 합치지 않는다 — 걷어낼 때 graft 를 남기면 이 블록도 남겨야 한다.

```
# harness-kit:begin
# graft 그래프 캐시 — 이 PC 에서 다시 만드는 로컬 산출물이라 커밋하지 않는다(graft build 는 이 줄이 없으면 매번 덧붙인다)
/graft/
# harness-kit:end
```

## §4 CLAUDE.md 「개발 하네스」 절

값은 이 레포의 config 에서 옮긴다. 하네스 원본 SHA 는 config 머리 줄(§6)과 커밋 메시지에 두고 여기에는 적지 않는다(갱신 때마다 낡는다).

```markdown
<!-- harness-kit:begin -->
## 개발 하네스 (`.harness/` · `harness.config.mjs`)

에이전트 훅(`.claude/settings.json`)으로 자동으로 돈다. 규칙·명령의 기준은 `harness.config.mjs` 다.

- **실행 전 가드(Bash·PowerShell)** — 막는 것: {deny 규칙마다 한 구절 + 이유}. 확인받는 것: {ask·공유 자원}. 막히면 판정 메시지의 `→` 뒤 복구 방법을 따른다. 막는 것은 에이전트의 도구 호출뿐이다 — 꼭 필요하면 사람이 자기 터미널에서 직접 친다.
- {D2-2 가 ask 면} **서버 기동은 공유 DB 에 붙는다** — {기동 명령} 은 기본 설정({설정 파일})이 공유 DB 를 향해, 띄우기만 해도 {마이그레이션 도구}가 공유 스키마에 적용된다. 명령에 주소가 안 보여 주소 규칙이 못 보므로 기동 명령 자체를 실행 전 확인으로 잡는다. 시험 기동은 {로컬 대상 기동 명령 · 근거 문서}.
- **테스트 명령** — {바뀐 명령}. {선행 조건: 컨테이너 기동 등 · 실행 전 대상 환경 확인}. 출력은 파이프로 넘기지 않는다.
- **관찰만 하는 것** — 턴 시작·종료{, 증거 슬롯을 채웠으면 그 유형}. 아무것도 막지 않는다. 결과는 `node .harness/metrics.mjs` 로 본다.
- 상태 확인: `node .harness/danger-guard.mjs --status` · `node .harness/turn-end.mjs --status`. 계측 로그 `.harness/log.jsonl` 은 커밋하지 않는다.
- **플러그인** — `harness-kit` 은 `.claude/settings.json` 으로 project scope 에서 켜져 있다{, 끈 플러그인과 이유 · 끄며 하네스로 옮긴 가드}. 처음 쓰는 PC 에서는 한 번:
  1. **비공개 저장소 접근** — `surahha-ha/harness-kit` 은 비공개 저장소다. 그 저장소를 읽을 권한이 있는 GitHub 계정으로 git 자격증명을 갖춘다(`gh auth login` → `gh auth setup-git` 등). 권한이 없으면 다음 줄이 저장소를 찾지 못한다며 실패한다 — 권한은 저장소 관리자에게 받는다.
  2. `claude plugin marketplace add surahha-ha/harness-kit` → `claude plugin install harness-kit@harness-kit --scope project`
  3. 이 설치 명령은 `.claude/settings.json` 을 다시 쓰므로(키 순서·줄끝이 바뀌고 다른 도구의 값이 지워진다) 직후 `git restore .claude/settings.json` 으로 되돌린다. 설치 기록은 남는다.
  같은 PC 의 새 worktree 는 다시 설치하지 않아도 된다.
- 걷어내기: `harness-uninstall` — 이 절과 `harness.install.json` 의 영수증대로 넣은 것만 뺀다. 다시 설치하려면 걷어 낸 뒤 새 세션에서 `harness-install`.
<!-- harness-kit:end -->
```

- 시작·끝 표시는 절 전체를 감싼다. 표시 줄은 앞뒤 공백 말고는 그 문자열만 있어야 하고, 블록 앞뒤에 빈 줄을 하나씩 둔다. 블록 안에 같은 표시를 또 넣지 않는다.
- 비공개 저장소 줄(플러그인 1번)은 빼지 않는다. 이 줄이 없던 시험 설치본은 팀원이 첫 설치에서 「저장소를 찾지 못함」으로 막힐 자리를 남겼다. harness-kit 이 공개로 바뀌면 그때 이 꼴에서 지운다.
- 레포 `CLAUDE.md` 에 작업 라우팅 표나 목록이 있으면 이 절을 가리키는 한 줄을 건다. 그 줄 끝(표의 행이면 마지막 칸 안)에 **한 줄 표시** `<!-- harness-kit:line -->` 를 붙인다 — 목록·표 한가운데에 블록 표시 줄을 넣으면 목록·표가 끊긴다.

```markdown
- 팀 공용 게이트(위험 명령 가드·계측)는 아래 「개발 하네스」 절 참조 <!-- harness-kit:line -->
| 하네스 가드에 막혔을 때 | 「개발 하네스」 절 <!-- harness-kit:line --> |
```

- 코드 블록 안의 명령 줄을 고친 것(8단계의 「고침」)에는 표시를 붙이지 않는다 — 표시가 명령의 일부로 보인다. 그 대신 바꾸기 전·뒤 원문을 체크포인트 `edits` 에 `replace` 로 적고 영수증(§9)에 옮긴다.

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
      "slots": [{ "file": "settings", "path": ["enabledPlugins", "<이름>@<마켓>"], "value": false }] },
    { "id": "D6-2", "answer": "재귀 삭제 ask · 데몬 전부 종료 deny · 원격 브랜치 삭제 막지 않음",
      "lost": [
        { "command": "rm -rf <경로>", "plugin": "ask", "answer": "ask", "rule": "recursive-delete" },
        { "command": "<빌드 도구> --stop", "plugin": "deny", "answer": "deny", "rule": "gradle-stop-all" },
        { "command": "git push --delete <브랜치>", "plugin": "ask", "answer": "none", "rule": null }
      ],
      "slots": [],
      "recs": [{ "item": "recursive-delete", "recommended": "ask", "basis": "플러그인이 ask · 정상 절차(빌드 산출물 정리)", "followed": true }] },
    { "id": "D9", "answer": "사용 — 이 PC 에서만 · graft 0.12.1", "slots": [],
      "recs": [{ "item": "graft", "recommended": "use", "basis": "signal: 코드 파일 <N>개 · 최근 30일 커밋 <M>개", "followed": true }] },
    { "id": "D10", "answer": "합치기 사용", "slots": [],
      "recs": [{ "item": "statusline", "recommended": "combined", "basis": "D9 사용 · 전역 statusLine 은 보통 상태 줄", "followed": true }] }
  ],
  "nulls": [{ "path": "project.commands.fe.lint", "why": "lint 도구 없음 — 도입하면 채운다" }],
  "created": [
    { "path": ".harness", "role": "skeleton" },
    { "path": "harness.config.mjs", "role": "config" },
    { "path": "<빌드 디렉토리>/<보조 파일>", "role": "aux", "why": "commands.unitTest 의 --init-script" }
  ],
  "edits": [
    { "path": ".gitignore", "how": "block" },
    { "path": "CLAUDE.md", "how": "block" },
    { "path": "CLAUDE.md", "how": "line" },
    { "path": ".claude/commands/<커맨드>.md", "how": "replace", "before": "<고치기 전 줄>", "after": "<고친 뒤 줄>" }
  ],
  "settings": {
    "hooks": [{ "event": "Stop", "matcher": null, "command": "node \"$CLAUDE_PROJECT_DIR/.harness/turn-end.mjs\"", "eventCreated": false }],
    "keys": [{ "path": ["enabledPlugins", "harness-kit@harness-kit"], "value": true, "parentCreated": true }]
  },
  "plugin": { "id": "harness-kit@harness-kit", "scope": "project", "marketplace": "project", "installRecord": "installed" },
  "settingsSnapshots": { "before": "CRLF", "afterEdit": "CRLF", "afterCli": "되덮음 1 · CLI 판 보관" },
  "updated": "<ISO 시각>"
}
```

- `lost`(D6-2) — 끈 플러그인이 막던 명령 꼴마다 하나. 규칙 배열의 최종값(`dangerGuard.deny`·`ask` 의 id 목록)은 D4 의 `slots` 에 한 번만 적는다 — 두 곳에 나눠 적으면 6단계 대조가 서로 다른 부분 목록을 전체와 비교해 틀린다. `plugin` 은 그 플러그인의 판정(`deny`·`ask`·`warn`), `answer` 는 사용자 답(`deny`·`ask`·`none`), `rule` 은 그 답으로 넣은 하네스 규칙 id(`none` 이면 `null`). `none` 인 줄은 보고의 「빈자리」 목록이 된다.
- `settingsSnapshots` — 5단계의 `install.mjs settings-snap`·`settings-eol`·`after-cli` 결과 한 줄씩. 스냅숏 바이트 자체는 `git rev-parse --git-path harness-install-settings/` 아래에 있다.

- `done` 에는 완료 기준을 통과한 단계 번호만 넣는다. 0·1단계는 읽기뿐이라 적지 않는다 — 재개 때 다시 한다.
- `slots` 는 그 답이 정하는 슬롯 값이다. `"*"` 는 배열의 모든 원소, 정규식 값은 `String(re)` 꼴(`"/…/i"`) 문자열로 적는다. CHECKS.md §6 스크립트가 이것을 config·settings 와 대조한다.
- `recs` 는 그 D 의 항목마다 권장(DECISIONS.md 「권장」)이다. `recommended: null` 은 「판단 근거 부족」이고 그때 `followed` 도 `null` 이다. 권장과 다르게 고르면 `followed: false` — CHECKS.md §6 ⑤ 와 보고의 「권장과 다름」이 이것을 읽는다.
- `created`·`edits`·`settings`·`plugin` 은 그 단계에서 넣을 때마다 더한다(3단계 `.gitignore`·보조 파일 · 4단계 config · 5단계 훅·키·설치 기록 · 8단계 블록·줄·고친 줄). 9단계가 이것을 영수증 초안으로 옮긴다(§9).
- 쓰기가 권한 확인에 걸리면 사용자에게 위치와 이유를 말하고 승인받는다. 끝내 쓸 수 없으면 「체크포인트 없음 — 끊기면 재개 불가」를 보고에 적고 진행할지 묻는다.

## §8 결정 질문 (2단계)

한 번에 질문 하나가 기본이다. 한 D 에 항목이 여럿이면 항목마다 따로 묻는다. 여러 질문을 한 번에 낼 때(D6-2 의 묶음 등)는 header 가 서로 달라야 한다. 꺾쇠 자리는 이 레포의 1단계 관찰로 채운다.

### 쉬운 말이 먼저다

질문 첫 문장에는 **무엇이 일어나는지·무엇이 바뀌는지**를 사용자의 말로 쓴다. 명령·슬롯 이름·내부 용어는 괄호 안이나 근거 줄로 보낸다. 아래 표 왼쪽의 말을 첫 문장에 풀지 않고 쓰지 않는다 — 시험 설치에서 사용자가 질문을 거절하고 설명을 다시 청한 다섯 번(볼륨 삭제, `gradlew --stop`, deny 와 trailer, 플러그인을 끄면 사라지는 가드, 「옮길 규칙」)이 모두 이 말들에서 났다.

| 내부 용어 | 질문에 쓸 쉬운 말 |
| - | - |
| deny · 차단 | 에이전트가 이 명령을 실행하지 못하게 막는다. 사람이 자기 터미널에서 치는 것은 막지 않는다. 막히면 대신 쓸 명령이 안내된다 |
| ask · 실행 전 확인 | 에이전트가 실행하기 전에 승인 창이 뜬다. 승인하면 실행된다 |
| 막지 않음 · 규칙 없음 | 묻지 않고 그대로 실행된다 |
| recover | 막혔을 때 안내되는 대신 쓸 명령 |
| trailer · `coAuthor` | 커밋 메시지 끝에 붙는 공동 작성자 줄(`Co-Authored-By: Claude …`) |
| `commitExecution` | `/save` 가 커밋까지 직접 하나, 커밋 메시지만 만들어 주나 |
| `gradlew --stop` · 데몬 종료 | 이 PC 에서 돌고 있는 Gradle 백그라운드 프로세스를 전부 끈다. 다른 창·IDE 에서 띄운 서버도 같이 꺼진다 |
| 볼륨 삭제 · `down -v` | 컨테이너 DB 의 데이터 저장소를 지운다. 넣어 둔 시드·설정이 사라진다 |
| 간접 접근 · 서버 기동 | 명령에 DB 주소가 안 보이지만, 서버를 띄우면 기본 설정 때문에 공유 DB 에 붙는다 |
| `dangerGuard.shared` · 주소 규칙 | 명령에 공유 DB 주소가 보이면 쓰기 전에 확인받는 규칙 |
| 빈자리 · 옮길 규칙 | 플러그인을 이 레포에서 끄면 그 플러그인이 막던 명령이 무방비가 된다. 그 규칙을 이 레포의 하네스 설정(`harness.config.mjs`)에 다시 적을까 — 플러그인은 고치지 않는다 |
| init script · 명령줄 제외 | 테스트 소스를 고치지 않고, 테스트 명령에 붙이는 설정 파일 하나로 특정 테스트를 뺀다 |
| worktree | 같은 레포의 두 번째 작업 폴더(다른 브랜치). 지금 폴더의 미커밋 변경과 섞이지 않는다 |
| project scope | 이 레포의 `.claude/settings.json` 에 켠다. 커밋되어 팀 전체가 같다 |
| 증거 슬롯 · `qualityCycle.evidence` | 끝내기 전에 검증을 실제로 돌렸는지 관찰만 한다. 막지 않는다 |
| `testFirst` · 경계표 | 테스트 없이 소스를 고치면 막는 가드 · 어느 소스에 테스트가 먼저 있어야 하는지 정한 표 |
| `drift.mirrors` | 레포 안 사본이 원본과 달라지면 알린다 |
| `reviewThreshold` | 이만큼 넘게 바뀌면 커밋 전에 리뷰를 돌린다(파일 수·줄 수) |
| probe · 프로브 | 훅이 실제로 도는지 확인하는 가짜 명령. 아무것도 막지 않는다 |

표에 없는 용어를 첫 문장에 써야 하면 같은 꼴로 풀어 쓰고, 보고의 「질문 형식」 줄에 그 용어를 적는다 — 다음 판 풀이표의 후보다.

### 꼴

```text
header: 단위테스트 범위
D3-1. 단위 테스트를 돌릴 때 로컬 컨테이너 DB 가 필요한 통합 테스트까지 함께 돌릴까? (commands.unitTest)
근거: <기반 클래스 파일:행> 을 상속하는 통합 테스트 <N>개 · 대상 localhost:<포트> 컨테이너(<compose 파일>) · 거를 이름 관습·태그 없음

1. 통합 테스트 포함 (권장)
   권장 이유: 컨테이너 정의가 레포에 있다(<compose 파일>) — 빼면 그 검증이 판정에서 조용히 사라진다
   바뀌는 것: commands.unitTest·project.commands.be.testAll 이 통합까지 돈다. 컨테이너가 없으면 무관한 레드 — config 주석·CLAUDE.md 에 「실행 전 컨테이너 기동 · 대상 환경 확인」
2. 통합 테스트 제외
   바뀌는 것: 같은 명령에 제외 필터. 이름 관습·태그가 없어 클래스 목록을 박아야 하고, 새 통합 테스트는 목록에서 빠진다

header: 공유DB테스트 제외
D3-2. 공유 DB 에 직접 붙어 데이터를 바꾸는 테스트가 있습니다. 이 테스트를 단위 테스트 실행에서 어떻게 뺄까?
근거: <테스트 파일:행> 이 공유 호스트에 하드코딩 접속해 쓰기 구문 실행 · 빌드 설정의 test 작업에 제외 없음 · 빠지는 것 <N>개(<클래스 이름>)

1. 테스트 소스 무수정 (권장)
   권장 이유: 레포 코드를 바꾸지 않고 뺄 수 있다(명령줄 제외 — 테스트 명령에 붙이는 설정 파일 하나)
   바뀌는 것: .harness/ 밖 init script 1개 + 테스트 명령에 --init-script <경로>. 레포 코드 변경 0
2. 테스트 소스 수정 — 레포 코드를 바꾼다
   바뀌는 것: 테스트 소스에 태그 + 필터. 설치 커밋에 테스트 코드 변경이 섞이고 레포 소유자 리뷰 대상

header: 테스트DB 볼륨삭제
D4-3. 테스트용 컨테이너 DB 의 데이터 저장소(볼륨)를 지우는 명령을 막을까? 지우면 넣어 둔 시드·설정이 사라집니다. (docker compose … down -v · docker volume rm …)
근거: <compose 파일:행> 의 볼륨 데이터를 다시 만드는 init 스크립트가 없다 · 지우면 5분 안에 되돌릴 수단이 없다

1. 차단 (deny) (권장)
   권장 이유: 지운 데이터를 다시 만들 수단이 레포에 없다(<compose 파일:행>)
   바뀌는 것: 에이전트는 이 명령을 실행하지 못하고, 대신 쓸 명령(볼륨을 남기는 down)이 안내된다. 사람은 직접 칠 수 있다
2. 실행 전 확인 (ask)
   바뀌는 것: 에이전트가 실행하기 전에 승인 창이 뜬다. 승인하면 실행된다
3. 막지 않음
   바뀌는 것: 규칙이 들어가지 않는다. 그 명령은 묻지 않고 실행된다

header: Gradle 데몬종료
D4-4. 이 PC 에서 돌고 있는 Gradle 백그라운드 프로세스를 전부 끄는 명령을 막을까? 다른 창·IDE 에서 띄운 서버도 같이 꺼집니다. (./gradlew --stop)
근거: 레포 문서·스크립트에는 이 명령이 없다 · 사용자 전역 지침(<파일:행>)이 금지 · 지금은 <플러그인> 가드가 막는데 D6 에서 끄기로 했다
권장 없음 — 근거가 레포가 아니라 사용자 전역 지침뿐이다. 직접 골라 주세요

1. 차단 (deny)
   바뀌는 것: 에이전트가 이 명령을 실행하지 못하고 「PID 를 지정해 그 프로세스만 끄라」는 안내를 받는다. deny 가 <N>개째가 된다
2. 막지 않음
   바뀌는 것: 하네스는 관여하지 않는다. 이 레포에서는 묻지 않고 실행된다

header: 커밋 공동작성자
D5-3. 에이전트가 만든 커밋 메시지 끝에 공동 작성자 줄(Co-Authored-By: Claude …)을 붙일까? (project.git.coAuthor — 이런 꼬리 줄을 git 에서 trailer 라고 부른다)
근거: 레포 CLAUDE.md:<행> 「커밋 메시지에 Co-Authored-By 라인을 넣지 않는다」

1. 붙이지 않음 (권장)
   권장 이유: 레포 규칙이 이 줄을 금한다(CLAUDE.md:<행>)
   바뀌는 것: /save 와 이번 설치 커밋 메시지에 이 줄이 붙지 않는다
2. 붙임
   바뀌는 것: 커밋마다 이 줄이 붙어 저장소 웹 화면에 공동 작성자로 보인다. 레포 규칙과 어긋난다

header: 서버 기동 확인
D2-2. 서버를 띄우기만 해도 공유 개발 DB 에 붙어 스키마를 바꿀 수 있습니다. 명령에 DB 주소가 안 보여 주소 규칙으로는 못 잡습니다. 서버를 띄우기 전에 확인을 받을까? (<기동 명령>)
근거: <기본 설정 파일:행> 의 기본 datasource 가 공유 호스트 · <마이그레이션 도구> 가 기동 때 자동 적용 · <시작 스크립트:행> 이 같은 호스트를 환경변수로 세팅

1. 서버 기동 전 확인 (ask) (권장)
   권장 이유: 서버 기동은 개발의 정상 절차라 막으면 일이 멈추고, 묻지 않으면 공유 스키마가 바뀔 수 있다
   바뀌는 것: dangerGuard.ask 에 원소 하나(셸 래퍼·도구 경로 꼴 포함). 승인 창에서 어느 DB 로 뜨는지 확인하고 실행한다
2. 주소 규칙만 (shared)
   바뀌는 것: 규칙을 더하지 않는다. 서버 기동은 묻지 않고 실행되고, CLAUDE.md 에 안내만 남는다
3. 차단 (deny)
   바뀌는 것: 에이전트는 서버를 띄우지 못하고 사람이 직접 띄운다

header: 재귀삭제 막기유지
D6-2. <플러그인> 을 이 레포에서 끄면, 폴더를 통째로 지우는 명령(rm -rf · Remove-Item -Recurse)을 확인받던 규칙이 함께 사라집니다. 이 레포의 하네스 설정(harness.config.mjs)에 같은 규칙을 다시 적을까? 플러그인 자체는 고치지 않습니다.
근거: <플러그인 훅 파일:행> 이 이 명령을 ask · 지금 하네스 규칙에는 걸리지 않음(케이스 검사) · 빌드 산출물 정리에도 쓰인다

1. 실행 전 확인 (ask) (권장)
   권장 이유: 플러그인이 ask 로 두던 명령이고, 정상 절차(빌드 산출물 정리)에도 쓰여 막으면 일이 멈춘다
   바뀌는 것: dangerGuard.ask 에 원소 하나. 정리용 삭제도 매번 승인 창이 뜬다
2. 차단 (deny)
   바뀌는 것: 에이전트는 실행하지 못한다. deny 상한(3개)에 센다
3. 막지 않음
   바뀌는 것: 이 레포에서 묻지 않고 실행된다. 보고의 「빈자리」 목록에 남는다

header: graft 사용
D9. 이 레포의 코드 지도(graft)를 만들어, 질문할 때마다 관련 코드 위치를 자동으로 붙여 줄까? 이 PC·이 폴더에서만 켜지고 커밋되지 않습니다.
근거: graft-localize signal — 추적 파일 <N>개 · 코드 파일 <C>개 · 최근 30일 커밋 <M>개 · graft <판>

1. 사용 — 이 PC 에서만 (권장)
   권장 이유: 코드 파일 <C>개 · 최근 30일 커밋 <M>개 — 크고 작업이 잦아 관련 위치 주입이 탐색을 줄인다
   바뀌는 것: .gitignore 에 /graft/ 블록 1개(커밋). graft 설정은 settings.local.json 으로, 로컬 산출물은 .git/info/exclude 로 — 커밋되는 settings.json 은 그대로
2. 안 씀
   바뀌는 것: 아무것도 바뀌지 않는다

header: 전역 상태줄 합치기
D10. Claude Code 아래 상태 줄에 지금 쓰는 줄과 graft 줄을 함께 보일까? 이 PC 의 사용자 전역 설정(~/.claude/settings.json)에서 상태 줄 명령 하나만 바꿉니다 — 모든 레포에 적용되고, graft 가 없는 레포에서는 원래 줄만 나옵니다.
근거: statusline-setup status — 지금 전역 상태 줄 <명령> · 판정 <보통 상태 줄>

1. 합치기 사용 (전역 설정 바꿈) (권장)
   권장 이유: D9 에서 graft 를 켰다 — 플러그인은 상태 줄을 줄 수 없어 전역 명령을 바꿔야 graft 줄이 보인다
   바뀌는 것: 전역 settings.json 백업 뒤 statusLine.command 만 합치기 스크립트로. 원래 명령은 ~/.claude/harness-kit/statusline.json 에 남고, 되돌리기는 걷어내기에서 따로 묻는다
2. 안 씀
   바뀌는 것: 전역 설정을 바꾸지 않는다. graft 상태 줄은 보이지 않는다
```

### header (질문 chip, 12자 이하) — 대상 + 동작 명사구

- D 번호는 header 에 넣지 않는다. 번호는 `question` 맨 앞(`D4-3.`)에 그대로 둔다 — 12자 중 3~5자를 번호가 먹으면 대상이 빠진다.
- 12자 안에서 **대상을 먼저** 채우고 남는 자리에 동작을 붙인다. 대상이 길면 줄여 쓰되(`단위테스트`·`공유DB`) 빼지 않는다. 동작만 있는 header(`범위`·`제외`·`간접`·`데몬`)는 쓰지 않는다.
- 대상 명사는 이 레포의 관찰에서 가져온다 — 공유 자원이 DB 가 아니면 그 자원의 일반 이름을 쓴다.
- **한 번에 낸 질문끼리 header 가 겹치지 않는다.** 같은 D 의 항목 여럿을 한 번에 물으면 대상으로 가른다(`재귀삭제 막기유지` · `원격삭제 막기유지`).
- header 에도 풀이표 왼쪽의 말(`간접`·`빈자리`·`trailer`)을 홀로 쓰지 않는다.
- 넣기 전에 공백을 포함해 글자 수를 센다.

| 항목 | header | 글자 수 |
| - | - | - |
| D1 | `설치 위치` | 5 |
| D2 | `공유DB 승인방식` | 9 |
| D2-2 (서버 기동) | `서버 기동 확인` | 8 |
| D3-1 | `단위테스트 범위` | 8 |
| D3-2 | `공유DB테스트 제외` | 10 |
| D6 | `플러그인 겹침` | 7 |
| D6-2 (명령 꼴마다) | `재귀삭제 막기유지` | 9 |
| D4 (전체 테스트) | `전체테스트 차단` | 8 |
| D4 (출력 파이프) | `빌드출력 파이프` | 8 |
| D4 (볼륨 삭제) | `테스트DB 볼륨삭제` | 10 |
| D4 (데몬 종료) | `Gradle 데몬종료` | 11 |
| D5 (커밋 실행) | `커밋 실행방식` | 7 |
| D5 (trailer) | `커밋 공동작성자` | 8 |
| D7 (testFirst) | `테스트먼저 가드` | 8 |
| D7 (증거 슬롯) | `완료증거 관찰` | 7 |
| D9 | `graft 사용` | 8 |
| D10 | `전역 상태줄 합치기` | 10 |

### 선택지 라벨 · 권장 표시

- 라벨만 읽어도 뜻이 통해야 한다. 라벨은 DECISIONS.md 의 선택지 굵은 이름을 쓴다. `넣지 않음` 대신 `막지 않음`, `ask` 대신 `실행 전 확인 (ask)`, `deny` 대신 `차단 (deny)`, `false` 대신 `붙이지 않음`.
- **권장이 있으면** — 권장 선택지를 첫 번째에 두고 라벨 끝에 「(권장)」을 붙인다(`차단 (deny) (권장)`). 그 선택지 설명의 첫 줄은 「권장 이유: <이 레포의 관찰 한 줄>」이다. 이유는 규칙표의 맞은 줄을 이 레포의 파일:행·값으로 바꿔 쓴 것이고, 「규칙표 「…」 줄에 해당」처럼 규칙표를 인용하는 것으로 대신하지 않는다.
- **권장이 없으면** — 근거 줄 아래에 「권장 없음 — <무엇을 찾지 못했나>. 직접 골라 주세요」를 적는다. 어느 선택지에도 「(권장)」을 붙이지 않고, 첫 선택지 설명에 권장 이유 줄을 두지 않는다. 선택지 순서는 DECISIONS.md 의 순서 그대로다.

### AskUserQuestion 에 옮길 때

- `header` 에 위 header 를, `question` 에 질문(쉬운 말 첫 문장 + 괄호 속 명령·슬롯)과 근거 한 줄을 넣는다. 권장이 없으면 `question` 끝에 「권장 없음 — … 직접 골라 주세요」를 붙인다.
- `options` — 권장 선택지를 첫 번째에, `label` 끝에 「(권장)」을. 그 `description` 은 「권장 이유: … · 바뀌는 것: …」, 나머지 선택지의 `description` 은 「바뀌는 것: …」.
- 한 호출에 질문을 여럿 넣으면 `header` 가 모두 달라야 한다.
- 사용자가 거절하고 되물으면, 되물은 말을 풀이표에 대어 첫 문장을 쉬운 말로 고쳐 다시 묻는다. 같은 질문을 같은 문구로 다시 내지 않는다.

## §9 영수증 (`harness.install.json`, 9단계)

**자리: 레포 루트, `harness.config.mjs` 옆 · 커밋 대상.** `.harness/` 안에 두지 않는다 — `.harness/` 는 원본 `skeletons/` 와 같아야 하고(3단계 완료 기준 「원본에 없는 파일 0개」), 다음 갱신 설치가 디렉토리째 바꾸면 지워진다. git 디렉토리(체크포인트 자리)에 두지 않는다 — 커밋되지 않아 다른 PC·worktree 에서 걷어 낼 때 기준이 없다.

초안 — 체크포인트에서 옮겨 scratchpad 에 Write 한다. sha256 은 쓰지 않는다(스크립트가 채운다).

```json
{
  "installedAt": "<ISO 시각>",
  "source": { "repo": "https://github.com/surahha-ha/harness-agent", "sha": "<40자 SHA>", "dirty": false },
  "kit": { "repo": "surahha-ha/harness-kit", "sha": "<설치에 쓴 harness-kit SHA 또는 null>" },
  "decisions": [{ "id": "D1", "answer": "새 worktree 에 설치" }, { "id": "D5", "answer": "메시지만 · push 확인 · trailer 없음" }],
  "files": [
    { "path": ".harness", "role": "skeleton" },
    { "path": "harness.config.mjs", "role": "config" },
    { "path": "<빌드 디렉토리>/<보조 파일>", "role": "aux", "why": "commands.unitTest 의 --init-script" }
  ],
  "edits": [
    { "path": ".gitignore", "how": "block" },
    { "path": "CLAUDE.md", "how": "block" },
    { "path": "CLAUDE.md", "how": "line" },
    { "path": ".claude/commands/<커맨드>.md", "how": "replace", "before": "<고치기 전 줄>", "after": "<고친 뒤 줄>", "count": 1 }
  ],
  "settings": {
    "path": ".claude/settings.json",
    "hooks": [{ "event": "PreToolUse", "matcher": "Bash|PowerShell", "command": "node \"$CLAUDE_PROJECT_DIR/.harness/danger-guard.mjs\"", "eventCreated": true }],
    "keys": [
      { "path": ["enabledPlugins", "harness-kit@harness-kit"], "value": true, "parentCreated": true },
      { "path": ["extraKnownMarketplaces", "harness-kit"], "value": { "source": { "source": "github", "repo": "surahha-ha/harness-kit" } }, "parentCreated": true },
      { "path": ["enabledPlugins", "<이름>@<마켓>"], "value": false, "parentCreated": false, "decision": "D6" }
    ]
  },
  "plugin": { "id": "harness-kit@harness-kit", "scope": "project", "marketplace": "project", "installRecord": "installed" },
  "local": {
    "graft": { "answer": "local", "graftVersion": "0.12.1", "state": "git-path:harness-kit-graft/state.json",
      "items": [".claude/settings.local.json#graft", ".claude/helpers/graft-*.cjs", ".claude/skills/graft/", "graft/", ".mcp.json", ".ignore", "git-path:info/exclude#harness-kit graft-localize"] },
    "statusline": { "answer": "combined", "receipt": "~/.claude/harness-kit/receipt.json", "items": ["~/.claude/settings.json#statusLine", "~/.claude/harness-kit/"] }
  }
}
```

- `local` — 8-2단계(D9·D10)를 했을 때만. 커밋되지 않는 이 PC·이 트리의 항목이라 해시를 채우지 않는다. `items` 는 걷어낼 때 볼 자리를 적는 목록이다 — 상대경로 · `~/` · `git-path:` 꼴만(스크립트가 절대경로·모르는 항목을 막는다). `.mcp.json`·`.ignore` 는 init 전에 없던 경우만 적는다. 실제로 무엇을 만들었는지는 각 PC 의 체크포인트(`git-path:harness-kit-graft/state.json` · `~/.claude/harness-kit/receipt.json`)가 기준이다 — 다른 PC·worktree 에는 이 항목들이 없다.
- `files` — 디렉토리 항목은 스크립트가 파일로 편다(`.harness/*.jsonl` 런타임 산출물은 뺀다). `role` 은 `skeleton` · `config` · `aux`.
- `edits` — `block`(시작·끝 표시 블록) · `line`(한 줄 표시) · `replace`(표시 없이 고친 줄). block·line 은 그 파일 안에 나오는 순서대로 하나씩 적는다 — 스크립트가 표시 수와 맞춰 보고 해시를 채운다. `replace` 의 `before`·`after` 는 줄끝 없이 LF 로 잇고, `count` 는 `after` 가 그 파일에 나오는 수다.
- `settings.hooks` — 넣은 훅마다 하나. `matcher` 가 없는 이벤트는 `null`. `eventCreated` 는 그 이벤트 키를 이 설치가 새로 만들었는가.
- `settings.keys` — 넣은 키마다 하나. `parentCreated` 는 `enabledPlugins`·`extraKnownMarketplaces` 객체를 새로 만들었는가, `decision` 은 그 키를 정한 결정.
- `plugin.installRecord` — `installed`(5단계 3번을 실행) · `skipped`(이미 enabled 라 건너뜀).
- 반출 — 로컬 클론 경로·사용자 홈·드라이브 경로를 넣지 않는다(스크립트가 막는다). 결정 답에 경로가 필요하면 상대경로나 일반 이름으로 적는다.

스크립트가 쓰는 영수증은 초안에 `schema: 1`·`tool` 과 sha256(파일·블록·줄)을 더한 꼴이다. sha256 은 **줄끝을 LF 로 맞춘 UTF-8 내용**의 해시이고, 블록·줄은 표시 줄을 포함해 줄끝을 뺀 줄을 LF 로 이은 것의 해시다.
