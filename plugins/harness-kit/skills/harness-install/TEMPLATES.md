# 꼴 — settings.json · .gitignore · CLAUDE.md · 커밋 명령

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

값은 이 레포의 config 에서 옮긴다. 하네스 원본 SHA 는 커밋 메시지에 두고 여기에는 적지 않는다(갱신 때마다 낡는다).

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
