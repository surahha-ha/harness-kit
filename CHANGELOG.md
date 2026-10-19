# Changelog

버전은 `plugins/harness-kit/.claude-plugin/plugin.json` 과 `.claude-plugin/marketplace.json` 이 항상 같다.
절차 변경·자산 추가 = minor, 문구 정리 = patch.

## 미발행 — 하네스 설치 스킬

- 스킬 추가: `harness-install`(SKILL·DECISIONS·PITFALLS·CHECKS·TEMPLATES) — 지금 레포에 harness-agent 게이트를 골격 복사 방식으로 설치하고, 이 플러그인을 project scope 로 켠다. 결정은 하나씩 묻는다
- 버전 표기는 아직 0.1.0 이다 — 버전 정책(명시 버전 / 커밋 SHA 추적)을 정한 뒤 매니페스트를 고친다

## 0.1.0 — 초기 구성

- 스킬 7: `coordinator` · `fe-be-trace` · `qa-cycle` · `archive-cycle` · `ui-ux-guide`(SKILL·PRINCIPLES·CHECKLIST·REPO_TEMPLATE) · `data-migration` · `plugin-sync`
- 에이전트 6: `backend-engineer` · `frontend-engineer` · `unit-test-engineer` · `change-verifier` · `data-migration-engineer` · `plugin-curator`
- 커맨드 1: `save`
- 훅 없음 — 실행 게이트는 harness-agent 가 맡는다
- 프로젝트 고유값은 각 레포 `harness.config.mjs` 의 `project` 블록에서 읽는다. 값이 없으면 지어내지 않고 묻는다(README 「프로젝트 프로필」)
- 금칙어 스캔 게이트(`tools/scan-forbidden.mjs`, `.githooks/pre-commit`) — 목록 파일 `.forbidden-terms.local` 은 커밋하지 않는다
- 커밋 메타데이터 게이트(`tools/scan-commit-meta.mjs`) — author·committer 신원을 `.forbidden-meta.local`(커밋하지 않음) 패턴과 대조해 차단한다
