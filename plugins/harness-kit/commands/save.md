---
name: save
description: 테스트 → 커밋 → 푸시. 테스트 명령·보호 브랜치·커밋 규칙은 레포 harness.config.mjs 의 project 블록에서 읽는다.
---

# /save — 테스트 → 커밋 → 푸시

## 프로필 — 프로젝트 고유값을 읽는 곳

이 커맨드는 프로젝트 고유값을 본문에 갖지 않는다. 레포 루트 `harness.config.mjs` 의 `project` 블록에서 읽는다(슬롯 정의는 harness-kit README 「프로젝트 프로필」).

- 읽는 순서: 현재 레포 config → `project.pairOwner` 가 가리키는 주 레포 config. 짝 공통값(`layout`·`contract`·`git`)은 주 레포에만 있다.
- 이 커맨드가 읽는 슬롯: `layout` · `sides.*.root` · `sides.*.marker` · `commands.*.testAll` · `commands.be.compile` · `repos.peers` · `contract.beGlobs` · `risk.sharedDbSuites` · `git.protectedBranches` · `git.commitFormat` · `git.commitExecution` · `git.push` · `git.coAuthor` · `git.reviewThreshold`
- 단일 레포에서 `project.commands` 가 없으면 harness 최상위 `commands`(`unitTest` 등)를 읽는다.
  - 이유: 같은 값을 두 곳에 적지 않기 위해서다.
- **값이 없으면 지어내지 않는다.**
  - 파일이 없거나 슬롯 키가 없으면 그 자리에서 멈추고 사용자에게 묻는다.
  - 테스트 명령·보호 브랜치·커밋 형식을 흔한 기본값으로 채우지 않는다.
  - `null` 은 "해당 없음으로 판단됨"이다. 그 단계를 건너뛰고 보고에 적는다.

## Step 0: 진행 중 백그라운드 작업 확인

이 세션이 띄운 백그라운드 작업(서브에이전트·백그라운드 셸·`Monitor`·`Workflow` 등)이 실행 중이면 아래 순서를 따른다.

1. **분류** — 각 작업을 「읽기 전용」·「파일 수정 중」·「외부 부수효과(사용자 판단 대기)」 중 하나로 가른다.
2. **마무리 요청** — 곧 끝나는 작업이면 마무리를 기다린다. 서브에이전트는 결과를 내고 끝내도록 요청한다.
3. **정지** — 읽기 전용 작업은 정지한다.
4. **확인** — 정지·대기 결과를 사용자에게 **한 줄로 보고**한다.

실행 중 작업이 없으면 확인만 하고 Step 1 로 간다.

> 🔴 **「파일 수정 중」·「외부 부수효과(사용자 판단 대기)」 작업이 남아 있으면 커밋·푸시하지 않는다.**
> **강제 정지한 파일 수정 작업의 변경 파일은 사용자 확인 없이 커밋 경로에 넣지 않는다.**
>
> 이유: 반쯤 고친 파일이 커밋되는 것을 막는다. 서브에이전트가 바꾸는 중인 파일이 함께 stage 되는 것도 막는다.

## Step 1: 브랜치 확인 + 테스트 실행

현재 브랜치가 `git.protectedBranches` 에 있으면 즉시 중단. 그 외 모든 브랜치에서 실행 가능.

어느 계층의 테스트를 돌릴지는 프로필로 **판별해서 실행**한다:
- `layout: 'paired'` — 현재 레포가 `sides.be` 쪽인지 `sides.fe` 쪽인지 `sides.*.root`·`sides.*.marker` 로 가른다. 그 계층의 `commands.<side>.testAll` 하나를 돌린다.
- `layout: 'single'` — 레포 안에 계층이 둘이면(`sides.be.root`·`sides.fe.root` 가 하위 디렉토리) 둘 다 차례로 돌린다. 하나라도 실패면 실패다.

```bash
LOG="${TMPDIR:-/tmp}/save-test.log"
# <ROOT>·<TEST_CMD> = 프로필에서 읽은 sides.<side>.root · commands.<side>.testAll 문자열 그대로
( cd "<ROOT>" && <TEST_CMD> ) > "$LOG" 2>&1; ec=$?
echo "[exit=$ec]"
tail -30 "$LOG"
```

> 🔴 **빌드·테스트 출력을 파이프로 넘기지 않는다. 판정은 `$ec` 로 한다.**
> 출력은 파일로 받는다. 판정은 `$ec`, 내용은 로그로 본다.
>
> 이유:
> - `<테스트> | tail` 의 종료코드는 **`tail` 의 것**이라 항상 0 이다.
> - 그대로 믿으면 **BUILD FAILED 를 통과로 오판하고 그 상태로 커밋·푸시**한다(실제 사고 이력 있음).
> - `${PIPESTATUS[0]}` 로 살릴 수도 있다. 그러나 **그 한 조각을 빠뜨린 변형이 곧바로 오판으로 돌아온다.** 그래서 파이프 자체를 쓰지 않는다.
>
> harness-agent 를 설치하고 위험 명령 가드에 파이프 판정 금지 규칙을 걸어 두었다면, 그 가드가 이 형태를 실제로 차단한다.

> ⚠️ 직렬 실행 플래그는 `commands.<side>.testAll` 값 안에 넣어 둔다. 러너가 병렬 실행 아티팩트로 거짓-RED 를 내는 구성일 때다.
> 이 커맨드가 플래그를 덧붙이지 않는다.

> 🔴 **`risk.sharedDbSuites` 에 걸린 스위트가 `testAll` 에 들어 있으면, 돌리기 전에 대상 환경을 확인받는다.**
> 이유: 그 스위트는 공유 DB 에 실접속한다.
> RED 면 회귀로 단정하기 전에 접속 가능 여부부터 가른다. 접속 불가로 인한 RED 는 이번 변경과 무관하다.

**`$ec` 가 0 이 아니면 여기서 중단하고 실패 항목을 보고한다.**
(빠른 확인만 필요하면 BE 는 `commands.be.compile` 로 컴파일만 검증 후 진행 여부를 사용자에게 확인.)

## Step 2: 변경 파일 나열

테스트 전체 통과 시:

```bash
echo "=== Modified ===" && git diff --name-only HEAD && echo "=== Untracked ===" && git ls-files --others --exclude-standard
echo "=== Staged (이 커맨드가 넣지 않음) ===" && git diff --cached --name-only
```

**파일 목록을 사용자에게 보여주고, 커밋 대상 파일 선택을 요청한다.**

- 이미 stage 된 파일이 있으면 그것도 함께 알린다. 다른 세션이 넣었을 수 있다.
- 사용자가 고르지 않은 stage 파일은 커밋에 들어가지 않는다. index 에 그대로 남는다.

### ⚠️ 계약 커플링 체크 (`layout: 'paired'` 일 때)
변경 목록에 `contract.beGlobs` 에 걸리는 파일(요청/응답 DTO·Controller·endpoint)이 있으면,
**짝 레포(`repos.peers`) 동반 수정이 필요한지** 사용자에게 먼저 확인한다:

```bash
# <PEER> = repos.peers[].path
echo "=== 짝 레포 미커밋 변경 ===" && git -C "<PEER>" status --porcelain || echo "(짝 레포를 찾지 못함 — 계약 변경 시 동반 반영 확인 필요)"
```

## Step 3: 커밋 — 고른 경로만, 경로 지정 커밋으로

사용자가 커밋 대상 파일을 선택하면 그 목록을 **커밋 경로**(`<PATHS>`)로 고정한다. 이후 게이트·메시지·커밋은 모두 이 경로만 본다.

> 🔴 **`git add <파일>` + 경로 없는 `git commit` 을 쓰지 않는다.** `git add -A`·`git add .` 도 금지다.
> 이 커맨드는 index 에 내용을 쌓지 않는다. index 는 남의 것일 수 있다고 본다.
>
> 이유: 경로 없는 커밋은 **index 전체**를 커밋한다. 같은 트리의 다른 세션·사용자가 미리 stage 해 둔 변경까지 딸려 들어간다(실제 사고 이력 있음).

1. **신규 파일만 의도 표시**
   - 커밋 경로 중 미추적 파일은 `git add -N -- <신규 파일…>` 로 「추가할 예정」만 index 에 적는다. 내용은 넣지 않는다.
   - 이것이 있어야 아래 diff 와 경로 지정 커밋이 신규 파일을 본다.
2. **검출력 게이트** — 아래 소절. 발동 조건 미해당이면 건너뛴다
3. **diff 리뷰 게이트** — 아래 소절. 임계 미만이면 건너뛴다
4. 변경 내용(`git diff HEAD -- <PATHS>`) 분석 후 `git.commitFormat` 대로 커밋 메시지 생성. trailer 는 `git.coAuthor` 가 허용할 때만
5. 사용자에게 메시지 확인 요청
6. `git.commitExecution` 에 따라:
   - `'auto'` — 메시지를 임시 파일로 쓰고 아래 명령을 **한 번에** 실행한다.
     - 브랜치·toplevel 조건과 커밋이 같은 명령에 있어야 한다.
     - 그래야 확인과 커밋 사이에 브랜치가 바뀌어도 엉뚱한 곳에 커밋하지 않는다.
   - `'message-only'` — 메시지 텍스트와 **사용자가 칠 아래 명령**을 제시한다.
     - 커밋·푸시를 실행하지 않는다.
     - 1번의 `git add -N` 도 하지 않는다. 명령에 넣어 건넨다.
     - 여기서 끝낸다
   - 키가 없거나 두 값 밖이면 지어내지 않고 멈추고 묻는다(프로필 규칙)

```bash
# <ROOT>=레포 루트(git rev-parse --show-toplevel) · <BRANCH>=Step 1 에서 확인한 현재 브랜치 · <MSG>=메시지 파일
# <NEW…>=커밋 경로 중 미추적 파일 · <PATHS…>=커밋 경로 전부
R="<ROOT>"; B="<BRANCH>"
[ "$(git -C "$R" rev-parse --show-toplevel)" = "$R" ] \
  && [ "$(git -C "$R" rev-parse --abbrev-ref HEAD)" = "$B" ] \
  && [ ! -e "$(git -C "$R" rev-parse --path-format=absolute --git-path index.lock)" ] \
  && git -C "$R" add -N -- <NEW…> \
  && git -C "$R" commit -F "<MSG>" -- <PATHS…>
```

- 신규 파일이 없으면 `add -N` 줄을 뺀다.
- `git commit -- <PATHS>` 는 그 경로의 **작업본 내용 전체**를 커밋한다.
  - 경로 안에서 일부 줄만 커밋하려던 것(`git add -p` 로 고른 부분 스테이징)은 무시된다.
  - 부분 커밋이 필요하면 멈추고 사용자에게 묻는다.
- 커밋 직후 두 가지를 본다.
  - `git -C "$R" show --stat HEAD` 의 파일 목록이 `<PATHS>` 와 같은지
  - `git -C "$R" status --short` 에 커밋 전부터 있던 남의 변경(stage 된 것 포함)이 그대로 남았는지

### 검출력 게이트 — 새 단위테스트가 실제로 잡는지 확인

발동: 커밋 경로에 단위 테스트 파일이 추가·수정됐고, 추가된 줄에 테스트 선언·단언(`it(`·`@Test`·`expect(`·`assertThat(` 류)이 있을 때.

제외: 문서만 · e2e · `risk.sharedDbSuites`(공유 DB 실접속) · 훅 테스트 · 되돌릴 이전 버전이 없는 신규 파일 · 경계표 밖 배선 코드.

1. 그 테스트가 겨냥하는 프로덕션 심볼을 하나 고른다.
2. `git restore --source=<rev> --worktree -- <파일>` 로 분기·가드·바인딩 하나를 되돌린다.
   🔴 `git checkout <rev> -- <파일>` 금지 — 인덱스까지 덮어 스테이징된 수정이 사라진다.
3. 대상 테스트만 좁게 돌린다. 변형 1~3개, 5분 상한.
4. 원복 후 `git status --porcelain` 과 `git diff HEAD --stat -- <PATHS>` 가 전과 같은지 확인한다.
5. 변형이 살아남으면(테스트가 그대로 통과하면) 사용자에게 알리고 **묻는다. 막지 않는다.**
6. 커밋 메시지에 `검출력: 변형 N · 생존 M · 케이스 K` 한 줄과 되돌림 방법을 남긴다.

왜 막지 않고 묻는가 — 이 게이트의 기준은 「deny 는 되돌릴 수 없거나 오탐이 없는 영역에만」이다. 변형은 원복이 트리비얼하고, 오탐이 알려져 있다(신규 파일·변형 위치 오선정·배선 코드·flaky/외부자원 의존). 막으면 그 경우에 정상 커밋이 멈춘다.

### diff 리뷰 게이트

커밋 경로가 정해진 직후, 그 경로의 diff 가 **임계를 넘을 때만** `harness-kit:change-verifier` 에게 코드리뷰를 맡긴다.
자리를 여기로 잡은 이유는 둘이다.

- 커밋 대상이 확정된 뒤라 **미선택 변경을 리뷰하지 않는다.**
- 빈도가 **커밋당 1회**로 고정돼 턴마다 반복되지 않는다.

```bash
git diff HEAD --numstat -- <PATHS…> | awk '{f++; a+=$1; d+=$2} END {print "files=" f+0, "lines=" a+d+0}'
```

(`git diff --cached` 를 쓰지 않는다 — index 에는 이 커맨드가 넣지 않은 남의 stage 가 있을 수 있다. 신규 파일은 Step 3 의 `add -N` 뒤라 이 diff 에 보인다. `message-only` 라 `add -N` 을 하지 않았으면 신규 파일은 `git diff --no-index --numstat /dev/null <신규 파일>` 로 따로 세어 더한다 — 차이가 있으면 종료코드 1 이 정상이다.)

- **임계: `git.reviewThreshold`(파일 수 초과 또는 추가+삭제 줄 수 초과).** 둘 중 하나만 넘어도 태운다. 슬롯이 없으면 임계를 묻는다.
- 임계 미만이면 리뷰 없이 다음 번호로 간다.
  - 이유: **한 줄짜리 수정까지 리뷰를 돌리면 그 경고는 곧 무시된다.** 게이트를 두는 목적 자체가 사라진다.
- 태울 때는 `harness-kit:change-verifier` 를 **diff 리뷰 전용**으로 호출한다. 빌드·lint·테스트는 Step 1 에서 이미 그린으로 판정했으므로 **다시 돌리지 않는다.**

호출 프롬프트에 반드시 담을 것:

- 대상은 `git diff HEAD -- <PATHS…>` 뿐이다. 워킹트리에 남겨둔 미선택 변경과 남이 stage 해 둔 변경은 리뷰 범위가 아니다.
- **고신뢰 결함 우선**, 불확실한 것은 "확인 필요" 라벨로 남기고 단정하지 않는다 (에이전트 절대원칙 4).
- **스타일·포맷·네이밍 지적 금지.** 요청에 없는 변경을 부르고, 리뷰어도 테스트도 그 변경을 보고 있지 않게 된다.

**결과 처리 — 판정은 사용자가 한다.** 발견이 있으면 목록을 보여주고 «고치고 커밋 / 그대로 커밋 / 커밋 중단» 을 묻는다.
리뷰를 근거로 **에이전트가 스스로 프로덕션 코드를 고치지 않는다** (`harness-kit:change-verifier` 는 실행·판정 전용).

> ⚠️ **"리뷰를 돌렸으니 봤다" 로 눈검증을 건너뛰지 않는다.** 이 게이트는 눈검증을 대체하지 않는다.
>
> 이유:
> - 렌더/도메인 결함(픽셀 정렬·기하·시간 단위 등)은 diff 에 드러나지 않는다.
> - 게이트가 잡는 것은 **코드로 보이는** 종류뿐이다. 예: 중복 요청·실패 경로 누락·닫힘 처리

## Step 4: 푸시

`git.push` 에 따라:
- `'auto'` — 커밋 완료 후 아래 명령 실행
- `'ask'` — 푸시 여부를 묻고, 승인되면 아래 명령 실행
- `'never'` — 푸시하지 않고, 사용자가 실행할 아래 명령만 제시
- `git.commitExecution: 'message-only'` 면 Step 3 에서 끝났으므로 이 단계는 없다

```bash
# 원격·브랜치를 늘 명시한다 — 맨 `git push` 는 push.default·upstream 설정에 따라 다른 브랜치를 밀 수 있다
R="<ROOT>"; B="<BRANCH>"
[ "$(git -C "$R" rev-parse --abbrev-ref HEAD)" = "$B" ] && git -C "$R" push origin "$B"
# upstream 이 없는 새 브랜치면: git -C "$R" push -u origin "$B"
```

- `<BRANCH>` 가 `git.protectedBranches` 에 있으면 실행하지 않는다(Step 1 에서 이미 멈췄어야 한다).
- `--force` 류는 이 커맨드가 쓰지 않는다. 필요하면 사용자가 직접 친다.

## 규칙

- `git.protectedBranches` 에서 절대 실행 금지
- 그 외 모든 브랜치에서 실행 가능
- trailer(`Co-Authored-By:` 등)는 `git.coAuthor` 가 허용할 때만
