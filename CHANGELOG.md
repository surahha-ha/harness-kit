# Changelog

매니페스트에 `version` 필드를 두지 않는다 — 판은 main 커밋 SHA 로 갈린다. 절은 병합 단위로 적는다.
(0.1.0 까지는 `plugin.json` 과 `marketplace.json` 의 명시 버전을 함께 올렸다.)

## 미발행 — 하네스 설치 재개

- `harness-install` 을 재현 시험 결과대로 고친다 — 체크포인트(`git rev-parse --git-path harness-install-state.json`)에 완료 단계·결정 답·원본 SHA 를 적고, 0단계가 중단된 설치·지워진 설치·끝난 설치를 가른다(CHECKS §5). example 복사와 원본 SHA 머리 줄을 3단계로 옮기고, 4단계 완료 기준에 「example 과 다름 + `--status` 활성·프로브」를, 5단계에 「4단계 통과 뒤에만」을 넣는다
- D3 의 공유 자원 테스트 제외는 소스 무수정(빌드 도구 명령줄 주입)을 기본·권장으로, 테스트 소스 태그는 「레포 코드를 바꾼다」고 밝힌 별도 선택지로 둔다
- `.harness/` 비교를 줄끝 무시·index blob 기준으로 바꾸고, 6단계에 답을 바꾼 흔적 점검(`answer-trace.mjs`)을 더한다
- 결정 질문 D1~D7 에 근거 기반 권장을 붙인다 — DECISIONS 의 D 마다 「관찰 → 권장」 규칙표로 1단계 관찰에서 계산해 첫 선택지에 「(권장)」과 근거 한 줄, 선택지마다 바뀌는 것을 단다(꼴 TEMPLATES §8). 레포 코드 변경·공유 자원 쓰기 비차단·테스트 삭제는 권장하지 않고, 권장과 다른 답은 체크포인트 `recs` 와 answer-trace ⑤·보고 표에 남긴다

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
