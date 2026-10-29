---
name: review-pending
description: 사후리뷰 — 리뷰를 거치지 않은 커밋을 커밋 하나씩 change-verifier 에 리뷰시키고, 결과를 git notes(refs/notes/<review.notesRef>)에 남긴다. 리뷰 설정은 레포 harness.config.mjs 의 project.review 블록에서 읽는다. 인자로 rev 범위를 받는다.
argument-hint: "[<rev 범위> 예: main..HEAD]"
---

# /review-pending — 리뷰 안 된 커밋 사후리뷰

`/harness-kit:save` 의 diff 리뷰 게이트를 거치지 않은 커밋을 커밋 하나씩 리뷰한다. 결과는 git notes 에 남긴다.

- 대상이 되는 커밋
  - IDE·터미널에서 한 커밋
  - save 가 임계 미만이라 리뷰 없이 한 커밋
  - 리뷰에 발견이 있었는데 그대로 한 커밋
- notes 는 커밋을 다시 쓰지 않는다. 그래서 이미 push 한 커밋에도 기록을 남길 수 있다.
- 리뷰는 `harness-kit:change-verifier` 하나가 한다.
- 🔴 **이 커맨드는 코드를 고치지 않는다.**
  - fail 이면 보고만 한다.
  - 고칠지는 사용자가 정한다. 고칠 때는 새 커밋으로 한다(`/harness-kit:save`).
  - push 한 커밋을 amend·rebase 하지 않는다.
- 빌드·lint·테스트를 돌리지 않는다. DB·컨테이너에 붙지 않는다.
- **라이트 범위에서 돈다.** 하네스의 관찰 훅·계측 로그를 읽지 않는다. 읽는 것은 git 과 config 뿐이다.

## 프로필 — 프로젝트 고유값을 읽는 곳

이 커맨드는 프로젝트 고유값을 본문에 갖지 않는다. 레포 루트 `harness.config.mjs` 의 `project` 블록에서 읽는다(슬롯 정의는 harness-kit README 「프로젝트 프로필」).

- 읽는 순서: 현재 레포 config → `project.pairOwner` 가 가리키는 주 레포 config.
- 이 커맨드가 읽는 슬롯: `review.notesRef` · `review.integrationBranch` · `review.remote` · `review.batchAsk` · `git.reviewThreshold` · `git.push`
- **값이 없으면 지어내지 않는다.**
  - 슬롯 키가 없으면 그 자리에서 멈추고 사용자에게 묻는다.
  - `null` 은 "해당 없음으로 판단됨"이다. 그 단계를 건너뛰고 보고에 적는다.
  - `review` 또는 `review.notesRef` 가 `null` 이면 사후리뷰가 꺼져 있다. 「사후리뷰 꺼짐(project.review null)」을 보고하고 끝낸다.
  - `review.remote` 가 `null` 이면 원격이 없는 레포다. 원격 기록 받기(Step 2)와 올리기(Step 7)를 건너뛴다. 보고에 「원격 없음 — 받기·올리기 건너뜀」을 적는다.
  - `git.reviewThreshold` 가 `null` 이거나 키가 없으면 범위 안의 커밋을 모두 대상으로 본다(크기로 거르지 않는다).

## 말 풀이

질문과 보고의 첫 문장에는 아래 표 오른쪽의 말을 쓴다. 왼쪽 말은 괄호 안에만 쓴다.

| 용어 | 쉬운 말 |
| - | - |
| 사후리뷰 | 이미 한 커밋을 나중에 리뷰한다 |
| notes · 리뷰 기록 | 커밋을 바꾸지 않고 커밋 옆에 붙여 두는 메모. 여기서는 리뷰 결과(pass·fail)를 적는다 |
| notes ref(`refs/notes/<notesRef>`) | 이 PC 의 리뷰 기록이 모인 곳 |
| 받아 둔 기록(`refs/notes/<notesRef>-<remote>`) | 다른 PC 가 원격에 올린 리뷰 기록을 받아 둔 사본. 이 PC 의 기록과 따로 둔다 |
| 임계(`git.reviewThreshold`) | 이만큼 넘게 바뀐 커밋만 리뷰한다(파일 수·줄 수) |

## Step 0: 스크립트 경로

보조 스크립트는 `${CLAUDE_PLUGIN_ROOT}/scripts/review-pending.mjs` 다. 아래에서 `<RP>` 는 이 경로다.

- 스크립트는 지금 디렉토리가 든 git 레포를 대상으로 한다. 레포 루트에서 돌린다.
- Bash 호출 사이에 셸 변수는 남지 않는다. 찾은 경로·값을 이후 명령에 **그대로 적는다**.

## Step 1: 리뷰 설정 풀기

```bash
T="${TMPDIR:-/tmp}"
node "<RP>" config > "$T/rp-config.json" 2> "$T/rp-config.err"; ec=$?
echo "[exit=$ec]"; cat "$T/rp-config.json" "$T/rp-config.err"
```

> 🔴 **파이프로 넘기지 않는다. 판정은 `$ec` 로 한다.**

| `$ec` | 뜻 | 할 일 |
| - | - | - |
| `0` | 칸이 모두 있다(`null` 포함) | 다음 단계 |
| `1` | 키 없는 칸이 있다(`missing`) | 멈춘다. `missing` 목록을 보이고 값을 묻는다 |
| `2` | config 를 읽지 못했다 | stderr 를 보고하고 멈춘다 |

이후 단계는 출력의 값을 쓴다.

- `refs.notes` — 이 PC 의 리뷰 기록 ref
- `refs.tracking` — 받아 둔 기록 ref(`review.remote` 가 `null` 이면 `null`)
- `review.remote` · `review.batchAsk`
- `disabled` 가 `true` 면 사후리뷰 꺼짐이다. 보고하고 끝낸다.

## Step 2: 원격 리뷰 기록 받기

`review.remote` 가 `null` 이면 이 단계를 건너뛴다.

```bash
# <REMOTE>=review.remote · <NOTES>=refs.notes · <TRACKING>=refs.tracking
git fetch <REMOTE> "+<NOTES>:<TRACKING>"; echo "[exit=$?]"
```

- 원격 기록은 이 PC 의 기록(`<NOTES>`)이 아니라 **따로 둔 ref(`<TRACKING>`)** 로 받는다.
  - 그래서 `+`(강제 갱신)여도 아직 올리지 않은 이 PC 의 기록은 덮이지 않는다.
  - `unreviewed` 는 두 ref 를 모두 읽는다. 다른 PC 가 리뷰한 커밋은 병합하지 않아도 빠진다.
- **실패해도 진행한다.**
  - 결과 요약 맨 위에 「원격 리뷰 기록 받기 실패(<사유>)」를 한 줄로 적는다.
  - 다른 PC 가 리뷰한 커밋이 목록에 다시 나올 수 있다.
- 흔한 실패 원인은 둘이다.
  - 원격에 notes ref 가 아직 없다(`couldn't find remote ref`). 처음 쓰는 레포다. 정상이다.
  - 네트워크·권한

## Step 3: 범위와 대상 목록

범위는 `$ARGUMENTS` 다.

- 주면 그대로 쓴다.
- 비어 있으면 스크립트의 기본값을 쓴다.
  1. **통합 브랜치에 아직 없는 이 브랜치 커밋** — `HEAD --not <remote>/<integrationBranch>`. 원격이 없으면 `HEAD --not <integrationBranch>`.
  2. 그 ref 가 없으면 `@{upstream}..HEAD`. 사유를 stderr 에 낸다. 결과 요약의 범위 줄에 그 사유를 적는다.
  3. upstream 도 없으면 종료 2 다. 범위를 인자로 달라고 묻는다.
- 1번은 push 한 뒤에도 대상이 남는다. `@{upstream}..HEAD` 는 push 하자마자 빈다.
- 원격 ref 가 낡으면(오래 fetch 하지 않음) 이미 통합 브랜치에 들어간 커밋이 섞일 수 있다. 목록이 예상보다 길면 `git fetch <REMOTE>` 뒤 다시 돌린다.

```bash
T="${TMPDIR:-/tmp}"
node "<RP>" unreviewed $ARGUMENTS --json > "$T/rp-pending.json" 2> "$T/rp-pending.err"; ec=$?
echo "[exit=$ec]"; cat "$T/rp-pending.json" "$T/rp-pending.err"
```

> 🔴 **파이프로 넘기지 않는다. 판정은 `$ec` 로 한다.** `0` = 대상 없음 · `1` = 대상 있음(**오류가 아니다**) · `2` = 오류(stderr 를 보고하고 멈춘다).

결과는 `{ range, rangeNote, threshold, refs, commits: [{ sha, subject, grade, rules, files, lines }] }` 다.

| `grade` | 뜻 | `rules` |
| - | - | - |
| `over` | 임계를 넘었다 | 넘은 쪽(`files 4 > 3` · `lines 180 > 100`) |
| `all` | 임계가 `null` 이라 크기로 거르지 않았다 | `[]` |
| `unknown` | 임계 키가 없어 크기로 거르지 않았다 | `[]` |

- 병합 커밋은 빠진다. 첫 부모 대비 diff 가 병합해 온 커밋 전체라 각 커밋과 두 번 잡히기 때문이다.
- 리뷰 기록이 있는 커밋은 verdict 와 관계없이 빠진다. fail 도 리뷰한 커밋이다.
- 대상이 0건이면 「사후리뷰 대상 없음(범위: …)」을 보고하고 끝낸다. 이번에 남긴 기록이 없으니 올리기도 묻지 않는다.

## Step 4: 대상이 많으면 먼저 묻는다

대상이 `review.batchAsk` 건을 넘으면 리뷰 전에 묻는다. `batchAsk` 가 `null` 이면 묻지 않고 모두 리뷰한다.

1. 응답 본문에 목록 표를 먼저 낸다. 질문 창에는 표가 보이지 않는다.

   | sha | 등급 | 넘은 쪽 | 파일·줄 | 제목 |
   | - | - | - | - | - |
   | `1a2b3c4d5` | over | lines 180 > 100 | 2 · 180 | … |

2. 그 뒤에 묻는다.

```text
header: 사후리뷰 대상범위
리뷰 안 된 커밋이 <N>건입니다(기준 <batchAsk>건). 커밋마다 리뷰어 하나가 붙습니다. 모두 리뷰할까요?
근거: unreviewed — 범위 <range> · 등급 <over N건 · all M건>
```

| 관찰 | 권장 |
| - | - |
| 대상이 모두 `over` 다(임계를 넘은 커밋만 골랐다) | **모두 리뷰** — 권장 이유: 크기로 이미 거른 목록이다 |
| `all`·`unknown` 이 섞였다(크기로 거르지 않았다) | 권장 없음 — 크기로 거르지 않은 목록이라 어디까지 볼지 근거가 없다. 직접 골라 주세요 |

- 선택지 — 바뀌는 것
  - **모두 리뷰** — 목록 전부를 리뷰하고 기록한다.
  - **골라서 리뷰** — 사용자가 고른 sha 만 리뷰한다. 나머지는 기록이 없어 다음 실행에 다시 나온다.
  - **이번엔 안 함** — 아무것도 기록하지 않고 끝낸다.
- 권장이 있으면 그 선택지를 첫째에 두고 라벨 끝에 「(권장)」을 붙인다. 설명 첫 줄은 「권장 이유: …」다.
- 권장이 없으면 질문 끝에 「권장 없음 — … 직접 골라 주세요」를 붙이고 어느 선택지에도 「(권장)」을 붙이지 않는다.

## Step 5: 커밋마다 change-verifier 에 리뷰 맡기기

커밋끼리는 서로 기대지 않는다. **한 메시지에서 병렬로** 부른다. `harness-kit:change-verifier` 를 「커밋 리뷰 모드」로 부른다.

호출 프롬프트에는 **아래만** 담는다.

- 「커밋 리뷰 모드」라는 것과 대상 sha
- 그 커밋 항목의 `grade` 와 `rules` 원문
- 리뷰 대상은 그 커밋의 diff 하나다. 에이전트가 직접 `git show --format=%H <sha>` 로 읽는다(메시지 없이 diff 만).
- 고신뢰 결함을 먼저 본다. 불확실한 것은 「확인 필요」 라벨을 단다. 스타일·포맷·네이밍은 지적하지 않는다.
- 결과로 발견 목록 또는 「없음」과 한 줄 요약을 낸다(꼴은 change-verifier 「커밋 리뷰 모드」).

> 🔴 **커밋 제목·메시지·작업 경위를 넘기지 않는다.**
> 이유: 작성 맥락을 받은 리뷰어는 diff 를 의도대로 읽는다. 그러면 작성자가 놓친 곳을 같이 놓친다. save 「diff 리뷰 게이트」와 같은 이유다.

## Step 6: 결과 기록

발견이 「없음」이면 `pass` 다. 하나라도 있으면(「확인 필요」 포함) `fail` 이다.

```bash
node "<RP>" note <sha> pass --summary "<요약>"; echo "[exit=$?]"
node "<RP>" note <sha> fail --summary "<요약>"; echo "[exit=$?]"
```

- 기록 꼴은 아래다. 같은 커밋에 다시 쓰면 바꾼다. 앞 기록은 notes ref 이력에 남는다.

  ```text
  Review: pass
  Reviewed-At: 2026-10-29T03:12:45.120Z
  Reviewer: review-pending
  Summary: 발견 없음
  ```

- 요약은 한 줄이다.
  - pass 는 `발견 없음` 또는 리뷰어의 요약이다.
  - fail 은 `발견 N건 — <가장 심각한 것 한 줄>` 이다.
  - 셸이 해석하는 `"` · `$` · 백틱은 빼고 적는다.
- **fail 도 「리뷰한 커밋」이다.** 기록이 남으면 다음 목록에서 빠진다.
  - 그래서 fail 은 반드시 사용자에게 보고한다. 발견 목록(파일·요약·신뢰도)을 함께 보인다.
  - 고칠지는 사용자가 정한다.
- `note` 가 종료 2 면 그 커밋은 결과 표에 「기록 실패」로 남긴다. 다음 커밋으로 간다.

## 결과 요약

```text
원격 리뷰 기록 받기: 성공 | 실패(<사유>) | 원격 없음 — 건너뜀
범위: <range>(<rangeNote 가 있으면 그 사유>)

| sha | 등급 | verdict | 요약 |
| - | - | - | - |
| 1a2b3c4d5 | over | fail | 발견 2건 — … |
| 6e7f8a9b0 | all | pass | 발견 없음 |
```

- sha 는 앞 9자리다.
- 기록 실패 · 사용자가 건너뛴 커밋도 verdict 칸에 그렇게 적어 표에 남긴다.
- 표를 낸 뒤에만 Step 7 질문을 낸다.

## Step 7: 리뷰 기록 올리기 — 묻고 나서

이번 실행에서 `note` 를 하나라도 남겼으면 올릴지 묻는다. 묻지 않고 올리지 않는다. `review.remote` 가 `null` 이면 묻지 않는다.

```text
header: 리뷰기록 공유
이번에 남긴 리뷰 기록 <N>건을 원격(<REMOTE>)에 올려 다른 PC·팀원도 보게 할까요? 커밋은 바뀌지 않습니다. (git push <REMOTE> <NOTES>)
근거: project.git.push = <값> · 이번 기록 pass <a>건 · fail <b>건
```

| 관찰 | 권장 |
| - | - |
| `project.git.push` 가 `'never'` | **올리지 않음** — 권장 이유: 레포 규칙이 push 를 금한다 |
| 그 밖 | 권장 없음 — 리뷰 기록은 팀이 같이 보는 ref 라 올릴 시점은 사용자가 정한다. 직접 골라 주세요 |

- 선택지 — 바뀌는 것
  - **올림** — 원격 `<NOTES>` 에 이번 기록이 더해진다. 다른 PC 의 다음 실행에서 그 커밋이 빠진다.
  - **올리지 않음** — 기록은 이 PC 에만 있다. 잃는 것은 없다. 나중에 아래 명령으로 올린다.

```bash
git push <REMOTE> "<NOTES>"; echo "[exit=$?]"
```

> 🔴 **`--force`·`+<NOTES>` 로 밀어 넣지 않는다.**
> 이유: notes ref 는 팀 공용이다. 강제로 올리면 다른 사람이 남긴 리뷰 기록이 지워진다.

### 거절됐을 때 — non-fast-forward (`rejected … fetch first` · `non-fast-forward`)

원격에 이 PC 가 아직 합치지 않은 기록이 있다는 뜻이다. 받아 둔 기록을 합친 뒤 **한 번만** 다시 올린다.

1. Step 2 의 받기를 다시 돌린다. 그 사이 원격이 또 바뀌었을 수 있다.
2. 양쪽에 다 있고 내용이 다른 커밋을 응답 본문에 보인다. 합치면 이 PC 쪽이 남는다.

   ```bash
   git notes --ref=<NOTES> list > "${TMPDIR:-/tmp}/rp-local.txt"
   git notes --ref=<TRACKING> list > "${TMPDIR:-/tmp}/rp-remote.txt"
   ```

   두 파일에서 둘째 칸(커밋 sha)이 같고 첫째 칸(기록 blob)이 다른 줄이 그 커밋이다.

3. 합치고 다시 올린다.

   ```bash
   git notes --ref=<NOTES> merge -s ours "<TRACKING>"; echo "[exit=$?]"
   git push <REMOTE> "<NOTES>"; echo "[exit=$?]"
   ```

- 전략은 **`ours`(이 PC 우선)** 다.
  - 이 PC 의 기록은 방금 리뷰한 결과다.
  - 한쪽에만 있는 기록은 전략과 관계없이 둘 다 남는다. 부딪히는 것은 같은 커밋을 양쪽에서 리뷰한 경우뿐이다.
- `union`·`cat_sort_uniq` 는 쓰지 않는다. 두 기록의 줄이 한 note 에 섞여, verdict 가 어느 쪽 것인지 알 수 없게 된다.
- 사용자가 원격 쪽을 남기길 원하면 `-s ours` 대신 `-s theirs` 로 합친다.
- `<TRACKING>` 은 지우지 않는다. `unreviewed` 가 계속 읽는 사본이고, 다음 받기가 고친다.
- 다시 올려도 거절되면 멈추고 보고한다. 세 번째로 시도하지 않는다.

### 서버가 받지 않을 때

호스팅 서버가 `refs/notes/*` push 를 받지 않을 수 있다.

- `remote rejected`·`deny`·권한 오류가 나면 그 메시지를 그대로 보고하고 멈춘다.
- 기록은 이 PC 에 남아 있다. 잃는 것은 없고 공유만 안 된다.
- 다른 ref 이름으로 바꿔 다시 밀지 않는다.

## 공유 설정 (1회, 선택)

일반 `git fetch`(IDE 자동 fetch 포함) 때 리뷰 기록도 같이 받으려면 fetch refspec 을 더한다.

```bash
git config --add remote.<REMOTE>.fetch "+<NOTES>:<TRACKING>"
```

- 받는 곳이 `<TRACKING>` 이라 강제 갱신이어도 **덮이는 것은 받아 둔 사본뿐이다.** 이 PC 의 기록 `<NOTES>` 는 건드리지 않는다.
- 🔴 받는 곳을 `<NOTES>` 로 적지 않는다. 그러면 강제 갱신이 올리지 않은 이 PC 의 기록을 덮는다.
- 이 refspec 과 notes ref 는 사용자 데이터다. `harness-uninstall` 은 지우지 않는다(보고에 지우는 명령만 적는다).

## 규칙

- 코드·테스트·커밋을 고치지 않는다. fail 은 보고만 한다.
- 리뷰 기록 올리기는 사용자 확인 뒤에만 한다. 강제로 올리지 않는다.
- 스크립트 출력도 빌드·테스트 출력처럼 파이프로 넘기지 않는다. 종료코드로 판정한다.
- change-verifier 에 커밋 메시지를 넘기지 않는다.
