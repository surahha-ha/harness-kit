---
name: harness-install
description: 지금 레포에 harness-agent 게이트(.harness/ 훅)와 harness-kit 플러그인(project scope)을 함께 설치한다 — 사전 확인 → 정적 분석 → 결정 질문(설치 범위 라이트·계측부터) → 골격 복사 → config → settings.json → 정적 확인 → 발동 확인 안내 → CLAUDE.md 절 → 선택 항목(graft 로컬 연결 · 전역 상태 줄, 기본 끔) → 영수증 · 경로 지정 커밋 → 문서 구조 질문. Triggers on "하네스 설치해줘", "이 레포에 하네스 적용", "harness-agent 설치", "harness-kit 설치", "하네스 설치 이어서". 끝난 설치의 업그레이드에는 쓰지 않는다 — 다시 설치하려면 harness-uninstall 뒤 새 세션에서.
---

# harness-install — 게이트와 플러그인을 한 번에, 결정은 하나씩

이 스킬이 레포에 넣는 것은 두 가지다.

1. **harness-agent 게이트** — `.harness/`(골격 사본) + `harness.config.mjs` + `.claude/settings.json` 의 훅(라이트 1개 · 계측 5개)
2. **harness-kit 플러그인** — `.claude/settings.json` 의 `enabledPlugins`·`extraKnownMarketplaces`(project scope)

선택 항목은 둘이다. 기본은 끔이고, 고르면 8-2단계에서 넣는다.

- **graft 로컬 연결**(D9) — 이 PC·이 트리 전용이다. 커밋되는 것은 `.gitignore` 한 줄뿐이다.
- **전역 상태 줄 합치기**(D10) — harness-kit 이 사용자 전역 `~/.claude` 에 쓰는 유일한 항목이다.

다른 레포의 고유 지식을 담은 **프로젝트 전용 플러그인은 설치하지 않는다.** 이 레포의 고유 지식은 레포 안(`CLAUDE.md`·`docs/`·`.claude/skills`)에 둔다.

**설치 범위는 둘이다**(D0, [DECISIONS.md](DECISIONS.md)). 골격 파일은 두 범위 모두 통째로 복사한다. 범위가 가르는 것은 아래 셋뿐이다(표는 `scripts/tiers.mjs`).

- settings.json 에 거는 훅
- config 에 채우는 칸
- CLAUDE.md 절의 판

범위마다 넣는 것:

- **라이트** — 권장
  - 실행 전 가드 훅 1개
  - 사고 근거가 있는 deny·ask · 공유 자원
  - 공유DB 테스트 제외 init script(필요할 때)
  - 짧은 「개발 하네스」 절 · 영수증 · harness-kit 켜기
- **계측 — 하네스 개발 설치처용** — 권장하지 않는다(마지막 선택지)
  - 지금까지의 전체 설치: 훅 5개 · 계측 로그·지표 · 증거 슬롯 · 전체 절

표준(그 사이)은 아직 없다 — 비교 창 판정 뒤에 정한다.

설치를 끝까지 지배하는 말 여섯 개:

- **정적**
  - 0~6단계는 읽기·`git` 조회·정적 판정만 한다.
  - 빌드·테스트·DB 접속·앱 기동은 하지 않는다.
  - 판정에 실행이 필요하면 사용자에게 넘긴다.
- **묻는다**
  - 결정은 근거와 함께 하나씩 묻는다([DECISIONS.md](DECISIONS.md)).
  - 권장은 1단계 관찰에서 계산해 표시할 뿐이다.
  - 고르는 것은 사용자다.
  - 다른 레포의 값이나 흔한 기본값으로 채우지 않는다.
  - 근거 없는 칸은 `null` 로 두고 보고에 적는다.
- **통째로**
  - 골격은 디렉토리째 복사한다.
  - 일부만 옮기면 정적 import 가 깨져 가드가 **조용히** 꺼진다.
- **반출**
  - 커밋되는 파일(config·settings·`CLAUDE.md`)에는 개인 경로·개인 설정·비밀번호를 넣지 않는다.
  - 사내 호스트·계정 이름 같은 레포 고유값은 이 레포의 config 안에만 둔다.
- **체크포인트**
  - 2단계부터 단계가 완료 기준을 통과할 때마다 체크포인트를 쓴다(2단계는 답 하나마다).
  - 자리: 대상 트리의 `git rev-parse --git-path harness-install-state.json` 파일
  - 내용: 완료 단계·결정 답·원본 SHA·만든 파일·고친 곳(꼴은 [TEMPLATES.md](TEMPLATES.md) §7)
  - git 디렉토리 안이라 커밋·`.harness/` 비교에 섞이지 않는다.
  - 세션이 끊겨도 다음 세션의 0단계가 이어받는다.
  - 단계를 서브에이전트에 맡겨도, 완료 기준을 확인하고 체크포인트를 쓰는 것은 메인이다.
- **영수증**
  - 기존 파일에 넣는 것은 시작·끝 표시로 감싼다(TEMPLATES.md §3·§4).
  - 9단계에서 만든 파일·고친 곳·훅·키를 레포 루트 `harness.install.json` 에 남긴다(TEMPLATES.md §9).
  - harness-uninstall 이 이 영수증을 기준으로 넣은 것만 걷어 낸다.

각 단계를 시작할 때 [PITFALLS.md](PITFALLS.md) 의 같은 번호 절을 먼저 읽는다. 실제 설치에서 터진 함정이 단계별로 모여 있다.

---

## 0. 사전 확인 — 이 트리에 지금 설치해도 되는가

확인할 것:

- `node "${CLAUDE_SKILL_DIR}/scripts/install.mjs" precheck <레포 루트>` — 아래 셋을 한 번에 낸다.
  - 이 세션 id 를 알면 `--self <id>` 를 붙인다.
  - **트리 종류** — 메인 트리인가, 이미 연결 worktree 인가(그렇다면 메인 트리 경로) · 현재 브랜치 · worktree 수
  - **설치 대상 파일**(`.claude/settings.json`·`settings.local.json`·`.gitignore`·`CLAUDE.md`)의 미커밋 변경 · stash 수
  - **같은 트리의 다른 Claude 세션** — `~/.claude/projects/<트리 경로 슬러그>/*.jsonl` 마다 아래를 본다.
    - **마지막 user·assistant 기록의 시각** — 이 세션 시작보다 앞인가 뒤인가(`동시`·`최근`·`오래됨`)
    - 마지막 기록 종류(사용자 중단·알림 등)
    - 파일 수정 시각은 쓰지 않는다(이유: PITFALLS §0).
    - 슬러그는 경로의 영숫자 아닌 글자를 `-` 로 바꾼 꼴이다.
    - 드라이브 문자 대소문자만 다른 둘은 같은 폴더로 본다.
- `git worktree list` · `git status --short`(설치 대상 밖 변경도 보고에 옮긴다)
- 기존 `.claude/settings.json`·`settings.local.json` 의 `hooks`(이벤트·matcher·명령)와 `enabledPlugins`
- 기존 게이트 — git 훅(`core.hooksPath`), 셸 래퍼, 플러그인 훅
  - 같은 위험을 이미 막는 가드가 있으면 그 축은 켜지 않는다(겹침).
- **설치 흔적 — 재개 판정**([CHECKS.md](CHECKS.md) §5)
  - 체크포인트 · 영수증(`harness.install.json`) · `.harness/`·`harness.config.mjs` 의 유무
  - config 가 example 그대로인가
  - HEAD 에는 있는데 작업본에서 지워졌는가
- 한글이 든 파일의 인코딩 표본(UTF-8 여부·BOM·줄끝), `.bat`/`.cmd` 의 비 ASCII 여부, `core.autocrlf`·`.gitattributes`

판정:

- **설치 위치**
  - precheck 의 `D1 관찰` 줄을 [DECISIONS.md](DECISIONS.md) D1 규칙표에 대어 권장을 정한다.
  - 2단계에서 묻는다.
  - 이 트리가 이미 연결 worktree 면 선택지 이름이 바뀐다(DECISIONS.md D1).
- **설치 흔적** — CHECKS.md §5 의 표로 가른다.
  - **중단된 설치** — 남은 상태(완료 단계·답)를 보이고 「재개 / 초기화」를 묻는다.
  - **끝난 설치** — 멈추고 보고한다(업그레이드는 범위 밖).
    - 다시 설치하려면 **`harness-uninstall` 로 걷어 낸 뒤 새 세션에서 이 스킬을 돌리라고** 안내한다.
    - 끝난 설치 위에 덮어 설치하지 않는다.
  - **끝난 설치의 범위를 바꾸려는 것** — 방향마다 다르다.
    - 계측 → 라이트: `harness-uninstall` 의 범위 낮추기(`scan --tier light`)를 쓴다.
    - 범위 낮추기는 범위 밖 훅 · 칸 · 안내절만 바꾸고 나머지는 남긴다.
    - 라이트 → 계측: 걷어 낸 뒤 새 세션에서 이 스킬을 계측으로 돌린다.
  - **HEAD 에 하네스가 있는데 작업본에서 지워졌으면** 멈추고 보고한다.
    - 그 뒤 「의도적 재설치인가」를 묻는다.
    - 그렇다는 답이 있을 때만 새 설치로 진행한다.

**완료 기준:**

- 위 항목마다 관찰값이 한 줄씩 적혀 있다.
- 판정이 셋 중 하나로 나 있다: 「중단」 · 「진행 — 새 설치(현 트리 / worktree 후보)」 · 「재개 — N단계부터」.

## 1. 레포 분석 — 정적으로만

조사할 것:

- 스택·빌드 도구·모듈 배치(단일 레포 / 모노레포 / 짝 레포)
- 빌드·테스트 명령과 테스트 프레임워크
  - 테스트를 성격별로 센다: 순수 단위 / 로컬 컨테이너가 필요한 통합 / **공유 자원에 직접 붙는 것**
- **외부 자원이 어디를 향하는가**
  - 프로파일·설정 파일의 기본 datasource, 시작 스크립트의 환경변수, 테스트 코드에 하드코딩된 접속 문자열을 본다.
  - 프로파일 이름으로 추정하지 않는다(「local」이 로컬을 가리킨다는 보장이 없다).
- CI 에서 테스트가 도는지, lint·format 도구와 포매터가 `.harness/` 를 건드리는지
- 기존 Claude 설정
  - `.claude/` 의 agents·commands·skills·hooks
  - 레포 `CLAUDE.md` 의 커밋 규칙·trailer 규칙
  - 레포 안 플러그인 디렉토리와 마켓플레이스 파일
- 설정 파일을 덮어쓰는 setup 스크립트나 배달용 settings 사본
- 앞선 걷어내기 백업에 남은 docs-setup 칸 — `node "${CLAUDE_SKILL_DIR}/../docs-setup/scripts/config-slots.mjs" backups <레포 루트>`(D8-2 의 근거, 읽기만 한다)

접속 정보·비밀번호는 위치(파일:행)만 적고 값은 옮기지 않는다.

**완료 기준:** [DECISIONS.md](DECISIONS.md) 의 질문마다 아래 둘이 표시돼 있다.

- 「근거(파일:행) 있음 / 근거 없음」
- 권장 규칙표에서 맞은 줄(또는 「맞는 줄 없음」)

## 2. 결정 질문 — 하나씩 묻는다

[DECISIONS.md](DECISIONS.md) 의 질문을 1단계 근거와 함께 하나씩 묻는다. 일괄 기본값을 제시하고 "이대로 갈까요" 로 묶지 않는다. 답이 다음 질문의 선택지를 바꾸는 순서로 묻는다.

묻는 순서:

1. **설치 범위(D0)**
2. 설치 위치(D1)
3. 공유 자원(D2 · 서버 기동 D2-2)
4. 단위 테스트 범위(D3)
5. **플러그인 겹침(D6 · 끄면 사라지는 가드 D6-2)**
6. 위험 명령(D4)
7. 커밋 정책(D5)
8. 나머지 칸(D7)
9. kit 이 읽는 칸(D8 · 문서 칸 되살리기 D8-2)
10. graft 사용(D9)
11. 전역 상태 줄(D10)

**D0 — 맨 앞에 묻는다.**

- 범위 표(무엇이 걸리고 무엇이 채워지나)를 질문 본문에 먼저 보인다.
- 라이트에 「(권장)」을 붙인다.
- 계측은 마지막 선택지로 두고 「하네스 개발 설치처용」이라 적는다.
- 답을 체크포인트 `tier` 에 적는다(TEMPLATES.md §7).
- 라이트면 DECISIONS.md D0 「뒤 질문」 표의 질문은 묻지 않는다.
- 그 칸은 범위대로 채우고 `auto: true` 와 이유를 남긴다.

**D9·D10**

- D9 를 묻기 전에 `node "${CLAUDE_SKILL_DIR}/../../scripts/graft-localize.mjs" check <레포 루트>` 로 사전 점검한다.
- 종료코드 3 이면 D9 를 묻지 않는다.
  - graft 가 없거나, 지금 Node 가 graft 의 `engines.node` 에 못 미친 것이다.
  - 출력의 설치 안내를 보고에 옮긴다.
- D9 는 권장을 계산하지 않는다.
  - 「(권장)」 없이 DECISIONS.md D9 의 안내 한 줄과 함께 묻는다.
  - 기본은 안 씀이다.
- D10 은 D9 가 「사용」일 때만 묻는다.
- D9·D10 은 범위(D0)와 따로인 선택 항목이다. 라이트·계측 모두 같게 묻는다.

**D6 을 D4 앞에 묻는다.**

- 플러그인을 끄면 그 플러그인이 막던 명령이 이 레포에서 무방비가 된다.
- D4 를 먼저 정하면 그 빈자리가 D4 후보에 들지 못한다(사고: PITFALLS §2).

**권장 표시와 질문 형식**

- 질문마다 DECISIONS.md 「권장」 절에 따라 권장을 계산한다.
- 권장 선택지를 첫 선택지로 두고 「(권장)」을 붙인다.
  - 그 설명 첫 줄에 권장 이유 한 줄을 단다.
- 선택지마다 바뀌는 것을 한 줄씩 단다.
- 권장할 근거가 없으면 질문에 「권장 없음 — 판단 근거 부족, 직접 골라 주세요」를 적는다.
  - 그때는 어느 선택지에도 「(권장)」을 붙이지 않는다.
- 질문 header 는 D 번호 없이 대상 + 동작 명사구로 쓴다.
  - 12자 이하로 쓴다.
  - 한 번에 묻는 질문끼리 겹치지 않게 짓는다.
- 질문 첫 문장은 **쉬운 말로 무엇이 일어나는지**를 먼저 쓴다.
  - 용어·명령·슬롯 이름은 괄호나 근거 줄로 보낸다(용어 풀이표는 [TEMPLATES.md](TEMPLATES.md) §8).
- 선택지 라벨은 그것만 읽어도 뜻이 통하게 쓴다(`막지 않음` · `차단 (deny)`).
- 사용자가 권장과 다르게 고르면 그대로 따른다.

사용자가 질문을 되묻거나 설명을 청하면, 그 용어를 풀이표에 대어 쉬운 말로 다시 묻는다. 풀이표에 없는 용어였으면 보고의 「질문 형식」 줄에 그 용어를 적는다 — 다음 판의 풀이표 후보다.

답을 받을 때마다 체크포인트에 그 답, 답이 정하는 슬롯 값, 권장·근거·따름 여부를 적는다. 재개라면 체크포인트의 답을 보이고 확인만 받는다.

**완료 기준:**

- 모든 질문에 사용자 답이 있거나 「사용자가 미정으로 둠 → null」로 기록돼 있다.
- 그 답이 체크포인트의 답과 같다.
- 체크포인트의 답마다 권장(또는 「근거 부족」)과 따름 여부가 있다.
- 내가 고른 값은 하나도 없다.

## 3. 게이트 설치 — 골격을 통째로 복사

> 지금은 **복사 방식**이다. 게이트가 harness-kit 플러그인으로 패키징되면 골격 복사(3번)는 사라진다.

1. harness-agent 원본을 정한다.
   - 사용자에게 로컬 클론 위치를 묻는다.
   - 없으면 공개 저장소 `https://github.com/surahha-ha/harness-agent.git` 를 **임시 디렉토리**(대상 레포 밖)에 clone 한다.
2. 원본의 **커밋 SHA 를 기록한다**(`git -C <원본> rev-parse HEAD`).
   - 미커밋 변경이 있으면 그 사실도 기록한다.
   - 체크포인트에 먼저 적고, 이어 6번의 config 머리 줄에 적는다.
   - 보고와 커밋 메시지에도 넣는다.
3. `skeletons/` 를 `.harness/` 로 **통째로** 복사한다(`lib/`·`*.test.mjs` 포함). 같음은 줄끝을 무시하고 본다([CHECKS.md](CHECKS.md) §5).
4. `.gitignore` 에 `.harness/log.jsonl` · `.harness/promotions.jsonl` 두 줄을 **시작·끝 표시로 감싸** 넣는다.
   - 사본은 커밋하고, 로그는 커밋하지 않는다(꼴은 [TEMPLATES.md](TEMPLATES.md) §3).
   - 포매터 대상이면 `.harness/` 를 제외 목록에 넣고, 그 줄도 표시로 감싼다.
   - 넣은 곳을 체크포인트 `edits` 에 적는다.
5. 레포 고유 보조 파일(빌드 도구용 init script 등)은 **`.harness/` 밖**(예: 빌드 디렉토리 아래)에 둔다.
   - 만들 때마다 체크포인트 `created` 에 경로와 용도(어느 config 명령이 쓰는가)를 적는다.
6. 원본의 **최신** `harness.config.example.mjs` 를 `harness.config.mjs` 로 복사한다.
   - 옛 설치처 config 를 복사하면 새 슬롯이 빠진다.
   - 첫 줄에 원본·SHA 머리 줄을 넣는다([TEMPLATES.md](TEMPLATES.md) §6).

**완료 기준:**

- `.harness/` 비교 출력 0줄
- `.harness/` 안에 원본에 없는 파일 0개
- `.gitignore` 두 줄이 표시 안에 있음
- config 첫 줄에 원본 SHA
- `node .harness/danger-guard.mjs --status` 가 「설정됨 · 규칙 없음」(종료코드 1)

## 4. config 작성 — `harness.config.mjs`

3단계에서 만든 config(머리 줄 + example)를 2단계 답대로 채운다.

- 게이트 슬롯: `commands`(파이프 금지) · `approvals.destructive` · `dangerGuard.deny`/`ask`/`shared` · `dangerGuard.probe.token`(고유 문자열) · `docs.always` · `testFirst`·`qualityCycle.evidence`(2단계 결정대로, 기본은 끔·비움).
- **harness-kit `project` 블록**
  - 슬롯 정의는 harness-kit README 「프로젝트 프로필」이 SSOT 다.
  - **kit 이 받는 값만** 쓴다.
  - 열거형 슬롯(`layout`·`data.schemaMgmt`·`git.commitExecution`·`git.push`)은 README 의 값 목록 밖이면 무효다.
- 정규식·명령 문자열은 Write/Edit 도구로 쓴다. 셸로 다루면 방금 만든 규칙에 자기가 걸린다.
- 근거 없는 칸은 `null` + 주석 「미확정 — 무엇을 확인하면 채운다」.
- **범위 밖 칸** — 라이트면 아래처럼 둔다.
  - 계측 칸(`testFirst.auditOnStop`·`qualityCycle.evidence`·`drift`·`metrics`·`promotion`·게이트 `docs.*`)은 example 기본값 그대로 둔다.
  - kit `project.docs`·`project.memory` 는 키를 넣지 않는다(TEMPLATES.md §4 「라이트 config 의 꼴」).
  - 키가 없는 그 칸은 10단계 문서 구조 질문이 채운다.
- **kit 자산이 읽는 칸은 비워 두지 않는다.**
  - 키가 없으면 그 자산이 멈추고 묻는다.
  - `null` 이면 그 단계를 말없이 건너뛴다.
  - 칸마다 DECISIONS.md D8 대로 묻거나 근거로 채운다.
  - `null` 로 두는 칸에는 **그 null 이 끄는 자산과 단계**를 주석에 적는다(사고: PITFALLS §4).
  - 예: `archiveDir: null, // 아카이브 폴더 없음 — archive-cycle ④ 레포 문서 이동이 건너뛴다. docs-setup 에서 정함`
- D8-2 답이 「되살림」·「골라 되살림」이면, 위 칸을 다 쓴 뒤 아래 명령을 돌린다.
  - `node "${CLAUDE_SKILL_DIR}/../docs-setup/scripts/config-slots.mjs" restore <레포 루트> --backup <백업> [--slots …]`
  - 이 명령은 `backups` 출력의 「되살리기:」 줄에 있다.
  - 스크립트가 표시 붙은 칸 줄만 바꾸거나 넣는다.
  - 스크립트는 import 해 값이 같은지 본 뒤, 아니면 원래 판으로 되돌린다.
  - 표시 줄은 Edit 로 손대지 않는다.

**완료 기준:**

- `node --check harness.config.mjs` 통과
- 머리 줄을 뺀 본문이 example 과 다름(CHECKS.md §5)
- `--status` 가 「활성」(deny·ask·공유자원 중 1개 이상)이고 「프로브 설정됨」
- 비밀번호 0건 · 절대경로·사용자 홈 경로 0건
- 열거형 슬롯 값이 전부 README 목록 안
- `node "${CLAUDE_SKILL_DIR}/scripts/install.mjs" slots <레포 루트>` 가 `failures=0`
  - kit 이 읽는 칸에 「없음」 0 · 주석에 꺼지는 자산이 없는 null 0
  - 범위는 체크포인트 `tier` 에서 읽는다.
  - 라이트의 문서·메모리 칸 「키 없음」은 `DEFER` 줄로 나오고 실패가 아니다.

## 5. settings.json 반영 — 직접 편집하고 기계 대조

4단계 완료 기준을 통과하고 체크포인트 `done` 에 4 가 적힌 뒤에만 시작한다.

`I=node "${CLAUDE_SKILL_DIR}/scripts/install.mjs"` 라 할 때:

1. 편집 전 판을 뜬다: `$I settings-snap <레포 루트> before`.
   - settings.json·settings.local.json 의 바이트와 줄끝(CRLF/LF)·BOM 이 `git rev-parse --git-path harness-install-settings/before/` 에 남는다.
   - 재개 때는 이미 있는 before 를 덮지 않는다.
2. D0 범위의 훅(라이트 1개 · 계측 5개)과 플러그인 키를 **Edit 로** 넣는다(꼴은 [TEMPLATES.md](TEMPLATES.md) §1·§2).
   - 같은 이벤트 키가 이미 있으면 그 배열에 항목을 더한다.
   - 이벤트 키를 하나 더 만들지 않는다.
   - **Write 로 파일을 통째로 다시 쓰지 않는다.**
   - Write 는 넘긴 문자열을 그대로 써서 CRLF 체크아웃의 파일이 LF 로 바뀐다(사고: PITFALLS §5).
3. 줄끝을 확인한다: `$I settings-eol <레포 루트>`.
   - 편집 전과 줄끝·BOM·끝 줄바꿈이 다르면 내용은 그대로 두고 그 바이트만 되돌린다.
   - `OK` 가 아니면 다음으로 가지 않는다.
4. 편집 뒤 판을 뜬다: `$I settings-snap <레포 루트> after-edit` — CLI 뒤 대조·복원의 기준이다.
5. 이 PC 에 플러그인 설치 기록을 남긴다(사용자 확인 뒤).
   - 대상 트리에서 `claude plugin list` 가 harness-kit 을 enabled 로 보이면 5·6번을 건너뛴다(「not installed」 없이).
   - `claude plugin marketplace list` 로 마켓 등록을 본다.
   - 없으면 `claude plugin marketplace add surahha-ha/harness-kit --scope project` 를 돌린다.
   - 이어서 `claude plugin install harness-kit@harness-kit --scope project` 를 돌린다.
6. **CLI 를 돌렸으면 바로** `$I after-cli <레포 루트>` 를 돌린다.
   - CLI 는 settings.json 을 통째로 다시 써 키 순서·줄끝을 바꾸고 다른 도구의 값을 지운다.
   - 스크립트가 after-edit 스냅숏과 대조한다.
   - 달라졌으면 스크립트가 CLI 판을 남긴 뒤 스냅숏 바이트로 되덮는다.
   - 그러면 넣은 훅·키, 원래 줄끝·BOM, CLI 가 지운 키가 함께 돌아온다(설치 기록은 남는다).
   - `WARN … CLI 가 더한 키` 가 나오면 그 키가 설치에 필요한지 본다.
   - 필요하면 Edit 로 다시 넣고 3·4번을 다시 한다.
7. 체크포인트 `edits` 에 아래를 적는다.
   - 넣은 훅 — 이벤트·matcher·명령, 이벤트 키를 새로 만들었는지
   - 넣은 키 — 경로·값, 부모 객체를 새로 만들었는지, 어느 결정인지
   - 5번의 설치 기록 — scope · 건너뜀 여부

**완료 기준:**

- JSON 파싱 OK · 이벤트 키 중복 0
- `$I hooks <레포 루트>` 가 `failures=0`
  - 그 범위의 하네스 훅이 각 이벤트에 정확히 1번
  - 범위 밖 훅 0
  - matcher 에 Bash·PowerShell
- 기존 훅이 편집 전과 같은 수·같은 명령
- `settings-eol` 이 `failures=0`(줄끝·BOM 이 편집 전과 같음)
- CLI 를 돌렸으면 `after-cli` 가 `failures=0`
- `git diff` 에 의도한 추가만 있음(autocrlf 트리에서도 줄 수로 본다)

## 6. 정적 확인 — 실행 없이 판정

[CHECKS.md](CHECKS.md) 의 스크립트를 scratchpad 에 두고 돌린다(대상 레포에 파일을 만들지 않는다).

- `node --check` — `harness.config.mjs` 와 `.harness/**/*.mjs`
- settings.json — 파싱 · 이벤트 키 중복 0 · 각 훅 command 가 가리키는 파일 존재
- `.harness` 각 실행 파일의 `--status`(기대값 표는 CHECKS.md §2)
- **deny/ask/shared 패턴** — `danger-guard.mjs` 의 `evaluate` 를 import 해 케이스 표로 판정한다.
  - 케이스는 **통과 기대 / 차단 기대** 로 나눈다.
  - 케이스에는 레포 문서에 적힌 실제 명령 줄을 원문 그대로 넣는다.
  - 차단 기대 케이스마다 스크립트가 **래퍼 변형**(`bash -c "…"` · `cmd /c` · `powershell -Command` 등)을 자동으로 만든다.
  - 스크립트가 그 변형이 같은 판정인지 본다.
  - 규칙마다 **도구 경로 변형**(`./gradlew`·`gradlew.bat`·`cd <하위> && …`·`npx …`)을 1건 이상 넣는다.
  - 규칙마다 **와일드카드**(`--tests '*'`·`'<패키지>.*'`·glob 경로)를 1건 이상 넣는다(CHECKS.md §4, 사고: PITFALLS §4).
- 테스트 제외 규칙(D3 의 init script·필터)이 있으면 `install.mjs test-select` 로 **무엇이 빠지는지**를 정적으로 펼친다.
  - 빼려던 것만 빠지는지 본다(CHECKS.md §8).
  - 「빼려던 것이 빠졌나」만 보면 제외가 넓은 것을 못 잡는다.
- kit 이 읽는 칸 — `install.mjs slots` 를 다시 돌려 4단계 뒤에 바뀐 칸이 없는지 본다.
- 훅 — `install.mjs hooks` 로 범위와 settings 훅이 맞는지 본다.
- **답을 바꾼 흔적**(CHECKS.md §6, 스크립트 `scripts/answer-trace.mjs`)
  - 볼 것: 주석↔값 · 규칙 중복 · example 기본값이 남은 슬롯 · 체크포인트 답↔config 값
  - 볼 것: 권장과 다른 답 · 질문 형식(header·선택지 라벨·권장 표시·쉬운 말)
  - 체크포인트에 `tier` 가 없으면 실패한다.
  - 라이트의 범위 밖 칸은 `SAME` 대신 `TIER`(의도)로 나온다.
  - 범위로 채운 답은 `AUTO` 로 나온다.

**완료 기준:**

- 모든 확인이 기대값과 같다.
- 케이스 표에 FAIL 0 · HOLE 0 — 남기는 구멍은 사용자 답과 함께 보고에 적는다.
- 차단 기대와 통과 기대가 규칙마다 1건 이상
- `test-select` 가 `failures=0`
- 흔적 점검의 항목마다 「고침 / 의도(근거)」가 적혀 있다.

## 7. 발동 확인 안내 — 사용자가 직접

설정이 맞아도 훅이 실제로 불리는지는 대화형 세션의 도구 호출로만 알 수 있다. [CHECKS.md](CHECKS.md) §3 의 안내문을 config 의 프로브 토큰을 **정확히** 넣어 사용자에게 건넨다. 라이트면 턴 종료 훅이 없으므로 §3 의 3번(턴 종료 기록 확인)은 건네지 않는다. 헤드리스(`-p`)·`!` 직접 실행은 훅 경로를 타지 않아 거짓 음성이다.

테스트 제외 규칙을 만들었으면 CHECKS.md §8 의 실행 확인 안내도 건넨다.

- 사용자가 판정용 테스트 명령을 돌린다.
- 그 뒤 `test-select --results` 로 **돌아야 할 테스트가 실제로 돌았는지** 본다.
- 빠져야 할 것이 안 돌았는지도 함께 본다.
- 실행 환경(로컬 컨테이너인가)은 안내문에 적고, 사용자가 확인한다.

**완료 기준:** 안내문이 사용자에게 전달됐고, 결과(성공 / 미확인)가 보고에 적혀 있다. 미확인이면 「미확인」으로 적는다. 제외 규칙이 있으면 `test-select --results` 결과도 같은 꼴로 적는다.

## 8. 레포 지식 초안 — CLAUDE.md 「개발 하네스」 절

- [TEMPLATES.md](TEMPLATES.md) §4 의 **D0 범위 판**(라이트 · 계측)으로 「개발 하네스」 절 초안을 만든다.
  - 담을 것: 무엇이 막히고 무엇이 관찰만 되는가 · 바뀐 테스트 명령 · 상태 확인 명령 · 첫 사용자 설치 절차
  - 절은 **시작·끝 표시로 감싼다**.
  - 절을 가리키는 라우팅 한 줄에는 한 줄 표시를 붙인다.
- **새 deny 에 걸리게 된 명령 줄**(맨 테스트 명령, 출력 파이프)을 찾는다.
  - 찾는 곳: 레포 `CLAUDE.md`·커맨드·에이전트 문서
  - 찾은 줄을 목록으로 보이고, 고칠지 묻는다.
  - 서술 문서가 차단될 명령을 권하는 모순이 남지 않게 한다.
  - 고친 줄마다 바꾸기 전·뒤 원문을 체크포인트 `edits` 에 `replace` 로 적는다.
  - 코드 블록 안이라 표시를 붙이지 않는 자리이기 때문이다.

- 고친 줄이 **레포 안 프로젝트 전용 플러그인 디렉토리**에 있으면 판 올림을 함께 묻는다.
  - 그 디렉토리는 그 레포가 스스로 배포하는 플러그인 — `.claude-plugin/plugin.json` 이 있는 곳이다.
  - 관례: 그 플러그인의 매니페스트에 `version` 이 있으면 **파일을 고친 커밋에서 version 을 올린다**.
  - 명령 줄·문구 고침은 patch, 자산 추가·절차 변경은 minor 를 올린다.
  - 마켓플레이스 파일에 같은 플러그인의 `version` 이 있으면 같은 값으로 함께 올린다.
  - 올리지 않으면 이미 설치한 사람은 옛 판을 계속 쓴다.
  - 매니페스트에 `version` 이 없으면(harness-kit 자신처럼 커밋 SHA 로 판을 가르는 플러그인) 올리지도 새로 넣지도 않는다.
  - 올린 줄은 바꾸기 전·뒤 원문을 체크포인트 `edits` 에 `replace` 로 적는다.

**완료 기준:**

- 초안이 반영됐거나 사용자가 보류했다.
- 걸리는 줄 목록의 각 줄에 「고침 / 그대로(사유)」가 표시돼 있다.
- 넣은 블록·줄과 고친 줄이 체크포인트 `edits` 에 빠짐없이 있다.
- 고친 줄이 version 있는 프로젝트 플러그인 안에 있으면, 그 version 이 올랐거나 「올리지 않음(사용자 답)」이 적혀 있다.

## 8-2. 선택 항목 — 전역 상태 줄(D10) → graft 로컬 연결(D9)

D9·D10 이 둘 다 「안 씀」(또는 건너뜀)이면 이 단계는 없다. `S=${CLAUDE_SKILL_DIR}/../../scripts` 라 할 때, 순서는 D10 먼저다. `localize --statusline` 이 D10 의 전역 영수증에서 명령을 읽기 때문이다.

1. **전역 상태 줄(D10 = 합치기 사용)** — `node "$S/statusline-setup.mjs" install` 을 돌린다.
   - 종료코드 3 이면 아무것도 쓰지 않은 것이다. 그때는 아래처럼 한다.
     - 이미 다른 합치기 스크립트를 가리키면, 출력의 명령을 보이고 D10 표대로 다시 묻는다.
     - 원래 명령을 기록할 셸로 돌려 보니 실패·빈 출력이면, 그 셸과 이유를 보이고 묻는다.
   - 출력의 백업·영수증 경로를 보고에 옮긴다.
2. **graft 준비(D9 = 사용)** — `node "$S/graft-localize.mjs" prepare <레포 루트>` 를 돌린다.
   - 스크립트가 하는 일:
     - graft 확인
     - Node 판 확인 — graft 설치본의 `engines.node` 와 지금 Node 를 견준다.
     - Node 판이 못 미치면 「Node <요구> 필요, 현재 <판>」으로 종료코드 3 이다.
     - Node 판을 못 읽으면 `WARN` 만 내고 진행한다.
     - init 전 스냅숏 — `settings.json`·`.mcp.json`·`.gitignore`·`.ignore`·`settings.local.json` 을 `git rev-parse --git-path harness-kit-graft/` 에 뜬다.
     - `.gitignore` 에 `/graft/` 표시 블록을 넣는다(TEMPLATES.md §3 꼴).
     - 그 블록이 그 파일의 몇 번째 블록인지 출력에 낸다.
   - 결과를 보고 할 일:
     - 그 블록을 체크포인트 `edits` 에 `block` 으로 적는다.
     - 종료코드 3 이면 graft 가 없거나 Node 판이 모자라다. 출력의 설치 안내만 보고에 옮기고 이 항목을 건너뛴다.
     - 설치 안내: `npm view @nanonets/graft engines` → `node --version` 과 비교 → 모자라면 Node 먼저 올린 뒤 `npm i -g @nanonets/graft`
     - 종료코드 1 이면(`settings.local.json` 이 추적 중) 멈추고 보고한다.
   - 이유 — `/graft/` 를 `.gitignore` 에 미리 넣는 까닭:
     - graft build 는 `.gitignore` 텍스트만 본다.
     - 그 줄이 없으면 **매 build(= 매 턴)** 표시 없이 덧붙인다.
     - `.git/info/exclude`·`core.excludesFile` 은 보지 않는다.
3. **graft 연결** — 레포 루트에서 `graft init . --no-agents --no-global --no-build -y` → `graft build .` 를 돌린다.
   - 기본값의 init 은 추적 파일(`AGENTS.md`·`.cursor/`)을 건드린다.
   - `--no-global` 없이는 사용자 홈의 다른 에이전트 설정에 쓴다.
4. **로컬 전용으로 옮기기** — `node "$S/graft-localize.mjs" localize <레포 루트>` 를 돌린다(D10 을 켰으면 `--statusline`). 스크립트가 하는 일:
   - graft 가 `settings.json` 에 넣은 것을 `settings.local.json` 으로 옮긴다.
     - 대상: graft 훅 · `subagentStatusLine` · graft `statusLine` · graft 권한 `Bash(graft:*)` 등 · `footerLinksRegexes`
     - 훅 timeout 은 초로 교정한다.
   - `settings.json` 을 init 전 바이트로 되돌린다.
   - `.mcp.json` 을 정리한다(init 전에 없었으면 로컬 전용 · 추적 파일이었으면 init 전 바이트로).
   - `settings.local.json` 에 `disabledMcpjsonServers: ["graft"]` 를 넣는다.
   - `git rev-parse --git-path info/exclude` 에 로컬 산출물 블록을 쓴다.
     - 대상: `/graft/` · `/.claude/helpers/graft-*.cjs` · `/.claude/skills/graft/` · 새로 생긴 `.mcp.json`·`.ignore`
     - 추적 중인 경로는 exclude 에 넣지 않는다.
   - 이벤트별 기계 대조가 어긋나면 아무 파일도 쓰지 않고 `failures=N` 으로 끝난다.
5. 체크포인트에 D9·D10 답과 영수증 `local` 초안(TEMPLATES.md §9)을 적는다.
6. Windows 안내를 보고에 적는다.
   - graft 가 띄우는 하위 프로세스의 콘솔 창을 숨기려고, graft 설치본(dist)을 고치는 개인 스크립트를 쓰는 PC 가 있다.
   - graft 를 업그레이드하면 그 고침은 사라진다.
   - 그래서 업그레이드 뒤 그 스크립트를 다시 돌린다.

graft 업그레이드 뒤에는 `node "$S/graft-localize.mjs" status <레포 루트>` 가 `settings.json` 에 다시 들어온 graft 몫을 알린다. 그때 `localize` 만 다시 돌린다(멱등). 이 안내를 보고에 남긴다. 커밋되는 CLAUDE.md 에는 적지 않는다(graft 는 이 PC 에만 있다).

**완료 기준:**

- D10 을 켰으면 `install` 이 `OK`(또는 「이미 설치」)
- D9 를 켰으면 `prepare`·`localize` 가 종료코드 0 이고, `localize` 끝 줄이 `failures=0`
- `git status --short` 에 이 단계가 더한 커밋 대상은 `.gitignore` 하나뿐
- `status` 가 `settings.json graft 몫: 0개`

## 9. 영수증과 커밋 — 경로 지정, 같은 명령에서 브랜치 조건

- 커밋 전에 **영수증**을 쓴다.
  1. 체크포인트의 원본·결정 답·`created`·`edits` 를 초안 JSON 으로 옮겨 scratchpad 에 Write 한다(꼴은 [TEMPLATES.md](TEMPLATES.md) §9).
  2. `node "${CLAUDE_SKILL_DIR}/scripts/write-manifest.mjs" <레포 루트> <초안> --example <example 사본>` 을 돌린다.
- example 사본은 CHECKS.md §5 ② 의 그 SHA 판이다.
  - 스크립트는 이 사본으로, 설치가 바꾼 칸마다 설치 전 값을 `config.slots` 에 적는다.
  - 그 값이 범위 낮추기가 칸을 되돌릴 기준이 된다.
- 초안의 `tier` 는 필수다.
- 스크립트가 하는 일:
  - 파일·블록·줄의 sha256 을 채운다.
  - 적힌 것이 실제로 있는지와 개인 경로가 없는지 대조한다.
  - 레포 루트에 `harness.install.json` 을 쓴다.
  - `FAIL` 이 있으면 영수증을 쓰지 않는다.
- 결과를 보고 할 일: `FAIL` 이 나면 초안이나 작업본을 고쳐 다시 돌린다.
- 8-2단계를 했으면 초안에 `local` 을 넣는다(D9 → `local.graft`, D10 → `local.statusline`, 꼴은 TEMPLATES.md §9).
  - 로컬 항목은 커밋되지 않아 해시를 채우지 않는다.
  - 경로는 상대경로 · `~/` · `git-path:` 꼴만 받는다.
  - `.gitignore` 의 `/graft/` 블록은 다른 블록처럼 `edits` 에 `block` 으로 적는다(파일 안 순서대로).
- D8-2 로 칸을 되살렸으면 영수증 뒤에 `node "${CLAUDE_SKILL_DIR}/../docs-setup/scripts/config-slots.mjs" record <레포 루트>` 를 돌린다.
  - 스크립트가 `owners["docs-setup"]` 에 그 칸을 적는다.
  - 설치 칸(`files`·`edits`·`settings`)은 건드리지 않는다.
- 영수증 뒤에 설치 파일을 고쳤으면 영수증을 다시 쓴다.
  - 영수증의 sha256 과 다른 파일은 harness-uninstall 이 「설치 뒤 손댄 파일」로 따로 묻는다.
- 2단계에서 정한 커밋 정책대로 한다.
  - 레포 규칙이 「커밋하지 않고 메시지만」이면 메시지만 건넨다.
  - 영수증도 커밋 대상이다.
- 신규 파일은 `git add -N -- <경로>` 를 먼저 한다.
- 커밋은 `git commit -F <메시지파일> -- <경로…>` 로만 한다.
  - 같은 명령 안에서 브랜치·toplevel 을 조건으로 건다(꼴은 [TEMPLATES.md](TEMPLATES.md) §5).
- 메시지는 레포 `git log` 관례(언어·접두어)를 따른다.
  - 원본 SHA 를 본문에 넣는다.
  - trailer 는 레포 규칙이 허용할 때만 넣는다.
- push·MR 은 실행 직전에 따로 확인받는다.

**완료 기준:**

- `write-manifest.mjs` 가 `OK` 로 끝났다(줄에 「범위 <라이트|계측>」 · config 칸 수).
- 영수증의 파일 수가 `.harness/`(런타임 산출물 제외)·config·보조 파일 수의 합과 같다.
- 커밋 직후 `git status --short` 에 설치 전부터 있던 변경만 남아 있다.
- `git show --stat HEAD` 의 파일 목록이 의도한 목록(영수증 포함)과 같다.

## 10. 문서 구조 맞추기 — docs-setup 으로 넘길까

9단계가 끝난 뒤 한 번 묻는다(두 범위 모두). 규칙표는 [DECISIONS.md](DECISIONS.md) 「10단계 질문」, 꼴은 [TEMPLATES.md](TEMPLATES.md) §8 이다.

- `node "${CLAUDE_SKILL_DIR}/scripts/install.mjs" docs-hookup <레포 루트>` 를 돌린다.
- 「관찰:」 줄을 근거로 삼는다.
- 「권장:」 · 「권장 이유:」 줄을 그대로 옮겨 header `문서구조 맞추기` 로 묻는다.
- 「권장: 묻지 않음」이면 묻지 않고, 보고에 그 이유를 적는다.

선택지:

- **진행** — 보고를 건넨 뒤 이 세션에서 docs-setup 스킬로 넘어간다.
  - 설치는 여기서 끝이다.
  - docs-setup 이 바꾸는 것은 그 스킬의 영수증 칸(`owners["docs-setup"]`)에 따로 적힌다.
- **나중에** — 아무것도 바꾸지 않는다. 보고의 다음 할 일에 「docs-setup — 나중에」를 적는다.

답과 권장·이유는 체크포인트 `docsHookup` 에 적는다(영수증에는 들지 않는다).

**완료 기준:** `docs-hookup` 의 관찰·권장·권장 이유가 보고에 있고, 질문을 했으면 답이 체크포인트에 있다.

---

## 보고

마지막 응답에 아래를 담는다.

- **설치 범위(라이트 / 계측)** · 원본 SHA · 변경 파일 목록 · 영수증 경로
- 결정별 답 표 — 「권장」 열은 권장대로 / 권장과 다름 / 권장 없음 / 범위로 정함 가운데 하나다.
  - D9 는 권장을 계산하지 않아 「—」로 적는다.
- `null` 로 둔 칸과 그 이유, **그 null 이 끄는 kit 자산**(`install.mjs slots` 의 목록)
- 라이트면 키 없이 둔 칸(`slots` 의 「키 없이 둔 칸」 목록)
- 10단계 문서 구조 질문의 답
- D6-2 에서 「막지 않음」으로 남긴 빈자리
- 6단계 결과(남긴 HOLE 포함) · 7단계 상태
- 8-2단계 결과(D9·D10)
  - graft 판 · 옮긴 graft 몫과 timeout 교정 · exclude 블록 · 전역 백업·영수증 경로
  - 또는 「graft 없음 — 건너뜀」·「Node 판 모자람 — 건너뜀」
- 사용자가 할 일 — 발동 확인, 제외 규칙 실행 확인, 첫 사용자 설치, 미정 결정, graft 업그레이드 뒤 `localize` 재실행

보고를 건넨 뒤 체크포인트 파일을 지운다 — 원본 SHA 는 config 머리 줄에 남는다. 체크포인트가 남아 있으면 다음 0단계가 그 트리를 「중단된 설치」로 본다.
