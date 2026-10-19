# harness-kit

프로젝트에 묶이지 않는 **공용 Claude Code 플러그인**과 그 마켓플레이스.
여러 계층·여러 레포에 걸친 작업을 지휘하고, 구현·테스트·검증을 역할별 에이전트에 나눠 맡기고, 판정 규율(파이프로 종료코드 가리지 않기 · baseline 실측 · 단언 강도 유지 · 파괴적 적용 별도 승인)을 팀 전체가 같은 방식으로 따르게 한다.

자산 본문에는 **프로젝트 고유값이 없다.** 경로·명령·브랜치·위험 지점은 각 프로젝트 레포의 `harness.config.mjs` `project` 블록(아래 「프로젝트 프로필」)에서 읽고, 값이 없으면 지어내지 않고 사용자에게 묻는다.

## 구성

스킬 7 · 에이전트 6 · 커맨드 1 · 훅 0

| 종류 | 이름 | 언제 쓰나 |
| - | - | - |
| 스킬 | `coordinator` | ① 둘 이상의 레포 또는 계층(BE·FE) ② 계약 변경(API·스키마·마이그레이션) ③ 검증 두 종류 이상 — 셋 중 둘 이상이면 코드보다 먼저 |
| 스킬 | `fe-be-trace` | "어디서 조회/호출돼?" — FE·BE 를 함께 추적 |
| 스킬 | `qa-cycle` | 명세 확정 → 구현 → 단위/회귀 → e2e → UI 정합성 → 완성도 리포트 |
| 스킬 | `archive-cycle` | 쌓인 메모리·문서를 계측 → 판정 → 이관 → 연표 접기 → 검증 |
| 스킬 | `ui-ux-guide` | 화면·문구·인터랙션을 만들거나 고칠 때 6단계 + 7원칙 + 체크리스트 |
| 스킬 | `data-migration` | 데이터가 있는 DB 의 스키마 이행 · 타 서비스 ETL |
| 스킬 | `plugin-sync` | 플러그인(이 플러그인 또는 프로젝트 오버레이) 최신화 사이클 — 명시 호출 전용 |
| 에이전트 | `backend-engineer` | BE 구현 위임 기본 대상 |
| 에이전트 | `frontend-engineer` | FE 구현 · BE→FE 계약 동기화 |
| 에이전트 | `unit-test-engineer` | 테스트 작성/유지 |
| 에이전트 | `change-verifier` | 빌드·lint·스위트 실행 · diff 리뷰 · baseline 실측 · 그린/레드 판정 |
| 에이전트 | `data-migration-engineer` | `data-migration` 절차 실행 |
| 에이전트 | `plugin-curator` | 플러그인 드리프트 감사(읽기 전용) |
| 커맨드 | `/harness-kit:save` | 테스트 → 커밋 → 푸시 |

에이전트를 부를 때는 `harness-kit:<이름>` 으로 부른다(예: `subagent_type="harness-kit:change-verifier"`).

### 훅은 두지 않는다

이 플러그인에는 `hooks/` 가 없다. 위험 명령 가드 · test-first 가드 · 미러 드리프트 감시 같은 **실행 게이트는 harness-agent 의 몫**이다 — 각 프로젝트에 harness-agent 골격을 설치해 쓴다.
플러그인 훅은 설치 범위(user 범위면 모든 프로젝트)에서 발화하므로, 공용 플러그인이 훅을 가지면 그 훅을 전제하지 않은 프로젝트에서도 돌게 된다.

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
- 레포 안에 harness-agent 가 설치돼 있고 `harness.config.mjs` 에 `project` 블록이 채워져 있어야 스킬·에이전트가 프로젝트 값을 읽는다. 없으면 절차만 안내하고 값을 묻는다.

### 업데이트

- 설치본은 **버전이 바뀌어야 갱신된다.** 자산을 고치면 `plugins/harness-kit/.claude-plugin/plugin.json` 과 `.claude-plugin/marketplace.json` 의 `version` 을 **함께** 올린다(절차 변경·자산 추가 = minor, 문구 정리 = patch). 내용만 바꾸고 버전을 그대로 두면 팀원은 옛 판을 계속 쓴다.
- 받는 쪽: `/plugin marketplace update harness-kit` → `/reload-plugins`

## 프로젝트 프로필

스킬·에이전트·커맨드는 프로젝트 레포 루트 `harness.config.mjs` 의 `project` 블록을 읽는다. harness-agent 가 이미 정의한 `project.name`·`project.repos` 옆에 아래 슬롯을 더한다. harness-agent 코드는 이 슬롯을 읽지 않는다 — 읽는 쪽은 이 플러그인뿐이다.

### 읽기 규칙

1. **평범한 객체 리터럴로만 쓴다.** 계산식·import·함수 호출 금지 — 에이전트가 파일을 그대로 읽어 해석한다.
2. **값 또는 경로만 둔다.** 산문 규칙(계약 규율, UI 금지 패턴, BE 컨벤션)은 레포 `docs/` 에 두고 슬롯은 그 문서 경로를 가리킨다.
3. **짝 레포는 공통값을 주 레포에만 둔다.** 짝 레포 config 는 `pairOwner` 로 주 레포를 가리키고, 자산은 자기 config → 주 레포 config 순으로 읽는다. 같은 값을 두 레포에 적지 않는다.
4. **빈칸과 `null` 은 다르다.** 키가 없으면 "아직 안 정함" — 자산은 멈추고 묻는다. `null` 이면 "해당 없음으로 판단함" — 자산은 그 단계를 건너뛰고 보고에 적는다.
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
| `risk` | `sharedDbSuites`(공유 DB 에 실접속하는 테스트) · `sharedDbProfiles`(공유 DB 를 향하는 프로파일·설정 파일 **이름**) · `devServer`(기본 프록시가 원격을 향하는가 — 한 문장) · `destructive`(승인 필요 명령) | change-verifier · unit-test-engineer · save · data-migration |
| `docs` | `domainIndex` · `screenMap` · `repoMap` · `testGuide` · `uiUxRules` · `archiveDir` · `pathValidator` · `autoloaded`(자동 로드 `CLAUDE.md` 목록) | 여러 자산 |
| `git` | `protectedBranches` · `commitFormat`(한 문장) · `commitExecution`(`'auto'` \| `'message-only'`) · `push`(`'auto'` \| `'ask'` \| `'never'`) · `coAuthor`(trailer 허용 여부) · `reviewThreshold`(`{ files, lines }`) | save · frontend-engineer |
| `agents` | 역할 → 에이전트 이름 덮어쓰기. 역할: `schemaDesign` · `schemaApply` · `migration` · `backend` · `frontend` · `testAuthor` · `verifier` | coordinator · 에이전트 |
| `memory` | `slugs`(`~/.claude/projects/` 아래 메모리 디렉토리 이름) · `policy`(백로그를 어디에 남기나 — 한 문장) | archive-cycle · qa-cycle |
| `plugin` | 플러그인 정본 레포에서만: `canonicalRepo` · `canonicalBranch` · `dir` · `marketplaceFile` · `readme` · `mirrorScript` · `hookTests` · `auditSources` | plugin-sync · plugin-curator |

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
- 조직명·식별자 접두어처럼 형태로 못 잡는 것은 **`.forbidden-terms.local`** 에 적는다. 이 파일은 **커밋하지 않는다**(`.gitignore` 등록) — 목록 자체가 유출물이기 때문이다.
- 본문 스캔은 커밋 신원을 보지 않는다. 커밋의 author·committer(이름·메일)는 `tools/scan-commit-meta.mjs` 가 **`.forbidden-meta.local`**(한 줄에 정규식 하나, 커밋하지 않음)과 대조해 막는다. 클론한 PC 마다 이 파일도 만들고, 신원은 `git config user.email` 로 이 저장소에만 설정한다.
- 검출되면 `--no-verify` 로 우회하지 말고, 값을 프로필 슬롯 참조나 합성 값(`192.0.2.x`, `example.com`, `orders` 같은 가상 이름)으로 바꾼다.

## 변경 기록

[CHANGELOG.md](CHANGELOG.md)
