---
name: data-migration
description: Use this skill when migrating EXISTING data through a schema change (any DB that already holds rows — stage/prod) or ingesting data from ANOTHER service's live DB into your tables (cross-system ETL). Covers data-preserving ALTER/RENAME/type-change, backfilling new NOT NULL columns, moving data between tables, and pulling from a source service via DB dump or API batch. Triggers on "마이그레이션", "데이터 보존하면서 스키마 변경", "rename을 운영에 반영", "다른 서비스/레포 DB 데이터 이관", "운영 DB 데이터 이행", "ETL". Runs the disciplined procedure (assess → idempotent script → backup+dry-run on copy → rollback plan → approval → execute → verify); for cross-system sources adds S(source acquisition) → M(mapping, natural-key reconciliation) front-end. NOT for dev recreate (drop & re-init) — that's a schema-apply task, not a migration. Project-specific deltas live in that project's own overlay skill.
---

# Data Migration — 기존 데이터 보존 이행 / 크로스-시스템 ETL (범용)

이 스킬은 데이터를 잃거나 깨뜨리지 않고 이행하는 표준이다. 대상은 아래 두 경우다.

- 이미 **데이터가 들어있는** DB(주로 stage/prod)의 스키마를 바꿀 때
- 다른 시스템의 데이터를 내 테이블로 가져올 때

dev를 `drop & re-init`으로 갈아엎는 것과 **정반대 작업**이다.

> 이 스킬은 **범용 규율**이다. 프로젝트별 특이사항은 해당 프로젝트의 전용 스킬에 둔다. 그 이름이 `data.migrationOverlaySkill` 이다.
> 특이사항의 예: 스키마 경로·명명 규칙·기존 sync 경로·감사컬럼 규약·이력 함정.
> 둘을 함께 적용하고, 어긋나면 프로젝트 스킬이 우선한다.

## 프로필 — 프로젝트 고유값을 읽는 곳

이 스킬은 프로젝트 고유값을 본문에 갖지 않는다. 레포 루트 `harness.config.mjs` 의 `project` 블록에서 읽는다(슬롯 정의는 harness-kit README 「프로젝트 프로필」).

- 읽는 순서: 현재 레포 config → `project.pairOwner` 가 가리키는 주 레포 config.
- 이 스킬이 읽는 슬롯: `data.schemaMgmt` · `data.schemaHome` · `data.migrationOverlaySkill` · `risk.destructive` · `risk.sharedDbProfiles`
- **값이 없으면 지어내지 않는다.**
  - 파일이 없거나 슬롯 키가 없으면 그 자리에서 멈추고 사용자에게 묻는다.
  - 특히 마이그레이션 도구 유무를 추정하지 않는다.
  - `null` 은 "해당 없음으로 판단됨"이다. 그 단계를 건너뛰고 보고에 적는다.
  - 예: `data.migrationOverlaySkill: null` → 프로젝트 애드온 없이 범용 절차만.

## ⚠️ 전제 판정 (먼저)

- **마이그레이션 프레임워크 유무 확인** (`data.schemaMgmt`)
  - Flyway/Liquibase가 있으면 버전 추적/증분 적용을 그 위에서 한다.
  - 없으면(init SQL만 있는 프로젝트 등) **스크립트가 반드시 멱등**(재실행 안전)이어야 한다.
  - 이유: 누가 어디까지 돌렸는지 도구가 모른다.
- **dev = recreate면 대상 아님**
  - 개발 DB를 drop & re-init으로 재생성(데이터 폐기)하는 건 마이그레이션이 아니다.
  - **보존할 데이터가 있는 환경**만 이 스킬 대상이다.
- **대상 DB 의 실물 스키마는 매번 조회해 확인한다.**
  - 앱 배포와 스키마 이행은 따로 움직인다.
  - 레포 브랜치 상태로 대상 DB 스키마를 단정하지 않는다.

## 🔴 원격 DB(dev·stage·prod) 취급 철칙

원격 실 DB 에서 실제 사고가 난 것만 모았다. 넷 다 원인이 하나다 — **레포/로컬을 근거로 원격을 단정한 것.**

0. **접속 게이트 — 허가 전에는 접속 시도 자체를 하지 않는다.**
   - 공유 DB 는 사용자가 "접속 허용" 을 명시하기 전까지 붙지 않는다.
   - 자격증명을 알고 있는 것은 허가가 아니다.
   - 오프라인 대조(레포 DDL·매퍼·문서)를 먼저 끝낸다.
   - 실물 확인이 필요하면 **실행할 SQL 을 제시한 뒤 승인**을 받는다.
   - 쓰기(INSERT/UPDATE/DELETE/LOAD)는 매번 별도 사전 승인을 받는다.
   - 어느 프로파일이 공유 DB 를 향하는지는 `risk.sharedDbProfiles` 로 확인한다.
   - 프로파일 이름(`local` 등)으로 추정하지 않는다.
1. **레포 DDL ≠ 실물 스키마 — 물리 FK 를 먼저 조회한다.**
   - 레포 DDL 이 주석으로 "논리 FK" 라고 못 박은 관계가 있었다.
   - 그 관계가 원격 실물엔 **물리 FK 로 걸려 있던** 사례가 있다.

   작업 전 실물에서 확인한다(MySQL/MariaDB 예):

   ```sql
   SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
     FROM information_schema.KEY_COLUMN_USAGE
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL;
   ```
2. **번호 리맵은 INSERT 되는 값 자체에 한다 — 사후 UPDATE 금지.**
   - 금지하는 방식: "원본 번호로 넣어두고 나중에 UPDATE 로 새 번호에 맞춘다".
   - 물리 FK 가 있으면 이 방식은 FK 위반(MySQL/MariaDB `ERROR 1452`)으로 **전량 롤백**된다.
   - 리맵은 dump/생성 단계에서 값에 적용해 넣는다.
   - 크로스호스트는 dump + 치환이 기본이다.
   - **치환에는 연쇄 방지 마커가 필수**다. 새로 넣은 번호가 다음 치환에 다시 걸리면 안 된다.
3. **원격 포트가 읽기 라우팅 프록시일 수 있다 — 검증 SELECT 는 마스터를 강제한다.**
   - 프록시 경유 시 COMMIT 직후 SELECT 가 복제본으로 가 **0행으로 보인다**(적재는 정상).
   - 이걸 실패로 오판해 재적재하면 중복이 된다.

   마스터 강제 예:

   ```sql
   START TRANSACTION;  -- 마스터로 강제
   SELECT COUNT(*) FROM ...;
   COMMIT;
   ```

## 트리거
- 데이터가 있는 환경의 CREATE/ALTER/RENAME/타입변경/컬럼추가
- "운영에 rename 반영 / prod 컬럼 바꿔야 하는데 데이터 있음 / 테이블 간 데이터 이관 / 타 시스템 데이터 이관"

## 절차

### 0. 마이그레이션이 정말 필요한가 판정
대상 환경에 보존할 데이터가 있나? dev recreate로 끝나면 반려. 데이터 있는 환경만 진행.

### 1. 영향 평가 (보고에 **먼저**)
- **변경 카탈로그**: 어떤 테이블/컬럼이 어떻게(rename/타입/추가/이동). 누적 rename이면 **origin → 최종명 1회 점프**(중간 단계 거치지 말 것).
- **데이터량 / 다운타임 허용 여부 / 점검창**.
- **FK 의존 순서**: 부모 PK·자식 FK 컬럼 rename 순서, 또는 FK 제약 일시 해제(`SET FOREIGN_KEY_CHECKS=0` 등) 구간.
- **백필 필요 컬럼**: 신규 NOT NULL(감사/메타 컬럼 포함)은 기존 행에 값 채워야 함.
- **DB 엔진 능력 확인**
  - 엔진/버전별 ALTER 능력을 먼저 확인한다.
  - 예) MariaDB `RENAME COLUMN`은 10.5(패치 2) 이상에서만 된다.
  - 그보다 낮으면 `CHANGE COLUMN old new <타입재명시>` 를 쓴다(타입 빠뜨리면 손실).

### 2. 마이그레이션 스크립트 작성 (멱등 필수)
- **멱등 가드**: `information_schema.COLUMNS`/`TABLES` 조회로 "이미 적용됐으면 skip". 단순 `ALTER`는 재실행 시 `Duplicate column`/`Unknown column`으로 깨진다.
- **NOT NULL 신규컬럼 = 2-step**
  - ① nullable로 ADD → ② `UPDATE`로 backfill → ③ `MODIFY ... NOT NULL`.
  - 비어있지 않은 테이블에 곧장 NOT NULL ADD하면 실패한다(MySQL/MariaDB `1364`).
- **FK 컬럼 rename**: FK 제약 일시 해제 구간으로 감싸거나 부모→자식 의존순서대로. PK rename이 여러 자식으로 카스케이드되면 동일 트랜잭션/구간으로.
- **타입 변경**(예 CHAR→VARCHAR·int→numeric)은 데이터 적합성 확인 후 `MODIFY`.
- 스크립트는 **init/시드와 분리된 버전 접두 디렉토리**에 보관(init 스크립트에 섞지 말 것). 스키마 자산의 자리는 `data.schemaHome`.

### 3. 백업 + 복제본 dry-run (운영 직접 실행 전 필수)
- 대상 백업(dump) → **scratch DB에 복원** → 스크립트 실행 → 검증.
- **운영 DB에 첫 실행 금지** — 반드시 복제본에서 먼저.
- **한글 등 비ASCII 텍스트 무결성 확인**
  - 판정: 아래 둘을 함께 판정한다.
    - 스크립트·배치 파일의 인코딩: `.bat`/`.cmd` 는 ASCII 전용, SQL/CSV 는 소비자 기준 인코딩.
    - dry-run 결과 데이터의 한글 컬럼 깨짐(mojibake·음절 씹힘).
  - 근거: 배치가 한글 오파싱으로 중단돼 이관이 지연된 실사고가 있다.

### 4. 롤백 플랜
- 역 ALTER 스크립트 또는 백업 복원 절차를 **미리** 작성한다.
- `DROP`/타입축소 등 **비가역 변경**을 식별해 표시한다.
- 크로스-시스템 적재의 롤백 = 배치ID/출처 태깅으로 delete.

### 5. 승인 후 실행 (destructive — 자동 금지)
- 점검창/다운타임 합의, 실행 직전 백업 재확보, **사용자 승인 후** 운영 적용.
- `risk.destructive` 에 적힌 명령도 같은 등급이다.

### 6. 검증
- 행수 보존(전/후 COUNT), 신규 컬럼 backfill 완료, FK 무결성, 앱 스모크. 정적 점검만으로 "정상" 단정 금지.

## 크로스-시스템 이관 (타 서비스 DB → 내 테이블)

소스가 **다른 서비스의 운영 DB**(다른 레포·다른 스키마)인 경우. 위 절차(L 적재·V 검증)는 그대로, **앞단에 S(소스 확보)·M(매핑)을 붙인다**. 단일 DB ALTER가 아니라 ETL이다.

```
[S] 소스 확보 → [M] 매핑 설계 → [L] 적재(멱등 upsert) → [V] 교차 정합 검증
```

**적재 구조 = staging 2단 (대용량 생명줄)**: 소스에서 본 테이블에 직접 꽂지 말고 `소스 → staging(raw 그대로) → 변환 → 본 테이블`. extract(네트워크·timeout·재시도)와 transform(매핑·키·FK)을 분리하면, 변환이 틀려도 **소스 재호출 없이 staging에서 replay**. 대용량일수록 필수.

### 🔴 크로스서비스 철칙 3가지 (위반 시 실제 사고)
1. **타 서비스 DB 는 SELECT 만.**
   - 원천 DB 에 INSERT/UPDATE/DELETE 를 하지 않는다.
   - 매핑이 안 맞는다고 원천에 행을 만들어 맞추면 그 서비스의 데이터를 오염시킨다.
2. **이관 행의 감사 컬럼 처리자 = 이관을 수행한 주체 서비스.**
   - 원천 서비스명이 아니다.
   - ⚠️ **라이브 sync 는 반대일 수 있다.** 외부 인바운드 동기화는 출처를 남기는 규약이 흔하다.
   - 이관 경로와 sync 경로의 규약을 섞지 않는다.
   - 프로젝트 규약은 `data.migrationOverlaySkill` 에서 확인한다.
3. **마스터 미해결건은 PASS + 집계 로그.**
   - 원천 행이 내 마스터에 매칭되지 않으면 **건너뛰고 카운트를 남긴다.**
   - FK 를 통과시키려고 껍데기 부모행을 만들지 않는다.
   - 그건 FK 가 잘못 걸린 신호이지, 데이터를 지어낼 근거가 아니다.

### [S] 소스 확보 — 두 가지 모드
공통: 소스 스키마·관계(FK)·코드값 의미를 먼저 파악(소스 레포의 DDL/엔터티 문서). 코드는 레포에, 실데이터는 DB에 있음 — 분리 인지.

- **모드 A — DB 직접(dump)**
  - 운영끼리 직접 연결하지 않는다.
  - dump(또는 읽기 복제본) → scratch/staging DB 복원.
  - 빠르고 일관 스냅샷이다. 대신 DB 접근권이 필요하고 스키마에 강하게 묶인다.
- **모드 B — API 배치(연동 서비스)**
  - 이미 통신 중인 서비스면 연동 API로 당긴다.
  - 장점: 권한/계약 재사용·소스 추상화.
  - 대신 **timeout·페이지네이션·rate limit·라이브 변경**이 따라온다(아래 대응).

### 대용량 / timeout 대응 (모드 B 필수)
"한 요청에 너무 많이" 달라고 하면 깨진다. 해법 = **나눠서·이어서·다시**.
1. **진단 먼저**: 어느 timeout인지(클라이언트 read / 게이트웨이·LB·proxy / 소스 트랜잭션).
2. **청크 + 커서 페이지네이션**: 한 번에 N건(500~2000). `offset/limit`은 뒤로 갈수록 O(n) skip으로 느려짐 → 대용량은 **keyset(커서)** `WHERE id > :lastId ORDER BY id LIMIT N`.
3. **체크포인트/재개**
   - 마지막 성공 커서를 저장한다. 중단돼도 이어서 간다.
   - 멱등 적재와 결합하면 깨져도 완주한다.
   - **Spring 스택 표준 = Spring Batch chunk 모델**(read N→process→write N→commit + JobRepository restart).
   - 구현 시 context7로 버전별 reader/writer·restart 설정을 확인한다.
4. **비동기 잡 기반**: 소스가 지원하면 export 잡 생성 → 폴링/콜백 수령으로 동기 timeout 회피.
5. **재시도(지수 백오프) + 부분 실패 격리**: 한 청크 실패가 전체를 안 막게, 실패 청크만 재시도/기록.
6. **동시성·rate limit**: 병렬로 속도↑ 가능하나 소스 운영 부하 고려(동시 N 제한 + 간격).
7. **적재도 배치**: 건건 INSERT 금지(N+1) → bulk insert + **청크 단위 커밋**(전체 단일 트랜잭션 = 락·메모리·롤백비용 폭발).

### 라이브 소스 일관성 (초기 백필 + 델타)
당기는 동안 소스가 계속 바뀐다. 한 방에 끝낸다 가정 금지.
- **초기 백필(bulk) + 델타 동기화(증분)**: `updatedAt`/버전 기반 이후 변경분 따라잡기.
- 이미 실시간 sync 경로가 있으면 cutover 한다.
  - 순서: **초기 백필로 과거치 적재** → **기존/신규 sync가 이후 따라잡기**.
  - 가드: 빈 응답에 전체 비활성되지 않게 **빈 목록 가드**를 둔다.

### [M] 매핑 설계
- **소스 테이블/컬럼 → 타깃 컬럼** 매핑표. 타입/도메인 변환(코드값·날짜·인코딩), 소스 FK 관계를 타깃 관계에 정렬.
- **★키 정합 = 최대 위험**
  - 소스 PK/외부 ID를 내 내부 키로 **직접 승계하지 않는다**.
  - 안정 자연키로 매칭하고, 채번은 내부로 한다.
  - 외부 seq는 불안정하다.
    - 같은 대상을 다른 seq 로 주거나 한 seq 를 다른 대상에 재사용하면, 크로스-시스템에선 그대로 중복행/PK 재사용으로 번진다.
- 감사/출처 컬럼에 **출처 시스템명** 기록(역추적·롤백용).

### [L] 적재
- **자연키 기준 멱등 upsert** + FK 의존순서(부모→자식) + 신규 NOT NULL backfill + 출처 태깅.
- 복제본 dry-run 먼저, 운영 적재는 승인 후.

### [V] 교차 정합 검증
- "행수 보존"이 아니라 **소스 행수 ↔ 타깃 적재수 + 키 매칭률**(누락/중복/충돌 행 리스트) + 스팟체크 + 앱 스모크 + 재실행 멱등 확인.

### 실행계획 템플릿 (소스 속성·관계도 → 타깃 적재)
1. **소스 분석**: 소스 DDL/관계도에서 대상 테이블·컬럼·FK·코드값·데이터량 파악.
2. **타깃 정렬**: 어느 테이블/컬럼으로 갈지 매핑표(1:1/변환/드롭).
3. **키 전략 확정**: 소스 식별자 → 타깃 키 매칭 규칙(자연키), 충돌·동명·orphan 처리. **사용자 승인**.
4. **소스 추출 경로 확정**: 모드 A(dump→scratch) 또는 모드 B(API 배치 — 커서·청크·체크포인트). 타깃은 dry-run 복제본.
5. **ETL 스크립트(멱등)**: 변환 → 청크 단위 upsert(자연키), FK 순서, 출처 태깅. 대용량이면 재개 가능 체크포인트.
6. **dry-run + 정합 리포트**: 복제본 실행 → 행수/키매칭/충돌 리포트 → 보정.
7. **승인 후 운영 적재** → 교차 정합 재검증 + 앱 스모크.

## 함정 (범용)
- **누적 rename 중간단계 거치기**: dev는 단계별로 갔어도 **운영은 origin→최종명 1회**로. 중간명 거치면 무의미한 다운타임·실패지점 증가.
- **NOT NULL backfill 누락** → 기존 행 ALTER 실패. 2-step 필수.
- **외부 식별자를 내부 키로 직접 승계** → 소스 식별자 churn 시 중복행/PK 재사용. 자연키로.
- **멱등 안 함** → 부분 실패 후 재실행이 더 깨짐.
- **문서용 산출물(모델링 export 등)을 운영 적용 스크립트로 착각** → 둘은 별개.

## 관련
프로젝트 특이사항 = `data.migrationOverlaySkill`. 범용 스키마 변경 절차는 해당 프로젝트의 `data.schemaProcedureSkill`(dev recreate 반대편). 실행 위임은 `harness-kit:data-migration-engineer`.
