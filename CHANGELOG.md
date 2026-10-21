# Changelog

매니페스트에 `version` 필드를 두지 않는다 — 판은 main 커밋 SHA 로 갈린다. 절은 병합 단위로 적는다.
(0.1.0 까지는 `plugin.json` 과 `marketplace.json` 의 명시 버전을 함께 올렸다.)

## 미발행 — 하네스 걷어내기

- 스킬 추가: `harness-uninstall`(SKILL·DECISIONS·PITFALLS · `scripts/uninstall.mjs`·`scripts/edit.mjs`) — harness-install 이 넣은 것만 블록·줄·치환·JSON 키 단위로 걷어 낸다. 영수증이 있으면 영수증 기준(sha256 이 다르면 「설치 뒤 손댄 것」으로 따로 묻는다), 없으면 알려진 구조로 후보를 뽑아 항목마다 묻는다. 손대기 전 `git-path harness-uninstall-backup/` 백업과 런타임 산출물의 `git-common-dir` 증거 사본, 체크포인트로 이어받기, 후보 밖 파일을 가리키는 참조는 보고만, settings 는 하네스가 아닌 훅을 이벤트별로 백업과 대조, `git restore`·`checkout` 금지, 커밋은 지우기 전에 읽어 둔 `commitExecution` 대로 경로 지정·직전 확인, 플러그인 키는 맨 마지막 결정. 재설치는 uninstall → 새 세션 → install
- `harness-install` 이 영수증과 경계 표시를 남긴다 — 9단계가 레포 루트 `harness.install.json`(커밋 대상)에 원본·SHA·설치 시각·결정 답·만든 파일과 sha256(줄끝 LF 정규화)·고친 곳(표시 블록 · 한 줄 표시 · 바꾸기 전·뒤 원문)·settings 훅과 키·플러그인 설치 기록을 `scripts/write-manifest.mjs` 로 쓴다. `.gitignore` 줄과 `CLAUDE.md` 「개발 하네스」 절은 `harness-kit:begin`·`harness-kit:end` 로 감싸고, 절을 가리키는 줄에는 `harness-kit:line` 을 붙인다(TEMPLATES §3·§4·§9, CHECKS §7). 0단계가 끝난 설치에서 멈출 때 「`harness-uninstall` → 새 세션 → install」을 안내한다
- `harness-uninstall` 을 대화형 시험 결과대로 고친다 — verify 의 커밋 경로는 걷어 낸 연산을 HEAD 판에 해 보아 HEAD 에 그 조각이 있던 경로만 세고, 설치가 커밋된 적 없는 트리는 이유와 함께 0개로 내며 메시지 파일을 만들지 않는다(scan 이 `installAtHead` 를 적는다). apply 가 계측 로그를 지우기 직전에 증거 사본을 지금 판으로 다시 맞추고(백업 뒤 더해진 줄), 백업 `index.json` 에 바이트 해시 `sha256` 과 LF 정규화 `sha256Lf` 를 함께 적으며, 되돌리기 한 줄과 `restore-check` 를 더한다. backup 은 「백업 N개 = 후보 파일 N개」를, verify 는 보고용 요약(후보·답·적용 수 · 백업·증거 절대경로와 수명)을 낸다. 질문 header 를 스크립트가 후보마다 겹치지 않게 정하고(훅은 이벤트 이름 · 같은 종류는 번호 · 플러그인 키는 `kit 키 처리`), 권장이 없는 질문은 「권장 없음」을 먼저 밝혀 고정 순서(목적은 완전 제거 먼저)로 묻고 「권장대로」로는 채우지 않는다. 본문은 평이한 말 먼저(낱말 표), 라벨에 사용자 판단을 단정하지 않으며, 옛 훅 오류는 「날 수 있다」로 낮추고, 보고를 먼저 보인 뒤에 finish 를 부른다

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
