# 꼴 — 배너 · 성격표 · CLAUDE.md 절 · 메모리 규약 · config · 커밋 명령 · 체크포인트 · 결정 질문

꺾쇠 자리는 이 레포의 관찰과 사용자 답으로 채운다. 행·분류 이름을 미리 정해 두지 않는다 — 아래 예의 분류는 자리 표시일 뿐이다.

## §1 아카이브 배너 (3단계 5번)

첫 제목 줄 바로 아래(제목이 없으면 맨 위)에 둔다. archive-cycle ④ 의 배너와 같은 꼴이라, 나중에 archive-cycle 이 접은 문서와 섞여도 같은 규칙으로 읽힌다.

```markdown
> ⚠️ **시점 문서 — 현행 아님.** <YYYY-MM-DD> 에 `<옛 경로>` 에서 옮겼다. 판정: 접기 — <근거 한 줄: 끝난 증거 · 현행 지식이 이미 있는 곳>.
> 현행은 <현행 SSOT 링크 — 문서 경로 또는 코드 심볼> 을 본다. 이 본문은 경위를 되짚을 때만 읽는다.
```

- 근거 줄에는 끝난 증거(백로그 상태·커밋·머지)를 적는다. 줄 번호 대신 심볼·절 이름을 쓴다.
- 문서 안의 상태 표기(`ACTIVE` 등)는 고치지 않는다 — 배너가 그 위에서 현행 아님을 말한다.

## §2 `docs/README.md` 성격표 (A4)

다른 곳에 문서 색인이 있으면 파일 목록은 그것을 링크하고 여기에는 규칙만 둔다.

```markdown
# docs — 문서 트리 안내

무엇을 하려는지에 따라 여는 곳이 다르다. 작업으로 찾는 라우팅 표는 [../CLAUDE.md](../CLAUDE.md) 에 있다{, 문서 목록은 [../README.md](../README.md) 「<절 이름>」}.

| 분류 · 위치 | 성격 | 언제 여나 |
| - | - | - |
| <분류 — 이 레포의 문서에서 제안> | 현행 규칙·명세 (상시) | <작업> 전 |
| <분류> | 진행 계획 · 백로그 (살아 있는 동안만) | <작업>을 이어갈 때 |
| <분류> | 참조 | <언제> |
| [<archiveDir 상대경로>/](<archiveDir 상대경로>/) | **시점 기록 — 현행 아님** | 과거 경위를 되짚을 때만 |

## 이 디렉토리의 규칙

- 끝난 계획·완료 보고·협의 기록은 `<archiveDir>` 로 옮기고 상단에 배너를 단다(시점 · 현행 아님 · 판정 근거 · 현행이 있는 곳). 판정 기준은 「이 문서가 아직 일을 시키는가」다.
- 아카이브가 아닌 이동은 하지 않는다 — 참조가 깨진다. 분류는 이 표가 보여 준다.
- 문서와 코드가 어긋나면 서술 문서는 코드가 옳고, 명세·정책·계약 같은 규범 문서는 코드의 미이행을 먼저 의심한다.
- `<archiveDir>` 는 검사 대상이 아니다. 낡은 채로 두는 것이 그 폴더의 목적이다.
```

## §3 `CLAUDE.md` 절 (A5)

### 작업 라우팅

```markdown
## 작업 유형 라우팅 — 이 작업을 한다면

| 작업 | 먼저 읽을 것 |
| - | - |
| <이 레포에서 반복되는 작업> | <현행 문서 경로> → <스킬·커맨드가 있으면 그 이름> |
```

- 행은 이 레포의 현행 문서·스킬·커맨드에서만 만든다. 아카이브 문서를 「먼저 읽을 것」에 두지 않는다.
- 기존 문서 목록 절을 바꿀 때는 목록의 문서를 빠뜨리지 않는다. 목록에 있던 문서가 아카이브로 갔으면 그 행은 현행 SSOT 로 바꾸거나 지운다.

### 문서 규약

```markdown
## 문서 규약

| 위치 | 성격 |
| - | - |
| <분류 · 위치> | <현행 규칙·명세 (상시) / 진행 계획 / 참조> |
| `<archiveDir>/` | **시점 기록 — 현행 아님.** 현행으로 읽지 않는다 |

- 끝난 문서는 `<archiveDir>` 로 옮기고 배너를 단다 — 정리는 `archive-cycle` 스킬, 구조·규약을 다시 세울 때는 `docs-setup` 스킬.
- 문서 이동은 일반 파일 이동 + 경로 지정 커밋(옛 경로·새 경로 둘 다)으로 한다. 옮기기 전에 참조를 찾고 옮긴 뒤 다시 찾는다.
- 상세 규칙은 [docs/README.md](docs/README.md).
```

## §4 메모리 규약 절 (A7)

수치는 A7 의 답(판단값 또는 사용자 값)으로 채운다.

```markdown
## 메모리 규약 (Claude Code 프로젝트 메모리)

메모리 폴더는 `~/.claude/projects/` 아래에 있고, 이 레포의 슬러그는 `harness.config.mjs` 의 `project.memory.slugs` 에 있다(PC 마다 다를 수 있다). 메모리는 레포 밖이라 팀·다른 PC 가 보지 못한다. 이 레포의 지식은 레포 문서에 쓰고, 메모리에는 그 경로와 세션 사이의 진행 상태만 둔다.

- **인덱스 `MEMORY.md`** — 한 줄에 하나: `- [제목](파일.md) — 한 줄 요약`, <150>자 이하. 절은 「진행 중」 · 「규칙」 · 「참조」 · 「완료(접힘)」 순서로 둔다. 자세한 것은 토픽 파일에 쓴다.
- **끝난 일** — 토픽 파일을 연표 파일 `<연표 파일 이름>.md` 의 한 줄(`날짜 · 무엇을 · 결과 · 커밋`)로 접고, 인덱스에서는 그 줄을 지운다.
- **핸드오프** — 최근 <4> 세션만 둔다. 각 트랙의 상세는 토픽 파일이 SSOT 다.
- **레포 문서와 같은 내용**(진행 계획 사본 등)은 메모리에 두지 않고 문서 경로를 가리킨다.
- **정리 시점** — `MEMORY.md` 가 자동 로드 한도(앞 200줄 또는 25KB)의 <60>% 를 넘거나 <150>자 넘는 줄이 <5>개 이상이면 `archive-cycle` 을 부른다. 수치는 판단값이다.
```

## §5 config (A6)

값만 바꾸고 주석에 근거를 한 구절 단다. 경로는 레포 기준 상대경로다.

**표시** — 채운 칸마다 한 줄에 쓰고, 줄 끝 주석을 `// harness-kit:docs-setup — <근거>` 로 시작한다. 값이 여러 줄이거나 한 줄 객체(`memory: { slugs: …, policy: … }`) 안에 있으면 표시가 읽히지 않는다 — 칸을 제 줄로 나눈다. 설치가 쓴 주석(「docs-setup 에서 정함」)은 이 주석으로 바꾼다. harness-uninstall 의 표시(`harness-kit:begin`·`harness-kit:line`)는 쓰지 않는다 — 그 표시가 붙은 것은 걷어내기 후보다.

```js
    docs: {
      // …기존 칸 유지
      archiveDir: 'docs/archive', // harness-kit:docs-setup — 끝난 문서는 배너와 함께 여기로
      pathValidator: null, // harness-kit:docs-setup — 문서 경로 검사기 없음, 검증은 링크 검사와 grep
      autoloaded: ['CLAUDE.md'], // harness-kit:docs-setup — 실제 자동 로드 CLAUDE.md 목록
    },
    memory: {
      slugs: ['<슬러그>'], // harness-kit:docs-setup — 메모리 디렉토리 이름
      policy: '<기존 값 유지>',
    },
```

harness-agent 게이트 칸(같은 파일의 최상위 `docs`):

```js
  docs: {
    always: [/* 기존 항목 */ 'docs/README.md'], // harness-kit:docs-setup — A4 에서 만들었으면
    archive: ['docs/archive/'], // harness-kit:docs-setup — 아카이브 폴더 하나, 접두 경로로 살아 있는 문서를 빼지 않는다
  },
```

**문서 칸이 없는 config**(설치 단계에 `project.docs`·`project.memory`·게이트 `docs` 가 없다) — 없는 블록만 새로 열고, 여는 줄에도 같은 표시를 단다. 있는 블록은 칸만 더한다.

```js
  project: {
    // …설치가 쓴 칸 유지
    docs: { // harness-kit:docs-setup
      archiveDir: 'docs/archive', // harness-kit:docs-setup — 끝난 문서는 배너와 함께 여기로
      pathValidator: null, // harness-kit:docs-setup — 문서 경로 검사기 없음
      autoloaded: ['CLAUDE.md'], // harness-kit:docs-setup — 실제 자동 로드 CLAUDE.md 목록
    },
  },
```

쓴 뒤 `node <스킬>/scripts/config-slots.mjs list <레포>` 가 칸마다 `SLOT` 줄을 내고 `failures=0` 이어야 한다. 영수증(`harness.install.json`)이 있으면 이어서 `config-slots.mjs record <레포>` 로 `owners["docs-setup"]` 에 칸과 값을 적는다 — 설치가 쓴 칸(`files`·`edits`·`settings`)은 바꾸지 않는다.

## §6 커밋 명령 (5단계)

메시지는 scratchpad 파일로 쓴다(Write). 브랜치·toplevel 조건과 커밋을 한 명령에 둔다.

```bash
R=<레포 루트>; B=<브랜치>
[ "$(git -C "$R" rev-parse --show-toplevel)" = "$R" ] \
  && [ "$(git -C "$R" rev-parse --abbrev-ref HEAD)" = "$B" ] \
  && [ ! -e "$(git -C "$R" rev-parse --git-path index.lock)" ] \
  && git -C "$R" add -N -- <새 경로…> \
  && git -C "$R" commit -F <메시지 파일> -- <옛 경로…> <새 경로…> <고친 파일…>
```

- 이동은 옛 경로와 새 경로를 **둘 다** pathspec 에 넣는다. 옛 경로가 빠지면 새 파일만 생기고 원본이 남은 커밋이 된다.
- 커밋 뒤 `git -C "$R" status --short` 와 `git -C "$R" show --stat HEAD` 로 남은 변경·포함 파일을 본다. 이름 바꿈 판정(`R`)은 git 이 내용으로 하므로 배너를 달아도 대개 이동으로 보인다.

## §7 체크포인트 (`git rev-parse --git-path docs-setup-state.json`)

대상 트리에서 위 명령이 돌려주는 경로에 Write 로 쓴다. 커밋되지 않으므로 로컬 경로를 적어도 된다.

```json
{
  "skill": "docs-setup",
  "head": "<시작 시 HEAD SHA>",
  "done": ["2", "3.1", "3.2"],
  "decisions": [
    { "id": "A1", "answer": "docs/archive 새로 정함", "value": "docs/archive",
      "recommended": "docs/archive", "basis": "docs/ 평면 · 보관 폴더 없음", "followed": true },
    { "id": "A2", "answer": "「접기」 후보 전부 옮김", "value": ["docs/<문서>.md"],
      "recommended": "「접기」 후보 전부", "basis": "후보 표 — 접기 <N> · 이관 후 접기 <M> · 살아있음 <K>", "followed": true }
  ],
  "handoffToArchiveCycle": ["docs/<이관 후 접기 문서>.md"],
  "plan": "<scratchpad>/plan.json",
  "linksBaseline": "<scratchpad>/links-before.json",
  "backup": "<git 디렉토리>/docs-setup-backup",
  "refDecisions": [{ "at": "<파일>:<행>", "kind": "name", "answer": "그대로", "why": "코드 주석의 문서 이름" }],
  "updated": "<ISO 시각>"
}
```

- `done` 에는 완료 기준을 통과한 단계(3단계는 하위 번호)만 넣는다. 0·1단계는 읽기뿐이라 적지 않는다 — 재개 때 다시 한다.
- **재개** — 0·1단계를 다시 하고, `done` 의 각 단계는 완료 기준을 한 번 더 확인한다. 3.4(이동) 뒤에 끊겼으면 계획의 `from` 이 없고 `to` 가 있는지로 이동 여부를 가린다. 반쯤 된 상태가 의심되면 백업과 `docs-setup-backup.json` 을 보이고 「되돌림 / 이어서」를 묻는다.

## §8 결정 질문 (2단계)

한 번에 질문 하나. 칸이 여럿인 결정(A5·A6)은 항목마다 따로 묻거나, 칸 표를 보인 뒤 한 번에 묻는다.

```text
header: 아카이브 폴더
A1. 끝난 문서를 모아 둘 아카이브 폴더를 어디에 둘까? (project.docs.archiveDir)
근거: docs/ 가 평면(<N>개)이고 보관 폴더가 없다 · config archiveDir: null · 게이트 docs.archive 는 접두 경로 <K>개

1. docs/archive 새로 정함 (권장)
   바뀌는 것: archiveDir 가 'docs/archive'. 폴더는 첫 문서를 옮길 때 생긴다
2. 아카이브 두지 않음
   바뀌는 것: archiveDir: null. archive-cycle 이 레포 문서 이동을 건너뛴다

header: 아카이브 이동 문서
A2. 끝난 것으로 판정한 문서 <N>개를 아카이브로 옮길까?
근거: 후보 표(문서 · 판정 · 근거 · 들어오는 참조) — 접기 <N> · 이관 후 접기 <M>(옮기지 않고 archive-cycle 로) · 살아있음 <K>

1. 「접기」 후보 전부 옮김 (권장)
   바뀌는 것: <N>개가 docs/archive 아래로 가고 배너가 달린다. 참조 고침 <X>건(지시 문서 <Y>건은 따로 묻는다)
2. 골라서 옮김 — 목록을 받음
   바뀌는 것: 고른 문서만 옮긴다
3. 지금은 옮기지 않음
   바뀌는 것: 폴더와 규약만 세운다. 후보 표는 보고에 남는다

header: 나머지 문서 이동
A3. 아카이브가 아닌 문서를 분류 폴더로 옮길까?
근거: 살아 있는 문서 <K>개 · 들어오는 참조 <Z>건(지시 문서 <W>건)

1. 옮기지 않음 (권장)
   바뀌는 것: 경로가 그대로다. 분류는 성격표에만 적힌다
2. 분류 폴더로 옮김 — 대상 목록을 받음
   바뀌는 것: 받은 문서만 옮기고 참조 <Z>건 중 해당분을 고친다
```

**header(12자 이하)** — 대상을 먼저 쓰고 동작을 붙인다. 번호는 `question` 맨 앞에만 둔다. 넣기 전에 공백을 포함해 글자 수를 센다.

| 결정 | header | 글자 수 |
| - | - | - |
| A1 | `아카이브 폴더` | 7 |
| A2 | `아카이브 이동 문서` | 10 |
| A3 | `나머지 문서 이동` | 9 |
| A4 | `문서 성격표` | 6 |
| A5 (라우팅) | `CLAUDE 라우팅표` | 11 |
| A5 (문서 규약) | `CLAUDE 문서규약` | 11 |
| A6 | `문서·메모리 설정` | 9 |
| A7 | `메모리 규약 절` | 8 |
| 3단계 지시 문서 줄 | `지시문서 참조` | 7 |

**선택지 라벨** — 라벨만 읽어도 뜻이 통해야 한다. `옮김`·`안 함` 처럼 무엇을 하는지 빠진 라벨은 쓰지 않는다. 권장 표시 「(권장)」은 라벨 끝에 붙인다.

**근거 부족 · AskUserQuestion** — 근거가 모자라면 근거 줄에 무엇을 찾지 못했는지 적고 「판단 근거 부족 — 직접 골라 주세요」를 둔다. AskUserQuestion 을 쓰면 `header` 에 위 header 를, `question` 에 질문과 근거 한 줄을, 권장 선택지를 `options` 첫 번째에 두고 `label` 끝에 「(권장)」을, 각 `description` 에 바뀌는 것을 넣는다.
