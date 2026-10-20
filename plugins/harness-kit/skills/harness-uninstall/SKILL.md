---
name: harness-uninstall
description: 지금 레포에서 harness-install 이 넣은 것만 걷어 낸다 — 사전 확인 → 후보 뽑기(영수증 또는 알려진 구조) → 결정 질문 → 백업 → 걷어내기 → 플러그인 키(마지막 결정) → 검증 → 경로 지정 커밋. 재설치는 이 스킬 → 새 세션 → harness-install 순서다. Triggers on "하네스 제거해줘", "하네스 걷어내", "하네스 삭제", "harness-uninstall", "하네스 재설치", "하네스 다시 설치", "하네스 제거 이어서". 중간에 끊긴 설치(체크포인트가 남은 것)의 정리는 harness-install 0단계의 「초기화」가 맡는다.
---

# harness-uninstall — 넣은 것만, 블록과 키 단위로

이 스킬이 걷어 내는 것은 harness-install 이 넣은 것뿐이다.

1. **게이트** — `.harness/`(골격 사본 · 런타임 산출물) · `harness.config.mjs` · config 가 가리키는 레포 고유 보조 파일 · `.claude/settings.json` 의 `.harness/` 훅
2. **설치가 고친 곳** — `CLAUDE.md` 의 「개발 하네스」 절과 그 절을 가리키는 줄 · `.gitignore` 의 하네스 줄 · 8단계에서 고친 문서 줄 · 겹침 결정으로 넣은 `enabledPlugins` false 키
3. **harness-kit 플러그인 키** — `enabledPlugins` 의 `harness-kit@harness-kit` · `extraKnownMarketplaces.harness-kit`(맨 마지막 결정)

기준은 둘 중 하나다. 레포 루트에 **영수증**(`harness.install.json`, harness-install 9단계가 쓴다)이 있으면 영수증이 기준이다. 없으면 **알려진 구조**로 후보를 뽑고 항목마다 확인받는다.

걷어내기를 끝까지 지배하는 말 여섯 개:

- **넣은 것만** — 후보로 뽑힌 것만, 시작·끝 표시로 감싼 블록 · 한 줄 표시 · 영수증의 치환 · JSON 키 단위로 잘라 낸다. `git restore`·`git checkout -- <파일>`·커밋 되돌리기로 걷어 내지 않는다 — 같은 파일의 하네스와 무관한 변경까지 되돌린 사고가 있었다([PITFALLS.md](PITFALLS.md) §4).
- **묻는다** — 결정마다 권장과 근거를 보이고 묻는다([DECISIONS.md](DECISIONS.md)). 고르는 것은 사용자다. 영수증 없이 뽑은 후보는 묶지 않고 하나씩 묻는다.
- **백업 먼저** — 손댈 파일을 모두 `git rev-parse --git-path harness-uninstall-backup/` 아래에 복사한 뒤에만 고친다. 런타임 산출물(`.harness/log.jsonl` 등)은 증거 데이터라 `git rev-parse --git-common-dir` 아래 `harness-evidence/` 에 따로 남긴다.
- **참조는 보고만** — 후보 밖 파일이 하네스(`.harness`·`harness.config`·보조 파일 이름)를 가리키면 그 줄을 지우거나 고치지 않고 목록으로 보고한다.
- **git 은 마지막** — 7단계 전에는 작업본만 바꾼다. 커밋은 경로 지정으로만 하고, 직전에 따로 묻는다.
- **체크포인트** — 스크립트가 `git rev-parse --git-path harness-uninstall-state.json` 에 계획·답·백업 위치·적용한 항목을 적는다. 끊겨도 다음 세션의 0단계가 이어받는다. 걷어내기는 같은 항목을 두 번 지우지 않는다(블록은 해시로 찾는다).

보조 스크립트는 이 스킬 디렉토리의 `scripts/uninstall.mjs` 하나다. 아래에서 `U` 는 `node "${CLAUDE_SKILL_DIR}/scripts/uninstall.mjs"` 를 줄인 것이다. 인자에는 레포 경로·후보 id·답만 넘긴다 — 명령 문자열을 셸 인자로 넘기면 아직 살아 있는 실행 전 가드가 그 문자열을 보고 막는다.

각 단계를 시작할 때 [PITFALLS.md](PITFALLS.md) 의 같은 번호 절을 먼저 읽는다.

---

## 0. 사전 확인 — 지금 걷어 내도 되는가

확인할 것:

- `git status --short` · 현재 브랜치 · `git stash list` · `git worktree list`
- **같은 트리의 살아 있는 다른 Claude 세션** — `~/.claude/projects/<트리 경로 슬러그>/*.jsonl` 의 최근 수정 시각(자기 세션 파일은 뺀다)
- 영수증 `harness.install.json` 의 유무 · harness-install 체크포인트(`git rev-parse --git-path harness-install-state.json`)의 유무
- uninstall 체크포인트(`git rev-parse --git-path harness-uninstall-state.json`)의 유무 — 있으면 `U status <루트>` 로 진행 상황을 보인다
- 설치가 커밋됐는가(`git log --oneline -- harness.config.mjs`) — 커밋되지 않았으면 걷어 낸 뒤 커밋할 것이 없을 수 있다

판정:

- **harness-install 체크포인트가 있으면** 중단된 설치다 — 멈추고 harness-install 0단계의 「재개 / 초기화」로 넘긴다.
- **uninstall 체크포인트가 있으면** 재개다. `done`·`applied` 를 보이고 남은 단계부터 잇는다. `applied` 가 비어 있으면 「다시 뽑기(`scan --refresh`) / 그대로 잇기」를 묻는다.
- 걷어 낼 파일(`CLAUDE.md`·`.claude/settings.json`·`.gitignore`)에 하네스와 무관한 미커밋 변경이 있거나 다른 세션이 살아 있으면, 그 사실을 보이고 계속할지 묻는다. 작업본 편집은 블록·키 단위라 그 변경을 지우지 않지만, 7단계 경로 지정 커밋에는 섞인다.

**완료 기준:** 위 항목마다 관찰값이 한 줄씩 적혀 있고, 「중단 — harness-install 초기화로」 · 「진행 — 새로 걷어내기」 · 「재개 — N단계부터」 중 하나로 판정돼 있다.

## 1. 후보 뽑기 — 영수증 또는 알려진 구조

`U scan <루트>` 를 돌린다. 스크립트가 체크포인트에 계획을 적고 표를 낸다(id · 상태 · 권장 · 항목 — 근거).

- **영수증이 있으면** 영수증의 파일·블록·줄·치환·훅·키가 후보다. sha256 이 영수증과 다르면 상태가 `modified`(설치 뒤 손댐), 영수증에 없는데 `.harness/` 안에 있으면 `extra` 다.
- **영수증이 없으면** 알려진 구조로 뽑는다 — `.harness/` · `harness.config.mjs` · `.harness/` 를 가리키는 settings 훅(`settings.local.json` 포함) · `CLAUDE.md` 의 「개발 하네스」 절과 그 절을 가리키는 줄 · `.gitignore` 의 `.harness/` 줄과 바로 위 주석 · config `commands.*`·`project.commands.*` 가 가리키는 보조 파일(이름에 harness 가 있거나 설치와 함께 생긴 것) · 설치 근거가 있는 `enabledPlugins` false 키 · harness-kit 플러그인 키. 표시(`harness-kit:begin`·`harness-kit:line`)가 있으면 어느 파일이든 후보로 잡는다. 상태는 `unknown`(비교 기준 없음)이다.
- 표 아래 **남을 참조**는 권장대로 걷어 낸 뒤에도 남을 줄이다. 보조 파일을 다른 파일이 가리키면 그 보조 파일의 권장은 「남김」이 된다.
- 스크립트가 config 의 `project.git.commitExecution`·`push`·`coAuthor` 를 **지우기 전에** 읽어 체크포인트에 적는다(7단계가 쓴다).

**완료 기준:** 체크포인트에 계획이 있고, 표의 후보마다 상태·권장(또는 「근거 부족」)·근거가 있다. `WARN` 줄은 하나씩 사용자에게 옮겼다. 표에 없는데 하네스로 보이는 것을 찾았으면 손으로 지우지 않고 보고에 적는다.

## 2. 결정 질문 — 권장과 함께 묻는다

[DECISIONS.md](DECISIONS.md) 의 순서(목적 → 런타임 산출물 → 항목 → 설치 뒤 손댄 것)로 묻는다. 플러그인 키는 5단계, 커밋은 7단계에서 묻는다.

- 질문마다 권장을 첫 선택지에 「(권장)」과 근거 한 줄로, 선택지마다 바뀌는 것을 한 줄씩 단다. header 는 D 번호 없이 대상 + 동작(12자 이하), 선택지 라벨은 그것만 읽어도 뜻이 통하게 쓴다(꼴은 DECISIONS.md 끝 절 — harness-install TEMPLATES.md §8 과 같은 꼴).
- **영수증이 없으면 후보마다 질문 하나**다. 영수증이 있으면 상태가 `clean` 인 같은 종류(훅 5개 등)를 한 질문에 묶을 수 있고, `modified`·`extra` 는 따로 묻는다.
- 답을 받을 때마다 `U answer <루트> <id>=<값> …` 로 적는다(목적은 `purpose=reinstall|remove`). 사용자가 「나머지는 모두 권장대로」라고 하면 그때만 `U answer <루트> --recommended` — 권장이 「근거 부족」인 칸은 `keep` 으로 채워지고, 그 목록을 보고에 적는다.

**완료 기준:** `U status` 의 플러그인 외 모든 후보에 답이 있고, 각 답이 사용자 답과 같다. 내가 고른 값은 하나도 없다.

## 3. 백업 — 손대기 전에 한 번

`U backup <루트>` — 손댈 파일 전부를 `<git-path>/harness-uninstall-backup/<시각>/files/` 에 복사하고 바이트 대조한 뒤 `index.json` 을 쓴다. 런타임 산출물을 지우기로 했으면 `<git-common-dir>/harness-evidence/<트리>-<시각>/` 에도 복사한다.

- 백업은 한 번만 뜬다. 재개 때 다시 돌려도 덮어쓰지 않는다 — 걷어내던 중간 상태로 백업을 덮으면 원본을 잃는다.

**완료 기준:** 백업 경로와 파일 수가 출력됐고, 그 수가 계획의 후보 파일 수와 맞는다. 증거 사본 경로를 사용자에게 알렸다.

## 4. 걷어내기 — 텍스트 → settings → 파일

`U apply <루트>` — 답이 `remove`·`revert` 인 후보를 이 순서로 걷어 낸다. 플러그인 키는 건드리지 않는다.

1. 텍스트 — 파일마다 한 번에: 영수증 치환을 설치 전 원문으로 되돌리고, 표시 블록·절·줄 묶음·한 줄을 지운다. 블록 앞뒤가 빈 줄이면 빈 줄 하나만 남긴다.
2. settings — 훅 하나씩: 그룹에 그 훅뿐이면 그룹을, 이벤트에 그 그룹뿐이면 이벤트 키를 지운다. 다른 훅·다른 키의 바이트는 그대로다. 이어서 false 키.
3. 파일 — 보조 파일 · config · 손댄/생긴 파일 · 골격 사본 · 런타임 산출물(증거 사본이 있을 때만), 빈 디렉토리, 마지막으로 영수증(남긴 항목이 없을 때만).

`.harness/` 가 지워지면 이 세션에 이미 올라온 하네스 훅이 도구 호출마다 오류를 낸다(파일 없음). 막지는 않는 오류다 — 새 세션부터 사라진다(PITFALLS §4).

**완료 기준:** 출력의 모든 줄이 `OK` 이거나, `SKIP` 줄마다 이유(이미 없음 · 설치 뒤 손댄 것이라 되돌리지 않음)를 사용자에게 옮겼다.

## 5. 플러그인 키 — 맨 마지막 결정

DECISIONS.md 「kit 플러그인 끄기」를 묻는다. 이 스킬도 harness-kit 안에 있다 — 키를 지우면 다음 세션부터 이 레포에서 harness-install·harness-uninstall 이 뜨지 않는다(사용자 범위에서 켜 둔 PC 는 남는다). 재설치가 목적이면 켜 두는 것이 권장이다.

`U answer <루트> plugin=off|keep` → `U plugin <루트>`. 이 PC 의 설치 기록(`claude plugin uninstall`)을 지울지는 따로 묻는다(DECISIONS.md 「설치기록 삭제」) — CLI 는 settings.json 을 통째로 다시 쓰므로 실행 전후로 백업과 대조한다.

**완료 기준:** 답이 체크포인트에 있고, `off` 면 두 키가 지워졌다는 `OK` 줄이 있다.

## 6. 검증 — 남은 것과 그대로인 것

`U verify <루트>` 가 판정한다.

- 지우기로 한 파일·디렉토리가 남았는가
- settings.json·settings.local.json — JSON 파싱 · 중복 키 0 · `.harness` 훅 0(남기기로 한 것 빼고) · **하네스가 아닌 훅이 이벤트별로 백업과 같은가** · 다른 최상위 키와 다른 `enabledPlugins` 키가 그대로인가
- 후보 밖 파일 — 걷어내기 전부터 있던 미커밋 변경이 그대로이고, 새로 바뀐 파일이 없는가
- 남은 참조 — `.harness`·`harness.config`·`harness.install`·`harness-kit`·보조 파일 이름을 가리키는 줄(보고만)
- `git status --short` 와 커밋 경로(추적 중인 후보 중 HEAD 와 내용이 다른 것). status 는 M 인데 내용이 같은 파일은 「줄끝만 다름」으로 따로 적는다

**완료 기준:** `failures=0`. 남은 참조와 「줄끝만 다름」 줄이 보고에 옮겨져 있다.

## 7. 커밋 — 1단계에서 읽어 둔 정책대로, 직전에 묻는다

- 커밋 경로가 0개면 커밋하지 않는다(설치가 커밋되지 않았던 트리) — 그렇다고 보고한다.
- 체크포인트에 읽어 둔 `commitExecution` 이 `message-only` 면 메시지 파일만 건넨다. `auto` 여도 가드는 이미 지워져 확인 창이 뜨지 않으므로, 커밋 직전에 DECISIONS.md 「제거 커밋」을 따로 묻는다. 값이 없었으면(`null`) 레포 `CLAUDE.md` 의 커밋 규칙을 보이고 묻는다.
- 메시지는 레포 `git log` 관례를 따르고, 본문에 지운 것 · 남긴 것 · 백업 경로를 적는다. trailer 는 읽어 둔 `coAuthor` 와 레포 규칙이 허용할 때만 넣는다.
- 커밋은 경로 지정으로만, 브랜치·toplevel 조건과 같은 명령에서 한다. 지운 파일도 경로로 넘긴다.

```bash
R=<레포 루트>; B=<브랜치>
[ "$(git -C "$R" rev-parse --show-toplevel)" = "$R" ] \
  && [ "$(git -C "$R" rev-parse --abbrev-ref HEAD)" = "$B" ] \
  && git -C "$R" commit -F <메시지 파일> -- <verify 가 낸 커밋 경로…>
```

- push 는 하지 않는다. 사용자가 요청하면 실행 직전에 따로 확인받는다.

**완료 기준:** 커밋했으면 `git show --stat HEAD` 의 파일 목록이 커밋 경로와 같고, `git status --short` 에 걷어내기 전부터 있던 변경(과 남긴 항목)만 남아 있다. 커밋하지 않았으면 그 이유가 보고에 있다.

## 8. 보고 · 재설치 안내 · 체크포인트 정리

마지막 응답에 담는다: 기준(영수증 / 알려진 구조) · 지운 것 · 되돌린 것 · 남긴 것(이유) · 「설치 뒤 손댄 것」의 처리 · 남은 참조 목록 · 백업·증거 경로 · 검증 결과 · 커밋(SHA 또는 메시지 파일) · 플러그인 키 상태 · `--recommended` 로 채운 「근거 부족」 칸.

**재설치 절차는 uninstall → 새 세션 → install 이다.** 걷어 낸 세션에는 옛 훅과 옛 `CLAUDE.md` 가 올라와 있어, 같은 세션에서 harness-install 을 돌리면 0단계가 옛 상태를 보고 판정이 틀어진다. 사용자에게 「새 세션을 열고 `하네스 설치해줘`」라고 안내한다. 플러그인 키를 지웠으면 새 세션에서 harness-install 이 뜨지 않는다 — 사용자 범위로 켜거나 키를 다시 넣는 방법을 함께 적는다.

보고를 건넨 뒤 `U finish <루트>` 로 체크포인트를 지운다. 백업과 증거 사본은 남는다 — 지울지는 사용자가 정한다.
