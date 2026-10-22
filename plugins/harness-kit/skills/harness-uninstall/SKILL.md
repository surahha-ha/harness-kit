---
name: harness-uninstall
description: 지금 레포에서 harness-install 이 넣은 것만 걷어 낸다 — 사전 확인 → 후보 뽑기(영수증 또는 알려진 구조) → 결정 질문 → 백업 → 걷어내기 → 플러그인 키(마지막 결정)와 이 트리의 설치 기록 → 검증 → 경로 지정 커밋. 재설치는 이 스킬 → 새 세션 → harness-install 순서다. Triggers on "하네스 제거해줘", "하네스 걷어내", "하네스 삭제", "harness-uninstall", "하네스 재설치", "하네스 다시 설치", "하네스 제거 이어서". 중간에 끊긴 설치(체크포인트가 남은 것)의 정리는 harness-install 0단계의 「초기화」가 맡는다.
---

# harness-uninstall — 넣은 것만, 블록과 키 단위로

이 스킬이 걷어 내는 것은 harness-install 이 넣은 것뿐이다.

1. **게이트** — `.harness/`(골격 사본 · 런타임 산출물) · `harness.config.mjs` · config 가 가리키는 레포 고유 보조 파일 · `.claude/settings.json` 의 `.harness/` 훅
2. **설치가 고친 곳** — `CLAUDE.md` 의 「개발 하네스」 절과 그 절을 가리키는 줄 · `.gitignore` 의 하네스 줄 · 8단계에서 고친 문서 줄 · 겹침 결정으로 넣은 `enabledPlugins` false 키
3. **harness-kit 플러그인 키** — `enabledPlugins` 의 `harness-kit@harness-kit` · `extraKnownMarketplaces.harness-kit`(맨 마지막 결정)
4. **로컬 전용 선택 항목**(harness-install D9·D10 을 켰을 때) — graft 로컬 연결(`settings.local.json` 의 graft 몫 · `.claude/helpers/graft-*.cjs` · `.claude/skills/graft/` · `graft/` · 새로 생긴 `.mcp.json`·`.ignore` · info/exclude 블록)과 사용자 전역 상태 줄 합치기. 커밋되지 않는 것이라 영수증 해시 대신 각 스크립트의 체크포인트가 기준이고, 0-2단계에서 따로 묻는다. 전역 상태 줄은 이 레포를 걷어 내도 저절로 되돌리지 않는다

기준은 둘 중 하나다. 레포 루트에 **영수증**(`harness.install.json`, harness-install 9단계가 쓴다)이 있으면 영수증이 기준이다. 없으면 **알려진 구조**로 후보를 뽑고 항목마다 확인받는다.

걷어내기를 끝까지 지배하는 말 여섯 개:

- **넣은 것만** — 후보로 뽑힌 것만, 시작·끝 표시로 감싼 블록 · 한 줄 표시 · 영수증의 치환 · JSON 키 단위로 잘라 낸다. `git restore`·`git checkout -- <파일>`·커밋 되돌리기로 걷어 내지 않는다 — 같은 파일의 하네스와 무관한 변경까지 되돌린 사고가 있었다([PITFALLS.md](PITFALLS.md) §4). 예외는 HEAD 와 내용이 같고 줄끝만 다른 파일 하나뿐이다(6단계 · PITFALLS §6).
- **묻는다** — 결정마다 권장과 근거를 보이고 묻는다([DECISIONS.md](DECISIONS.md)). 고르는 것은 사용자다. 영수증 없이 뽑은 후보는 묶지 않고 하나씩 묻는다.
- **백업 먼저** — 손댈 파일을 모두 `git rev-parse --git-path harness-uninstall-backup/` 아래에 복사한 뒤에만 고친다. 런타임 산출물(`.harness/log.jsonl` 등)은 증거 데이터라 `git rev-parse --git-common-dir` 아래 `harness-evidence/` 에 따로 남긴다.
- **참조는 보고만** — 후보 밖 파일이 하네스(`.harness`·`harness.config`·보조 파일 이름)를 가리키면 그 줄을 지우거나 고치지 않고 목록으로 보고한다.
- **git 은 마지막** — 7단계 전에는 작업본만 바꾼다. 커밋은 경로 지정으로만 하고, 직전에 따로 묻는다.
- **체크포인트** — 스크립트가 `git rev-parse --git-path harness-uninstall-state.json` 에 계획·답·백업 위치·적용한 항목을 적는다. 끊겨도 다음 세션의 0단계가 이어받는다. 걷어내기는 같은 항목을 두 번 지우지 않는다(블록은 해시로 찾는다).

보조 스크립트는 이 스킬 디렉토리의 `scripts/uninstall.mjs` 하나다. 아래에서 `U` 는 `node "${CLAUDE_SKILL_DIR}/scripts/uninstall.mjs"` 를 줄인 것이다. 인자에는 레포 경로·후보 id·답만 넘긴다 — 명령 문자열을 셸 인자로 넘기면 아직 살아 있는 실행 전 가드가 그 문자열을 보고 막는다.

스크립트 순서는 하나다 — `sessions` → (로컬 선택 항목이 있으면 0-2단계의 `graft-localize.mjs remove` · `statusline-setup.mjs restore`) → `scan` → `answer` → `backup` → `apply` → `plugin` → `records` → (CLI 를 돌렸으면) `after-cli` → `verify` → 보고 → `finish`. 명령마다 출력 끝 「다음:」 줄이 다음 명령을 말한다. 한 Bash 호출에 두 단계를 묶지 않는다 — 시험에서 `plugin` 과 `verify` 를 한 번에 돌려, 설치기록 질문이 검증 뒤로 밀렸다.

각 단계를 시작할 때 [PITFALLS.md](PITFALLS.md) 의 같은 번호 절을 먼저 읽는다.

---

## 0. 사전 확인 — 지금 걷어 내도 되는가

확인할 것:

- `git status --short` · 현재 브랜치 · `git stash list` · `git worktree list`
- **같은 트리의 살아 있는 다른 Claude 세션** — `U sessions <루트>`. `~/.claude/projects/<트리 경로 슬러그>/*.jsonl` 마다 **timestamp 가 있는 마지막 user·assistant 기록**의 시각과 몇 분 전인지를 낸다. 파일 수정 시각은 쓰지 않는다 — 세션이 끝날 때 timestamp 없는 줄이 붙어, 1시간 전에 끝난 세션이 「약 1분 전」으로 보였다(PITFALLS §0). 자기 세션은 가장 최근에 쓰인 파일로 추정하고, 틀리면 `--self <id>` 로 준다
- 영수증 `harness.install.json` 의 유무 · harness-install 체크포인트(`git rev-parse --git-path harness-install-state.json`)의 유무
- uninstall 체크포인트(`git rev-parse --git-path harness-uninstall-state.json`)의 유무 — 있으면 `U status <루트>` 로 진행 상황을 보인다
- 설치가 커밋됐는가(`git log --oneline -- harness.config.mjs`) — 커밋되지 않았으면 걷어 낸 뒤 커밋할 것이 없다(6단계 verify 가 이유와 함께 「커밋 경로 0개」를 낸다)

판정:

- **harness-install 체크포인트가 있으면** 중단된 설치다 — 멈추고 harness-install 0단계의 「재개 / 초기화」로 넘긴다.
- **uninstall 체크포인트가 있으면** 재개다. `done`·`applied` 를 보이고 남은 단계부터 잇는다. `applied` 가 비어 있으면 「다시 뽑기(`scan --refresh`) / 그대로 잇기」를 묻는다.
- 걷어 낼 파일(`CLAUDE.md`·`.claude/settings.json`·`.gitignore`)에 하네스와 무관한 미커밋 변경이 있거나 다른 세션이 살아 있으면, 그 사실을 보이고 계속할지 묻는다(DECISIONS.md 「다른 세션 확인」 — 권장 없는 질문이다). **이 질문은 혼자 먼저 묻는다** — 목적 질문과 한 번에 묶지 않는다. 여기서 「중단」을 고르면 목적 답은 쓸 데가 없다. 그 세션이 끝났는지는 사용자가 판단한다 — 선택지 라벨에 「종료됨」 같은 단정을 넣지 않고, `sessions` 가 낸 마지막 기록 시각과 몇 분 전인지를 설명에 둔다. 작업본 편집은 블록·키 단위라 그 변경을 지우지 않지만, 7단계 경로 지정 커밋에는 섞인다.

**완료 기준:** 위 항목마다 관찰값이 한 줄씩 적혀 있고, 「중단 — harness-install 초기화로」 · 「진행 — 새로 걷어내기」 · 「재개 — N단계부터」 중 하나로 판정돼 있다.

## 0-2. 로컬 선택 항목 — graft 로컬 연결 · 전역 상태 줄 (scan 전에)

영수증에 `local` 이 있거나, 영수증이 없어도 `.claude/helpers/graft-hooks.cjs` 가 있거나 `git rev-parse --git-path harness-kit-graft/state.json` 이 있으면 graft 로컬 연결이 있다. `S=${CLAUDE_SKILL_DIR}/../../scripts` 라 할 때 상태는 `node "$S/graft-localize.mjs" status <루트>` 와 `node "$S/statusline-setup.mjs" status` 로 본다.

- **scan 보다 먼저 한다.** graft 훅을 남긴 채 `.gitignore` 의 `/graft/` 블록을 지우면 다음 graft build 가 표시 없는 줄을 다시 덧붙인다. 또 graft 몫을 뺀 `settings.local.json` 을 백업·검증의 기준으로 삼아야 6단계 대조(하네스가 아닌 훅이 백업과 같은가)가 맞는다.
- **graft 로컬 연결** — [DECISIONS.md](DECISIONS.md) 「graft 로컬 연결」을 묻는다. 「걷어 냄」이면 `node "$S/graft-localize.mjs" remove <루트>`(그래프 데이터를 남기려면 `--keep-graph`). `failures=0` 이면 스냅숏·체크포인트·이번 백업이 든 `git-path harness-kit-graft/` 째 지우고, FAIL 이 있으면 그 폴더와 백업 `backup-<시각>/` 을 남긴다(그래프 `graft/` 는 다시 만드는 산출물이라 백업하지 않는다). `failures=0` 이어야 다음으로 간다. info/exclude 블록은 worktree 끼리 공유인데도 지운다 — 출력의 `WARN` 한 줄(다른 worktree 의 graft 산출물이 미추적으로 보일 수 있음)을 사용자에게 옮긴다. settings.json 에 graft 몫이 남아 있다는 `WARN` 은 커밋 파일이라 스크립트가 지우지 않는다 — 사용자에게 옮긴다.
- **전역 상태 줄** — 전역 영수증(`~/.claude/harness-kit/receipt.json`)이 있을 때만 DECISIONS.md 「전역 상태 줄 되돌리기」를 따로 묻는다. 「되돌림」이면 `node "$S/statusline-setup.mjs" restore`. 지금 값이 우리가 쓴 값과 다르면 스크립트가 손대지 않고 종료코드 3 으로 멈춘다 — 그 사실만 보고한다. 되돌리는 것은 전역 `statusLine` 값뿐이고 사본 스크립트·`statusline.json` 은 남는다 — 출력의 `KEEP` 줄(graft 를 쓰는 레포의 `settings.local.json` 이 그 사본을 계속 쓴다)을 사용자에게 옮긴다. 이 PC 의 다른 레포도 같은 전역 줄을 쓰므로 레포 걷어내기가 저절로 되돌리지 않는다.
- 이 세션에 이미 올라온 graft 훅은 helpers 가 지워진 뒤 도구 호출·턴 끝에 오류(파일 없음)를 낼 수 있다. 막지는 않는 오류다 — 새 세션에서는 나지 않는다.

**완료 기준:** 로컬 항목이 없으면 「없음」이 적혀 있다. 있으면 답마다 스크립트 출력 끝 줄(`failures=0` · `OK` · `STOP` 과 이유)과 백업 경로가 보고 초안에 있다.

## 1. 후보 뽑기 — 영수증 또는 알려진 구조

`U scan <루트>` 를 돌린다. 스크립트가 체크포인트에 계획을 적고 표를 낸다(id · 질문 header · 상태 · 권장 · 답 · 항목 — 근거). 표 위 「후보 N개」 줄과 「설치: HEAD 에 커밋됨 / HEAD 에 없음」이 보고와 7단계의 근거다.

- **영수증이 있으면** 영수증의 파일·블록·줄·치환·훅·키가 후보다. sha256 이 영수증과 다르면 상태가 `modified`(설치 뒤 손댐), 영수증에 없는데 `.harness/` 안에 있으면 `extra` 다.
- **영수증이 없으면** 알려진 구조로 뽑는다 — `.harness/` · `harness.config.mjs` · `.harness/` 를 가리키는 settings 훅(`settings.local.json` 포함) · `CLAUDE.md` 의 「개발 하네스」 절과 그 절을 가리키는 줄 · `.gitignore` 의 `.harness/` 줄과 바로 위 주석 · config `commands.*`·`project.commands.*` 가 가리키는 보조 파일(이름에 harness 가 있거나 설치와 함께 생긴 것) · 설치 근거가 있는 `enabledPlugins` false 키 · harness-kit 플러그인 키. 표시(`harness-kit:begin`·`harness-kit:line`)가 있으면 어느 파일이든 후보로 잡는다. 상태는 `unknown`(비교 기준 없음)이다.
- **앞선 걷어내기가 있었으면** 그 백업(`git rev-parse --git-path harness-uninstall-backup/*/index.json`)에서 그때 후보와 답을 읽어, 남긴 보조 파일을 다시 후보로 잡는다 — 두 번째 걷어내기에는 config 가 이미 없어 config 명령으로는 보조 파일을 못 찾는다. 예전 꼴의 index.json(후보 목록 없음)이면 백업 파일 중 이름에 harness 가 있는 것을 잡는다. config 도 백업도 없으면 이름에 harness 가 있고 미추적(또는 설치 커밋에서 생긴) 파일을 「권장 없음」으로 잡는다. 표 위 「앞선 걷어내기 백업 N개」 줄이 그 근거다.
- 표 아래 **남을 참조**는 권장대로 걷어 낸 뒤에도 남을 줄이다. 보조 파일을 다른 파일이 가리키면 그 보조 파일의 권장은 「남김」이 된다. 보고의 참조 수는 이 줄(과 verify 요약)에서 옮긴다 — 시험에서 스크립트가 보조 파일을 몰라 「0줄」을 냈고, 보고는 그 수를 손으로 고쳐 썼다.
- `.gitignore` 의 `/graft/` 표시 블록(harness-install D9)은 graft 가 아직 이 트리에 연결돼 있으면(0-2단계에서 남겼으면) 권장이 「남김」이다 — 지우면 graft build 가 표시 없는 줄을 다시 덧붙인다.
- 스크립트가 config 의 `project.git.commitExecution`·`push`·`coAuthor` 를 **지우기 전에** 읽어 체크포인트에 적는다(7단계가 쓴다).

**완료 기준:** 체크포인트에 계획이 있고, 표의 후보마다 header·상태·권장(또는 「권장 없음」)·근거가 있다. `WARN` 줄은 하나씩 사용자에게 옮겼다. 표에 없는데 하네스로 보이는 것을 찾았으면 손으로 지우지 않고 보고에 적는다.

## 2. 결정 질문 — 권장과 함께 묻는다

[DECISIONS.md](DECISIONS.md) 의 순서(목적 → 런타임 산출물 → 항목 → 설치 뒤 손댄 것)로 묻는다. 다른 세션 확인은 0단계에서 이미 따로 물었다. 플러그인 키와 설치 기록은 5단계, 커밋은 7단계에서 묻는다.

- 질문마다 권장을 첫 선택지에 「(권장)」과 근거 한 줄로, 선택지마다 바뀌는 것을 한 줄씩 단다. header 는 표의 「질문 header」 열을 그대로 쓴다 — 스크립트가 대상 + 동작(12자 이하)으로, 한 계획 안에서 겹치지 않게(훅은 이벤트 이름을 넣고, 같은 종류가 여럿이면 번호를 붙여) 정해 둔 것이다. 선택지 라벨은 그것만 읽어도 뜻이 통하게 쓴다(꼴은 DECISIONS.md 끝 절 — harness-install TEMPLATES.md §8 과 같은 꼴).
- **질문 본문은 평이한 말이 먼저다.** 첫 문장은 무엇을 어떻게 할지를 일상어로 쓰고(「하네스 스크립트 19개를 지울까요?」), 후보 id·경로·내부 용어(골격 사본 · 런타임 산출물 · git-common-dir)는 그 뒤 「근거:」에 둔다. 바꿔 쓸 말은 DECISIONS.md 「질문의 꼴」의 낱말 표를 따른다.
- **권장이 없는 질문**(표의 권장이 「권장 없음」인 칸 · 목적 · 다른 세션 확인)은 본문 첫 줄에 「권장 없음 — <무엇에 따라> 고릅니다」를 쓰고, 어느 라벨에도 「(권장)」을 붙이지 않으며, 선택지는 DECISIONS.md 에 적힌 고정 순서로 둔다. 사용자가 「권장대로」라고 답해도 이 질문들은 채우지 않고 따로 다시 묻는다 — 첫 선택지를 권장으로 읽은 사고가 있었다(PITFALLS §2).
- **영수증이 없으면 후보마다 질문 하나**다. 영수증이 있으면 상태가 `clean` 인 같은 종류(훅 5개 등)를 한 질문에 묶을 수 있고(header 는 번호 없는 꼴), `modified`·`extra` 는 따로 묻는다.
- 질문을 보내기 전에 본문·라벨·설명의 한글을 한 번 다시 읽는다 — 시험에서 받침이 틀린 낱말과 같은 낱말을 두 번 쓴 문장이 선택지 설명과 보고에 그대로 나갔다(PITFALLS §2).
- 답을 받을 때마다 `U answer <루트> <id>=<값> …` 로 적는다(목적은 `purpose=reinstall|remove`). 사용자가 「나머지는 모두 권장대로」라고 하면 그때만 `U answer <루트> --recommended` — 권장이 없는 칸은 `keep` 으로 채워지고 스크립트가 그 목록을 출력한다(보고에 옮긴다). 목적(`purpose`)은 채우지 않는다 — 목적이 미정이면 스크립트가 그렇다고 출력하고 플러그인 키도 비워 둔다.

**완료 기준:** `U status` 의 플러그인 외 모든 후보에 답이 있고, 각 답이 사용자 답과 같다. 내가 고른 값은 하나도 없다. 권장 없는 질문에 「(권장)」이 붙은 선택지를 보이지 않았다.

## 3. 백업 — 손대기 전에 한 번

`U backup <루트>` — 손댈 파일 전부를 `<git-path>/harness-uninstall-backup/<시각>/files/` 에 복사하고 바이트 대조한 뒤 `index.json` 을 쓴다. 런타임 산출물을 지우기로 했으면 `<git-common-dir>/harness-evidence/<트리>-<시각>/` 에도 복사한다.

- 백업은 한 번만 뜬다. 재개 때 다시 돌려도 덮어쓰지 않는다 — 걷어내던 중간 상태로 백업을 덮으면 원본을 잃는다.
- `index.json` 의 해시는 둘이다 — `sha256` 은 바이트 그대로(되돌려 놓은 파일 대조용), `sha256Lf` 는 줄끝을 LF 로 맞춘 뒤(영수증과 같은 계산). CRLF 파일은 두 값이 다르다.
- 출력의 「되돌리기:」 줄이 그대로 복사해 돌리는 한 줄이다 — 백업의 `files/` 를 루트에 복사하고(증거 사본이 있으면 그 `files/` 도), 스크립트 절대경로로 `restore-check` 를 불러 바이트 대조한다. 체크포인트 없이 돌아서 `finish` 뒤에도 쓸 수 있다. kit 키를 지워 플러그인 사본이 없어졌을 때를 위해 「되돌리기(스크립트가 없을 때)」 줄도 함께 나온다(복사 뒤 `git status`·`git diff` 로 확인).

**완료 기준:** 출력에 「백업 N개 = 후보 파일 N개」 줄이 있다(「≠」 면 멈추고 보고한다). 이미 없어서 백업하지 않은 후보 경로가 있으면 그 목록을 옮겼다. 백업·증거 사본 경로와 「되돌리기:」 줄을 사용자에게 알렸다.

## 4. 걷어내기 — 텍스트 → settings → 파일

`U apply <루트>` — 답이 `remove`·`revert` 인 후보를 이 순서로 걷어 낸다. 플러그인 키는 건드리지 않는다.

1. 텍스트 — 파일마다 한 번에: 영수증 치환을 설치 전 원문으로 되돌리고, 표시 블록·절·줄 묶음·한 줄을 지운다. 블록 앞뒤가 빈 줄이면 빈 줄 하나만 남긴다.
2. settings — 훅 하나씩: 그룹에 그 훅뿐이면 그룹을, 이벤트에 그 그룹뿐이면 이벤트 키를 지운다. 다른 훅·다른 키의 바이트는 그대로다. 이어서 false 키.
3. 파일 — 보조 파일 · config · 손댄/생긴 파일 · 골격 사본 · 런타임 산출물, 빈 디렉토리, 마지막으로 영수증(남긴 항목이 없을 때만). 런타임 산출물은 지우기 직전에 증거 사본을 지금 판으로 다시 맞춘다 — 백업 뒤에도 살아 있는 훅이 로그에 줄을 더하기 때문이다(`OK 증거 사본 … 더해진 N줄` 줄). 맞추지 못하면 지우지 않고 `SKIP` 한다.

`.harness/` 가 지워진 뒤에는, 이 세션에 이미 올라온 하네스 훅이 도구 호출 때 오류(파일 없음)를 낼 수 있다 — 훅 설정을 다시 읽는지에 따라 다르다(시험에서는 걷어 낸 뒤 Bash 4번에 오류가 없었다). 나더라도 막지는 않는 오류다. 재설치하려면 어느 쪽이든 새 세션을 연다(PITFALLS §4·§8).

걷어 낸 결과가 HEAD 와 내용이 같아진 파일은 줄끝을 체크아웃 판에 맞춰 쓴다(`INFO … 줄끝을 체크아웃 판(CRLF)에 맞췄다`). 설치나 플러그인 CLI 가 CRLF 체크아웃 파일을 LF 로 다시 써서, 걷어 낸 뒤에도 status 만 M 으로 남던 것을 막는다. 내용이 HEAD 와 다르면 줄끝도 그대로 둔다.

**완료 기준:** 출력 끝에 `적용 N건` 줄이 있다(할 일이 없었으면 `적용 0건 (플러그인 키는 5단계)`). 그 위의 모든 줄이 `OK` 이거나, `SKIP`·`KEEP` 줄마다 이유(이미 없음 · 설치 뒤 손댄 것이라 되돌리지 않음 · 남긴 항목의 기준)를 사용자에게 옮겼다.

## 5. 플러그인 키 → 설치 기록 — 맨 마지막 결정, 검증보다 먼저

순서가 정해져 있다: **5-1 키 지우기 → 5-2 설치기록 질문 → 5-3 CLI 와 대조·복원 → 6단계 검증.** 검증을 설치기록 질문보다 먼저 돌리지 않는다.

**5-1 kit 키.** DECISIONS.md 「kit 키 처리」를 묻는다(header `kit 키 처리` — 권장이 「켜 둠」이어도 header 가 한쪽 동작을 말하지 않게). 이 스킬도 harness-kit 안에 있다 — 키를 지우면 다음 세션부터 이 레포에서 harness-install·harness-uninstall 이 뜨지 않는다(이 레포 설정에서만 빠진다 — 사용자 범위로 켜 둔 PC 에서는 계속 뜬다). 재설치가 목적이면 켜 두는 것이 권장이다. `U answer <루트> plugin=off|keep` → `U plugin <루트>`. plugin 은 키를 지운 직후의 settings 를 백업 디렉토리 `after-plugin/` 에 스냅숏으로 뜬다 — CLI 뒤 되덮기의 기준이다(3단계 백업은 키를 지우기 전 판이라, 그것으로 되덮으면 kit 키가 되살아난다).

**5-2 설치 기록.** `U records <루트>` — `~/.claude/plugins/installed_plugins.json` 의 harness-kit 기록 중 **`projectPath` 가 이 레포 루트와 같은 것만** 고른다(Windows 는 대소문자 무시 · 슬래시 통일). 다른 트리(메인 트리 · 다른 worktree)의 기록은 근거로 쓰지 않고 「건드리지 않는다」로만 보인다 — 시험에서 남의 트리 기록 둘(「project·local 둘 다 disabled」)을 이 트리의 근거로 썼다.

- 이 트리의 기록이 없으면 묻지 않는다. 보고에 「이 트리의 설치 기록 없음 — CLI 실행 안 함」을 옮긴다.
- `claude plugin uninstall --scope project|local` 은 **cwd 의 프로젝트**에 작용한다. CLI 가 worktree 를 메인 트리로 푸는지는 확인되지 않았다 — 이 트리가 worktree 이고 메인 트리에도 기록이 있으면 스크립트가 CLI 를 권하지 않고(`WARN`) 손 절차(`INFO 손 절차`)를 낸다. 그때는 CLI 를 선택지로 보이지 않고, 손 절차는 사용자가 원할 때만 건넨다.
- 기록이 이 트리에만 있으면 DECISIONS.md 「설치기록 삭제」를 묻는다. 출력의 `CLI 후보` 줄이 실행할 명령이다(이 트리 루트에서만).

**5-3 CLI 뒤.** 「기록 삭제」를 고르면 CLI 를 이 트리 루트에서 실행한 직후 `U after-cli <루트>` — settings 를 `after-plugin/` 스냅숏과 바이트 대조하고, 달라졌으면 CLI 판을 `after-cli/` 에 남긴 뒤 스냅숏 바이트로 되덮는다(키 순서 · 지워진 키 · 줄끝이 스냅숏대로 돌아온다). CLI 를 돌리지 않았으면 이 단계는 없다.

**완료 기준:** 답이 체크포인트에 있고, `off` 면 두 키가 지워졌다는 `OK` 줄과 `after-plugin 스냅숏` 줄이 있다. `records` 출력이 있고(「이 트리의 설치 기록 없음」 · CLI 를 권하지 않은 이유 · `CLI 후보` 중 하나), CLI 를 돌렸으면 `after-cli: … failures=0` 줄이 있다.

## 6. 검증 — 남은 것과 그대로인 것

`U verify <루트>` 가 판정한다. 5단계(`records`, CLI 를 돌렸으면 `after-cli`)가 끝난 뒤에 돌린다 — 그 전이면 `WARN 설치기록 단계(records)를 아직 안 돌렸다` 가 나온다.

- 지우기로 한 파일·디렉토리가 남았는가
- settings 가 `after-plugin/` 스냅숏과 같은가 — 다르면 `FAIL`(CLI 가 다시 썼는데 `after-cli` 를 안 돌렸거나, 다른 세션이 고쳤다)
- settings.json·settings.local.json — JSON 파싱 · 중복 키 0 · `.harness` 훅 0(남기기로 한 것 빼고) · **하네스가 아닌 훅이 이벤트별로 백업과 같은가** · 다른 최상위 키와 다른 `enabledPlugins` 키가 그대로인가
- 후보 밖 파일 — 걷어내기 전부터 있던 미커밋 변경이 그대로이고, 새로 바뀐 파일이 없는가
- 남은 참조 — `.harness`·`harness.config`·`harness.install`·`harness-kit`·보조 파일 이름을 가리키는 줄(보고만)
- `git status --short` 와 커밋 경로 — 추적 중인 후보 중 HEAD 와 다르고, **실제로 걷어 낸 조각이 HEAD 판에 있던 것**. 스크립트가 걷어 낸 연산을 HEAD 판에 똑같이 해 보아 가린다. 설치가 커밋되지 않은 트리에서는 걷어내기가 작업본을 HEAD 쪽으로 되돌릴 뿐이라, HEAD 와 남은 차이(손대지 않은 문서 줄 · 남긴 kit 키)는 걷어내기 결과가 아니다 — 커밋 경로에서 빼고 이유와 함께 「커밋 경로 0개」로 낸다
- **줄끝만 다른 파일** — status 는 M 인데 HEAD 와 내용이 같은 파일(후보 경로와, 후보가 아니어도 설치가 늘 고치는 `settings.json`·`settings.local.json`·`.gitignore`·`CLAUDE.md`)을 지금 줄끝과 체크아웃 판 줄끝과 함께 적고, 고치는 명령을 함께 낸다: `U eol-fix <루트> <경로>`(체크아웃 판 바이트로 쓴다 · HEAD 와 내용이 다르면 쓰지 않는다) 또는 `git checkout -- <경로>`. `git update-index --refresh` 로는 풀리지 않는다(autocrlf=true 시험에서 `needs update` 로 끝났다). 고칠지는 사용자가 정한다
- 출력 끝의 「요약」 블록 — 후보 수 · 답별 수 · 적용 건수 · 권장이 없어 keep 으로 채운 칸 · 남은 참조 수 · 설치 기록 판정 · 백업 수와 절대경로 · after-plugin 스냅숏 · 증거 사본 절대경로 · 되돌리기 두 줄 · 백업 수명 · 앞선 백업·증거 사본 · 「남긴 것을 나중에 지우려면」. 보고의 수와 경로는 이 블록에서 옮긴다

**완료 기준:** `failures=0`. 남은 참조 · 「줄끝만 다름」(과 고치는 명령) · 「HEAD 에 걷어 낸 조각이 없다」 줄이 보고에 옮겨져 있다.

## 7. 커밋 — 1단계에서 읽어 둔 정책대로, 직전에 묻는다

- 커밋 경로가 0개면 커밋하지 않고, **메시지 파일도 만들지 않는다**. verify 가 낸 이유 줄(예: 「설치가 HEAD 에 커밋된 적이 없다」)을 그대로 보고에 옮긴다 — 그 트리에서 남은 차이를 커밋하면 「제거」가 아니라 「설치 일부 추가」 커밋이 된다.
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

## 8. 보고 → 그다음에 체크포인트 정리

순서가 정해져 있다. **① 보고를 응답 본문으로 먼저 내보낸다 → ② 그 뒤에 `U finish <루트>` 를 부른다 → ③ finish 출력 한 줄(체크포인트를 지웠다)만 덧붙인다.** finish 를 보고보다 먼저 부르지 않는다 — 보고가 끊기거나 틀리면 체크포인트로 `U status`·`U verify` 를 다시 돌려 보고를 다시 만들 수 있어야 한다. finish 는 체크포인트 파일 하나만 지운다. 백업과 증거 사본은 그대로라 보고에 적은 경로는 finish 뒤에도 유효하다.

보고에 담는다 — 수와 경로는 verify 「요약」 블록에서 옮기고 손으로 세지 않는다(시험에서 후보 14개를 13개로 적었다):

- 기준(영수증 / 알려진 구조) · 후보 수(플러그인 키 포함) · 지운 것 · 되돌린 것 · 남긴 것(이유) · 「설치 뒤 손댄 것」의 처리 · 권장이 없어 keep 으로 채운 칸
- 남은 참조 목록 · 검증 결과 · 커밋(SHA, 메시지 파일, 또는 verify 가 낸 「커밋하지 않음」 이유) · 플러그인 키 상태 · 설치 기록(요약의 「설치 기록:」 줄 — 다른 트리 기록은 건드리지 않았다는 것)
- 0-2단계 로컬 항목 — graft 로컬 연결(걷어 냄 / 남김 · 백업 경로 · 남긴 exclude 블록과 이유) · 전역 상태 줄(되돌림 / 남김 / 값이 달라 손대지 않음). 남겼으면 나중에 걷어 내는 명령(`graft-localize.mjs remove` · `statusline-setup.mjs restore`)을 적는다
- **백업과 증거 사본 — 두 절대경로와 수명.** 백업은 `git-path` 아래라 worktree 면 `.git/worktrees/<이름>/` 안에 있어 `git worktree remove` 가 함께 지운다. 증거 사본은 `git-common-dir/harness-evidence/` 아래라 worktree 를 지워도 남고, 필요 없어지면 손으로 지운다. 재설치할 수 있으면 백업을 레포 밖으로 옮겨 두라고 적는다. **앞선 걷어내기의 백업·증거 사본**(요약의 「앞선 백업」·「앞선 증거 사본」 줄)도 함께 적고, 증거 사본은 손으로 지워야 남지 않는다고 적는다
- **되돌리는 법** — 요약의 「되돌리기:」 줄(그대로 복사해 돌린다)과 「되돌리기(스크립트가 없을 때)」 줄. 되돌리면 하네스 훅도 돌아오니 새 세션을 연다는 말을 붙인다
- **남긴 것을 나중에 지우려면** — 요약의 같은 이름 절을 항목마다 옮긴다(다시 걷어내기 · 정확한 손 편집 · 줄끝 명령). `git restore`·`git checkout -- <파일>` 로 한꺼번에 되돌리지 않는다고 적는다 — 파일 단위라 다른 변경까지 되돌리고, 자동 모드의 권한 분류기가 막을 수 있다. 막히면 우회하지 않고 줄 단위 Edit 나 걷어내기 재실행으로 한다(PITFALLS §8)

**재설치 절차는 uninstall → 새 세션 → install 이다.** 걷어 낸 세션에는 옛 훅과 옛 `CLAUDE.md` 가 올라와 있어, 같은 세션에서 harness-install 을 돌리면 0단계가 옛 상태를 보고 판정이 틀어진다. 사용자에게 「새 세션을 열고 `하네스 설치해줘`」라고 안내한다. 옛 훅이 이 세션에서 오류를 낼지는 훅 설정을 다시 읽는지에 따라 다르니 「반드시 오류가 난다」고 쓰지 않는다. 플러그인 키를 지웠으면 새 세션에서 harness-install 이 뜨지 않는다 — 사용자 범위로 켜거나 키를 다시 넣는 방법을 함께 적는다.

보고를 보내기 전에 보고의 한글을 한 번 다시 읽는다(2단계와 같은 이유).

**완료 기준:** 보고가 finish 호출보다 앞에 나갔다. 보고의 후보 수·백업 수·남은 참조 수가 verify 요약과 같고, 백업·증거 두 절대경로와 수명, 되돌리기 줄, 「남긴 것을 나중에 지우려면」이 있다(남긴 것이 없으면 없다고 적는다).
