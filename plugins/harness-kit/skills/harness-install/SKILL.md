---
name: harness-install
description: 지금 레포에 harness-agent 게이트(.harness/ 훅)와 harness-kit 플러그인(project scope)을 함께 설치한다 — 사전 확인 → 정적 분석 → 결정 질문 → 골격 복사 → config → settings.json → 정적 확인 → 발동 확인 안내 → CLAUDE.md 절 → 경로 지정 커밋. Triggers on "하네스 설치해줘", "이 레포에 하네스 적용", "harness-agent 설치", "harness-kit 설치", "하네스 설치 이어서". 끝난 설치의 업그레이드에는 쓰지 않는다.
---

# harness-install — 게이트와 플러그인을 한 번에, 결정은 하나씩

이 스킬이 레포에 넣는 것은 두 가지다.

1. **harness-agent 게이트** — `.harness/`(골격 사본) + `harness.config.mjs` + `.claude/settings.json` 의 훅 5개
2. **harness-kit 플러그인** — `.claude/settings.json` 의 `enabledPlugins`·`extraKnownMarketplaces`(project scope)

다른 레포의 고유 지식을 담은 **프로젝트 전용 플러그인은 설치하지 않는다.** 이 레포의 고유 지식은 레포 안(`CLAUDE.md`·`docs/`·`.claude/skills`)에 둔다.

설치를 끝까지 지배하는 말 다섯 개:

- **정적** — 0~6단계는 읽기·`git` 조회·정적 판정만 한다. 빌드·테스트·DB 접속·앱 기동은 하지 않는다. 판정에 실행이 필요하면 사용자에게 넘긴다.
- **묻는다** — 결정은 근거와 함께 하나씩 묻는다([DECISIONS.md](DECISIONS.md)). 권장은 1단계 관찰에서 계산해 표시할 뿐이고, 고르는 것은 사용자다. 다른 레포의 값이나 흔한 기본값으로 채우지 않는다. 근거 없는 칸은 `null` 로 두고 보고에 적는다.
- **통째로** — 골격은 디렉토리째 복사한다. 일부만 옮기면 정적 import 가 깨져 가드가 **조용히** 꺼진다.
- **반출** — 커밋되는 파일(config·settings·`CLAUDE.md`)에는 개인 경로·개인 설정·비밀번호를 넣지 않는다. 사내 호스트·계정 이름 같은 레포 고유값은 이 레포의 config 안에만 둔다.
- **체크포인트** — 2단계부터 단계가 완료 기준을 통과할 때마다(2단계는 답 하나마다) 대상 트리의 `git rev-parse --git-path harness-install-state.json` 파일에 완료 단계·결정 답·원본 SHA 를 적는다(꼴은 [TEMPLATES.md](TEMPLATES.md) §7). git 디렉토리 안이라 커밋·`.harness/` 비교에 섞이지 않고, 세션이 끊겨도 다음 세션의 0단계가 이어받는다. 단계를 서브에이전트에 맡겨도 완료 기준을 확인하고 체크포인트를 쓰는 것은 메인이다.

각 단계를 시작할 때 [PITFALLS.md](PITFALLS.md) 의 같은 번호 절을 먼저 읽는다 — 실제 설치에서 터진 함정이 단계별로 모여 있다.

---

## 0. 사전 확인 — 이 트리에 지금 설치해도 되는가

확인할 것:

- `git status --short` · 현재 브랜치 · `git stash list` · `git worktree list`
- **같은 트리의 살아 있는 다른 Claude 세션** — `~/.claude/projects/<트리 경로 슬러그>/*.jsonl` 의 최근 수정 시각(자기 세션 파일은 뺀다). 슬러그는 경로의 `:`·`\`·`/` 를 `-` 로 바꾼 꼴이고, 드라이브 문자의 대소문자가 섞여 있을 수 있다.
- 기존 `.claude/settings.json`·`settings.local.json` 의 `hooks`(이벤트·matcher·명령)와 `enabledPlugins`
- 기존 게이트 — git 훅(`core.hooksPath`), 셸 래퍼, 플러그인 훅. 같은 위험을 이미 막는 가드가 있으면 그 축은 켜지 않는다(겹침)
- **설치 흔적 — 재개 판정**([CHECKS.md](CHECKS.md) §5): 체크포인트 · `.harness/`·`harness.config.mjs` 의 유무 · config 가 example 그대로인가 · HEAD 에는 있는데 작업본에서 지워졌는가
- 한글이 든 파일의 인코딩 표본(UTF-8 여부·BOM·줄끝), `.bat`/`.cmd` 의 비 ASCII 여부, `core.autocrlf`·`.gitattributes`

판정:

- 미커밋 변경이 `.claude/settings.json`·`.gitignore`·`CLAUDE.md` 에 있거나 다른 세션이 살아 있으면 **worktree 에서 설치하자고 제안한다**(2단계 설치 위치 질문으로 넘긴다).
- 설치 흔적은 CHECKS.md §5 의 표로 가른다. **중단된 설치**면 남은 상태(완료 단계·답)를 보이고 「재개 / 초기화」를 묻는다. **끝난 설치**면 멈추고 보고한다(업그레이드는 범위 밖). **HEAD 에 하네스가 있는데 작업본에서 지워졌으면** 멈추고 보고한 뒤 「의도적 재설치인가」를 묻고, 그렇다는 답이 있을 때만 새 설치로 진행한다.

**완료 기준:** 위 항목마다 관찰값이 한 줄씩 적혀 있고, 「중단」 · 「진행 — 새 설치(현 트리 / worktree 후보)」 · 「재개 — N단계부터」 중 하나로 판정돼 있다.

## 1. 레포 분석 — 정적으로만

조사할 것:

- 스택·빌드 도구·모듈 배치(단일 레포 / 모노레포 / 짝 레포)
- 빌드·테스트 명령과 테스트 프레임워크. 테스트를 성격별로 센다: 순수 단위 / 로컬 컨테이너가 필요한 통합 / **공유 자원에 직접 붙는 것**
- **외부 자원이 어디를 향하는가** — 프로파일·설정 파일의 기본 datasource, 시작 스크립트의 환경변수, 테스트 코드에 하드코딩된 접속 문자열. 프로파일 이름으로 추정하지 않는다(「local」이 로컬을 가리킨다는 보장이 없다)
- CI 에서 테스트가 도는지, lint·format 도구와 포매터가 `.harness/` 를 건드리는지
- 기존 Claude 설정 — `.claude/` 의 agents·commands·skills·hooks, 레포 `CLAUDE.md` 의 커밋 규칙·trailer 규칙, 레포 안 플러그인 디렉토리와 마켓플레이스 파일
- 설정 파일을 덮어쓰는 setup 스크립트나 배달용 settings 사본

접속 정보·비밀번호는 위치(파일:행)만 적고 값은 옮기지 않는다.

**완료 기준:** [DECISIONS.md](DECISIONS.md) 의 질문마다 「근거(파일:행) 있음 / 근거 없음」과, 권장 규칙표에서 맞은 줄(또는 「맞는 줄 없음」)이 표시돼 있다.

## 2. 결정 질문 — 하나씩 묻는다

[DECISIONS.md](DECISIONS.md) 의 질문을 1단계 근거와 함께 하나씩 묻는다. 일괄 기본값을 제시하고 "이대로 갈까요" 로 묶지 않는다. 답이 다음 질문의 선택지를 바꾸는 순서(설치 위치 → 공유 자원 → unitTest 범위 → deny → 커밋 정책 → 플러그인 겹침)로 묻는다.

질문마다 DECISIONS.md 「권장」 절에 따라 권장을 계산해 첫 선택지에 「(권장)」과 근거 한 줄을 붙이고, 선택지마다 바뀌는 것을 한 줄씩 단다(꼴은 [TEMPLATES.md](TEMPLATES.md) §8). 질문 header 는 D 번호 없이 대상 + 동작 명사구(12자 이하, `테스트DB 볼륨삭제`)로, 질문 첫 문장은 대상과 할 일을 평이한 말로, 선택지 라벨은 그것만 읽어도 뜻이 통하게(`막지 않음` · `차단 (deny)`) 쓴다. 근거가 모자라면 「판단 근거 부족 — 직접 골라 주세요」로 묻는다. 사용자가 권장과 다르게 고르면 그대로 따른다.

답을 받을 때마다 체크포인트에 그 답, 답이 정하는 슬롯 값, 권장·근거·따름 여부를 적는다. 재개라면 체크포인트의 답을 보이고 확인만 받는다.

**완료 기준:** 모든 질문에 사용자 답이 있거나 「사용자가 미정으로 둠 → null」로 기록돼 있고, 체크포인트의 답과 같다. 체크포인트의 답마다 권장(또는 「근거 부족」)과 따름 여부가 있다. 내가 고른 값은 하나도 없다.

## 3. 게이트 설치 — 골격을 통째로 복사

> 지금은 **복사 방식**이다. 게이트가 harness-kit 플러그인으로 패키징되면 골격 복사(3번)는 사라진다.

1. harness-agent 원본을 정한다 — 사용자에게 로컬 클론 위치를 묻는다. 없으면 공개 저장소 `https://github.com/surahha-ha/harness-agent.git` 를 **임시 디렉토리**(대상 레포 밖)에 clone 한다.
2. 원본의 **커밋 SHA 를 기록한다**(`git -C <원본> rev-parse HEAD`, 미커밋 변경이 있으면 그 사실도) — 체크포인트에 먼저, 이어 6번의 config 머리 줄에. 보고와 커밋 메시지에도 넣는다.
3. `skeletons/` 를 `.harness/` 로 **통째로** 복사한다(`lib/`·`*.test.mjs` 포함). 같음은 줄끝을 무시하고 본다([CHECKS.md](CHECKS.md) §5).
4. `.gitignore` 에 `.harness/log.jsonl` · `.harness/promotions.jsonl` 두 줄을 넣는다(사본은 커밋, 로그는 커밋하지 않음). 포매터 대상이면 `.harness/` 를 제외 목록에 넣는다.
5. 레포 고유 보조 파일(빌드 도구용 init script 등)은 **`.harness/` 밖**(예: 빌드 디렉토리 아래)에 둔다.
6. 원본의 **최신** `harness.config.example.mjs` 를 `harness.config.mjs` 로 복사하고(옛 설치처 config 를 복사하면 새 슬롯이 빠진다), 첫 줄에 원본·SHA 머리 줄을 넣는다([TEMPLATES.md](TEMPLATES.md) §6).

**완료 기준:** `.harness/` 비교 출력 0줄 · `.harness/` 안에 원본에 없는 파일 0개 · `.gitignore` 두 줄 · config 첫 줄에 원본 SHA · `node .harness/danger-guard.mjs --status` 가 「설정됨 · 규칙 없음」(종료코드 1).

## 4. config 작성 — `harness.config.mjs`

3단계에서 만든 config(머리 줄 + example)를 2단계 답대로 채운다.

- 게이트 슬롯: `commands`(파이프 금지) · `approvals.destructive` · `dangerGuard.deny`/`ask`/`shared` · `dangerGuard.probe.token`(고유 문자열) · `docs.always` · `testFirst`·`qualityCycle.evidence`(2단계 결정대로, 기본은 끔·비움).
- harness-kit `project` 블록: 슬롯 정의는 harness-kit README 「프로젝트 프로필」이 SSOT 다. **kit 이 받는 값만** 쓴다 — 열거형 슬롯(`layout`·`data.schemaMgmt`·`git.commitExecution`·`git.push`)은 README 의 값 목록 밖이면 무효다.
- 정규식·명령 문자열은 Write/Edit 도구로 쓴다. 셸로 다루면 방금 만든 규칙에 자기가 걸린다.
- 근거 없는 칸은 `null` + 주석 「미확정 — 무엇을 확인하면 채운다」.

**완료 기준:** `node --check harness.config.mjs` 통과 · 머리 줄을 뺀 본문이 example 과 다름(CHECKS.md §5) · `--status` 가 「활성」(deny·ask·공유자원 중 1개 이상)이고 「프로브 설정됨」 · 비밀번호 0건 · 절대경로·사용자 홈 경로 0건 · 열거형 슬롯 값이 전부 README 목록 안.

## 5. settings.json 반영 — 직접 편집하고 기계 대조

4단계 완료 기준을 통과하고 체크포인트 `done` 에 4 가 적힌 뒤에만 시작한다.

1. 편집 전 `.claude/settings.json` 을 scratchpad 로 백업한다.
2. 훅 5개와 플러그인 키를 **Edit 로 직접** 넣는다(꼴은 [TEMPLATES.md](TEMPLATES.md) §1·§2). 같은 이벤트 키가 이미 있으면 그 배열에 항목을 더하고, 이벤트 키를 하나 더 만들지 않는다.
3. 이 PC 에 플러그인 설치 기록을 남긴다(사용자 확인 뒤): `claude plugin marketplace list` 로 마켓 등록을 보고, 없으면 `claude plugin marketplace add surahha-ha/harness-kit --scope project`, 이어서 `claude plugin install harness-kit@harness-kit --scope project`. 대상 트리에서 `claude plugin list` 가 harness-kit 을 「not installed」 없이 enabled 로 보이면 이 줄은 건너뛴다.
4. **CLI 실행 직후 백업(2번까지 반영된 판)과 대조한다.** CLI 는 settings.json 을 통째로 다시 써 키 순서를 바꾸고 다른 키 값을 지울 수 있다 — 달라졌으면 백업으로 되돌린다(설치 기록은 남는다).

**완료 기준:** JSON 파싱 OK · 이벤트 키 중복 0 · 하네스 훅 5개가 각 이벤트에 정확히 1번 · 기존 훅이 편집 전과 같은 수·같은 명령 · `git diff` 에 의도한 추가만 있음.

## 6. 정적 확인 — 실행 없이 판정

[CHECKS.md](CHECKS.md) 의 스크립트를 scratchpad 에 두고 돌린다(대상 레포에 파일을 만들지 않는다).

- `node --check` — `harness.config.mjs` 와 `.harness/**/*.mjs`
- settings.json — 파싱 · 이벤트 키 중복 0 · 각 훅 command 가 가리키는 파일 존재
- `.harness` 각 실행 파일의 `--status`(기대값 표는 CHECKS.md §2)
- deny/ask/shared 패턴 — `danger-guard.mjs` 의 `evaluate` 를 import 해 **통과 기대 / 차단 기대** 케이스 표로 판정한다. 케이스에는 레포 문서에 적힌 실제 명령 줄을 원문 그대로 넣는다.
- 답을 바꾼 흔적 — 주석↔값 · 규칙 중복 · example 기본값이 남은 슬롯 · 체크포인트 답↔config 값 · 권장과 다른 답 · 질문 형식(header·선택지 라벨)(CHECKS.md §6)

**완료 기준:** 모든 확인이 기대값과 같고, 케이스 표에 FAIL 0 · 차단 기대와 통과 기대가 규칙마다 1건 이상 · 흔적 점검의 항목마다 「고침 / 의도(근거)」가 적혀 있다.

## 7. 발동 확인 안내 — 사용자가 직접

설정이 맞아도 훅이 실제로 불리는지는 대화형 세션의 도구 호출로만 알 수 있다. [CHECKS.md](CHECKS.md) §3 의 안내문을 config 의 프로브 토큰을 **정확히** 넣어 사용자에게 건넨다. 헤드리스(`-p`)·`!` 직접 실행은 훅 경로를 타지 않아 거짓 음성이다.

**완료 기준:** 안내문이 사용자에게 전달됐고, 결과(성공 / 미확인)가 보고에 적혀 있다. 미확인이면 「미확인」으로 적는다.

## 8. 레포 지식 초안 — CLAUDE.md 「개발 하네스」 절

- [TEMPLATES.md](TEMPLATES.md) §4 꼴로 「개발 하네스」 절 초안을 만든다: 무엇이 막히고 무엇이 관찰만 되는가, 바뀐 테스트 명령, 상태 확인 명령, 첫 사용자 설치 절차.
- 레포 `CLAUDE.md`·커맨드·에이전트 문서에서 **새 deny 에 걸리게 된 명령 줄**(맨 테스트 명령, 출력 파이프)을 찾아 목록으로 보이고, 고칠지 묻는다. 서술 문서가 차단될 명령을 권하는 모순이 남지 않게 한다.

**완료 기준:** 초안이 반영됐거나 사용자가 보류했고, 걸리는 줄 목록의 각 줄에 「고침 / 그대로(사유)」가 표시돼 있다.

## 9. 커밋 — 경로 지정, 같은 명령에서 브랜치 조건

- 2단계에서 정한 커밋 정책대로 한다. 레포 규칙이 「커밋하지 않고 메시지만」이면 메시지만 건넨다.
- 신규 파일은 `git add -N -- <경로>` 먼저, 커밋은 `git commit -F <메시지파일> -- <경로…>` 로만 한다. 같은 명령 안에서 브랜치·toplevel 을 조건으로 건다(꼴은 [TEMPLATES.md](TEMPLATES.md) §5).
- 메시지는 레포 `git log` 관례(언어·접두어)를 따르고, 원본 SHA 를 본문에 넣는다. trailer 는 레포 규칙이 허용할 때만 넣는다.
- push·MR 은 실행 직전에 따로 확인받는다.

**완료 기준:** 커밋 직후 `git status --short` 에 설치 전부터 있던 변경만 남아 있고, `git show --stat HEAD` 의 파일 목록이 의도한 목록과 같다.

---

## 보고

마지막 응답에 담는다: 원본 SHA · 변경 파일 목록 · 결정별 답 표(「권장」 열 — 권장대로 / 권장과 다름 / 권장 없음) · `null` 로 둔 칸과 그 이유 · 6단계 결과 · 7단계 상태 · 사용자가 할 일(발동 확인, 첫 사용자 설치, 미정 결정).

보고를 건넨 뒤 체크포인트 파일을 지운다 — 원본 SHA 는 config 머리 줄에 남는다. 체크포인트가 남아 있으면 다음 0단계가 그 트리를 「중단된 설치」로 본다.
