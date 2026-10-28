# Changelog

매니페스트에 `version` 필드를 두지 않는다. 판은 main 커밋 SHA 로 갈린다. 절은 병합 단위로 적는다.
(0.1.0 까지는 `plugin.json` 과 `marketplace.json` 의 명시 버전을 함께 올렸다.)

## 미발행 — 문서 문체 STE

- 문서를 STE 문체로 다시 쓴다
  - 대상: harness-install · harness-uninstall · docs-setup · 공용 스킬 · agents · commands · README · CHANGELOG · SOURCES
  - 뜻을 바꾼 것은 harness-install D4(deny 상한에는 deny 만 센다) · D5(커밋 선택지 두 라벨)뿐이다
    - 두 건은 1차 커밋 `61a8960` 에 있다

## 미발행 — 하네스 설치 범위

- `harness-install` 에 설치 범위 D0(header `하네스 설치범위`)을 맨 앞 결정으로 더한다
  - **라이트** — 권장이다. 다음을 넣는다
    - 실행 전 가드 훅 하나
    - 사고 근거가 있는 deny·ask·공유 자원
    - 공유DB 테스트 제외 init script
    - 짧은 「개발 하네스」 절
    - 영수증
    - harness-kit 켜기
  - **계측** — 마지막 선택지이고 권장 없음이다. 하네스 개발 설치처용이고, 지금까지의 전체 설치다
  - 골격은 두 범위 모두 통째로 복사한다
  - 범위가 가르는 것은 settings 훅 · config 칸 · CLAUDE.md 절의 판뿐이다. 로그만 끄는 스위치는 없다
  - 범위 표는 `scripts/tiers.mjs` 하나에 둔다
  - 표준은 비교 창 판정 뒤의 몫으로 넣지 않는다
  - 라이트면 계측 칸 질문(턴 종료 감사 · 증거 슬롯 · 사본 감시)은 묻지 않는다
    - 그 칸은 범위대로 채워 체크포인트에 `auto` 로 남긴다
    - kit 문서·메모리 칸은 키 없이 둔다(DECISIONS D0 「뒤 질문」 표)
  - TEMPLATES 에 다음을 더한다
    - 라이트 훅 블록(§1)
    - 라이트 절과 라이트 config 꼴(§4)
    - 체크포인트 `tier`(§7)
    - D0·문서 구조 질문 꼴과 풀이표 줄(§8)
- 점검을 범위대로 한다
  - `install.mjs slots` 는 라이트의 문서·메모리 칸 「키 없음」을 실패 대신 `DEFER` 로 낸다
    - 키 없음 = 쓸 때 묻는다는 규칙은 그대로다
  - 새 `install.mjs hooks` 가 다음을 본다. CHECKS §1 의 훅 5개 고정 대조를 이것으로 바꾼다
    - 그 범위의 훅이 각 이벤트에 정확히 1번
    - 범위 밖 훅 0번
    - matcher 에 Bash·PowerShell 인지
  - `answer-trace.mjs` 는 체크포인트 `tier` 가 없으면 실패한다
  - `answer-trace.mjs` 는 라이트의 범위 밖 칸을 `TIER` 로, 범위로 채운 답을 `AUTO` 로 낸다
  - CHECKS §2·§3 에 범위별 기대값을 적는다. 라이트는 턴 종료 확인을 건네지 않는다
- 영수증을 schema 2 로 올린다
  - `write-manifest.mjs` 가 초안의 `tier` 를 필수로 받는다. settings 훅이 그 범위와 맞는지 본다
  - `--example <example 사본>` 을 받으면 설치가 바꾼 config 칸마다 `config.slots` 를 적는다
    - 적는 값: `path`·`tier`·설치 전 값 원문·꼬리 주석·설치 뒤 해시
  - `tier` 없는 schema 1 영수증은 계측으로 읽는다
- `harness-uninstall` 에 범위 낮추기(계측 → 라이트)를 더한다
  - `scan --tier light` 는 다음만 후보로 뽑는다
    - 범위 밖 훅 지우기
    - 범위 밖 config 칸을 설치 전 값으로 되돌리기
      - `config.slots` 기준이고, 여러 줄 배열 칸을 포함한다
      - 되돌린 뒤 import 를 확인한다. 못 읽으면 원래 판으로 둔다
    - 「개발 하네스」 절을 새 판으로 통째로 바꾸기
      - 새 `block` 명령으로 받는다. 줄끝은 파일 것을 따른다
    - 영수증 갱신(`tier`·훅·칸·해시 · `tierChanges` · D0)
  - 골격·config 파일·로그·플러그인 키는 남긴다
  - 범위 올리기는 거절한다. 「걷어 낸 뒤 새 세션에서 설치」로 안내한다
  - 걷어내기 scan 도 영수증 범위로 「있어야 할 훅 · 범위 밖에 남은 훅」을 가른다
  - `edit.mjs` 의 블록 연산이 새 판으로 바꾸기를 받는다
  - `edit.mjs` 가 같은 판의 블록 둘을 같은 범위로 두 번 잡던 것을 막는다
- docs-setup 칸의 여러 줄 배열을 읽는다
  - `config-slots.mjs` 의 `ownedSlots` 가 여러 줄 배열 칸도 칸 하나(걸친 줄 범위)로 낸다
  - 표시가 여는 줄·닫는 줄 어디에 붙어도 같다
  - `slotValue`·`revertSlot`·`leafSlots` 를 더한다
  - 고친 결함: 영수증 없는 걷어내기가 config 를 import 하지 못해 글로 읽을 때 생겼다
    - 표시 줄 하나만 빼던 탓에 배열 안 문서 경로를 보조 파일 후보로 잡았다
- 설치 끝에 10단계 문서 구조 질문(header `문서구조 맞추기`)을 더한다
  - 새 `install.mjs docs-hookup` 이 관찰한다: 문서 수 · `archiveDir` · 문서 칸 null·키 없음
  - 문서가 있는데 아카이브 칸이 비었거나 문서 칸이 비면 「진행」(docs-setup 으로 넘긴다)을 권한다
  - 문서가 2개 이하인 새 레포면 「나중에」를 권한다
  - 「권장 이유」 줄을 낸다
  - 답은 체크포인트 `docsHookup` 에만 적는다
- 선택 항목 D9(graft 로컬 연결)·D10(전역 상태 줄)은 범위와 따로다
  - 두 범위에서 같게 묻는다(DECISIONS D0 「뒤 질문」 표에 한 줄)
  - 묻는 순서는 D0 → … → D8(D8-2) → D9 → D10 이다
  - graft 훅은 `install.mjs hooks` 의 범위 훅 수와 영수증 범위 대조에 들지 않는다. 그래서 그 점검은 바꾸지 않는다
    - 이유: graft 훅은 `settings.local.json` 에 들고 `.harness/` 를 가리키지 않는다
  - 범위 낮추기는 harness-uninstall 0-2단계(graft·전역 상태 줄)를 건너뛴다
  - 범위 낮추기는 `.gitignore` 의 `/graft/` 블록을 건드리지 않는다
- 시험
  - `harness-install/scripts/tiers.test.mjs` — 범위 표 · slots DEFER · hooks · write-manifest tier·config.slots · answer-trace TIER·AUTO·D0
  - `harness-uninstall/scripts/scenarios.test.mjs` — 임시 레포 시나리오
    - 라이트·계측 설치 → 걷어내기 → 설치 전과 같음
    - 계측 → 라이트 낮추기 결과가 라이트 설치와 바이트까지 같음
    - schema 1 을 계측으로
    - 여러 줄 배열 칸
    - 문서 구조 권장 두 갈래
    - CRLF settings 유지
    - graft 로컬 연결이 있는 계측 → 라이트 낮추기
      - `/graft/` 블록·`settings.local.json` graft 훅·영수증 `local` 이 그대로 남음
  - `boundary.test.mjs` 와 `tests/install-local-items.test.mjs` 의 영수증 초안에 `tier` 를 넣는다
  - `boundary.test.mjs` 의 기대 schema 를 2 로 바꾼다

## 미발행 — 출처 대장

- 출처 대장 [SOURCES.md](SOURCES.md) 를 더한다
  - 플러그인·저장소 도구 자산마다 구분(외부 유래 · 외부 유래 후 개작 · 자체 작성 · 출처 미확인)을 적는다
  - 자산마다 원본 레포·경로·SHA·반입 커밋·근거를 적는다
  - 0.1.0 초기 자산 14건은 비공개 레포에서 일반화한 것(외부 유래 후 개작)으로 적는다. 원본 경로·SHA 는 비운다(사용자 확인)

## 미발행 — 설치 선택 항목: graft 로컬 연결 · 전역 상태 줄

- `harness-install` 에 결정 둘을 더한다(기본 끔, 순서 D8·D8-2 뒤)
  - **D9 graft 사용** — 레포 단위이고, 이 PC·이 트리 전용이다
  - **D10 전역 상태 줄** — 사용자 전역이다. D9 를 켰을 때만 묻고 권장한다
  - 실행은 새 8-2단계에서 D10 → D9 순서로 한다
  - D9 는 권장을 계산하지 않는다. 안내 한 줄과 함께 묻는다. 기본은 안 씀이다
    - 안내: 코드가 크고 작업이 잦은 레포에서 이득이다. 작은·문서 위주 레포에선 매 프롬프트 주입이 잡음이다
  - 묻기 전 `graft-localize.mjs check` 로 graft 설치 여부와 Node 조건만 본다
  - graft 가 없으면 설치 안내만 하고 건너뛴다
- 플러그인 스크립트 `plugins/harness-kit/scripts/` 를 더한다(Node 내장 모듈만)
  - `graft-localize.mjs`(`check`·`prepare`·`localize`·`status`·`remove`)
    - init 전 스냅숏을 뜬다
    - `.gitignore` 에 `/graft/` 표시 블록을 둔다. graft build 가 `.gitignore` 텍스트만 보고 매번 덧붙이는 것을 막는다
    - graft 가 settings.json 에 넣은 훅·상태 줄·권한·`footerLinksRegexes` 를 `settings.local.json` 으로 옮긴다
    - settings.json 을 init 전 바이트로 되돌린다. 이벤트별로 기계 대조하고, 어긋나면 쓰지 않는다
    - graft 훅 timeout 을 초로 교정한다(8000·10000·15000 → 8·10·15)
    - `.mcp.json` 을 정리하고 `disabledMcpjsonServers: ["graft"]` 를 넣는다
    - info/exclude 에 로컬 산출물 블록을 둔다
      - 추적 경로는 뺀다. 블록이 없으면 넣고 있으면 둔다
      - worktree 공용이라 `remove` 는 지운 뒤 경고 한 줄만 낸다
    - 다시 돌려도 같다. graft 업그레이드가 settings.json 에 키를 다시 넣으면 `localize` 만 다시 돌린다
  - `statusline-combined.cjs`
    - 원래 명령과 레포의 graft 상태 줄 헬퍼를 병렬로 돌려 줄 단위로 잇는다
    - 헬퍼가 실패하면 그 줄만 뺀다
  - `statusline-setup.mjs`(`status`·`install`·`restore`)
    - base 를 돌릴 셸을 설치 때 한 번 정한다. `statusline.json` 의 `shell` 에 절대경로로 적는다
    - 그 셸로 base 를 한 번 돌려 확인한다
    - 전역 settings.json 을 백업한 뒤 `statusLine.command` 만 바꾼다
    - 다른 합치기 스크립트를 가리키거나 base 확인이 실패하면 아무것도 쓰지 않고 멈춘다
    - 되돌리기는 지금 값이 우리가 쓴 값일 때만 하고, 전역 값만 되돌린다
    - 사본은 남긴다. 레포 `settings.local.json` 이 가리킬 수 있다
  - 합치기 스크립트는 실행 때 셸을 찾지 않는다
    - 근거(실물 시험 결과): Claude Code 의 PATH(System32 가 앞)에서 이름으로 찾은 bash 가 WSL bash 였다
    - 그래서 base 줄이 조용히 사라졌다
  - base 실패는 `statusline base 실패(exit N)` 한 줄로 낸다. `shell` 이 없는 옛 설정은 안내 한 줄로 낸다
  - `graft-localize.mjs remove` 는 다 걷으면 `git-path harness-kit-graft/` 째 지운다
  - `check`·`prepare` 의 `graft --version` 은 Windows 에서 cmd 로 명시 실행한다(`shell:true` 의 DEP0190 경고 없음)
- README 에 예외와 이유를 적는다. harness-kit 이 사용자 전역에 쓰는 첫 항목이기 때문이다
  - 이유: 플러그인 settings 는 `agent`·`subagentStatusLine` 만 받는다
  - graft 업그레이드 뒤 재실행 안내도 README 에 적는다
- 영수증(`write-manifest.mjs`)에 `local` 을 더한다(TEMPLATES §9)
  - `local` 은 커밋되지 않는 로컬 항목이다. 해시는 없다
  - 상대경로·`~/`·`git-path:` 꼴만 받는다
- `harness-uninstall` 에 0-2단계(scan 전)를 더한다
  - 다음 둘을 레포 걷어내기와 따로 묻는다
    - graft 로컬 연결 걷어내기(`graft-localize.mjs remove`, 그래프만 남기기 가능)
    - 전역 상태 줄 되돌리기
  - scan 은 graft 가 아직 연결된 트리에서 `.gitignore` 의 `/graft/` 블록을 「남김」으로 권한다
- 시험을 더한다 — `npm test`(`tests/*.test.mjs`, node:test · 임시 git 레포·임시 홈, git 전역 설정을 비워 돈다)
- D9 사전 점검에 Node 판 확인을 더한다
  - `graft-localize.mjs` 의 `check`·`prepare` 가 graft 설치본의 `engines.node` 를 지금 Node 와 대어 본다
    - 설치본 위치: `npm root -g` 아래. 없으면 실행 파일 위치
    - 읽는 꼴: `>=X`·`>=X.Y.Z`·`^X`
  - 못 미치면 graft 가 있어도 건너뛴다(종료코드 3). 안내는 「Node <요구> 필요, 현재 <판>」이다
  - 못 읽거나 해석하지 못하면 `WARN` 만 내고 진행한다
  - 설치 안내에 다음 순서를 넣는다: `npm view @nanonets/graft engines` → `node --version` 비교 → 모자라면 Node 먼저 올리기
- 병합 뒤 리뷰 반영(`graft-localize.mjs`·`statusline-setup.mjs`)
  - `localize`
    - 경우: settings.json 이 BOM 이라 graft 가 `{}` 에서 다시 써 graft 밖 키가 빠졌다
    - 이때 기준 판 바이트로 되살린다. 전에는 `WARN` 뒤 종료 0 으로 끝나 가드 훅·`enabledPlugins` 가 사라졌다
    - 기준 판에 없던 graft 밖 키가 더해졌으면 아무것도 쓰지 않고 FAIL
    - 기준 판
      - 추적 settings.json 이면 git index 판이다(첫 prepare 스냅숏으로 되돌려 그 뒤 팀원 커밋을 지우지 않게)
      - 미추적이면 스냅숏이다
        - 이 스냅숏은 localize 가 성공할 때마다 그 결과로 갱신한다
    - info/exclude 블록이 이미 있으면 빠진 줄만 덧붙인다
      - 전에는 build 뒤 생긴 `.ignore` 를 넣지 않고 「OK … exclude」를 냈다
    - 추적 `.mcp.json` 에 팀이 커밋한 graft 서버를 init 이 바꿔 써도 init 전 바이트로 둔다
  - `remove`
    - settings.json 에 graft 몫이 다시 들어와 있으면 아무것도 지우지 않고 FAIL(「localize 먼저」)
    - `prepare` 전부터 있던 미추적 helpers·skill·`graft/` 와 추적 `.mcp.json`·`settings.local.json` 은 건드리지 않고 `KEEP`
    - 성공해도 백업 `backup-*` 은 남긴다. 스냅숏·체크포인트만 지운다
  - `statusline-setup.mjs restore` 는 install 전에 없던 전역 settings.json 이 다시 빈 객체면 지운다
  - `npm test` 를 `cd tests && node --test` 로 바꿔 Node 20 에서도 돈다. 따옴표 glob 은 Node 21+ 전용이다
  - 한계 둘을 PITFALLS·DECISIONS 에 적는다
    - graft 새 판이 뺀 이벤트의 옛 훅 그룹
    - 다른 worktree 의 helpers 개인 경로와 `git add -A`

## 미발행 — 문서 셋업 스킬

- 스킬 추가: `docs-setup`(SKILL·DECISIONS·TEMPLATES·`scripts/` observe·refs·links)
  - 레포에 다음을 세운다: 아카이브 폴더 · `docs/README.md` 성격표 · `CLAUDE.md` 작업 라우팅 · 문서 규약 표
  - 끝난 문서를 배너와 함께 옮긴다. 끝났는지는 「아직 일을 시키는가」로 판정한다
  - `project.docs.archiveDir`·`pathValidator`·`autoloaded`·`project.memory.slugs` 를 채운다
  - harness-agent `docs.always`·`docs.archive` 를 맞춰 `archive-cycle` 이 바로 돌게 한다
  - 메모리 규약을 `CLAUDE.md` 에 넣는다
    - 인덱스 한 줄 형식 · 연표 접기 · 핸드오프 보관 수 · 정리 시점
    - 수치는 판단값이다
  - 결정은 하나씩 묻고 관찰에서 계산한 권장을 보인다
  - 이동은 `git mv` 없이 다음 순서로 한다
    1. 백업
    2. 이동
    3. 참조 고침(지시 문서는 따로 묻는다)
    4. 기준선 대비 링크 검사
    5. 경로 지정 커밋
  - 체크포인트로 이어받는다
- 「이관 후 접기」 문서는 옮기지 않고 archive-cycle 이관 대상으로 넘긴다. 아카이브가 아닌 이동은 권장하지 않는다
- docs-setup 이 채운 config 칸이 재설치·설치 단계 변경 뒤에도 남게 한다
  - 칸마다 줄 끝에 `// harness-kit:docs-setup` 표시를 단다
    - 문서 칸이 없는 config 에는 표시 붙은 블록째로 둔다
  - 영수증에 `owners["docs-setup"]` 를 적는다. 설치 칸은 그대로다
  - `scripts/config-slots.mjs`(list·record·backups·restore)
  - harness-uninstall 은 그 칸을 후보와 따로 보고한다. 백업 `index.json` 에 `docsSetup` 으로 적는다
  - harness-install D8-2 가 최신 백업에서 되살릴지 묻는다
    - 가리키는 폴더·파일이 남아 있으면 권장은 「되살림」이다
  - 옮긴 문서·배너·성격표·`CLAUDE.md` 표가 걷어내기 후보가 되지 않는지 본다
    - 판정은 `scripts/boundary.mjs` 로 한다. uninstall 과 같은 판정 함수다
  - `scripts/boundary.test.mjs` 가 다음 흐름을 시험한다
    - 설치 → docs-setup → 걷어내기 → 새 설치(표준·라이트 꼴) → 되살리기
- 옮긴 뒤 커밋 전에 생기던 두 결함을 고친다
  - `observe.mjs` 가 지워진 옛 경로를 읽다 멈췄다. 작업본에 없는 추적 파일을 목록에서 뺀다
  - `links.mjs` 가 아카이브 배너의 옛 경로 표기를 새 깨짐으로 셌다. 배너 줄의 경로는 출처 표기로 본다
- `lib.mjs` 의 `mdLinks` 가 인라인 코드 스팬 안의 링크 꼴을 링크로 세던 것을 고친다
  - `lib.mjs` 는 `links.mjs`·`refs.mjs`·`observe.mjs` 가 함께 쓴다
  - 예: `` `[제목](파일.md)` `` — TEMPLATES 메모리 규약 절의 예시
  - 그래서 적용한 레포마다 깨진 링크로 보고했다
  - 줄마다 코드 스팬을 같은 길이 공백으로 가린 뒤 링크를 뽑는다(`maskCodeSpans`). 펜스 안은 전처럼 뺀다
  - 백틱 속 레포 경로 문자열 판정(links 의 path · refs 의 경로)은 그대로다
  - `scripts/links.test.mjs` 가 시험한다: 스팬·펜스 안 링크 꼴 0 · 본문 깨진 링크 1 · 경로 판정 유지
- 실제 레포 시험 적용에서 찾은 결함을 고친다
  - `refs.mjs`
    - 링크 글자에 적힌 옛 경로(`[docs/a.md](a.md)`)를 대상만 고치고 글자는 남기던 것을 고친다
    - 지시 문서(`CLAUDE.md`·`.claude/`·`harness.config.mjs`) 줄까지 자동으로 고치던 것을 고친다
      - 그 탓에 3단계 질문이 사후 확인이 됐다
      - 이제 `instr` 로 따로 내고 자동 고침 수에서 뺀다
    - 계획 없는 판이 「자동 고침」이라 적던 것을 고친다
    - 4단계용 `--after` 를 더한다. 배너 출처·새 경로 표기는 정상으로 보고, 남은 옛 경로만 목록으로 낸다
  - `observe.mjs`
    - `.claude/`·하위 `CLAUDE.md` 의 미커밋 변경을 세지 않던 것을 고친다
    - archiveDir 와 같고 모두 배너를 단 `docs.archive` 칸을 「어긋남?」으로 내던 것을 고친다
  - 펜스는 연 글자와 같은 글자로만 닫는다(`fenceTracker`)
  - 체크포인트·계획·기준선은 scratchpad 가 아니라 git 디렉토리에 둔다
    - 거기에 `skillDir`·시계에서 읽은 `updated` 를 적는다
  - 재개는 스킬을 다시 불러서 한다
  - 질문 전에 후보·칸·판단값 표를 본문에 낸다
  - header 를 「대상+동작」으로 정한다
  - 쉬운 말 풀이표·「권장 이유」·「권장 없음」을 harness-install 질문 꼴에 맞춘다
  - `scripts/refs.test.mjs`·`observe.test.mjs` 를 더한다
  - `links.test.mjs` 에 펜스 글자 경우를 넣는다

## 미발행 — 하네스 설치 시험 반영

- `harness-install` 에 `scripts/install.mjs` 를 더한다
  - `precheck` — 트리 종류·worktree 여부를 본다. 다른 세션을 동시·최근·오래됨으로 가른다
    - 가르는 기준: timestamp 있는 마지막 user·assistant 기록
  - `settings-snap`·`settings-eol`·`after-cli`
    - settings 의 줄끝·BOM·끝 개행을 손대기 전 판대로 되살린다
    - CLI 가 다시 쓴 파일을 손본 직후 스냅숏으로 되덮는다
  - `test-select`
    - 테스트 제외 패턴을 소스 트리에 대어 빠지는 것을 펼치고 실행 결과와 대조한다
    - 디렉토리 일치로 하위 패키지까지 빠지는 것을 잡는다
  - `slots` — kit 자산이 읽는 슬롯을 모은다. 빈 키와 이유 없는 `null` 을 실패로 센다
  - `plugin-hooks` — 끌 플러그인의 훅 목록
  - CHECKS §6 안에 있던 `answer-trace.mjs` 를 `scripts/` 로 꺼낸다
- 결정 순서를 D1→D2(D2-2)→D3→D6(D6-2)→D4→D5→D7→D8 로 바꾼다
  - D1 은 worktree 안에서 실행됐는지에 따라 권장과 문구가 바뀐다
  - D2-2(서버 기동 같은 간접 접속, 권장 ask)를 정식 결정으로 둔다
  - D6-2(끄는 플러그인이 막던 명령을 하나씩 deny·ask·막지 않음으로 물음)를 정식 결정으로 둔다
  - D7 에 e2e·testFirst·sharedDbProfiles·memory.slugs 규칙을 둔다
  - D8 에 kit 슬롯 표와 docs-setup 연결 문구를 둔다
- 질문 꼴(TEMPLATES §8)에 쉬운 말 풀이표를 더하고 되물음이 났던 질문 본문을 고쳐 쓴다
- 권장이 없을 때 「권장 없음 — 판단 근거 부족, 직접 골라 주세요」로 밝힌다
- 첫 플러그인 설치 안내에 비공개 레포 접근 단계를 넣는다
- CHECKS §4 에 도구 경로·와일드카드 케이스와 래퍼 변형 자동 생성(`HOLE`)을 더한다
- CHECKS §8 에 「빠질 것만 빠지고 돌 것은 돌았나」 확인을 더한다
- 5단계는 settings 를 Write 로 쓰지 않고 Edit 만 쓴다
- 8단계에 버전 관례를 적는다
  - 프로젝트 고유 플러그인은 파일이 바뀌면 버전을 올린다
  - harness-kit 은 버전 없이 SHA 로 추적한다
- `/save` 를 경로 지정 커밋으로 바꾼다
  - 신규 파일만 `git add -N` 한다
  - `git commit -F <메시지> -- <경로>` 를 브랜치·toplevel 조건과 한 명령으로 묶는다
  - 게이트의 diff 는 `--cached` 대신 `git diff HEAD -- <경로>` 로 본다
  - 푸시는 `git push origin <브랜치>` 로 한다
  - `git.commitExecution: message-only` 면 명령만 건넨다
  - 남이 stage 해 둔 변경은 커밋에 들어가지 않고 index 에 남는다
- `plugin-sync` 7단계와 `archive-cycle` ⑤-3 도 같은 꼴로 바꾼다
  - `git add` + 경로 없는 `git commit` 을 바꾼다
    - 바뀐 꼴: 신규 파일만 `git add -N` + 조건을 붙인 `git commit -F <메시지> -- <경로>`
  - plugin-sync 푸시는 `HEAD:` 대신 작업 브랜치 이름을 적는다
  - 두 스킬의 읽는 슬롯에 `git.commitExecution` 을 더한다(README 프로필 표 · harness-install D5 설명 함께)

## 미발행 — 하네스 걷어내기

- 스킬 추가: `harness-uninstall`(SKILL·DECISIONS·PITFALLS · `scripts/uninstall.mjs`·`scripts/edit.mjs`)
  - harness-install 이 넣은 것만 블록·줄·치환·JSON 키 단위로 걷어 낸다
  - 영수증이 있으면 영수증 기준으로 뽑는다. sha256 이 다르면 「설치 뒤 손댄 것」으로 따로 묻는다
  - 영수증이 없으면 알려진 구조로 후보를 뽑아 항목마다 묻는다
  - 손대기 전 `git-path harness-uninstall-backup/` 에 백업한다
  - 손대기 전 런타임 산출물의 증거 사본을 `git-common-dir` 에 둔다
  - 체크포인트로 이어받는다
  - 후보 밖 파일을 가리키는 참조는 보고만 한다
  - settings 는 하네스가 아닌 훅을 이벤트별로 백업과 대조한다
  - `git restore`·`checkout` 금지
  - 커밋은 지우기 전에 읽어 둔 `commitExecution` 대로 한다. 경로 지정·직전 확인을 따른다
  - 플러그인 키는 맨 마지막 결정이다
  - 재설치는 uninstall → 새 세션 → install
- `harness-install` 이 영수증과 경계 표시를 남긴다
  - 9단계가 레포 루트 `harness.install.json`(커밋 대상)을 `scripts/write-manifest.mjs` 로 쓴다
  - 영수증에 적는 것
    - 원본·SHA·설치 시각·결정 답
    - 만든 파일과 sha256(줄끝 LF 정규화)
    - 고친 곳(표시 블록 · 한 줄 표시 · 바꾸기 전·뒤 원문)
    - settings 훅과 키
    - 플러그인 설치 기록
  - `.gitignore` 줄과 `CLAUDE.md` 「개발 하네스」 절은 `harness-kit:begin`·`harness-kit:end` 로 감싼다
  - 절을 가리키는 줄에는 `harness-kit:line` 을 붙인다(TEMPLATES §3·§4·§9, CHECKS §7)
  - 0단계가 끝난 설치에서 멈출 때 「`harness-uninstall` → 새 세션 → install」을 안내한다
- `harness-uninstall` 을 대화형 시험 결과대로 고친다
  - verify 의 커밋 경로
    - 걷어 낸 연산을 HEAD 판에 해 보아, HEAD 에 그 조각이 있던 경로만 센다
    - 설치가 커밋된 적 없는 트리는 이유와 함께 0개로 낸다. 메시지 파일을 만들지 않는다
    - scan 이 `installAtHead` 를 적는다
  - apply
    - 계측 로그를 지우기 직전에 증거 사본을 지금 판으로 다시 맞춘다(백업 뒤 더해진 줄)
    - 백업 `index.json` 에 바이트 해시 `sha256` 과 LF 정규화 `sha256Lf` 를 함께 적는다
    - 되돌리기 한 줄과 `restore-check` 를 더한다
  - backup 은 「백업 N개 = 후보 파일 N개」를 낸다
  - verify 는 보고용 요약을 낸다: 후보·답·적용 수 · 백업·증거 절대경로와 수명
  - 질문 header 는 스크립트가 후보마다 겹치지 않게 정한다
    - 훅은 이벤트 이름, 같은 종류는 번호, 플러그인 키는 `kit 키 처리`
  - 권장이 없는 질문
    - 「권장 없음」을 먼저 밝힌다
    - 고정 순서(목적은 완전 제거 먼저)로 묻는다
    - 「권장대로」로는 채우지 않는다
  - 본문은 평이한 말을 먼저 쓴다(낱말 표)
  - 라벨에 사용자 판단을 단정하지 않는다
  - 옛 훅 오류는 「날 수 있다」로 낮춘다
  - 보고를 먼저 보인 뒤에 finish 를 부른다
- `harness-uninstall` 을 2차 대화형 시험 결과대로 고친다
  - 설치기록 질문
    - `records` 가 `installed_plugins.json` 에서 `projectPath` 가 이 루트와 같은 기록만 고른다(Windows 대소문자 무시 · 슬래시 통일)
    - 그런 기록이 있을 때만 묻는다
    - worktree 이고 메인 트리에도 기록이 있으면 CLI 를 권하지 않고 손 절차를 낸다
  - `plugin` 이 키를 지운 직후 settings 를 `after-plugin/` 에 뜬다
  - `after-cli` 가 CLI 뒤 그 스냅숏과 바이트 대조해 되덮는다
    - 전에는 3단계 백업으로 되덮어 kit 키가 되살아났다
  - 순서를 plugin → records → (CLI) after-cli → verify 로 못 박는다. 명령마다 「다음:」 줄을 낸다
  - 다른 세션 확인
    - `sessions` 가 timestamp 있는 마지막 user·assistant 기록 시각과 경과로 낸다
    - 이유: 수정 시각은 종료 때 늦어진다
    - 목적 질문과 묶지 않고 먼저 묻는다
  - scan 이 두 번째 걷어내기의 남긴 보조 파일과 그 참조를 되찾는다
    - 단서: 앞선 백업 `index.json`(이제 후보·답을 적는다)과 이름 패턴
  - 되돌리기 줄
    - 스크립트 절대경로를 넣어 그대로 돌릴 수 있게 한다
    - 스크립트 없는 손 절차를 함께 낸다
  - apply
    - 늘 `적용 N건` 을 낸다
    - 결과가 HEAD 와 내용이 같아진 파일은 체크아웃 판 줄끝으로 쓴다
  - 이미 줄끝만 다른 파일에는 verify 가 `eol-fix`(또는 `git checkout --`)를 안내한다
    - `update-index --refresh` 로는 풀리지 않는다
  - verify 요약에 더한다: 남은 참조 수 · 설치 기록 판정 · 앞선 백업·증거 사본 · 「남긴 것을 나중에 지우려면」
  - kit 키 「끔」 설명을 바꾼다
    - 새 설명: 「이 레포 설정에서만 빠집니다 — 사용자 범위로 켜 둔 PC 에서는 계속 뜹니다」
  - 후보 파일이 0개일 때 backup 이 index.json 자리를 못 만들던 것도 고친다

## 미발행 — 하네스 설치 재개

- `harness-install` 을 재현 시험 결과대로 고친다
  - 체크포인트(`git rev-parse --git-path harness-install-state.json`)에 완료 단계·결정 답·원본 SHA 를 적는다
  - 0단계가 중단된 설치·지워진 설치·끝난 설치를 가른다(CHECKS §5)
  - example 복사와 원본 SHA 머리 줄을 3단계로 옮긴다
  - 4단계 완료 기준에 「example 과 다름 + `--status` 활성·프로브」를 넣는다
  - 5단계에 「4단계 통과 뒤에만」을 넣는다
- D3 의 공유 자원 테스트 제외에 두 선택지를 둔다
  - 소스 무수정(빌드 도구 명령줄 주입)을 기본·권장으로 둔다
  - 테스트 소스 태그는 「레포 코드를 바꾼다」고 밝힌 별도 선택지로 둔다
- `.harness/` 비교를 줄끝 무시·index blob 기준으로 바꾼다
- 6단계에 답을 바꾼 흔적 점검(`answer-trace.mjs`)을 더한다
- 결정 질문 D1~D7 에 근거 기반 권장을 붙인다
  - DECISIONS 의 D 마다 「관찰 → 권장」 규칙표를 둔다. 1단계 관찰에서 권장을 계산한다
  - 첫 선택지에 「(권장)」과 근거 한 줄을 단다
  - 선택지마다 바뀌는 것을 단다(꼴 TEMPLATES §8)
  - 레포 코드 변경·공유 자원 쓰기 비차단·테스트 삭제는 권장하지 않는다
  - 권장과 다른 답은 체크포인트 `recs` 와 answer-trace ⑤·보고 표에 남긴다
- 결정 질문의 꼴을 다듬는다(TEMPLATES §8)
  - header 는 D 번호를 빼고 대상 + 동작 명사구로 쓴다(`테스트DB 볼륨삭제`)
  - 질문 첫 문장은 대상과 할 일을 평이한 말로 쓴다
  - 선택지 라벨은 그것만 읽어도 뜻이 통하게 쓴다(`막지 않음`·`실행 전 확인 (ask)`·`차단 (deny)`)
  - CHECKS §6 에 질문 형식 점검(6)을 더한다

## 미발행 — plugin-sync 버전 분기

- `plugin-sync` 5단계와 `plugin-curator` F 축을 버전 정책으로 가른다
  - 두 매니페스트에 `version` 이 있으면 함께 올리고 일치를 본다
  - 둘 다 없으면(커밋 SHA 추적) 올리지도 새로 넣지도 않고 정상으로 보고한다
  - 한쪽에만 있으면 멈추고 묻는다(감사에서는 드리프트)
  - 6단계 validate 의 `--strict` 는 명시 버전일 때만 붙인다

## 미발행 — 하네스 설치 스킬

- 스킬 추가: `harness-install`(SKILL·DECISIONS·PITFALLS·CHECKS·TEMPLATES)
  - 지금 레포에 harness-agent 게이트를 골격 복사 방식으로 설치한다
  - 이 플러그인을 project scope 로 켠다
  - 결정은 하나씩 묻는다
- 버전 필드 제거: `plugin.json`·`marketplace.json` 에서 `version` 을 뺐다
  - 이후 판은 main 커밋 SHA 로 갈리고 autoUpdate 로 갱신된다(README 「업데이트」)
  - 아래 0.1.0 이 마지막 명시 버전이다

## 0.1.0 — 초기 구성

- 스킬 7: `coordinator` · `fe-be-trace` · `qa-cycle` · `archive-cycle` · `ui-ux-guide`(SKILL·PRINCIPLES·CHECKLIST·REPO_TEMPLATE) · `data-migration` · `plugin-sync`
- 에이전트 6: `backend-engineer` · `frontend-engineer` · `unit-test-engineer` · `change-verifier` · `data-migration-engineer` · `plugin-curator`
- 커맨드 1: `save`
- 훅 없음 — 실행 게이트는 harness-agent 가 맡는다
- 프로젝트 고유값은 각 레포 `harness.config.mjs` 의 `project` 블록에서 읽는다. 값이 없으면 지어내지 않고 묻는다(README 「프로젝트 프로필」)
- 금칙어 스캔 게이트(`tools/scan-forbidden.mjs`, `.githooks/pre-commit`) — 목록 파일 `.forbidden-terms.local` 은 커밋하지 않는다
- 커밋 메타데이터 게이트(`tools/scan-commit-meta.mjs`) — author·committer 신원을 `.forbidden-meta.local`(커밋하지 않음) 패턴과 대조해 차단한다
