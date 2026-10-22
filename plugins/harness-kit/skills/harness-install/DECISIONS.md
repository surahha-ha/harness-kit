# 결정 질문 — 2단계에서 하나씩 묻는다

질문마다 **1단계 근거(파일:행)** 를 먼저 보이고, 선택지와 각 선택이 바꾸는 것을 함께 제시한다. 사용자가 답하지 않은 칸은 내가 고르지 않는다 — `null` + 「미확정」 주석으로 두고 보고에 적는다. 답을 바꾸면 체크포인트의 그 항목도 덮어쓴다(TEMPLATES.md §7) — 6단계가 체크포인트 답과 config 값을 대조한다.

묻는 순서는 D1 → D2(D2-2) → D3 → D6(D6-2) → D4 → D5 → D7 → D8(D8-2) → D9 → D10 이다. 앞 답이 뒤 질문의 선택지를 바꾼다. D9·D10 은 선택 항목이라 기본은 끔이고, 커밋되는 파일을 바꾸지 않는다(D9 의 `.gitignore` 한 줄만 예외). 번호는 체크포인트·영수증의 id 라 그대로 두고, D6 만 D4 앞으로 당겨 묻는다 — 플러그인을 끄면 사라지는 가드(D6-2)가 D4 의 후보가 되기 때문이다.

## 권장 — 관찰에서 계산하고, 고르는 것은 사용자다

- 각 D 의 **권장 규칙** 표를 위에서부터 읽어 0·1단계 관찰과 **처음 맞는 줄**의 권장을 쓴다. 앞 D 의 답도 관찰로 친다(D4 는 D3·D6-2 답, D6 은 D1 답을 본다). 한 D 에 물을 것이 여럿이면(D2·D3·D4·D5·D6·D7) 항목마다 따로 계산한다.
- 맞는 줄이 없으면 질문에 「권장 없음 — 판단 근거 부족, 직접 골라 주세요」라고 적고, 근거 줄에 무엇을 찾지 못했는지 적는다. 표에 없는 근거로 권장을 지어내지 않는다. 이때 첫 선택지가 권장으로 읽히지 않게 「(권장)」을 어디에도 붙이지 않는다.
- 권장 선택지를 **첫 번째**에 두고 라벨 끝에 「(권장)」을 붙이며, 그 선택지 설명의 첫 줄에 **권장 이유 한 줄**을 단다 — 맞은 줄의 관찰을 이 레포의 파일:행·설정 값으로 적는다. 선택지마다 **바뀌는 것**(config 슬롯·파일·차단 효과)을 한 줄씩 단다. 꼴은 TEMPLATES.md §8.
- 아래 「선택지」의 **굵은 이름**이 선택지 라벨이다 — 라벨만 읽어도 뜻이 통하게 짓는다. 질문 header 는 D 번호 없이 대상 + 동작으로 쓴다(`테스트DB 볼륨삭제`, TEMPLATES.md §8). 규칙표의 권장 칸은 같은 선택지를 짧게 가리킨다(`deny` = **차단 (deny)**).
- **권장 자리에 두지 않는 선택지** — 레포 코드를 바꾸는 것, 공유 자원 쓰기를 막지 않는 것, 테스트를 지우거나 비활성화하는 것. 규칙표를 고칠 때도 이 셋은 권장 칸에 오지 않는다. 앞의 둘은 선택지로는 보인다. 지우기·비활성화는 선택지로도 보이지 않는다(D3).
- 사용자가 권장과 다르게 고르면 그대로 따른다. 체크포인트의 그 답에 권장·근거·`followed: false` 를 적는다(TEMPLATES.md §7) — 6단계 answer-trace(CHECKS.md §6)와 보고의 결정 표에 「권장과 다름」으로 남는다.

## D1. 설치 위치 — 현 트리인가 worktree 인가

- 근거: 0단계 `install.mjs precheck` 의 `D1 관찰` 줄 — 설치 대상 파일(`.claude/settings.json`·`settings.local.json`·`.gitignore`·`CLAUDE.md`)의 미커밋 변경, 같은 트리의 다른 세션(마지막 user·assistant 기록이 이 세션 시작보다 뒤면 `동시`, 시작 전 2시간 안이면 `최근`), 트리 종류(메인 / 연결 worktree), 브랜치. 보호 브랜치는 레포 문서·`git.protectedBranches` 후보에서 본다.
- 세션 판정에 파일 수정 시각을 쓰지 않는다. 끝난 세션도 종료 때 붙는 줄로 수정 시각이 늦어져, 시험 설치에서는 직전에 끝낸 세션을 「2시간 안에 수정됨」으로 세어 worktree 를 권했다.

| 관찰 | 권장 |
| - | - |
| 설치 대상 파일에 미커밋 변경이 있다 | 새 worktree |
| 다른 세션이 `동시`다(마지막 기록이 이 세션 시작 뒤) | 새 worktree |
| 현재 브랜치가 보호 브랜치다(`main`·`develop` 류 — 레포 문서·CI 설정 근거) | 새 worktree — 설치 커밋을 보호 브랜치에 직접 쌓지 않는다 |
| 다른 세션이 `최근`이다(시작 전 2시간 안에 마지막 기록) | 권장 없음 — 그 세션이 끝났는지는 기록으로 가를 수 없다. 근거 줄에 마지막 기록 시각·종류(사용자 중단 등)를 적고 사용자가 고른다 |
| 위 넷 다 없다(미추적 파일·stash 만 있는 경우 포함) | 지금 트리 |

- 선택지 — 바뀌는 것. 이 트리가 이미 연결 worktree 면 이름을 괄호 안 것으로 바꾼다.
  - **지금 트리에 설치**(**지금 worktree 에 설치**) — 이후 단계의 작업 경로와 9단계 브랜치 조건이 지금 트리·브랜치가 된다. 설치 파일만 경로 지정 커밋에 들어간다. 연결 worktree 라면 메인 트리의 미커밋 변경과는 이미 떨어져 있고, 같은 worktree 의 세션만 신경 쓰면 된다.
  - **새 worktree 에 설치**(**새 worktree 를 하나 더 만들어 설치**) — `git worktree add -b <설치 브랜치> <경로> <기준 커밋>` 으로 새 트리를 만들고 그 경로·브랜치가 이후 기준이 된다. 다른 세션의 미커밋 settings 와 섞이지 않는다. 대신 나중에 병합이 필요하고, 그 병합은 PITFALLS §5 의 기계 대조를 거친다. 지금 트리가 이미 연결 worktree 면 worktree 가 하나 더 늘고, 병합 경로가 「새 worktree → 지금 worktree 의 브랜치 → 기준 브랜치」로 한 단 길어진다.

## D2. 공유 자원 — 무엇이 공유이고, deny 인가 ask 인가

- 판별 질문: **"이 대상을 나 말고 누가 동시에 쓰나?"** 호스트 이름이 아니라 연결이 최종적으로 닿는 곳으로 판별한다.
- 근거: 기본 프로파일의 datasource, 시작 스크립트의 환경변수, 테스트 코드의 하드코딩 접속, CI 설정. 쓰기 지침은 레포 `CLAUDE.md` 와 세션이 받은 사용자 지침에서 찾는다.

| 관찰 | 권장 |
| - | - |
| 연결이 닿는 곳이 운영 자원이거나, 지침이 「에이전트는 그 자원에 쓰지 않는다」 | deny |
| 여럿이 쓰는 개발·공유 자원이고, 지침에 「공유 자원 쓰기는 직전에 승인」 류가 있다 | ask |
| 여럿이 쓰는 자원인데 운영 여부와 쓰기 지침이 둘 다 확인되지 않는다 | 판단 근거 부족 |
| 근거 넷(datasource·시작 스크립트·테스트 하드코딩·CI)이 모두 로컬(컨테이너·localhost)만 향한다 | 공유 자원 없음 — 막을 대상이 없다는 관찰이다. 넷 중 하나라도 확인하지 못했으면 이 줄은 맞지 않는다 |

- 선택지 — 바뀌는 것
  - **실행 전 확인 (ask)** — `dangerGuard.shared` 에 `targetPattern`(그 공유 호스트, 설치처 config 안에만)과 `writePattern`(쓰기 구문)이 들어간다. 그 호스트에 쓰는 명령은 승인을 거친 뒤 에이전트가 실행하고, 조회는 막지 않는다. 사람이 직접 치지 않아도 되므로 접속 정보가 대화에 덜 남는다.
  - **차단 (deny)** — 같은 패턴이 `dangerGuard.deny` 규칙(`id`·`why`·`recover`)으로 들어간다. 에이전트는 절대 실행하지 않고, 승인된 작업도 사람이 직접 친다.
  - **공유 자원 없음** — `dangerGuard.shared` 를 비운다. 근거 넷이 모두 로컬일 때만 보인다.
- 함께 보고할 것: 하드코딩된 자격증명을 찾았으면 위치만 알리고 **교체(rotate) 여부는 사용자 판단**으로 넘긴다.
- **묻지 않고 근거로 채우는 칸** — D2 답이 정해지면 kit `project.risk` 의 두 칸을 같은 근거로 채운다(보고에 근거를 적는다).
  - `sharedDbSuites` — 공유 자원에 직접 붙는 테스트의 클래스 이름(FQN). 없으면 `[]`.
  - `sharedDbProfiles` — 연결이 공유 자원에 닿는 **이름을 모두**: 기본 설정 파일 이름(`application.yml` 류) · `default` · **자기 설정 파일이 없어 기본값으로 떨어지는 프로파일**(레포 문서·스크립트·CI 가 부르는 이름인데 `application-<이름>.yml` 이 없는 것) · 공유 접속 환경변수를 세팅하는 시작 스크립트 이름. 「설정 파일이 있는 프로파일」만 세면 기본값으로 떨어지는 프로파일을 놓친다 — 시험 설치는 기본 설정 파일 하나만 적어, 파일 없이 기본값으로 가는 `dev` 프로파일과 시작 스크립트 둘이 빠졌다. 근거 넷이 모두 로컬이면 `[]`.

### D2-2. 서버 기동 — 명령에 주소가 안 보여도 공유 DB 에 붙는가

- 판별 질문: **"명령에 공유 호스트가 보이지 않는데, 실행하면 기본 설정 때문에 공유 자원에 붙는가?"** 붙는 대표가 **서버 기동**이다(`bootRun`·`run`·`npm start` 류 · 시작 스크립트). 기본 datasource 가 공유 DB 면 서버를 띄우기만 해도 접속하고, 스키마 마이그레이션 도구(Flyway·Liquibase 류)가 기동 때 자동 적용되면 공유 스키마가 바뀐다. 이 경로는 `dangerGuard.shared` 의 호스트 패턴이 보지 못한다 — 명령 문자열에 호스트가 없기 때문이다.
- 근거: 기본 프로파일의 datasource(파일:행) · 시작 스크립트의 환경변수(파일:행) · 마이그레이션 자동 적용 설정 · 레포 문서가 안내하는 기동 명령. 공유 DB 에 직접 붙는 테스트는 여기가 아니라 D3·D4 에서 다룬다.
- 질문 첫 문장은 용어 없이 쓴다: 「서버를 띄우기만 해도 공유 개발 DB 에 붙어 스키마를 바꿀 수 있습니다. 명령에 DB 주소가 안 보여 주소 규칙으로는 못 잡습니다. 서버를 띄우기 전에 확인을 받을까요?」

| 관찰 | 권장 |
| - | - |
| 기본 설정(또는 시작 스크립트)이 공유 자원을 향하고, 레포에 서버 기동 명령이 있다 | 실행 전 확인 (ask) — 서버 기동은 개발의 정상 절차라 막으면 일을 못 한다. 확인 단계에서 어느 DB 로 뜨는지 묻는다 |
| 기본 설정이 공유 자원을 향하는데 기동 명령을 레포에서 찾지 못했다 | 권장 없음 |
| D2 답이 「공유 자원 없음」이다 | 묻지 않는다 |

- 선택지 — 바뀌는 것
  - **서버 기동 전 확인 (ask)** — `dangerGuard.ask` 에 원소 하나(`server-boot-shared-db` 류)가 들어간다. 패턴은 기동 명령의 모든 꼴을 덮는다 — 도구 경로(`./gradlew`·`gradlew.bat`·`cd <하위> && …`), 셸 래퍼(`bash -c`·`cmd /c`·`powershell -File`·`&`·`call`·`start`), 시작 스크립트 이름. `recover` 에는 로컬 대상으로 띄우는 명령(test 프로파일 등, 레포 문서 근거)을 적는다. `risk.destructive` 에도 같은 명령을 넣는다. CHECKS.md §4 의 래퍼 변형으로 구멍을 본다.
  - **주소 규칙만 (shared)** — 규칙을 더하지 않는다. 서버 기동은 묻지 않고 실행되고, 간접 경로는 `risk.destructive` 주석과 CLAUDE.md 「개발 하네스」 절로만 알린다.
  - **차단 (deny)** — 에이전트는 서버를 띄우지 못하고 사람이 직접 띄운다. 기동이 잦은 레포에서는 일이 멈춘다 — 레포 문서가 「에이전트는 서버를 띄우지 않는다」고 적었을 때만 고를 만하다.
- 선택지에 넣지 않는 것: 레포 설정을 로컬로 바꾸는 것(레포 코드 변경 — 권장 자리에 두지 않는 선택지). 필요하면 보고에 적는다.

## D3. `commands.unitTest` 의 범위 — 외부 자원이 필요한 테스트를 넣는가

- 판별 질문: **"이 명령의 종료코드만 보고 통과/실패를 판정할 수 있나?"** 파이프는 넣지 않는다.
- 근거: 1단계의 테스트 분류(순수 단위 / 로컬 컨테이너 통합 / 공유 자원 직결).

| 항목 | 관찰 | 권장 |
| - | - | - |
| 범위 | 로컬 컨테이너 통합 테스트가 있고 컨테이너 정의(compose 파일 등)가 레포에 있다 | 통합 포함 — 빼면 그 검증이 판정에서 조용히 사라진다. 실행은 대상 테스트만 좁게, 대상 환경을 확인한 뒤에 한다 |
| 범위 | 통합 테스트는 있는데 컨테이너 정의를 레포에서 찾지 못했다 | 판단 근거 부족 |
| 범위 | 통합 테스트가 없다 | 묻지 않는다(순수 단위뿐) |
| 제외 방법 | 공유 자원에 직접 붙는 테스트가 있다 | 소스 무수정 |
| 제외 방법 | 없다 | 묻지 않는다 |

- 범위 선택지 — 바뀌는 것
  - **통합 테스트 포함** — `commands.unitTest`·kit `project.commands.be.testAll` 이 통합까지 돈다. 실행 전에 컨테이너를 띄워야 하고, 없으면 무관한 레드가 난다. config 주석과 CLAUDE.md 에 선행 조건과 「실행 전 대상 환경 확인」을 적는다.
  - **통합 테스트 제외** — 같은 명령에 제외 필터가 붙는다. 이름 관습이나 이미 달린 태그로 거를 수 있을 때만 보인다. 목록을 박아 거르면 새 테스트가 빠진다.
- **공유 자원에 직접 붙는 테스트는 어느 쪽이든 뺀다.** 빼는 방법도 선택지로 묻는다.
  - **테스트 소스 무수정** — 레포 코드를 고치지 않는다. 빌드 도구의 명령줄 init script·설정 주입·명령줄 필터로 클래스·패키지 패턴을 뺀다. 바뀌는 것은 `.harness/` 밖 보조 파일 하나(3단계 5번)와 테스트 명령의 옵션이다. 패턴은 이름 관습·패키지 단위로 잡아 같은 성격의 새 테스트도 걸리게 한다. 단 「패키지 단위」는 그 패키지 **직속 클래스**다 — 빌드 도구의 제외 패턴이 디렉토리에도 맞으면 하위 패키지 전체가 함께 빠진다(PITFALLS §3). 패턴을 정하면 6단계 `test-select` 로 빠지는 목록을 펼쳐 질문의 근거 줄에 「빠지는 것 N개(이름)」를 적는다.
  - **테스트 소스 수정 — 레포 코드를 바꾼다.** 테스트 소스에 태그·어노테이션을 달고 필터로 뺀다. 설치 커밋에 레포 테스트 코드 변경이 섞이고, 레포 소유자의 리뷰 대상이 된다.
  - 소스에서 지우거나 비활성화하는 것은 레포 정책 변경이라 이 설치에서 하지 않고 위치만 보고한다.
- 모노레포: 최상위 `commands.unitTest` 는 `cd <하위> && <명령>` 꼴, kit `project.commands.be/fe` 는 **cd 없이**(kit 이 `sides.*.root` 로 들어간 뒤 붙인다).

## D4. `dangerGuard.deny` — 2~3개만

- 판별 질문: **"실행 후 5분 안에 원상복구할 수단이 있나?"** 둘째 축: **"결과가 틀려도 조용히 다음 작업의 입력이 되는가?"**(출력 파이프로 종료코드를 잃는 것 등)
- 후보는 1단계 근거에서 나온 것과 **D6-2 에서 하네스로 옮기기로 한 빈자리**만 보인다. 후보마다 권장을 따로 계산한다. D6-2 에서 이미 deny·ask 로 답한 명령은 다시 묻지 않고, deny 개수(아래 상한)에 함께 센다.
- 후보 명령이 무엇을 하는지 질문 첫 문장에 쉬운 말로 적는다(`./gradlew --stop` → 「이 PC 에서 돌고 있는 Gradle 백그라운드 프로세스를 전부 끕니다. 다른 창·IDE 에서 띄운 서버도 같이 꺼집니다」). 근거가 레포가 아니라 사용자 전역 지침뿐이면 그렇게 적고 권장 없음으로 묻는다.

| 후보 | 관찰 | 권장 |
| - | - | - |
| 제외 없이 전체 테스트를 부르는 명령 | D3 에서 공유 직결 테스트를 명령줄 제외로 뺐다 | deny — `recover` 는 제외를 붙인 명령 |
| 빌드·테스트 출력 파이프 | 레포 문서·커맨드에 출력 파이프(`… \| tail` 등)가 있거나, 지침이 출력 파이프를 금한다 | deny — `recover` 는 파이프 없는 명령과 판정할 곳(종료코드·결과 줄·리포트) |
| 볼륨·데이터 삭제 명령 | 대상이 init 스크립트로 다시 만들어지는 로컬 데이터다 | deny 로 두지 않는다(5분 안에 복구된다) |
| 볼륨·데이터 삭제 명령 | 대상을 다시 만들 수 없다 | deny |
| (권장 deny 가 3개를 넘는다) | — | 판별 질문 둘에 모두 걸리는 것부터 3개를 권장, 나머지는 판단 근거 부족 |
| `ask` 후보(`git reset --hard`·`git clean -f` 류) | 레포 문서·스크립트가 정상 절차로 부른다 | 그 명령 ask |
| `ask` 후보 | 그런 근거가 없다 | ask 없음(빈 배열) |

- 선택지 — 바뀌는 것
  - **차단 (deny)** — `dangerGuard.deny` 원소 하나(`id`·`pattern`·`why`·`recover`)가 들어간다. 맞는 명령은 실행 전에 막히고 판정 메시지에 `recover` 가 안내된다. `recover` 에는 막힌 사람이 칠 **통과하는 명령**을 적는다.
  - **실행 전 확인 (ask)** — `dangerGuard.ask` 원소 하나가 들어간다. 정상 절차인데 무언가 사라지는 명령이 승인을 거친 뒤 실행된다.
  - **막지 않음** — 규칙이 들어가지 않고, 그 명령은 묻지 않고 실행된다.
- `probe.token` 은 우연히 등장하지 않을 고유 문자열로 짓는다.

## D5. 커밋 정책 — 레포 규칙과 `project.git.*` 를 맞춘다

- 근거: 레포 `CLAUDE.md` 의 커밋·push·trailer 규칙, `git log` 의 메시지 관례, 보호 브랜치, 프로젝트 메모리·자동화 규칙.
- 레포 `CLAUDE.md` 와 메모리·자동화 규칙이 서로 다르면 레포 `CLAUDE.md` 쪽을 권장하고, 근거 줄에 두 규칙을 함께 적는다(PITFALLS §2).
- 질문 첫 문장은 쉬운 말로: `commitExecution` → 「`/save` 가 커밋까지 직접 할까요, 커밋 메시지만 만들어 줄까요?」 · `coAuthor` → 「에이전트가 만든 커밋 메시지 끝에 공동 작성자 줄(`Co-Authored-By: Claude …`)을 붙일까요?」 — 「trailer」라는 말은 괄호 안에만 쓴다. 시험 설치에서 「trailer 가 뭐야」로 되물었다.

| 항목 | 관찰 | 권장 |
| - | - | - |
| 이번 설치 커밋 · `commitExecution` | 레포 규칙이 「커밋은 하지 않고 메시지만」 류다 | 메시지만 · `'message-only'` |
| 이번 설치 커밋 · `commitExecution` | 레포 규칙이 에이전트의 커밋을 허용하거나 지시한다 | 실행 · `'auto'` |
| 이번 설치 커밋 · `commitExecution` | 커밋 규칙이 없다 | 판단 근거 부족 |
| `push` | 레포 규칙이 push 를 금한다 | `'never'` |
| `push` | 그 밖 | `'ask'` — `'auto'` 는 공유 원격에 묻지 않고 쓰므로 권장하지 않는다 |
| `coAuthor` | 레포 규칙이 trailer 를 금한다 | `false` |
| `coAuthor` | 레포 규칙이 trailer 를 요구한다 | `true` |
| `coAuthor` | 규칙이 없다 | 판단 근거 부족 |
| `reviewThreshold` | 레포 문서에 리뷰 문턱(파일 수·줄 수)이 있다 | 그 값 |
| `reviewThreshold` | 없다 | 판단 근거 부족 |

- 선택지 — 바뀌는 것
  - **설치 커밋 실행 / 커밋 메시지만 건넴** — 9단계가 경로 지정 커밋을 하거나 메시지 파일만 건넨다.
  - `project.git.commitExecution` — `'auto'` 면 kit save·plugin-sync·archive-cycle 이 경로 지정 커밋까지 실행하고, `'message-only'` 면 메시지와 명령만 낸다. 이 둘뿐이다.
  - `project.git.push` — `'auto'` | `'ask'` | `'never'`. kit save 가 push 를 바로 하나, 묻나, 하지 않나.
  - `coAuthor` — kit 커밋 메시지와 이번 설치 커밋에 trailer 가 붙는지.
  - `reviewThreshold` — `{ files, lines }` 를 넘는 diff 에 kit save 가 리뷰 게이트를 연다. 미정(`null`)이면 그 게이트를 건너뛴다는 것을 알린다.

## D6. 플러그인 겹침 — 같은 역할 스킬이 두 벌 뜨는가

- 근거: `~/.claude/settings.json` 과 레포 settings 의 `enabledPlugins`, 각 플러그인의 스킬·에이전트 이름, `git worktree list`, 레포 문서·프로젝트 메모리의 worktree 관례, **그 플러그인이 건 훅**(`install.mjs plugin-hooks <이름@마켓>` — 끄면 훅도 이 레포에서 함께 꺼진다).
- 같은 역할의 스킬·에이전트가 harness-kit 과 다른 플러그인에서 함께 뜨면 어느 쪽이 트리거될지 모호해진다.
- 질문 근거 줄에 「끄면 사라지는 가드 N개」를 함께 적는다(아래 D6-2 의 조사 결과). 끄는 쪽이 권장이어도, 끄면 무엇이 무방비가 되는지 모른 채 고르게 하지 않는다.

| 관찰 | 권장 |
| - | - |
| 다른 켜진 플러그인에 harness-kit 과 같은 이름의 스킬·에이전트가 있고, worktree 사용 흔적(`git worktree list` 2개 이상 · D1 답이 worktree · 레포 문서·메모리의 worktree 관례)이 있다 | 끈다 — 커밋되는 settings.json |
| 같은 이름 겹침이 있고 worktree 흔적은 없다 | 끈다 — `settings.local.json` |
| 이름은 다르고 설명상 역할만 비슷하다 | 판단 근거 부족 |
| 겹침이 없다 | 그대로 둔다(묻지 않고 보고에 「겹침 없음」) |

- 선택지 — 바뀌는 것
  - **이 레포에서 끈다 — 커밋되는 settings.json** — `enabledPlugins` 에 `"<이름>@<마켓>": false` 가 들어간다. 팀 전체와 모든 worktree 에서 같은 상태가 된다. 대신 개인이 쓰는 플러그인 이름이 커밋된다.
  - **이 레포에서 끈다 — `settings.local.json`** — 개인 설정으로 남는다. 이 파일은 보통 무시 대상이라 새 worktree 에는 없다. worktree 마다 다시 해야 한다.
  - **두 플러그인 모두 켜 둔다** — 두 벌이 함께 뜬다.
- 키는 설치 기록·사용자 settings 에 적힌 `<이름>@<마켓>` 과 **문자 그대로** 같아야 한다.
- harness-kit 자신은 묻지 않고 project scope 로 켠다(5단계). 같은 PC 의 새 worktree 는 설치 기록의 경로가 달라도 다시 설치하지 않고 로드된다.

### D6-2. 끄면 사라지는 가드 — 하나씩 어떻게 메울까

D6 에서 플러그인을 끄기로 했을 때만 묻는다. 시험 설치에서는 이 단계가 없어, 끈 뒤에야 `gradlew --stop`·볼륨 삭제·`down -v`·`rm -rf`·보호 브랜치 push·파괴적 SQL 을 막던 가드가 함께 사라진 것을 알았고, 사용자가 「어떤 설정이랑 겹쳐서 없어진 거야?」로 되물었다.

1. **목록** — `install.mjs plugin-hooks <이름@마켓>` 이 그 플러그인의 훅(이벤트·matcher·스크립트)을 낸다. 스크립트마다 ① 이 레포에서 실제로 발동하는가(경로·마커·쌍둥이 파일 조건) ② 무엇을 막는가(deny·ask·경고만)를 읽어 표로 만든다. 읽기는 서브에이전트에 맡겨도 된다 — 결과는 「명령 꼴 · 그 플러그인의 판정 · 파일:행」 표.
2. **덮임 확인** — 표의 명령마다 대표 명령 하나를 CHECKS.md §4 의 케이스 파일에 넣고 지금 하네스 config 로 `evaluate` 한다. 이미 하네스 규칙에 걸리면 「덮임」이다. 사용자 전역 훅(`~/.claude`)이 막는 것은 「이 PC 에서만 덮임」으로 적는다 — 커밋되지 않아 팀원 PC 에서는 무방비다.
3. **묻기** — 덮이지 않은 것마다(비슷한 것은 묶어도 된다 — `rm -rf`·`Remove-Item -Recurse` 는 「재귀 삭제」 하나) 아래 선택지로 묻는다. 여러 개를 한 번에 물으면 header 를 서로 다르게 짓는다(TEMPLATES.md §8).

| 관찰 | 권장 |
| - | - |
| 하네스 규칙이 이미 같은 명령을 막는다 | 묻지 않는다 — 보고에 「덮임(규칙 id)」 |
| 막는 규칙이 아니라 경고·넛지만 한다 | 묻지 않는다 — 보고에 「경고만 사라짐」 |
| 그 플러그인이 deny 했고, D4 판별 질문(5분 안 복구 불가)에 걸리며, deny 가 상한(3개) 안에 든다 | 차단 (deny) |
| 그 플러그인이 deny 했지만 deny 상한을 넘는다, 또는 ask 였다 | 실행 전 확인 (ask) |
| 그 플러그인이 막던 근거를 이 레포에서 찾지 못했다(다른 레포 전용 규칙) | 권장 없음 |

- 질문 첫 문장 꼴: 「<플러그인> 을 이 레포에서 끄면 `<명령>`(<쉬운 말로 무엇을 하는지>)을 막던 규칙이 함께 사라집니다. 이 레포의 하네스 설정에 다시 적을까요?」 — 「빈자리」·「옮긴다」만으로 쓰지 않는다. 시험 설치에서 「옮길 위치가 deny → 플러그인으로 옮기는 거야?」로 방향을 거꾸로 읽었다. 옮기는 방향은 늘 **그 플러그인 → 이 레포의 `harness.config.mjs`** 이고, 플러그인 자체는 고치지 않는다.
- 선택지 — 바뀌는 것
  - **차단 (deny)** — `dangerGuard.deny` 원소 하나. D4 의 deny 상한에 센다.
  - **실행 전 확인 (ask)** — `dangerGuard.ask` 원소 하나. 정상 절차로 쓰는 명령(빌드 산출물 정리 등)도 매번 승인 창이 뜬다는 것을 함께 적는다.
  - **막지 않음** — 규칙이 들어가지 않는다. 이 레포에서 그 명령은 묻지 않고 실행되고, 보고의 「빈자리」 목록에 남는다.
- 답을 체크포인트에 `D6-2` 로 적는다 — 명령 꼴마다 `{ "command": …, "plugin": "deny|ask|warn", "answer": "deny|ask|none", "rule": <규칙 id 또는 null> }`(TEMPLATES.md §7).
- 플러그인을 끄지 않기로 하면(「두 플러그인 모두 켜 둔다」) 이 질문은 없다. 대신 하네스 규칙과 그 플러그인 규칙이 같은 명령을 함께 막는 「겹침」을 보고에 적는다(0단계 겹침 원칙).

## D7. 나머지 슬롯 — 근거가 있을 때만 채운다

| 슬롯 | 관찰 | 권장 |
| - | - | - |
| `testFirst.enabled` | (설치 시점) | `false` — 도입 절차상 처음에는 끄고, `--audit` 으로 센 뒤 켠다(example 주석) |
| `testFirst.auditOnStop` | 같은 경계표로 레포 자체 test-first 훅이 이미 게이트 중이다 | `true`(enabled 는 끈 채) |
| `testFirst.auditOnStop` | 경계표(scopes)의 정본 문서가 레포에 없다 | `false` — scopes 는 ask 로만 두고 주석에 「정본 없음」 |
| `testFirst.auditOnStop` | 정본 문서는 있고 자체 훅은 없다 | 권장 없음 |
| `testFirst.scopes` | 경계표 정본 문서가 없다(enabled·auditOnStop 을 끈 채여도) | 1단계에서 찾은 도메인 규칙 자리(서비스·권한 판정·계산 유틸 류의 경로)를 **전부 ask** 로 초안에 넣고 주석 「정본 없음 — 초안, deny 없음」. 후보 자리가 없으면 `[]` + 같은 주석. 시험 설치는 비워 두어, 나중에 켤 때 셀 것이 없었다 |
| `testFirst.scopes` | 정본 문서가 있다 | 그 문서의 표를 옮긴다(deny 는 문서가 deny 라 적은 자리만) |
| `testFirst.testLookup`·`exempt` | 소스 루트와 테스트 루트가 갈린 언어다(`src/main/java` ↔ `src/test/java` 류) | `testLookup.pattern` 을 그 레포 테스트 이름 관습(`^{base}[\w.\-]*(Test\|Tests\|IT)\.java$` 꼴)으로, `rootSwap` 에 루트 쌍을, `exempt` 에 테스트 루트·마이그레이션 디렉토리·설정 확장자를 넣는다. example 의 JS 값을 그대로 두지 않는다 — 남기면 꺼져 있어도 6단계 흔적 점검 ③ 에 example 값으로 뜬다 |
| `testFirst.testLookup`·`exempt` | JS·TS 처럼 테스트가 소스 옆에 있다 | example 값을 그 레포 관습(`__tests__`·`.spec`)과 대조해 맞으면 둔다 |
| `qualityCycle.evidence` | 쪽(BE·FE)마다: 그 쪽에 **단위** 테스트 러너가 있다 | 그 쪽 소스 유형을 넣는다 — 증거는 테스트를 실제로 도는 명령만, compile·`-x test` 류는 불인정 |
| `qualityCycle.evidence` | 그 쪽 러너가 e2e 뿐이다 | 그 유형은 넣지 않는다 — e2e 는 실행 전 환경 승인 대상이라 턴 안의 증거로 세면 늘 「증거 없음」이 되거나, 승인 없이 돌리는 압력이 된다. 주석에 「e2e 만 — 환경 승인 대상」 |
| `qualityCycle.evidence` | 레포에 훅 스크립트 디렉토리(`.claude/hooks` 등)가 있다 | `hook` 유형 — 증거는 그 스크립트를 직접 실행한 것 |
| `qualityCycle.evidence` | 테스트 러너가 없는 쪽 | 그 유형은 넣지 않는다 |
| `commands.e2e`(게이트) · `project.commands.fe.e2e`(kit) | e2e 가 데이터를 쓰거나(만들기·고치기·지우기), 어느 DB 에 닿는지가 백엔드를 띄운 방식에 달렸다 | 게이트 `commands.e2e: null` + 주석 「CRUD — 실행 전 대상 환경 승인」 · kit `commands.fe.e2e` 는 실제 명령으로 채우고(qa-cycle 이 승인 뒤 쓴다) 같은 명령을 `risk.destructive` 에 넣는다 |
| `commands.e2e` · `project.commands.fe.e2e` | e2e 가 mock 이나 고정된 로컬 대상만 쓴다(설정 파일:행 근거) | 둘 다 그 명령으로 채운다 |
| `commands.e2e` · `project.commands.fe.e2e` | e2e 러너가 없다 | 둘 다 `null` + 주석(꺼지는 자산 이름, D8) |
| `drift.mirrors` | 레포 안 사본↔원본 짝이 파일 단위로 1:1 이다 | 넣는다(`compare: 'content'`) |
| `drift.mirrors` | 짝은 있으나 한쪽에만 있는 파일이 있다 | 비우고 후보를 주석으로 둔다 — 넣으려면 `approvedDifferences` 부터 적어야 한다 |
| `drift.mirrors` | 짝의 한쪽이 레포 밖·개인 절대경로다 | 넣지 않는다 |
| `project.memory.slugs` | 이 레포의 메모리 디렉토리가 있고 슬러그에 사용자 이름·홈 경로가 없다 | 넣는다. 대소문자만 다른 두 슬러그(`C--x`·`c--x`)는 Windows 에서 같은 폴더라 하나로 센다 |
| `project.memory.slugs` | 슬러그에 사용자 이름이 들어가거나 메모리 디렉토리가 없다 | `null` + 주석 「docs-setup 에서 정함 — 그전까지 archive-cycle 의 메모리 계측이 건너뛴다」 |
| `project.plugin` | 레포 안 플러그인 디렉토리가 정본이다(레포 문서가 거기서 고친다고 적었다) | 채운다 |
| `project.plugin` | 플러그인 디렉토리가 `.claude/` 등의 미러이거나 플러그인이 없다 | `null` — kit plugin-sync 는 플러그인을 정본으로 보아 방향이 반대다 |
| `approvals.*` | 레포 문서에 승인 주체·절차가 있다 | 그 역할 |
| `approvals.*` | 없다 | `destructive` 는 「레포 소유자 — 실행 직전 대화로 승인」, 나머지는 `null` |

- 선택지 — 바뀌는 것
  - `testFirst.enabled: true` — 경계표의 deny 범위에서 테스트 없는 소스 편집이 막힌다. `auditOnStop: true` — 막지 않고 턴 종료마다 셈만 남긴다.
  - `qualityCycle.evidence` 유형 — 관찰만 한다. 턴 종료 판정이 `node .harness/metrics.mjs` 의 「완료 전 증거」 줄에 얹힌다.
  - `drift.mirrors` — `node .harness/drift-watch.mjs` 가 짝의 어긋남을 보고한다. 개인 PC 의 절대경로를 가리키는 미러는 커밋되는 config 에 넣지 않는다.
  - `project.memory.slugs` — kit archive-cycle·qa-cycle 이 그 메모리 디렉토리를 읽는다. PC 마다 다른 값이다.
  - `project.plugin` — kit plugin-sync·plugin-curator 가 이 레포를 플러그인 정본으로 다룬다.
  - `approvals.*` — 승인 문구에 쓰인다. 사람 이름 대신 역할을 적는다.
  - `testFirst.scopes` 초안 — 꺼진 채라 아무것도 막지 않는다. 나중에 `--audit` 으로 셀 때 쓸 출발점이다.
  - `commands.e2e` — 게이트의 품질 사이클이 묻지 않고 돌리는 명령이다. CRUD e2e 를 여기 넣으면 승인 없이 공유 데이터가 바뀔 수 있다.

## D8. kit 이 읽는 칸 — 비우면 무엇이 꺼지는가

harness-kit 의 스킬·커맨드·에이전트는 config `project` 블록의 칸을 읽는다. **키가 없으면 그 자산이 그 자리에서 멈추고 묻고, `null` 이면 「해당 없음」으로 그 단계를 건너뛰고 보고에만 적는다**(README 「프로젝트 프로필」 읽기 규칙 4). 그래서 설치가 칸을 `null` 로 두면 그 자산의 일부가 말없이 꺼진다. 시험 설치에서 `docs.archiveDir: null` 이 주석 없이 남아 archive-cycle 의 문서 이동이 조용히 꺼졌다.

- 칸 목록의 기준은 kit 문서마다 있는 「이 … 가 읽는 슬롯:」 줄이다. `install.mjs slots <레포 루트>` 가 그 줄을 모아 config 와 대조한다 — 칸마다 값 / `null` / 없음, `null` 이면 그 줄(또는 바로 위 줄)의 주석에 **읽는 자산 이름이 들어 있는지**. 자산이 새 칸을 읽게 되면 그 문서의 「읽는 슬롯」 줄만 고치면 된다.
- 칸마다 아래 셋 중 하나로 처리한다. 「묻는다」 칸은 2단계에서 묻고, 나머지는 보고에 근거와 함께 적는다.

| 칸 | 읽는 자산(대표) | `null` 이면 꺼지는 것 | 설치의 처리 |
| - | - | - | - |
| `layout` · `sides.*.root`·`marker` | save · coordinator · 에이전트 | 쪽 판별 — `null` 은 두지 않는다 | 근거로 채운다(빌드 파일 위치) |
| `commands.be.*` · `commands.fe.*` | save · qa-cycle · 에이전트 | 그 명령을 쓰는 단계(테스트·lint·dev 서버) | 근거로 채운다(D3 답 · 파이프 금지). 러너·도구가 없으면 `null` + 자산 이름 주석 |
| `commands.fe.e2e` · `e2e.modeSwitch` | qa-cycle · unit-test-engineer | e2e 단계 | D7 규칙대로 |
| `contract.*` | coordinator · fe-be-trace · save · 에이전트 | 계약 커플링 확인 | 근거로 채운다(DTO·Controller 위치). 짝 레포·FE 가 없으면 `null` + 주석 |
| `data.*` | data-migration · coordinator | 스키마 절차 안내 | 근거로 채운다(마이그레이션 도구·디렉토리). 오버레이 스킬이 없으면 `null` + 주석 |
| `risk.sharedDbSuites`·`sharedDbProfiles`·`destructive` | save · change-verifier · data-migration | 실행 전 환경 확인 안내 | D2·D2-2 근거로 채운다 — 비우지 않는다(없으면 `[]`) |
| `risk.devServer` | frontend-engineer | dev 서버 프록시 경고 | 근거로 채운다. 프록시가 없으면 `null` + 주석 |
| `git.*` | save · frontend-engineer | 커밋·push 단계 | **묻는다**(D5) |
| `docs.domainIndex`·`screenMap`·`repoMap`·`testGuide`·`uiUxRules` | fe-be-trace · qa-cycle · ui-ux-guide · 에이전트 | 그 문서를 읽는 단계 | 근거로 채운다(파일이 있을 때만). 없으면 `null` + 자산 이름 주석 |
| `docs.archiveDir`·`pathValidator`·`autoloaded` | archive-cycle | ④ 레포 문서 이동 · ⑤-2 경로 검사 · ① 상시 적재 계측 | **근거가 있을 때만** 채운다(보관 폴더가 이미 있다 · 경로 검사 스크립트가 있다 · 자동 로드 `CLAUDE.md` 목록). 없으면 `null` + 주석 「docs-setup 에서 정함 — 그전까지 archive-cycle ④ 이동이 건너뛴다」. 보관 폴더를 새로 정하는 일은 문서 구조 결정이라 설치에서 하지 않는다 |
| `memory.slugs` | archive-cycle · qa-cycle | 메모리 계측·정리 | D7 규칙대로(근거 있을 때만, 대소문자 차이는 하나로) |
| `memory.policy` | qa-cycle | 백로그 기록 위치 안내 | 근거로 채운다(레포 문서의 백로그 위치). 없으면 `null` + 주석 |
| `agents` | coordinator · 에이전트 | 역할 덮어쓰기 — 기본값으로 돈다 | 레포에 같은 역할 에이전트가 있을 때만 채운다 |
| `plugin` | plugin-sync · plugin-curator | 플러그인 정본 작업 | D7 규칙대로 |

- **docs-setup 과의 연결** — `docs.archiveDir`·`pathValidator`·`autoloaded`·`memory.slugs` 와 게이트 `docs.always`·`docs.archive` 는 harness-kit 의 docs-setup 스킬이 정하는 칸이다. 설치는 근거 없는 칸을 위 주석과 함께 `null` 로 두고 보고에 「docs-setup 에서 정함」으로 적는다 — 보고의 이 줄이 다음 할 일이다. 앞선 걷어내기 백업에 docs-setup 이 채운 값이 있으면 D8-2 로 되살릴지 먼저 묻는다.
- **게이트 `docs.archive` 에 이름 앞머리를 넣지 않는다.** 이 칸은 「낡아도 되는 곳 — 검사에서 뺀다」이다. `docs/task/goal-`·`docs/phase` 같은 앞머리는 아직 살아 있는 같은 이름의 문서까지 검사에서 빼, 시험 설치처에서는 살아 있는 문서 9개가 검사 밖으로 나갔다. 넣을 수 있는 것은 아카이브 폴더 하나(`<archiveDir>/`)나 끝난 문서의 파일 경로뿐이다. 근거가 없으면 `[]` 로 둔다.

### D8-2. 문서 칸 되살리기 — 앞선 걷어내기 백업에 docs-setup 값이 있을 때만

docs-setup 은 설치 단계(tier)와 무관하게 자기 칸을 채우고, 그 줄 끝에 `// harness-kit:docs-setup` 표시를 단다. 걷어내기는 config 를 통째로 지우므로 이 값도 함께 사라지지만, 백업(`git rev-parse --git-path harness-uninstall-backup/<시각>/` 의 `index.json` `docsSetup` 과 `files/harness.config.mjs`)에는 남는다.

- 관찰: `node "${CLAUDE_SKILL_DIR}/../docs-setup/scripts/config-slots.mjs" backups <레포 루트>` — 최신 백업의 칸마다 백업 값 · 지금 값 · 가리키는 폴더·파일(아카이브 폴더 · 자동 로드 `CLAUDE.md` · `docs.always` 파일 · 메모리 디렉토리 · 경로 검사 스크립트)이 아직 있는가. 「docs-setup 칸이 든 것 0개」면 묻지 않는다.

| 관찰 | 권장 |
| - | - |
| 칸마다 가리키는 것이 모두 있다 | **되살림** — docs-setup 을 다시 돌리지 않아도 archive-cycle 이 바로 돈다 |
| 일부 칸이 가리키는 것이 없다(아카이브 폴더를 지웠다 등) | **골라 되살림** — 없는 칸(`SKIP`)은 빼고, 목록 칸은 없는 경로만 뺀다 |
| 백업 config 를 읽지 못했다(`WARN`) | 권장 없음 — 판단 근거 부족 |

- 선택지 — 바뀌는 것
  - **되살림** — 4단계 config 를 쓴 뒤 `config-slots.mjs restore <레포 루트> --backup <백업>` 이 그 칸 줄을 표시와 함께 되넣는다(게이트 `docs.always`·`docs.archive` 는 지금 값과 합친다). D8 의 「docs-setup 에서 정함」 `null` 이 그 값으로 바뀐다.
  - **골라 되살림** — `backups` 의 「되살리기:」 줄(`--slots` 포함)대로 고른 칸만 되넣는다. 나머지는 D8 대로 `null` + 주석.
  - **되살리지 않음** — D8 대로 둔다. 보고에 「docs-setup 다시 돌리기」를 다음 할 일로 적는다. 백업은 그대로 남는다.
- 되살린 칸은 설치가 고른 값이 아니다 — 체크포인트 답에 `D8-2` 로 적고, 9단계 영수증 뒤 `config-slots.mjs record` 가 `owners["docs-setup"]` 에 적는다(설치 칸 `files`·`edits` 는 건드리지 않는다).

## D9. graft 사용 — 코드 지도를 이 PC 에서만 켤까 (레포 단위, 기본 안 씀)

graft(전역 npm 패키지 `@nanonets/graft`)는 레포의 코드 그래프를 `graft/` 에 만들고, 훅으로 **매 프롬프트마다 관련 코드 위치를 대화에 붙이고** 턴 끝에 그래프를 다시 짓는다. 코드가 크고 작업이 잦은 레포에서만 이득이다 — 작고 문서 위주인 레포에서는 붙는 내용이 잡음이었다(실측).

- 질문 첫 문장: 「이 레포의 코드 지도(graft)를 만들어, 질문할 때마다 관련 코드 위치를 자동으로 붙여 줄까요? 이 PC·이 폴더에서만 켜지고 커밋되지 않습니다.」
- 안내 한 줄(질문 첫 문장 다음): 「코드가 크고 작업이 잦은 레포에서 이득. 작은·문서 위주 레포에선 매 프롬프트 주입이 잡음이 된다」
- 사전 점검: `node "${CLAUDE_SKILL_DIR}/../../scripts/graft-localize.mjs" check <레포 루트>` — graft 설치 여부(`graft --version`)와 그 설치본의 Node 조건만 본다. 종료코드 3 이면 묻지 않는다.
- 사전 조건 — **Node 판.** graft 는 `package.json` 의 `engines.node` 로 Node 판을 요구한다(예: 조사 판 0.12.1 기준 `>=20`, 판마다 다를 수 있어 숫자를 여기 박지 않는다). 못 미치는 Node 에서는 설치가 실패하거나 깔려 있어도 런타임 오류가 난다 — 실제로 graft 를 깔 때 Node 를 먼저 올려야 했다. `check`·`prepare` 는 graft 가 있으면 설치본 `package.json`(`npm root -g` 아래 `@nanonets/graft`, 없으면 graft 실행 파일 위치로 찾는다)의 `engines.node` 를 지금 `node --version` 과 대어 본다. 판정하는 범위식은 `>=X`·`>=X.Y.Z`·`^X` 꼴뿐이고, 못 읽거나 해석하지 못하면 `WARN` 만 내고 진행한다.

| 관찰 | 권장 |
| - | - |
| graft 가 이 PC 에 없다(`graft --version` 실패) | 묻지 않는다 — 설치 안내만 하고 보고에 「graft 없음 — 건너뜀」. 안내: `npm view @nanonets/graft engines` 로 요구 Node 판 확인 → `node --version` 과 비교 → 모자라면 Node 를 먼저 올린 뒤 `npm i -g @nanonets/graft`(사용자가 직접). 전역 npm 설치·Node 업그레이드를 스킬이 하지 않는다 |
| graft 가 있지만 지금 Node 가 그 설치본의 `engines.node` 에 못 미친다 | 묻지 않는다 — 깔려 있어도 쓸 수 없다고 보고(「Node <요구> 필요, 현재 <판>」) 위와 같은 안내만 하고 보고에 「Node 판 모자람 — 건너뜀」 |
| graft 를 쓸 수 있다 | 권장을 계산하지 않는다 — 「(권장)」 표시도 근거 부족 문구도 달지 않고 위 안내 한 줄과 함께 묻는다. 기본은 안 씀 |

- 선택지 — 바뀌는 것(안 씀이 먼저)
  - **안 씀 (기본)** — 아무것도 바뀌지 않는다.
  - **사용 — 이 PC 에서만** — 8-2단계가 `.gitignore` 에 `/graft/` 표시 블록 한 개(커밋 대상, 개인 경로 없음)를 넣고, `graft init`·`graft build` 뒤 `graft-localize.mjs localize` 로 graft 가 넣은 설정을 전부 `.claude/settings.local.json` 으로 옮긴다. 커밋되는 `settings.json` 은 init 전과 같아진다. 다른 PC·worktree 에는 graft 가 없다.
- **왜 로컬 전용인가** — graft 가 만드는 `.claude/helpers/graft-*.cjs` 는 그 PC 의 graft 설치 경로를 절대경로로 박아 둔다(shim 의 `BAKED`). 커밋하면 README 읽기 규칙 7(절대경로·사용자 홈 금지)에 걸리고, graft 가 없는 팀원 PC 에서는 settings.json 의 graft 훅이 매 턴 실패한다.
- **timeout 교정** — graft 0.12.1 은 훅 `timeout` 에 8000·10000·15000 을 적는다(ms 로 본 값). Claude Code 의 훅 timeout 단위는 **초**다(공식 hooks 문서 Common fields 「Seconds before canceling」). `localize` 는 graft 훅의 timeout 이 1000 이상이면 ms 로 보고 초로 올림한다(8000→8 · 10000→10 · 15000→15). graft 는 프롬프트 훅의 하위 질의 시간을 `settings.json` 의 timeout 에서만 읽으므로, 옮긴 뒤에는 기본값(6초)으로 돈다 — 15초 안에 든다.
- **graft 업그레이드 뒤** — graft 는 판이 바뀐 첫 세션 시작에 연결을 다시 쓰면서(`reconcileWiring` → `runInit`) `settings.json` 에 graft 키를 다시 넣는다. `graft-localize.mjs status` 가 그것을 알리고, `localize` 만 다시 돌리면 같은 상태가 된다(멱등).
- 체크포인트에 `D9` 로 적는다 — `slots: []`, `recs` 는 `recommended: null`·`followed: null`(근거는 `check` 의 graft 판). 영수증의 `local.graft`(TEMPLATES.md §9)가 걷어내기의 기준이다.

## D10. 전역 상태 줄 — 지금 상태 줄과 graft 줄을 함께 보일까 (사용자 전역, 기본 안 씀)

harness-kit 이 **사용자 전역(`~/.claude`)에 쓰는 유일한 항목**이다. 플러그인은 상태 줄(`statusLine`)을 줄 수 없다 — 플러그인 settings 에서 효력이 있는 키는 `agent`·`subagentStatusLine` 뿐이다(공식 plugins manifest-reference 「settings」). 상태 줄은 세션에 하나뿐이라, graft 줄을 보이려면 전역 상태 줄 명령을 「원래 명령 + graft 줄」을 잇는 스크립트로 바꿔야 한다.

- 질문 첫 문장: 「Claude Code 아래 상태 줄에 지금 쓰는 줄과 graft 줄을 함께 보일까요? 이 PC 의 사용자 전역 설정(`~/.claude/settings.json`)에서 상태 줄 명령 하나만 바꿉니다 — 모든 레포에 적용되고, graft 가 없는 레포에서는 원래 줄만 나옵니다.」
- 근거: `node "${CLAUDE_SKILL_DIR}/../../scripts/statusline-setup.mjs" status` — 지금 전역 statusLine 명령과 판정(없음 · 보통 상태 줄 · 다른 합치기 스크립트 · 우리 합치기).

| 관찰 | 권장 |
| - | - |
| D9 가 「안 씀」이거나 건너뜀 | 묻지 않는다 |
| 전역 statusLine 이 이미 우리 합치기 스크립트다 | 묻지 않는다 — 그대로 쓴다(보고에 「설치돼 있음」) |
| 전역 statusLine 이 이미 상태 줄을 합치는 명령으로 보인다(우리 것이 아님) | 권장 없음 — 그 명령을 보이고, 그대로 둘지 · 그 원래 명령을 base 로 옮겨 바꿀지 묻는다. 스크립트는 덮어쓰지 않고 종료코드 3 으로 멈춘다 |
| D9 가 「사용」 | 합치기 사용 |

- 선택지 — 바뀌는 것
  - **합치기 사용 (전역 설정 바꿈)** — `statusline-setup.mjs install` 이 합치기 스크립트를 `~/.claude/harness-kit/statusline-combined.cjs` 로 복사하고(플러그인 캐시 경로는 판마다 바뀌어 가리키지 않는다), 지금 명령을 `~/.claude/harness-kit/statusline.json` 의 `base` 로, 그 명령을 돌릴 셸을 `shell` 에 절대경로로 남기며(설치 때 한 번 정한다 — Windows: `CLAUDE_CODE_GIT_BASH_PATH` → `where git` 옆 `bin\bash.exe` → PowerShell, 그 밖: `$SHELL` → `/bin/sh`. Claude Code 의 PATH 는 System32 가 앞이라 이름으로 찾은 bash 가 WSL bash 였다), 전역 settings.json 을 백업한 뒤 `statusLine.command` 하나만 바꾼다. 전역 영수증은 `~/.claude/harness-kit/receipt.json` 이다(레포 영수증과 따로). 8-2단계의 `localize --statusline` 이 같은 명령을 그 레포의 `settings.local.json` 에도 넣어, graft 업그레이드가 graft 전용 상태 줄을 다시 넣어도 가려지게 한다(local 이 project 보다 앞선다).
  - **안 씀** — 전역 설정을 바꾸지 않는다. graft 상태 줄은 보이지 않고, graft 업그레이드 뒤 `settings.json` 에 다시 들어온 graft 상태 줄은 `localize` 를 다시 돌려야 빠진다.
- 되돌리기는 레포 걷어내기와 따로 묻는다(harness-uninstall 0-2단계). 지금 값이 우리가 쓴 값과 같을 때만 원래 값으로 되돌리고, 사본 스크립트·`statusline.json` 은 남긴다(레포 `settings.local.json` 이 가리킬 수 있다).
- 체크포인트에 `D10` 으로 적는다 — `slots: []`, `recs`. 영수증 `local.statusline` 에는 전역 영수증 위치를 `~/` 꼴로만 적는다.
