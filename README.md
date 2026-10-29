# harness-kit

프로젝트에 묶이지 않는 **공용 Claude Code 플러그인**과 그 마켓플레이스다. 이 플러그인은 세 가지를 한다.

- 여러 계층·여러 레포에 걸친 작업을 지휘한다.
- 구현·테스트·검증을 역할별 에이전트에 나눠 맡긴다.
- 팀 전체가 판정 규율을 같은 방식으로 따르게 한다.
  - 규율: 파이프로 종료코드 가리지 않기 · baseline 실측 · 단언 강도 유지 · 파괴적 적용 별도 승인

자산 본문에는 **프로젝트 고유값이 없다.**
경로·명령·브랜치·위험 지점은 각 프로젝트 레포의 `harness.config.mjs` `project` 블록(아래 「프로젝트 프로필」)에서 읽는다.
값이 없으면 지어내지 않고 사용자에게 묻는다.

## 구성

스킬 10 · 에이전트 6 · 커맨드 2 · 훅 0

| 종류 | 이름 | 언제 쓰나 |
| - | - | - |
| 스킬 | `coordinator` | 아래 조건 셋 중 둘 이상이면 코드보다 먼저 |
| 스킬 | `fe-be-trace` | "어디서 조회/호출돼?" — FE·BE 를 함께 추적 |
| 스킬 | `qa-cycle` | 명세 확정 → 구현 → 단위/회귀 → e2e → UI 정합성 → 완성도 리포트 |
| 스킬 | `archive-cycle` | 쌓인 메모리·문서를 계측 → 판정 → 이관 → 연표 접기 → 검증 |
| 스킬 | `ui-ux-guide` | 화면·문구·인터랙션을 만들거나 고칠 때 6단계 + 7원칙 + 체크리스트 |
| 스킬 | `data-migration` | 데이터가 있는 DB 의 스키마 이행 · 타 서비스 ETL |
| 스킬 | `plugin-sync` | 플러그인(이 플러그인 또는 프로젝트 오버레이) 최신화 사이클 — 명시 호출 전용 |
| 스킬 | `harness-install` | "하네스 설치해줘" — harness-agent 게이트와 이 플러그인을 함께 설치(아래 세부) |
| 스킬 | `harness-uninstall` | "하네스 제거해줘" · "하네스 재설치" — harness-install 이 넣은 것만 걷어 냄(아래 세부) |
| 스킬 | `docs-setup` | "문서 구조 잡아줘" — 문서 구조를 세우고 끝난 문서를 옮김(아래 세부) |
| 에이전트 | `backend-engineer` | BE 구현 위임 기본 대상 |
| 에이전트 | `frontend-engineer` | FE 구현 · BE→FE 계약 동기화 |
| 에이전트 | `unit-test-engineer` | 테스트 작성/유지 |
| 에이전트 | `change-verifier` | 빌드·lint·스위트 실행 · diff 리뷰 · baseline 실측 · 그린/레드 판정 |
| 에이전트 | `data-migration-engineer` | `data-migration` 절차 실행 |
| 에이전트 | `plugin-curator` | 플러그인 드리프트 감사(읽기 전용) |
| 커맨드 | `/harness-kit:save` | 테스트 → 커밋 → 푸시 |
| 커맨드 | `/harness-kit:review-pending` | 리뷰를 거치지 않은 커밋을 커밋 하나씩 사후리뷰 → 결과를 git notes 에 기록(아래 세부) |

에이전트를 부를 때는 `harness-kit:<이름>` 으로 부른다(예: `subagent_type="harness-kit:change-verifier"`).

**`coordinator` 를 먼저 여는 조건** — 셋 중 둘 이상이면 코드보다 먼저 연다.

- ① 둘 이상의 레포 또는 계층(BE·FE)
- ② 계약 변경(API·스키마·마이그레이션)
- ③ 검증 두 종류 이상

**`harness-install`** — "하네스 설치해줘"

- 지금 레포에 harness-agent 게이트(`.harness/` 훅)와 이 플러그인(project scope)을 함께 설치한다.
- 결정은 하나씩 묻는다.
- 선택 항목(기본 끔): graft 로컬 연결 · 전역 상태 줄 합치기
- 끝에 영수증 `harness.install.json` 을 남긴다.

**`harness-uninstall`** — "하네스 제거해줘" · "하네스 재설치"

- harness-install 이 넣은 것만 블록·키 단위로 걷어 낸다.
- 영수증이 있으면 영수증 기준으로 후보를 뽑는다. 없으면 알려진 구조로 뽑는다.
- 후보는 항목마다 확인한다.
- 재설치는 이 스킬 → 새 세션 → `harness-install`

**`docs-setup`** — "문서 구조 잡아줘"

- 아카이브 폴더·성격표·`CLAUDE.md` 라우팅·문서 규약 표를 세운다.
- 끝난 문서를 배너와 함께 옮긴다.
- `project.docs.*`·`memory.slugs` 를 채워 `archive-cycle` 이 바로 돌게 한다.
- 메모리 규약을 `CLAUDE.md` 에 넣는다.
- 설치된 레포에도 다시 돌릴 수 있다. 설치 단계와 무관하게 돈다.
- 채운 config 칸에 `// harness-kit:docs-setup` 표시를 단다. 그래서 걷어내기·재설치 뒤에도 되살린다.

**`/harness-kit:review-pending`** — "리뷰 안 된 커밋 리뷰해줘"

- 대상: 범위 안의 병합 아닌 커밋 가운데 리뷰 기록이 없는 것. 기본 범위는 통합 브랜치(`review.integrationBranch`)에 아직 없는 커밋이다.
- `git.reviewThreshold` 가 있으면 그 임계를 넘은 커밋만 고른다. save 의 diff 리뷰 게이트와 같은 판정이다. `null` 이면 모두 고른다.
- 커밋마다 `change-verifier` 「커밋 리뷰 모드」가 diff 만 보고 리뷰한다. 커밋 메시지는 넘기지 않는다.
- 결과(pass·fail)는 `refs/notes/<review.notesRef>` 에 남긴다. 코드는 고치지 않는다. 원격에 올리기는 묻고 나서, 강제 없이 한다.
- save 가 리뷰를 발견 없이 통과시킨 커밋에는 save 가 pass 기록을 남긴다. 그래서 그 커밋은 목록에 다시 나오지 않는다.
- **라이트 범위에서 돈다.** 하네스의 관찰 훅·계측 로그를 읽지 않는다. 읽는 것은 git 과 config 뿐이다.
- 보조 스크립트: `plugins/harness-kit/scripts/review-pending.mjs`(`config` · `unreviewed` · `note`)
- 리뷰 기록 ref 와 fetch refspec 은 사용자 데이터다. `harness-uninstall` 은 지우지 않고 지우는 명령만 보고에 적는다.

### 훅은 두지 않는다

이 플러그인에는 `hooks/` 가 없다.
위험 명령 가드 · test-first 가드 · 미러 드리프트 감시 같은 **실행 게이트는 harness-agent 의 몫**이다. 각 프로젝트에 harness-agent 골격을 설치해 쓴다.
이유: 플러그인 훅은 설치 범위(user 범위면 모든 프로젝트)에서 발화한다. 공용 플러그인이 훅을 가지면 그 훅을 전제하지 않은 프로젝트에서도 돌게 된다.

`harness-install` 의 선택 항목 「graft 사용」(D9)이 넣는 graft 훅도 플러그인 훅이 아니다. 그 훅은 그 레포의 `.claude/settings.local.json`(커밋되지 않음)에만 들어간다.

graft(전역 npm `@nanonets/graft`)는 Node 판 조건(`engines.node`)이 있다. 예: 조사 판 0.12.1 기준 `>=20`.
깔기 전 확인과 설치 순서는 다음과 같다.

1. `npm view @nanonets/graft engines` 로 요구 판을 본다.
2. `node --version` 과 비교한다.
3. 모자라면 Node 를 먼저 올린다.
4. `npm i -g @nanonets/graft` 로 깐다.

이미 깔려 있어도 지금 Node 가 그 조건에 못 미치면 `harness-install` 은 graft 항목을 건너뛴다.

### 사용자 전역에 쓰는 것 — 상태 줄 하나뿐

harness-kit 은 레포 안에만 쓴다. 예외가 하나 있다: `harness-install` 의 선택 항목 「전역 상태 줄」(D10, 기본 끔)이다.
이 항목을 고르면 `~/.claude/settings.json` 의 `statusLine.command` 를 합치기 스크립트로 바꾼다.
합치기 스크립트는 `~/.claude/harness-kit/statusline-combined.cjs` 다. 원래 명령의 출력에, 그 레포에 graft 상태 줄 헬퍼가 있으면 그 출력을 더한다.

- **왜 전역인가**
  - 플러그인은 상태 줄을 줄 수 없다.
  - 플러그인 settings 에서 효력이 있는 키는 `agent`·`subagentStatusLine` 뿐이다(공식 plugins manifest-reference 「settings」).
  - 상태 줄은 세션에 하나다. 원래 줄과 graft 줄을 함께 보이려면 그 명령을 바꿔야 한다.
- **바꾸기 전에 남기는 것**
  - 전역 settings.json 을 `~/.claude/harness-kit/backup/` 에 백업한다.
  - 원래 명령은 `~/.claude/harness-kit/statusline.json` 의 `base` 로 남긴다.
  - 그 명령을 돌릴 셸은 설치 때 한 번 정한다. 같은 파일의 `shell` 에 절대경로로 남긴다.
    - Windows 순서: `CLAUDE_CODE_GIT_BASH_PATH` → git 옆 `bin\bash.exe` → PowerShell
  - 바꾼 기록은 `~/.claude/harness-kit/receipt.json` 에 남긴다. 레포 영수증과 따로다.
- **멈추는 경우** — 아무것도 쓰지 않고 묻는다.
  - 이미 다른 합치기 스크립트를 가리킨다.
  - 원래 명령을 그 셸로 한 번 돌려 종료 0 + 출력이 나오지 않는다.
- **실행 중 실패** — 원래 명령이 실패하면 그 자리에 `statusline base 실패(exit N)` 한 줄이 나온다.
- **되돌리기**
  - `harness-uninstall` 이 레포 걷어내기와 따로 묻는다.
  - 지금 값이 harness-kit 이 쓴 값과 같을 때만 원래 값으로 되돌린다(`plugins/harness-kit/scripts/statusline-setup.mjs restore`).
  - 되돌리는 것은 전역 `statusLine` 값뿐이다.
  - `~/.claude/harness-kit/` 의 사본·`statusline.json` 은 남는다. graft 를 쓰는 레포의 `settings.local.json` 상태 줄이 그 사본을 계속 쓰기 때문이다.
  - 지우려면 각 레포에서 graft 연결을 걷어 낸 뒤 손으로 지운다.

### graft 를 업그레이드한 뒤

「graft 사용」으로 설치한 레포는 graft 가 넣은 설정을 `.claude/settings.local.json` 으로 옮겨 둔다.
graft 는 판이 바뀐 첫 세션 시작에 연결을 다시 쓴다. 이때 커밋되는 `.claude/settings.json` 에 graft 키(훅 · 상태 줄 등)를 다시 넣는다.
그때 그 레포에서 아래 명령을 한 번 다시 돌린다. 같은 결과가 된다(멱등):

```
node <harness-kit 플러그인>/scripts/graft-localize.mjs status   <레포 루트>   # settings.json 에 graft 몫이 다시 들어왔는가
node <harness-kit 플러그인>/scripts/graft-localize.mjs localize <레포 루트>   # 전역 상태 줄을 합쳤으면 --statusline
```

### 우선순위

좁은 쪽이 이긴다: **디렉토리 `CLAUDE.md` > 레포 문서·`CLAUDE.md` > 프로젝트 오버레이 플러그인 > harness-kit.**
프로젝트 고유 절차(스키마 산출물, DB 명명 표준, 테스트케이스 양식 등)는 프로젝트 오버레이 플러그인이나 레포 `.claude/` 에 두고, `project.agents`·`project.data.*` 슬롯으로 연결한다.

## 설치

### 개인

```
/plugin marketplace add surahha-ha/harness-kit
/plugin install harness-kit@harness-kit
```

### 팀 (프로젝트 범위)

프로젝트 레포 `.claude/settings.json` 에 마켓플레이스와 활성화를 적는다.

```json
{
  "extraKnownMarketplaces": {
    "harness-kit": {
      "source": { "source": "github", "repo": "surahha-ha/harness-kit" }
    }
  },
  "enabledPlugins": {
    "harness-kit@harness-kit": true
  }
}
```

- 팀원은 각자 한 번 설치해야 한다: `claude plugin install harness-kit@harness-kit --scope project`
- 이 저장소는 **비공개**다. 팀원마다 GitHub git 자격증명이 있어야 마켓플레이스를 받을 수 있다: `gh auth setup-git`
- 스킬·에이전트가 프로젝트 값을 읽으려면 두 조건이 필요하다. 없으면 절차만 안내하고 값을 묻는다.
  - 레포 안에 harness-agent 가 설치돼 있다.
  - `harness.config.mjs` 에 `project` 블록이 채워져 있다.

### 업데이트

- `plugin.json`·`marketplace.json` 에 **`version` 필드를 두지 않는다.**
  - 설치본은 main 의 커밋 SHA 로 판을 가른다. main 에 새 커밋이 들어가면 그것이 곧 새 판이다.
  - 버전 범프는 하지 않는다. `claude plugin validate` 의 version 없음 경고 1건은 의도된 것이다.
- autoUpdate 가 켜진 PC 는 **새 세션을 열 때**(또는 `/reload-plugins`) 새 판을 받는다. 켜지 않았다면 손으로: `/plugin marketplace update harness-kit` → `/reload-plugins`
- autoUpdate 는 **사용자 범위**에서 켠다(`~/.claude/plugins/known_marketplaces.json` 의 이 마켓플레이스 항목).
  - 이유: `/plugin` UI 의 autoUpdate 토글은 레포의 `.claude/settings.json` 에 키를 쓸 수 있다.
  - 그러면 켜기만 했는데 레포 파일이 바뀐다.
- main 병합은 곧 배포다. autoUpdate 가 켜진 곳에 바로 퍼진다. 그래서 시험을 통과한 브랜치만 병합한다.
- 사용 범위를 팀으로 넓혀 판을 고정하거나 되돌릴 필요가 생기면, 명시 버전(`version` 필드 + 범프 규칙)으로 바꾸는 것을 검토한다.

## 프로젝트 프로필

스킬·에이전트·커맨드는 프로젝트 레포 루트 `harness.config.mjs` 의 `project` 블록을 읽는다. harness-agent 가 이미 정의한 `project.name`·`project.repos` 옆에 아래 슬롯을 더한다. harness-agent 코드는 이 슬롯을 읽지 않는다. 읽는 쪽은 이 플러그인뿐이다.

### 읽기 규칙

1. **평범한 객체 리터럴로만 쓴다.** 계산식·import·함수 호출 금지. 에이전트가 파일을 그대로 읽어 해석한다.
2. **값 또는 경로만 둔다.**
   - 산문 규칙(계약 규율, UI 금지 패턴, BE 컨벤션)은 레포 `docs/` 에 둔다.
   - 슬롯은 그 문서 경로를 가리킨다.
3. **짝 레포는 공통값을 주 레포에만 둔다.**
   - 짝 레포 config 는 `pairOwner` 로 주 레포를 가리킨다.
   - 자산은 자기 config → 주 레포 config 순으로 읽는다.
   - 같은 값을 두 레포에 적지 않는다.
4. **빈칸과 `null` 은 다르다.**
   - 키가 없으면 "아직 안 정함"이다. 자산은 멈추고 묻는다.
   - `null` 이면 "해당 없음으로 판단함"이다. 자산은 그 단계를 건너뛰고 보고에 적는다.
5. **기본값을 지어내지 않는다.** 자산은 다른 프로젝트의 값이나 흔한 기본값(`npm test`, `main` 등)으로 빈칸을 채우지 않는다.
6. 단일 레포에서 `project.commands` 가 없으면 harness 최상위 `commands` 를 읽는다(같은 값을 두 번 적지 않기 위해).
7. 경로는 레포 기준 **상대경로**로 적는다. 절대경로·사용자 홈 경로를 넣지 않는다.

### 슬롯

| 키 | 내용 | 읽는 자산 |
| - | - | - |
| `layout` | `'single'` \| `'paired'` — 한 레포인가, BE·FE 가 짝 레포로 나뉘었나 | coordinator · save · backend/frontend |
| `pairOwner` | 짝 레포 쪽에서만: 주 레포 상대경로. 주 레포는 `null` | 전부(읽기 순서) |
| `repos.peers` | (harness 기존 슬롯) 짝 레포 `{ name, path, detect }` | coordinator · save · plugin-curator |
| `sides.be` · `sides.fe` | `root`(상대경로) · `marker`(판별 파일) · `stack` · `persistence`(BE) · `conventionsDoc` · `uiTipsDoc`(FE) | 에이전트 · fe-be-trace · save |
| `commands.be` | `build` · `compile` · `testAll` · `testOne` · `run` — 명령 문자열, **파이프 금지** | 에이전트 · qa-cycle · save |
| `commands.fe` | `dev` · `devMock` · `build` · `lint` · `testAll` · `testOne` · `e2e` — 같은 형식 | 에이전트 · qa-cycle · ui-ux-guide · save |
| `e2e.modeSwitch` | mock/실서버 전환 스위치의 위치 | qa-cycle · unit-test-engineer |
| `contract` | `beGlobs`(계약 DTO·Controller glob) · `feDirs`(api·store) · `feMocks` · `rulesDoc`(계약 규율 문서) · `dataSourceRule`(데이터 소스 판별 문서) | coordinator · fe-be-trace · save · 에이전트 |
| `data` | `schemaMgmt`(`'flyway'` \| `'liquibase'` \| `'init-sql'`) · `schemaHome` · `schemaProcedureSkill` · `migrationOverlaySkill` · `namingPlanDoc` | data-migration · coordinator |
| `risk` | `sharedDbSuites` · `sharedDbProfiles` · `devServer` · `destructive` — 표 아래 「`risk` 하위 키」 | change-verifier · unit-test-engineer · save · data-migration |
| `docs` | `domainIndex` · `screenMap` · `repoMap` · `testGuide` · `uiUxRules` · `archiveDir` · `pathValidator` · `autoloaded`(자동 로드 `CLAUDE.md` 목록) | 여러 자산 · `archiveDir`·`pathValidator`·`autoloaded` 는 docs-setup 이 채운다 |
| `git` | `protectedBranches` · `commitFormat`(한 문장) · `commitExecution`(`'auto'` \| `'message-only'`) · `push`(`'auto'` \| `'ask'` \| `'never'`) · `coAuthor`(trailer 허용 여부) · `reviewThreshold`(`{ files, lines }`) | save · frontend-engineer · plugin-sync·archive-cycle(`commitExecution`) · review-pending(`reviewThreshold`·`push`) |
| `review` | `notesRef` · `integrationBranch` · `remote` · `batchAsk` — 표 아래 「`review` 하위 키」. 임계는 `git.reviewThreshold` 를 같이 쓴다 | review-pending · save(`notesRef`) |
| `agents` | 역할 → 에이전트 이름 덮어쓰기. 역할: `schemaDesign` · `schemaApply` · `migration` · `backend` · `frontend` · `testAuthor` · `verifier` | coordinator · 에이전트 |
| `memory` | `slugs`(`~/.claude/projects/` 아래 메모리 디렉토리 이름) · `policy`(백로그를 어디에 남기나 — 한 문장) | archive-cycle · qa-cycle · docs-setup(채움) |
| `plugin` | 플러그인 정본 레포에서만: `canonicalRepo` · `canonicalBranch` · `dir` · `marketplaceFile` · `readme` · `mirrorScript` · `hookTests` · `auditSources` | plugin-sync · plugin-curator |

**`risk` 하위 키**

- `sharedDbSuites` — 공유 DB 에 실접속하는 테스트
- `sharedDbProfiles` — 공유 DB 를 향하는 프로파일·설정 파일 **이름**
- `devServer` — 기본 프록시가 원격을 향하는가(한 문장)
- `destructive` — 승인 필요 명령

**`review` 하위 키** — 사후리뷰(`/harness-kit:review-pending`) 설정. 라이트 칸이다(관찰 훅 없이 돈다).

- `notesRef` — 리뷰 기록 ref 이름. 기록은 `refs/notes/<값>` 에, 원격에서 받은 기록은 `refs/notes/<값>-<remote>` 에 둔다. 설치 기본값 `'harness-review'`. `null` 이면 사후리뷰가 꺼진다(save 도 기록하지 않는다)
- `integrationBranch` — 작업 브랜치를 합쳐 넣는 브랜치. 기본 범위가 `HEAD --not <remote>/<값>` 이다. `null` 이면 `@{upstream}..HEAD` 로 간다
- `remote` — 리뷰 기록을 받고 올리는 원격. 설치 기본값 `'origin'`. 원격이 없는 레포면 `null` — 받기·올리기를 건너뛰고, 통합 브랜치를 로컬 브랜치로 본다
- `batchAsk` — 대상이 이 수보다 많으면 리뷰 전에 묻는다. 설치 기본값 `5`. `null` 이면 묻지 않는다

`agents` 기본값: `migration` = `harness-kit:data-migration-engineer`, `backend` = `harness-kit:backend-engineer`, `frontend` = `harness-kit:frontend-engineer`, `testAuthor` = `harness-kit:unit-test-engineer`, `verifier` = `harness-kit:change-verifier`. `schemaDesign`·`schemaApply` 는 기본값이 없다 — 프로젝트 오버레이가 제공한다.

### 예시 (가상 값)

주 레포 `orders-api/harness.config.mjs`:

```js
export default {
  project: {
    // ── harness-agent 기존 슬롯 ──
    name: 'orders',
    repos: {
      self: '.',
      peers: [{ name: 'orders-web', path: '../orders-web', detect: 'package.json' }],
    },

    // ── harness-kit 슬롯 ──
    layout: 'paired',
    pairOwner: null,
    sides: {
      be: { root: '.', marker: 'build.gradle.kts', stack: 'spring-boot', persistence: 'mybatis',
            conventionsDoc: 'docs/rules/backend.md' },
      fe: { root: '../orders-web', marker: 'package.json', stack: 'vue3 + vite',
            conventionsDoc: '../orders-web/docs/rules/frontend.md', uiTipsDoc: null },
    },
    commands: {
      be: { build: './gradlew build', compile: './gradlew compileJava', testAll: './gradlew test',
            testOne: './gradlew test --tests "{class}"', run: './gradlew bootRun' },
      fe: { dev: 'npm run dev', devMock: 'npm run dev:mock', build: 'npm run build', lint: 'npm run lint',
            testAll: 'npx vitest run', testOne: 'npx vitest run {path}', e2e: 'npm run test:e2e' },
    },
    e2e: { modeSwitch: '../orders-web/playwright.config.ts' },
    contract: {
      beGlobs: ['src/main/java/**/*Request.java', 'src/main/java/**/*Response.java', 'src/main/java/**/*Controller.java'],
      feDirs: ['../orders-web/src/api', '../orders-web/src/stores'],
      feMocks: '../orders-web/src/mocks',
      rulesDoc: 'docs/rules/api-contract.md',
      dataSourceRule: null,
    },
    data: {
      schemaMgmt: 'flyway',
      schemaHome: 'src/main/resources/db/migration',
      schemaProcedureSkill: 'orders:schema-change',
      migrationOverlaySkill: null,
      namingPlanDoc: null,
    },
    risk: {
      sharedDbSuites: ['OrdersApplicationTests'],
      sharedDbProfiles: ['local'],
      devServer: null,
      destructive: ['docker compose down -v'],
    },
    docs: {
      domainIndex: 'docs/domain/README.md',
      screenMap: '../orders-web/docs/screen-map.md',
      repoMap: null,
      testGuide: 'docs/testing.md',
      uiUxRules: '../orders-web/docs/rules/ui-ux.md',
      archiveDir: 'docs/archive',
      pathValidator: null,
      autoloaded: ['CLAUDE.md'],
    },
    git: {
      protectedBranches: ['main'],
      commitFormat: 'Conventional Commits, 영어 제목 한 줄 + 본문 불릿',
      commitExecution: 'auto',
      push: 'ask',
      coAuthor: false,
      reviewThreshold: { files: 3, lines: 100 },
    },
    review: { notesRef: 'harness-review', integrationBranch: 'main', remote: 'origin', batchAsk: 5 },
    agents: { schemaDesign: 'orders:db-architect', schemaApply: null },
    memory: { slugs: ['<orders-api 메모리 디렉토리>'], policy: '백로그는 docs/plans/backlog.md 에 추가' },
    plugin: null,
  },
  // … harness-agent 의 나머지 슬롯(dangerGuard · testFirst · drift …)
};
```

짝 레포 `orders-web/harness.config.mjs` 는 자기 값만 두고 공통값은 주 레포를 가리킨다:

```js
export default {
  project: {
    name: 'orders-web',
    repos: { self: '.', peers: [{ name: 'orders-api', path: '../orders-api', detect: 'build.gradle.kts' }] },
    pairOwner: '../orders-api',
  },
};
```

## 금칙어 스캔

이 저장소는 외부 공개 호스팅 대상이라 **프로젝트·조직 고유 정보가 들어오면 안 된다.** 커밋 전에 막는 게이트가 있다(`tools/scan-forbidden.mjs` — harness-agent 의 같은 도구 사본).

```bash
git config core.hooksPath .githooks          # 커밋 전 게이트 활성화 (클론마다 1회)
cp .forbidden-terms.example .forbidden-terms.local   # 금칙어를 각자 채운다
cp .forbidden-meta.example .forbidden-meta.local     # 커밋 신원 금칙 패턴(사내 메일 도메인 등)을 각자 채운다
node tools/scan-forbidden.mjs --all          # 추적 중인 파일 전체 스캔 (= npm run scan)
node tools/scan-commit-meta.mjs --all        # 기존 커밋 전체의 author·committer 대조
```

- 구조적 패턴(IP 리터럴 · 메일 주소 · 내부망 형태 호스트)은 목록 없이도 잡힌다.
- 조직명·식별자 접두어처럼 형태로 못 잡는 것은 **`.forbidden-terms.local`** 에 적는다.
  - 이 파일은 **커밋하지 않는다**(`.gitignore` 등록). 목록 자체가 유출물이기 때문이다.
- 본문 스캔은 커밋 신원을 보지 않는다.
  - 커밋의 author·committer(이름·메일)는 `tools/scan-commit-meta.mjs` 가 막는다. **`.forbidden-meta.local`**(한 줄에 정규식 하나, 커밋하지 않음)과 대조한다.
  - 클론한 PC 마다 이 파일도 만든다.
  - 신원은 `git config user.email` 로 이 저장소에만 설정한다.
- 검출되면 `--no-verify` 로 우회하지 말고, 값을 프로필 슬롯 참조나 합성 값(`192.0.2.x`, `example.com`, `orders` 같은 가상 이름)으로 바꾼다.

## 시험

`npm test` 는 플러그인 스크립트(`plugins/harness-kit/scripts/`, 영수증·걷어내기의 로컬 항목)를 임시 git 레포와 임시 홈으로 돌린다.

- 실제 명령: `cd tests && node --test` (`tests/` 의 `*.test.mjs`)
- Node 20 에서도 돈다.
- 실제 사용자 홈(`~/.claude`)과 이 PC 의 git 전역 설정은 쓰지 않는다.

## 변경 기록

[CHANGELOG.md](CHANGELOG.md)
