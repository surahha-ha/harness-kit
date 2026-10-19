---
name: fe-be-trace
description: Use this skill when verifying how a feature works or "where data is fetched/called from" across a stack split into FE and BE. Triggers when investigating an API-backed behavior, debugging a discrepancy, or answering "어디서 조회해? / 이거 어디서 호출돼? / 동작 확인". Enforces always tracing FE AND BE together — never concluding from one side — because the FE URL can be unchanged while the BE implementation (external integration call vs own table) has switched.
---

# FE/BE Trace — 양쪽 동시 확인 원칙

기능 동작이나 "어디서 무엇을 호출/조회하는지" 판단할 때 **FE와 BE를 항상 같이** 추적한다. 한쪽만 보고 결론 내리지 않는다.

## 프로필 — 프로젝트 고유값을 읽는 곳

이 스킬은 프로젝트 고유값을 본문에 갖지 않는다. 레포 루트 `harness.config.mjs` 의 `project` 블록에서 읽는다(슬롯 정의는 harness-kit README 「프로젝트 프로필」).

- 읽는 순서: 현재 레포 config → `project.pairOwner` 가 가리키는 주 레포 config.
- 이 스킬이 읽는 슬롯: `sides.fe.root` · `sides.be.root` · `sides.be.persistence` · `contract.feDirs` · `contract.rulesDoc` · `contract.dataSourceRule` · `docs.domainIndex`
- **값이 없으면 지어내지 않는다.** 파일이 없거나 슬롯 키가 없으면 그 자리에서 멈추고 사용자에게 묻는다. `null` 은 "해당 없음으로 판단됨"이므로 그 단계를 건너뛰고 결론에 적는다.

## 트리거
- "이 기능 어떻게 동작해 / 어디서 조회해 / 어디서 호출돼"
- API 연동 동작 확인, FE-BE 불일치 디버깅
- `docs.domainIndex` 에 나오는 도메인의 동작 조사

## 원칙
**FE가 호출하는 URL이 동일해도 BE 구현이 바뀌어 있을 수 있다.** URL 동일 ≠ 동작 동일.

전형적인 사고: FE store 는 같은 endpoint 를 그대로 호출하는데, BE 는 외부 시스템 연동 호출에서 자체 테이블 조회로 바뀌어 있었다. FE 호출부만 보고 "외부 연동"이라 단정하면 BE 변경을 놓친다. 데이터 원천이 다른 외부 시스템으로 옮겨졌는데 FE 호출 경로는 그대로인 경우도 같다.

## 절차
1. **FE 호출부 추적** (`sides.fe.root`):
   - `contract.feDirs` 의 api 모듈 → store → 컴포넌트. 실제 URL과 사용처 확인.
2. **BE 핸들러 추적** (`sides.be.root`):
   - Controller → Service → `sides.be.persistence` 계층(Mapper/XML, Repository/Entity 등)까지 같은 흐름으로 연다.
   - **실제 데이터 소스 확인**: 외부 연동 클라이언트 호출인가, 자체 테이블 조회인가. 판별 규칙이 프로젝트에 정해져 있으면 `contract.dataSourceRule` 문서를 따른다.
3. URL이 같다고 BE 동작이 같다고 가정하지 않는다. Controller→Service까지 열어 소스 판별.
4. 결론에 FE 측 표현/사용처 + BE 측 데이터 소스를 **양쪽 다** 명시.

## 도메인 진입점
BE 도메인별 Controller/Service/영속 계층 위치는 `docs.domainIndex` 가 가리키는 문서를 연다. 그 문서에 없는 영역은 **코드가 SSOT** 다 — 라우팅 정의와 Controller 를 직접 연다.

## 관련
`data.schemaProcedureSkill`(스키마 절차 스킬) · `contract.rulesDoc`(계약 규율 문서)
