# 사용 가이드 산출

화면을 처음 여는 사람이 이 문서 한 장으로 모니터를 읽고 쓰게 한다. 문서 1장 + 캡처 10장이다.
캡처는 **재현 가능**해야 한다. 같은 명령을 다시 돌리면 같은 그림이 나온다. 화면이 바뀌면 다시 찍기만 하면 된다.

## 1. 사실 시트를 먼저 쓴다

가이드 본문을 쓰기 전에 사실 시트를 만든다. 가이드의 모든 문장은 이 시트에서 나온다.

- 절: 접속·로그인·보기 범위 · 켜는 환경 · 화면 구성과 문구 원문 · 지표 정의 · 결과 6종 · 방향·시각 · 시간 규칙 · 송신 결과 값 · 마스킹 · 연결 끊김 · 한계 · 캡처 데이터
- 칸마다 근거를 `파일:심볼` 로 단다. 라인번호는 쓰지 않는다.
- 코드로 확인하지 못한 것은 「미확인」으로 적는다. 가이드에 옮길 때도 단정하지 않는다.
- 문구는 상수 파일에서 원문 그대로 옮긴다. 화면에서 다시 타이핑하지 않는다.
- 기준 브랜치·커밋을 시트 맨 위에 적는다.

## 2. 재현 가능한 캡처의 조건

| 조건 | 방법 |
| - | - |
| 같은 데이터 | 모의 피드를 쓴다. `?seed=N` 으로 과거 시각 N건을 먼저 깐다. 실제 환경을 찍지 않는다 |
| 같은 시각 | 가짜 시계를 설치하고 고정 시각에서 멈춘다. 시간 초과가 보이게 응답 제한시간보다 길게 앞으로 돌린다 |
| 같은 난수 | 페이지 스크립트보다 먼저 seed 난수로 `Math.random` 과 UUID 생성을 바꾼다 |
| 같은 화면 설정 | 보기·테마·글자 크기·보관 상한·요약 접힘·패널 내용 저장값을 페이지 로드 전에 넣는다 |
| 같은 창 | 뷰포트·배율·로캘·시간대를 고정한다 |
| 같은 상태 | 포인터를 hover 대상 밖으로 치운다. 레이아웃이 자리 잡을 시간을 실제 시간으로 준다 |
| 안정된 선택자 | UI.md §13 의 테스트 ID 와 접근 가능한 이름을 쓴다. 표시 문구·클래스 이름에 덜 기댄다 |

- 참여자가 많은 장면(참여자 popover 의 스크롤·검색, 현황판 카드 격자)은 `?parties=N` 을 더한다. 장면마다 N 을 고정한다.
- 캡처 데이터는 전부 합성값이다. 가이드 본문에 그렇게 적는다.
- 모의 모드가 건너뛰는 가드는 SKILL.md 3단계 1 에 있다. 그래서 로그인 화면·연결 실패 화면은 찍을 수 없다. 그 절은 글과 표로 쓴다.

## 3. 캡처 10종

| 이름 | 장면 | 조작 | 쓰는 절 |
| - | - | - | - |
| `overview-light` | 밝은 테마, 행 보기 전체 | — | 머리말 |
| `overview-dark` | 어두운 테마, 행 보기 전체 | 테마 저장값 `dark` | 2 화면 구성 |
| `toolbar` | 머리 블록만 | 머리 요소만 찍는다 | 2 화면 구성 |
| `facet-help` | 결과 설명 popover | `결과 설명` 버튼 | 3 결과 6종 |
| `view-card` | 카드 보기 | 보기 저장값 `card` | 5 보기 3종 |
| `view-panel` | 패널 보기 | 보기 저장값 `panel` | 5 보기 3종 |
| `status-failed` | 실패 계열만 걸러 본 목록 | 결과 칩 처리 실패·송신 거절·송신 실패·시간 초과 | 6 필터와 검색 |
| `filter-party` | 참여자 popover 펼침 | 참여자 버튼 | 6 필터와 검색 |
| `buffer-limit` | 보관 상한 popover | 상한 버튼 | 6 필터와 검색 |
| `detail` | {상대}→{우리} 요청 하나의 상세 Payload 탭 | 그 행을 누른다 | 7 상세 보기 |

- D4 가 패널 보기를 뺐으면 `view-panel` 을 빼고 9장이다.
- 현황판(선택, UI.md §14)을 만들었으면 `board` 한 장을 더한다. 장면 = 현황판 전체, 밝은 테마. 쓰는 절 = 11 현황판.

## 4. 캡처 스크립트 견본 — 예시(Playwright 기준)

Node + Playwright 로 쓴 견본이다. 다른 헤드리스 도구를 쓰면 같은 조건(§2)을 그 도구로 옮긴다.
`BASE`·저장 키·장면 판정은 프로젝트 값으로 바꾼다. 선택자는 UI.md §13 의 테스트 ID 다. 모의 서버를 먼저 띄운다(`commands.fe.devMock`).

```js
// capture.mjs — node capture.mjs [장면 이름 ...]   (인자가 없으면 전부)
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.MONITOR_URL ?? 'http://localhost:5173/monitor';
const SEED = 40;                                          // 모의 피드 과거 건수
const OUT = process.env.OUT_DIR ?? 'docs/flow/monitor-guide/img';
const T0 = new Date('2026-01-15T10:00:00+09:00').getTime();  // 예 — 시차는 아래 timezoneId 와 맞춘다
const ADVANCE_MS = 34_500;                                 // 응답 제한시간보다 길게
const STORAGE = { viewMode: 'row', theme: 'light', fontSize: '14', bufferLimit: '500',
  summaryCollapsed: 'false', panelContent: 'all' };        // 키 접두는 프로젝트 값으로

async function open(browser, overrides = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });  // 로캘·시간대는 예다. 화면 사용자의 값으로 바꾼다
  await context.addInitScript(({ settings }) => {
    try { for (const [k, v] of Object.entries(settings)) localStorage.setItem(`monitor.${k}`, v); } catch {}
    let a = 0x2f6b1d3;                                     // mulberry32
    const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    Math.random = rnd;
    const hex = n => { let s = ''; while (s.length < n) s += Math.floor(rnd() * 16).toString(16); return s; };
    try { Object.defineProperty(crypto, 'randomUUID', { configurable: true,
      value: () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}` }); } catch {}
  }, { settings: { ...STORAGE, ...overrides } });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 500);
  await page.goto(`${BASE}?seed=${SEED}`, { waitUntil: 'domcontentloaded' });
  // 모의 피드가 버퍼를 채울 때까지 실제 시간으로 기다린다. 숫자가 보이는지가 아니라 0 보다 큰지를 본다(`총 0건` 도 숫자다)
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-testid="monitor-count"]')?.textContent ?? '';
    return Number((text.match(/[\d,]+/)?.[0] ?? '0').replace(/,/g, '')) > 0;
  }, null, { timeout: 30_000, polling: 200 });
  await page.clock.runFor(ADVANCE_MS);
  await settle(page);
  return { context, page };
}

async function settle(page) {
  await page.clock.runFor(300);
  await page.waitForTimeout(400);                          // 레이아웃·ResizeObserver
  await page.clock.runFor(50);
  await page.mouse.move(1430, 890);                        // hover 대상 밖으로
  await page.waitForTimeout(200);
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const scene = (overrides, act) => async browser => {
  const { context, page } = await open(browser, overrides);
  if (act) { await act(page); await settle(page); }
  return { context, page };
};

const scenes = {
  'overview-light': scene(),
  'overview-dark': scene({ theme: 'dark' }),
  'view-card': scene({ viewMode: 'card' }),
  'view-panel': scene({ viewMode: 'panel' }),
  'facet-help': scene({}, p => p.getByRole('button', { name: '결과 설명' }).click()),
  'filter-party': scene({}, p => p.getByTestId('party-filter-toggle').click()),
  'buffer-limit': scene({}, p => p.getByTestId('buffer-limit-toggle').click()),
  'status-failed': scene({}, async p => {
    for (const label of ['처리 실패', '송신 거절', '송신 실패', '시간 초과'])
      await p.getByRole('button', { name: label, exact: false }).first().click();
  }),
  detail: scene({}, p => p.getByTestId('monitor-row')     // 방향·종류·action 으로 고른다. 라벨은 프로젝트 문구로
    .filter({ hasText: 'B→A' }).filter({ hasText: '요청' }).filter({ hasText: 'CREATE_ITEM' }).first().click()),
};

const browser = await chromium.launch({ headless: true });
let failed = 0;
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : [...Object.keys(scenes), 'toolbar']) {
  try {
    if (name === 'toolbar') {
      const { context, page } = await open(browser);
      await page.getByTestId('monitor-header').screenshot({ path: path.join(OUT, 'toolbar.png') });
      await context.close();
    } else {
      const { context, page } = await scenes[name](browser);
      await shot(page, name);
      await context.close();
    }
    console.log('OK', name);
  } catch (e) { failed += 1; console.log('FAIL', name, String(e.message).split('\n')[0]); }
}
await browser.close();
process.exit(failed ? 1 : 0);
```

- 종료코드로 판정한다. `FAIL` 이 하나라도 있으면 1 이다. 출력은 파일로 받는다.
- 위 대기가 시간 초과로 끝나면 모의 피드의 첫 묶음이 타이머 뒤에 있는지 본다(SKILL.md 3단계 7).
- D1 이 송신 거절을 없앴으면 `status-failed` 의 라벨 목록에서 `송신 거절` 을 뺀다.
- `detail` 장면은 고를 행을 내용(방향·종류·action·결과)으로 찾는다. 행 순번으로 고르지 않는다. 피드가 바뀌면 순번이 바뀐다.
- `board` 장면은 경로가 다르고 건수 칸(`monitor-count`)이 없다. 기다리는 조건을 따로 둔다(예: 누적 요청 숫자가 0 이 아니다). 차트가 실제 폭을 잰 뒤 다시 그려지므로 `settle` 의 실제 시간 대기를 지킨다. 「집계 시작 시각」이 매번 다르면 시계 설치가 페이지 로드보다 늦은 것이다.

## 5. 가이드 문서 절 구성

단독 HTML 1장이다. 외부 의존이 없다. 위에 목차, 맨 위에 `overview-light` 를 둔다.
문체는 레포 문서 규약을 따른다. 따라 하는 문서라 짧은 문장으로 쓴다.

| 절 | 담는 것 |
| - | - |
| 01 화면 열기 | 경로 · 로그인·권한 · 켜진 환경 표 · 운영에서 열리지 않는 이유 · 보기 범위(로그인한 계정의 테넌트만) |
| 02 화면 구성 | 머리 띠·툴바 줄 순서(`toolbar`) · 지표 5 정의 · 건수 · 테마(`overview-dark`) |
| 03 결과 6종 | 아이콘·라벨·설명 표 · 한 행에 둘이 보이는 경우 · 송신 결과 값 표(개발자용, 접어 둠) · `facet-help` |
| 04 방향과 시각 | 방향 2종 설명 · 시각 라벨 · 시간 초과는 브라우저 시계, 소요는 서버 시각 · 소요 단계 |
| 05 보기 3종 | 행·카드·패널(`view-card`·`view-panel`) · 패널 활동 중 방식 |
| 06 필터와 검색 | 검색 대상 · 칩 건수의 뜻 · 문제 건만 보기(`status-failed`) · 참여자(`filter-party`) · 보관 상한(`buffer-limit`) · 일시정지 |
| 07 상세 보기 | 탭 3 · 요청·응답 비교 · 짝 없음 안내 · 송신 실패 사유 위치 · 복사(`detail`) |
| 08 개인정보 마스킹 | 가리는 키와 방식 표 · 가리지 않는 것 · 읽지 못한 JSON 의 사유 문구 |
| 09 연결 문제 | 상태별 라벨·문구·재연결 여부 표 · 끊긴 동안의 메시지는 다시 받지 못함 |
| 10 알아 둘 한계 | 이력 없음 · 화면을 연 뒤의 메시지만 · 새로고침하면 비움 · 지우기는 되돌릴 수 없음 · 서버 큐 넘침 유실 · 오프라인 버퍼가 버려져 끝내 오지 않는 결과(D1) · 중복 수신이 보임(T7) · 화면 밖 행은 Ctrl+F 로 못 찾음 · 인증 갱신 한계(D10) · 요청·응답이 아닌 메시지(D2) · 여러 인스턴스 기록 한계·버스 순서(D9) · 밀린 소비의 시각(T12, RULES.md §6) · 큰 정수(MASKING.md §1) · 보이지 않는 중단 트랜잭션(T7) · 짝 창보다 늦은 송신 확인(D11) · 「미확인」 항목 |
| 11 현황판(선택) | 현황판을 만들었을 때만. 모니터와 숫자가 다른 이유(집계 범위) · 지표 두 줄 · 추이 차트 · 결과 분포(비율 합이 100% 를 넘을 수 있음) · 방향별 현황(요청 방향 묶음, 짝 없는 응답 제외) · 참여자·action 카드와 정렬 · 숫자를 누르면 모니터가 그 조건으로 열림 · 놓친 요청 안내(`board`) |

- 캡처 아래에 한 줄 설명을 단다. 그림이 무엇을 보여 주는지 적는다.
- 개발자용 내용(송신 결과 값·계약)은 접힌 절로 둔다. 본문은 사용자 흐름만 둔다.

## 6. 게시 전 확인

- [ ] 사실 시트의 모든 행에 근거나 「미확인」이 있다
- [ ] 가이드의 문구가 상수 원문과 같다. 한 글자씩 대조했다
- [ ] 캡처 스크립트가 종료코드 0 으로 끝났다. §3 에서 정한 장면이 모두 있다
- [ ] 캡처에 실제 데이터·실제 호스트·실제 테넌트가 없다. 모두 합성값이다
- [ ] 같은 명령을 한 번 더 돌려 같은 그림이 나왔다(차이가 있으면 원인을 고친다)
- [ ] 문서를 브라우저로 열어 렌더를 직접 봤다. 못 봤으면 「렌더 미확인」으로 적는다
- [ ] 한글 문장을 한 번 다시 읽었다(깨진 음절·오타 없음). 문서 상단에 기준 브랜치·커밋이 있다
