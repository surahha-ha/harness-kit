# 출처 대장

이 저장소 자산이 어디서 왔는지 적는 대장이다. 외부 자산을 들여오거나 원본과 다시 맞출 때 같은 커밋에서 그 행을 고친다.
근거(머리말 · 주석 · 반입 커밋 메시지 · README · 원본 대조)가 없으면 「출처 미확인」으로 두고 확인 방법을 적는다. 원본 SHA 는 확인한 값만 적고, 모르면 비운다.
미확인 행은 원본을 확인한 뒤 「외부 유래」·「외부 유래 후 개작」·「자체 작성」 중 하나로 옮긴다. 근거 없이 「자체 작성」으로 옮기지 않는다.

- 구분: **외부 유래**(원본 그대로) · **외부 유래 후 개작**(원본을 고쳐 씀) · **자체 작성**(이 저장소에서 처음 씀) · **출처 미확인**
- 「반입 커밋」은 이 저장소에서 그 자산이 처음 생긴 커밋이다(`git log --diff-filter=A`). 반입 뒤 이 저장소에서 고친 내용은 [CHANGELOG.md](CHANGELOG.md) 에 있다.
- 플러그인 매니페스트의 라이선스 표기는 `UNLICENSED` 다(`plugins/harness-kit/.claude-plugin/plugin.json`).
- 마지막 전수 확인: 2026-10-27, `main` @ `aeb943e` 기준. 「출처 미확인」 행은 0건이다.

## 외부 유래

| 자산 경로 | 구분 | 원본 레포 | 원본 경로 | 원본 SHA | 반입 커밋 | 개작 요지 | 라이선스 | 근거 |
| - | - | - | - | - | - | - | - | - |
| `tools/scan-forbidden.mjs` | 외부 유래 후 개작 | `surahha-ha/harness-agent` | `tools/scan-forbidden.mjs` | `369dbe7c5a58311351060686ca2723466bd52390` | `1ea4e5c` | 판정 로직은 같다. 머리말·주석·차단 안내 문구 5줄에서 원본 문서(번역 규율) 참조를 이 저장소 README 「금칙어 스캔」으로 바꿨다 | 원본 표기 없음 | 머리말 「harness-agent `tools/scan-forbidden.mjs` 의 사본」 · README 「금칙어 스캔」 · 원본 대조(원본 이 파일의 이력은 이 커밋 하나, 원본 `main` @ `f6457ac` 에서도 같은 blob) |
| `.githooks/pre-commit` | 외부 유래 후 개작 | `surahha-ha/harness-agent` | `.githooks/pre-commit` | `369dbe7c5a58311351060686ca2723466bd52390` | `1ea4e5c` | 우회 안내 주석 한 줄을 README 참조로 바꾸고 `tools/scan-commit-meta.mjs` 호출 한 줄을 더했다 | 원본 표기 없음 | 원본 대조(15줄 중 13줄 같음). 파일 안에는 사본 표기가 없다 |
| `plugins/harness-kit/skills/coordinator/` | 외부 유래 후 개작 | 비공개 레포 | | | `1ea4e5c` | 비공개 레포에서 일반화. 문체를 STE 로 다시 씀(docs/ste-format) | 원본 표기 없음 | 사용자 확인(2026-10-27) |
| `plugins/harness-kit/skills/fe-be-trace/` | 외부 유래 후 개작 | 비공개 레포 | | | `1ea4e5c` | 비공개 레포에서 일반화. 문체를 STE 로 다시 씀(docs/ste-format) | 원본 표기 없음 | 사용자 확인(2026-10-27) |
| `plugins/harness-kit/skills/qa-cycle/` | 외부 유래 후 개작 | 비공개 레포 | | | `1ea4e5c` | 비공개 레포에서 일반화. 문체를 STE 로 다시 씀(docs/ste-format) | 원본 표기 없음 | 사용자 확인(2026-10-27) |
| `plugins/harness-kit/skills/archive-cycle/` | 외부 유래 후 개작 | 비공개 레포 | | | `1ea4e5c` | 비공개 레포에서 일반화. 문체를 STE 로 다시 씀(docs/ste-format) | 원본 표기 없음 | 사용자 확인(2026-10-27) |
| `plugins/harness-kit/skills/ui-ux-guide/`(SKILL · PRINCIPLES · CHECKLIST · REPO_TEMPLATE) | 외부 유래 후 개작 | 비공개 레포 | | | `1ea4e5c` | 비공개 레포에서 일반화. 문체를 STE 로 다시 씀(docs/ste-format) | 원본 표기 없음 | 사용자 확인(2026-10-27) |
| `plugins/harness-kit/skills/data-migration/` | 외부 유래 후 개작 | 비공개 레포 | | | `1ea4e5c` | 비공개 레포에서 일반화. 문체를 STE 로 다시 씀(docs/ste-format) | 원본 표기 없음 | 사용자 확인(2026-10-27) |
| `plugins/harness-kit/skills/plugin-sync/` | 외부 유래 후 개작 | 비공개 레포 | | | `1ea4e5c` | 비공개 레포에서 일반화. 문체를 STE 로 다시 씀(docs/ste-format) | 원본 표기 없음 | 사용자 확인(2026-10-27) |
| `plugins/harness-kit/agents/backend-engineer.md` | 외부 유래 후 개작 | 비공개 레포 | | | `1ea4e5c` | 비공개 레포에서 일반화. 문체를 STE 로 다시 씀(docs/ste-format) | 원본 표기 없음 | 사용자 확인(2026-10-27) |
| `plugins/harness-kit/agents/frontend-engineer.md` | 외부 유래 후 개작 | 비공개 레포 | | | `1ea4e5c` | 비공개 레포에서 일반화. 문체를 STE 로 다시 씀(docs/ste-format) | 원본 표기 없음 | 사용자 확인(2026-10-27) |
| `plugins/harness-kit/agents/unit-test-engineer.md` | 외부 유래 후 개작 | 비공개 레포 | | | `1ea4e5c` | 비공개 레포에서 일반화. 문체를 STE 로 다시 씀(docs/ste-format) | 원본 표기 없음 | 사용자 확인(2026-10-27) |
| `plugins/harness-kit/agents/change-verifier.md` | 외부 유래 후 개작 | 비공개 레포 | | | `1ea4e5c` | 비공개 레포에서 일반화. 문체를 STE 로 다시 씀(docs/ste-format). 반입 뒤 `5bb39bc` 에서 같은 비공개 레포의 「커밋 리뷰 모드」를 일반화해 더했다(도메인 체크리스트 없음) | 원본 표기 없음 | 사용자 확인(2026-10-27) · 커밋 리뷰 모드는 사용자 승인 설계(2026-10-29) |
| `plugins/harness-kit/agents/data-migration-engineer.md` | 외부 유래 후 개작 | 비공개 레포 | | | `1ea4e5c` | 비공개 레포에서 일반화. 문체를 STE 로 다시 씀(docs/ste-format) | 원본 표기 없음 | 사용자 확인(2026-10-27) |
| `plugins/harness-kit/agents/plugin-curator.md` | 외부 유래 후 개작 | 비공개 레포 | | | `1ea4e5c` | 비공개 레포에서 일반화. 문체를 STE 로 다시 씀(docs/ste-format) | 원본 표기 없음 | 사용자 확인(2026-10-27) |
| `plugins/harness-kit/commands/save.md` | 외부 유래 후 개작 | 비공개 레포 | | | `1ea4e5c` | 비공개 레포에서 일반화. 반입 뒤 `0ebc431` 에서 경로 지정 커밋으로 바꿨다. 문체를 STE 로 다시 씀(docs/ste-format) | 원본 표기 없음 | 사용자 확인(2026-10-27) |
| `plugins/harness-kit/commands/review-pending.md` | 외부 유래 후 개작 | 비공개 레포 | | | `5bb39bc` | 비공개 레포의 사후리뷰 커맨드를 일반화. 위험 규칙 엔진과 도메인 체크리스트를 빼고, 대상 선별을 `git.reviewThreshold` 로, 이름·원격·통합 브랜치를 `project.review.*` 칸으로 바꿨다 | 원본 표기 없음 | 사용자 승인 설계(2026-10-29) |
| `plugins/harness-kit/scripts/review-pending.mjs` · `tests/review-pending.test.mjs` | 외부 유래 후 개작 | 비공개 레포 | | | `e29983e` | 비공개 레포 분류기 가운데 사후리뷰 부분(리뷰 안 된 커밋 · note 쓰기 · 기본 범위)만 새로 썼다. 규칙 엔진 · 트레일러 판정은 옮기지 않았다 | 원본 표기 없음 | 사용자 승인 설계(2026-10-29) |

**0.1.0 초기 자산 14행** — 위 표에서 반입 커밋이 `1ea4e5c` 인 14행은 모두 저장소 초기 구성 커밋(`1ea4e5c`, 0.1.0)에 한꺼번에 들어왔다. 그 커밋 메시지는 「초기 구성」만 적는다. 사용자 확인(2026-10-27)에 따라 비공개 레포의 자산을 일반화해 들여온 것으로 적는다. 원본 레포 이름은 적지 않는다(이 저장소는 금칙어 스캔 대상이다). 원본 본문을 대조하지 않았으므로 원본 경로·SHA 는 비워 둔다.

## 자체 작성

| 자산 경로 | 반입 커밋 | 근거 |
| - | - | - |
| `plugins/harness-kit/.claude-plugin/plugin.json` · `.claude-plugin/marketplace.json` | `1ea4e5c` | 이 저장소의 매니페스트 |
| `tools/scan-commit-meta.mjs` | `1ea4e5c` | 머리말에 사본 표기 없음 · `surahha-ha/harness-agent` 에 같은 파일 없음(2026-10-27 확인) |
| `plugins/harness-kit/skills/harness-install/`(SKILL · DECISIONS · PITFALLS · CHECKS · TEMPLATES) | `0f07cc5` | 반입 커밋이 이 스킬의 설계를 처음부터 적는다. harness-agent 는 설치 대상으로 가리킬 뿐 그 코드를 담지 않는다 |
| `plugins/harness-kit/skills/harness-install/scripts/install.mjs` · `answer-trace.mjs` | `0ebc431` | 반입 커밋 메시지(「install.mjs 를 더한다」 · CHECKS §6 안의 것을 꺼냄) |
| `plugins/harness-kit/skills/harness-install/scripts/write-manifest.mjs` | `29ebbb0` | 반입 커밋 메시지 |
| `plugins/harness-kit/skills/harness-uninstall/`(SKILL · DECISIONS · PITFALLS · `scripts/uninstall.mjs` · `scripts/edit.mjs`) | `2795e55` | 반입 커밋 메시지 |
| `plugins/harness-kit/skills/docs-setup/`(SKILL · DECISIONS · TEMPLATES · `scripts/lib.mjs` · `observe.mjs` · `refs.mjs` · `links.mjs`) | `c3f83ef` | 반입 커밋 메시지 |
| `plugins/harness-kit/skills/docs-setup/scripts/boundary.mjs` · `boundary.test.mjs` · `config-slots.mjs` | `cc97197` | 반입 커밋 메시지 |
| `plugins/harness-kit/skills/docs-setup/scripts/links.test.mjs` | `e6b90ee` | 반입 커밋 메시지 |
| `plugins/harness-kit/skills/docs-setup/scripts/observe.test.mjs` · `refs.test.mjs` | `f4e59af` | 반입 커밋 메시지 |
| `plugins/harness-kit/scripts/graft-localize.mjs` · `statusline-combined.cjs` · `statusline-setup.mjs` | `3b6a437` | 반입 커밋 메시지. 외부 도구 graft(npm `@nanonets/graft`)의 산출물을 옮길 뿐 graft 코드를 담지 않는다 |
| `tests/graft-localize.test.mjs` · `install-local-items.test.mjs` · `statusline.test.mjs` | `3b6a437` | 반입 커밋 메시지 |
| `plugins/harness-kit/agents/security-reviewer.md` · `performance-reviewer.md` | `3ca6790` | 반입 커밋 메시지(리뷰 갈래 B·C 를 이 저장소에서 처음 씀) · 사용자 승인 설계(2026-11-02) |
| `plugins/harness-kit/agents/review-refuter.md` | `7f8e2dd` | 반입 커밋 메시지(사후리뷰 검증 단계의 반박자를 이 저장소에서 처음 씀) · 사용자 승인 설계(2026-11-02) |
| `plugins/harness-kit/skills/monitor-view/`(SKILL · DECISIONS · CONTRACT · RULES · UI · MASKING · GUIDE · PITFALLS · transports/MQTT) | `370cb43` | 이 저장소에서 처음 씀. 비공개 프로젝트의 구현·리뷰에서 설계·규칙·함정을 뽑아 전송·스택 무관하게 새로 썼다. 원문 코드·문구를 옮기지 않았고 예시 값은 합성값이다 · 사용자 지시(2026-11-04) |
