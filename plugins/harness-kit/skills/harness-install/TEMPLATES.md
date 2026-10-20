# 꼴 — settings.json · .gitignore · CLAUDE.md · 커밋 명령 · config 머리 줄 · 체크포인트

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
- 쓰기가 권한 확인에 걸리면 사용자에게 위치와 이유를 말하고 승인받는다. 끝내 쓸 수 없으면 「체크포인트 없음 — 끊기면 재개 불가」를 보고에 적고 진행할지 묻는다.
