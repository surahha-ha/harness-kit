# Changelog

매니페스트에 `version` 필드를 두지 않는다 — 판은 main 커밋 SHA 로 갈린다. 절은 병합 단위로 적는다.
(0.1.0 까지는 `plugin.json` 과 `marketplace.json` 의 명시 버전을 함께 올렸다.)

## 미발행 — 설치 선택 항목: graft 로컬 연결 · 전역 상태 줄

- `harness-install` 에 결정 둘을 더한다(기본 끔, 순서 D8·D8-2 뒤) — **D9 graft 사용**(레포 단위, 이 PC·이 트리 전용)과 **D10 전역 상태 줄**(사용자 전역, D9 를 켰을 때만 묻고 권장). 실행은 새 8-2단계(D10 → D9 순서). D9 는 권장을 계산하지 않고 안내 한 줄(코드가 크고 작업이 잦은 레포에서 이득, 작은·문서 위주 레포에선 매 프롬프트 주입이 잡음)과 함께 묻는다 — 기본 안 씀. 묻기 전 `graft-localize.mjs check` 로 graft 설치 여부와 Node 조건만 보고, graft 가 없으면 설치 안내만 하고 건너뛴다
- 플러그인 스크립트 `plugins/harness-kit/scripts/` 를 더한다(Node 내장 모듈만) — `graft-localize.mjs`(`check`·`prepare`·`localize`·`status`·`remove`): init 전 스냅숏과 `.gitignore` 의 `/graft/` 표시 블록(graft build 가 `.gitignore` 텍스트만 보고 매번 덧붙이는 것을 막는다), graft 가 settings.json 에 넣은 훅·상태 줄·권한·`footerLinksRegexes` 를 `settings.local.json` 으로 옮기고 settings.json 을 init 전 바이트로 되돌림(이벤트별 기계 대조, 어긋나면 쓰지 않음), graft 훅 timeout 을 초로 교정(8000·10000·15000 → 8·10·15), `.mcp.json` 정리와 `disabledMcpjsonServers: ["graft"]`, info/exclude 로컬 산출물 블록(추적 경로 제외, 없으면 넣고 있으면 둔다 — worktree 공용이라 `remove` 는 지운 뒤 경고 한 줄만 낸다). 다시 돌려도 같다 — graft 업그레이드가 settings.json 에 키를 다시 넣으면 `localize` 만 다시 돌린다. `statusline-combined.cjs`(원래 명령과 레포의 graft 상태 줄 헬퍼를 병렬로 돌려 줄 단위로 잇고, 헬퍼가 실패하면 그 줄만 뺀다) · `statusline-setup.mjs`(`status`·`install`·`restore` — base 를 돌릴 셸을 설치 때 한 번 정해 `statusline.json` 의 `shell` 에 절대경로로 적고 그 셸로 base 를 한 번 돌려 확인, 전역 settings.json 백업 뒤 `statusLine.command` 만 바꾸고, 다른 합치기 스크립트를 가리키거나 base 확인이 실패하면 아무것도 쓰지 않고 멈춤, 되돌리기는 지금 값이 우리가 쓴 값일 때만 전역 값만 — 사본은 레포 `settings.local.json` 이 가리킬 수 있어 남긴다). 합치기 스크립트는 실행 때 셸을 찾지 않는다 — Claude Code 의 PATH(System32 가 앞)에서 이름으로 찾은 bash 가 WSL bash 라 base 줄이 조용히 사라진 실물 시험 결과다. base 실패는 `statusline base 실패(exit N)` 한 줄로, `shell` 이 없는 옛 설정은 안내 한 줄로 낸다. `graft-localize.mjs remove` 는 다 걷으면 `git-path harness-kit-graft/` 째 지우고, `check`·`prepare` 의 `graft --version` 은 Windows 에서 cmd 로 명시 실행한다(`shell:true` 의 DEP0190 경고 없음)
- harness-kit 이 사용자 전역에 쓰는 첫 항목이라 README 에 예외와 이유(플러그인 settings 는 `agent`·`subagentStatusLine` 만 받는다)를 적는다. graft 업그레이드 뒤 재실행 안내도 README 에
- 영수증(`write-manifest.mjs`)에 `local`(커밋되지 않는 로컬 항목 — 해시 없음, 상대경로·`~/`·`git-path:` 꼴만)을 더한다(TEMPLATES §9)
- `harness-uninstall` 에 0-2단계(scan 전)를 더한다 — graft 로컬 연결 걷어내기(`graft-localize.mjs remove`, 그래프만 남기기 가능)와 전역 상태 줄 되돌리기를 레포 걷어내기와 따로 묻는다. scan 은 graft 가 아직 연결된 트리에서 `.gitignore` 의 `/graft/` 블록을 「남김」으로 권한다
- 시험을 더한다 — `npm test`(`tests/*.test.mjs`, node:test · 임시 git 레포·임시 홈, git 전역 설정을 비워 돈다)
- D9 사전 점검에 Node 판 확인을 더한다 — `graft-localize.mjs` 의 `check`·`prepare` 가 graft 설치본(`npm root -g` 아래, 없으면 실행 파일 위치)의 `engines.node` 를 지금 Node 와 대어 보고(`>=X`·`>=X.Y.Z`·`^X`), 못 미치면 graft 가 있어도 「Node <요구> 필요, 현재 <판>」으로 건너뛴다(종료코드 3). 못 읽거나 해석하지 못하면 `WARN` 만 내고 진행한다. 설치 안내에 `npm view @nanonets/graft engines` → `node --version` 비교 → 모자라면 Node 먼저 올리기를 넣는다

## 미발행 — 문서 셋업 스킬

- 스킬 추가: `docs-setup`(SKILL·DECISIONS·TEMPLATES·`scripts/` observe·refs·links) — 레포에 아카이브 폴더·`docs/README.md` 성격표·`CLAUDE.md` 작업 라우팅·문서 규약 표를 세우고, 「아직 일을 시키는가」로 판정한 끝난 문서를 배너와 함께 옮긴다. `project.docs.archiveDir`·`pathValidator`·`autoloaded`·`project.memory.slugs` 를 채우고 harness-agent `docs.always`·`docs.archive` 를 맞춰 `archive-cycle` 이 바로 돌게 하며, 메모리 규약(인덱스 한 줄 형식·연표 접기·핸드오프 보관 수·정리 시점 — 수치는 판단값)을 `CLAUDE.md` 에 넣는다. 결정은 하나씩 묻고 관찰에서 계산한 권장을 보인다. 이동은 `git mv` 없이 백업 → 이동 → 참조 고침(지시 문서는 따로 묻는다) → 기준선 대비 링크 검사 → 경로 지정 커밋 순이고, 체크포인트로 이어받는다
- 「이관 후 접기」 문서는 옮기지 않고 archive-cycle 이관 대상으로 넘긴다. 아카이브가 아닌 이동은 권장하지 않는다
- docs-setup 이 채운 config 칸이 재설치·설치 단계 변경 뒤에도 남게 한다 — 칸마다 줄 끝 `// harness-kit:docs-setup` 표시(문서 칸이 없는 config 에는 표시 붙은 블록째)와 영수증 `owners["docs-setup"]`(설치 칸은 그대로) · `scripts/config-slots.mjs`(list·record·backups·restore). harness-uninstall 은 그 칸을 후보와 따로 보고하고 백업 `index.json` 에 `docsSetup` 으로 적으며, harness-install D8-2 가 최신 백업에서 되살릴지 묻는다(가리키는 폴더·파일이 남아 있으면 권장 「되살림」). 옮긴 문서·배너·성격표·`CLAUDE.md` 표가 걷어내기 후보가 되지 않는지 `scripts/boundary.mjs`(uninstall 과 같은 판정 함수)로 보고, `scripts/boundary.test.mjs` 가 설치 → docs-setup → 걷어내기 → 새 설치(표준·라이트 꼴) → 되살리기를 시험한다
- 옮긴 뒤 커밋 전에 `observe.mjs` 가 지워진 옛 경로를 읽다 멈추던 것(작업본에 없는 추적 파일을 목록에서 뺀다)과, `links.mjs` 가 아카이브 배너의 옛 경로 표기를 새 깨짐으로 세던 것(배너 줄의 경로는 출처 표기로 본다)을 고친다
- `links.mjs`·`refs.mjs`·`observe.mjs` 가 함께 쓰는 `lib.mjs` 의 `mdLinks` 가 인라인 코드 스팬 안의 링크 꼴(`` `[제목](파일.md)` `` — TEMPLATES 메모리 규약 절의 예시)을 링크로 세어 적용한 레포마다 깨진 링크로 보고하던 것을 고친다 — 줄마다 코드 스팬을 같은 길이 공백으로 가린 뒤 링크를 뽑고(`maskCodeSpans`), 펜스 안은 전처럼 뺀다. 백틱 속 레포 경로 문자열 판정(links 의 path · refs 의 경로)은 그대로다. `scripts/links.test.mjs` 가 스팬·펜스 안 링크 꼴 0 · 본문 깨진 링크 1 · 경로 판정 유지를 시험한다
- 실제 레포 시험 적용에서 찾은 결함을 고친다 — `refs.mjs` 가 링크 글자에 적힌 옛 경로(`[docs/a.md](a.md)`)를 대상만 고치고 글자는 남기던 것, 지시 문서(`CLAUDE.md`·`.claude/`·`harness.config.mjs`) 줄까지 자동으로 고쳐 3단계 질문이 사후 확인이 되던 것(이제 `instr` 로 따로 내고 자동 고침 수에서 뺀다), 계획 없는 판이 「자동 고침」이라 적던 것을 고치고, 4단계용 `--after`(배너 출처·새 경로 표기는 정상으로, 남은 옛 경로만 목록)를 더한다. `observe.mjs` 가 `.claude/`·하위 `CLAUDE.md` 의 미커밋 변경을 세지 않던 것, archiveDir 와 같고 모두 배너를 단 `docs.archive` 칸을 「어긋남?」으로 내던 것을 고친다. 펜스는 연 글자와 같은 글자로만 닫는다(`fenceTracker`). 체크포인트·계획·기준선은 scratchpad 가 아니라 git 디렉토리에 두고 `skillDir`·시계에서 읽은 `updated` 를 적으며, 재개는 스킬을 다시 불러서 한다. 질문 전에 후보·칸·판단값 표를 본문에 내고, header 를 「대상+동작」으로 정하며, 쉬운 말 풀이표·「권장 이유」·「권장 없음」을 harness-install 질문 꼴에 맞춘다. `scripts/refs.test.mjs`·`observe.test.mjs` 를 더하고 `links.test.mjs` 에 펜스 글자 경우를 넣는다

## 미발행 — 하네스 설치 시험 반영

- `harness-install` 에 `scripts/install.mjs` 를 더한다 — `precheck`(트리 종류·worktree 여부·다른 세션을 timestamp 있는 마지막 user·assistant 기록으로 동시·최근·오래됨으로 가름) · `settings-snap`·`settings-eol`·`after-cli`(settings 의 줄끝·BOM·끝 개행을 손대기 전 판대로 되살리고, CLI 가 다시 쓴 파일을 손본 직후 스냅숏으로 되덮음) · `test-select`(테스트 제외 패턴을 소스 트리에 대어 빠지는 것을 펼치고 실행 결과와 대조 — 디렉토리 일치로 하위 패키지까지 빠지는 것을 잡는다) · `slots`(kit 자산이 읽는 슬롯을 모아 빈 키와 이유 없는 `null` 을 실패로 셈) · `plugin-hooks`(끌 플러그인의 훅 목록). CHECKS §6 안에 있던 `answer-trace.mjs` 를 `scripts/` 로 꺼낸다
- 결정 순서를 D1→D2(D2-2)→D3→D6(D6-2)→D4→D5→D7→D8 로 바꾼다. D1 은 worktree 안에서 실행됐는지에 따라 권장과 문구가 바뀐다. D2-2(서버 기동 같은 간접 접속, 권장 ask)와 D6-2(끄는 플러그인이 막던 명령을 하나씩 deny·ask·막지 않음으로 물음)를 정식 결정으로 둔다. D7 에 e2e·testFirst·sharedDbProfiles·memory.slugs 규칙을, D8 에 kit 슬롯 표와 docs-setup 연결 문구를 둔다
- 질문 꼴(TEMPLATES §8)에 쉬운 말 풀이표를 더하고 되물음이 났던 질문 본문을 고쳐 쓴다. 권장이 없을 때 「권장 없음 — 판단 근거 부족, 직접 골라 주세요」로 밝힌다. 첫 플러그인 설치 안내에 비공개 레포 접근 단계를 넣는다
- CHECKS §4 에 도구 경로·와일드카드 케이스와 래퍼 변형 자동 생성(`HOLE`)을, §8 에 「빠질 것만 빠지고 돌 것은 돌았나」 확인을 더한다. 5단계는 settings 를 Write 로 쓰지 않고 Edit 만 쓴다
- 프로젝트 고유 플러그인은 파일이 바뀌면 버전을 올리고, harness-kit 은 버전 없이 SHA 로 추적한다는 관례를 8단계에 적는다
- `/save` 를 경로 지정 커밋으로 바꾼다 — 신규 파일만 `git add -N`, `git commit -F <메시지> -- <경로>` 를 브랜치·toplevel 조건과 한 명령으로, 게이트의 diff 는 `--cached` 대신 `git diff HEAD -- <경로>`, 푸시는 `git push origin <브랜치>`. `git.commitExecution: message-only` 면 명령만 건넨다. 남이 stage 해 둔 변경은 커밋에 들어가지 않고 index 에 남는다
- `plugin-sync` 7단계와 `archive-cycle` ⑤-3 도 같은 꼴로 바꾼다 — `git add` + 경로 없는 `git commit` 을 신규 파일만 `git add -N` + 조건을 붙인 `git commit -F <메시지> -- <경로>` 로, plugin-sync 푸시는 `HEAD:` 대신 작업 브랜치 이름을 적는다. 두 스킬의 읽는 슬롯에 `git.commitExecution` 을 더한다(README 프로필 표 · harness-install D5 설명 함께)

## 미발행 — 하네스 걷어내기

- 스킬 추가: `harness-uninstall`(SKILL·DECISIONS·PITFALLS · `scripts/uninstall.mjs`·`scripts/edit.mjs`) — harness-install 이 넣은 것만 블록·줄·치환·JSON 키 단위로 걷어 낸다. 영수증이 있으면 영수증 기준(sha256 이 다르면 「설치 뒤 손댄 것」으로 따로 묻는다), 없으면 알려진 구조로 후보를 뽑아 항목마다 묻는다. 손대기 전 `git-path harness-uninstall-backup/` 백업과 런타임 산출물의 `git-common-dir` 증거 사본, 체크포인트로 이어받기, 후보 밖 파일을 가리키는 참조는 보고만, settings 는 하네스가 아닌 훅을 이벤트별로 백업과 대조, `git restore`·`checkout` 금지, 커밋은 지우기 전에 읽어 둔 `commitExecution` 대로 경로 지정·직전 확인, 플러그인 키는 맨 마지막 결정. 재설치는 uninstall → 새 세션 → install
- `harness-install` 이 영수증과 경계 표시를 남긴다 — 9단계가 레포 루트 `harness.install.json`(커밋 대상)에 원본·SHA·설치 시각·결정 답·만든 파일과 sha256(줄끝 LF 정규화)·고친 곳(표시 블록 · 한 줄 표시 · 바꾸기 전·뒤 원문)·settings 훅과 키·플러그인 설치 기록을 `scripts/write-manifest.mjs` 로 쓴다. `.gitignore` 줄과 `CLAUDE.md` 「개발 하네스」 절은 `harness-kit:begin`·`harness-kit:end` 로 감싸고, 절을 가리키는 줄에는 `harness-kit:line` 을 붙인다(TEMPLATES §3·§4·§9, CHECKS §7). 0단계가 끝난 설치에서 멈출 때 「`harness-uninstall` → 새 세션 → install」을 안내한다
- `harness-uninstall` 을 대화형 시험 결과대로 고친다 — verify 의 커밋 경로는 걷어 낸 연산을 HEAD 판에 해 보아 HEAD 에 그 조각이 있던 경로만 세고, 설치가 커밋된 적 없는 트리는 이유와 함께 0개로 내며 메시지 파일을 만들지 않는다(scan 이 `installAtHead` 를 적는다). apply 가 계측 로그를 지우기 직전에 증거 사본을 지금 판으로 다시 맞추고(백업 뒤 더해진 줄), 백업 `index.json` 에 바이트 해시 `sha256` 과 LF 정규화 `sha256Lf` 를 함께 적으며, 되돌리기 한 줄과 `restore-check` 를 더한다. backup 은 「백업 N개 = 후보 파일 N개」를, verify 는 보고용 요약(후보·답·적용 수 · 백업·증거 절대경로와 수명)을 낸다. 질문 header 를 스크립트가 후보마다 겹치지 않게 정하고(훅은 이벤트 이름 · 같은 종류는 번호 · 플러그인 키는 `kit 키 처리`), 권장이 없는 질문은 「권장 없음」을 먼저 밝혀 고정 순서(목적은 완전 제거 먼저)로 묻고 「권장대로」로는 채우지 않는다. 본문은 평이한 말 먼저(낱말 표), 라벨에 사용자 판단을 단정하지 않으며, 옛 훅 오류는 「날 수 있다」로 낮추고, 보고를 먼저 보인 뒤에 finish 를 부른다
- `harness-uninstall` 을 2차 대화형 시험 결과대로 고친다 — 설치기록 질문은 `records` 가 `installed_plugins.json` 에서 `projectPath` 가 이 루트와 같은 기록만 골라(Windows 대소문자 무시 · 슬래시 통일) 그때만 묻고, worktree 이고 메인 트리에도 기록이 있으면 CLI 를 권하지 않고 손 절차를 낸다. `plugin` 이 키를 지운 직후 settings 를 `after-plugin/` 에 뜨고, `after-cli` 가 CLI 뒤 그 스냅숏과 바이트 대조해 되덮는다(3단계 백업으로 되덮으면 kit 키가 되살아났다). 순서를 plugin → records → (CLI) after-cli → verify 로 못 박고 명령마다 「다음:」 줄을 낸다. 다른 세션 확인은 `sessions` 가 timestamp 있는 마지막 user·assistant 기록 시각과 경과로 내고(수정 시각은 종료 때 늦어진다) 목적 질문과 묶지 않고 먼저 묻는다. scan 이 앞선 백업 `index.json`(이제 후보·답을 적는다)과 이름 패턴으로 두 번째 걷어내기의 남긴 보조 파일과 그 참조를 되찾는다. 되돌리기 줄은 스크립트 절대경로를 넣어 그대로 돌릴 수 있게 하고 스크립트 없는 손 절차를 함께 낸다. apply 는 늘 `적용 N건` 을 내고, 결과가 HEAD 와 내용이 같아진 파일은 체크아웃 판 줄끝으로 쓰며, 이미 줄끝만 다른 파일에는 verify 가 `eol-fix`(또는 `git checkout --`)를 안내한다(`update-index --refresh` 로는 풀리지 않는다). verify 요약에 남은 참조 수 · 설치 기록 판정 · 앞선 백업·증거 사본 · 「남긴 것을 나중에 지우려면」을 더하고, kit 키 「끔」 설명을 「이 레포 설정에서만 빠집니다 — 사용자 범위로 켜 둔 PC 에서는 계속 뜹니다」로 바꾼다. 후보 파일이 0개일 때 backup 이 index.json 자리를 못 만들던 것도 고친다

## 미발행 — 하네스 설치 재개

- `harness-install` 을 재현 시험 결과대로 고친다 — 체크포인트(`git rev-parse --git-path harness-install-state.json`)에 완료 단계·결정 답·원본 SHA 를 적고, 0단계가 중단된 설치·지워진 설치·끝난 설치를 가른다(CHECKS §5). example 복사와 원본 SHA 머리 줄을 3단계로 옮기고, 4단계 완료 기준에 「example 과 다름 + `--status` 활성·프로브」를, 5단계에 「4단계 통과 뒤에만」을 넣는다
- D3 의 공유 자원 테스트 제외는 소스 무수정(빌드 도구 명령줄 주입)을 기본·권장으로, 테스트 소스 태그는 「레포 코드를 바꾼다」고 밝힌 별도 선택지로 둔다
- `.harness/` 비교를 줄끝 무시·index blob 기준으로 바꾸고, 6단계에 답을 바꾼 흔적 점검(`answer-trace.mjs`)을 더한다
- 결정 질문 D1~D7 에 근거 기반 권장을 붙인다 — DECISIONS 의 D 마다 「관찰 → 권장」 규칙표로 1단계 관찰에서 계산해 첫 선택지에 「(권장)」과 근거 한 줄, 선택지마다 바뀌는 것을 단다(꼴 TEMPLATES §8). 레포 코드 변경·공유 자원 쓰기 비차단·테스트 삭제는 권장하지 않고, 권장과 다른 답은 체크포인트 `recs` 와 answer-trace ⑤·보고 표에 남긴다
- 결정 질문의 꼴을 다듬는다(TEMPLATES §8) — header 는 D 번호를 빼고 대상 + 동작 명사구로(`테스트DB 볼륨삭제`), 질문 첫 문장은 대상과 할 일을 평이한 말로, 선택지 라벨은 그것만 읽어도 뜻이 통하게(`막지 않음`·`실행 전 확인 (ask)`·`차단 (deny)`) 쓰고, CHECKS §6 에 질문 형식 점검(6)을 더한다

## 미발행 — plugin-sync 버전 분기

- `plugin-sync` 5단계와 `plugin-curator` F 축을 버전 정책으로 가른다 — 두 매니페스트에 `version` 이 있으면 함께 올리고 일치를 보며, 둘 다 없으면(커밋 SHA 추적) 올리지도 새로 넣지도 않고 정상으로 보고, 한쪽에만 있으면 멈추고 묻는다(감사에서는 드리프트). 6단계 validate 의 `--strict` 는 명시 버전일 때만 붙인다

## 미발행 — 하네스 설치 스킬

- 스킬 추가: `harness-install`(SKILL·DECISIONS·PITFALLS·CHECKS·TEMPLATES) — 지금 레포에 harness-agent 게이트를 골격 복사 방식으로 설치하고, 이 플러그인을 project scope 로 켠다. 결정은 하나씩 묻는다
- 버전 필드 제거: `plugin.json`·`marketplace.json` 에서 `version` 을 뺐다 — 이후 판은 main 커밋 SHA 로 갈리고 autoUpdate 로 갱신된다(README 「업데이트」). 아래 0.1.0 이 마지막 명시 버전이다

## 0.1.0 — 초기 구성

- 스킬 7: `coordinator` · `fe-be-trace` · `qa-cycle` · `archive-cycle` · `ui-ux-guide`(SKILL·PRINCIPLES·CHECKLIST·REPO_TEMPLATE) · `data-migration` · `plugin-sync`
- 에이전트 6: `backend-engineer` · `frontend-engineer` · `unit-test-engineer` · `change-verifier` · `data-migration-engineer` · `plugin-curator`
- 커맨드 1: `save`
- 훅 없음 — 실행 게이트는 harness-agent 가 맡는다
- 프로젝트 고유값은 각 레포 `harness.config.mjs` 의 `project` 블록에서 읽는다. 값이 없으면 지어내지 않고 묻는다(README 「프로젝트 프로필」)
- 금칙어 스캔 게이트(`tools/scan-forbidden.mjs`, `.githooks/pre-commit`) — 목록 파일 `.forbidden-terms.local` 은 커밋하지 않는다
- 커밋 메타데이터 게이트(`tools/scan-commit-meta.mjs`) — author·committer 신원을 `.forbidden-meta.local`(커밋하지 않음) 패턴과 대조해 차단한다
