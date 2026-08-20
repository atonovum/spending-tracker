# spending-tracker

개인용 가계부. Cloudflare Workers + KV 위의 React PWA. 1인 프로젝트.

## 명령

| 목적 | 명령 |
|---|---|
| 개발 서버 | `npm run dev` |
| 테스트 | `npm test` (~5초) |
| 커버리지 | `npm run test:coverage` |
| 린트 | `npm run lint` / `npm run lint:fix` |
| 빌드 | `npm run build` (~2초) |
| 배포 | `npm run deploy` (wrangler) |

## 모듈 책임

| 파일 | 책임 |
|---|---|
| `src/lib/finance.js` | 금액·반복·날짜 계산, 상수, `uid()` |
| `src/lib/schedules.js` | 예약 거래 템플릿 정규화·실체화(materialisation)·v3 마이그레이션 |
| `src/lib/storage.js` | 정규화 + localStorage 영속화 |
| `src/lib/csv.js` | CSV 가져오기/내보내기 |
| `src/lib/cloudSync.js` | Worker KV HTTP 호출 (fetch/push, 계약만) |
| `src/lib/syncEngine.js` | 동기화 판단 (누가 이기는가, 언제 재시도하는가) — 순수 함수 |
| `src/lib/useCloudSync.js` | 동기화 루프 배선 (디바운스·flush·재시도·플래그) |
| `src/lib/authWall.js` | Access 로그인 페이지 판별 (200 HTML 함정) |
| `src/lib/appVersion.js` | 빌드 식별자 + 배포본 버전 조회 |
| `src/lib/swUpdate.js` | 서비스 워커 갱신 확인·적용 |
| `src/lib/i18n.jsx` | 번역 (ko/en) |
| `src/worker.js` | Cloudflare Worker (KV 바인딩 `STATE_KV`) |
| `src/App.jsx` | 화면 전체 (2500줄 이상) |

계산 로직은 `finance.js`에 이미 있는지 먼저 확인할 것. 중복 구현 금지.

## 상태 스키마

정확한 정의는 `src/lib/storage.js`의 `normalizeState`가 진실이다. 아래는 형태만.

```
state    { version: 5, selectedWalletId, language: "ko"|"en",
           wallets[], categories[], labels[] }
wallet   { id, name, currency: "KRW"|"USD", entries[], scheduled[] }
entry    { id, date: "YYYY-MM-DD", amount: number, categoryId,
           labelIds[], note }
schedule { id, startDate: "YYYY-MM-DD", amount: number, categoryId,
           labelIds[], note, repeat, repeatEndDate, lastRunDate }
category { id, name, type: "expense"|"income", color, icon }
label    { id, name }
```

- **entry는 반복하지 않는다.** 반복은 `wallet.scheduled`의 템플릿이 갖는다.
  `repeat` 허용값은 `finance.js`의 `REPEAT_OPTIONS`.
- **예약 거래는 때가 되면 진짜 entry를 만든다**(materialisation). 만들어진
  거래와 예약은 그때부터 서로 독립이다 — 예약을 고쳐도 과거 거래는 안 바뀌고,
  예약을 지워도 과거 거래는 남는다. 미래(아직 안 일어난 회차)만 파생으로
  보여준다: `buildPendingScheduledOccurrences`.
- `lastRunDate`가 실체화 커서다. 마지막으로 만들어낸 회차 날짜이고, 그 이후
  날짜만 생성한다. 커서가 사라져도 entry id(`{scheduleId}-{date}`)가 두 번째
  방어선이라 중복 생성이 안 된다. 실체화는 **멱등**이어야 한다.
- **실체화는 `normalizeState`에 넣지 않는다.** 정규화는 가져오기·KV 읽기·로드
  때마다 도는 순수 정화기라 레코드를 만들어내면 안 된다. 실체화는 앱이 문서를
  소유하는 지점(최초 로드, 원격 상태 채택)에서 `materializeState`로 한 번 돈다.
- **통화는 지갑마다, 언어는 문서 전체.** 지갑 하나는 KRW, 다른 하나는 USD로
  둘 수 있다. 표시용 통화는 선택된 지갑을 따라가고, `I18nProvider`가 그 값을
  받는다. 설정 UI도 통화는 지갑 카드, 언어는 Preferences 카드에 있다.
- CSV 내보내기는 `Wallet`·`Currency` 열을 덧붙인다. 파일 전체에 하나뿐인
  값이지만 행마다 반복해 평범한 직사각형 CSV를 유지한다. 가져올 때 이 두 열은
  **선택**이라 v5 이전 6열 파일도 그대로 읽힌다.
- localStorage 키는 `spending-tracker-v5` (`ACTIVE_STORAGE_KEY`).
  `STORAGE_KEYS`에 v1~v4가 남아 있는 건 마이그레이션 경로다.
- **`normalizeState`가 유일한 정화 지점.** 외부에서 들어온 상태(가져오기,
  KV 동기화, 구버전)는 전부 여기를 통과한다. 검증을 다른 곳에 흩뿌리지 말 것.
  v3→v4(반복 entry → schedule + 과거 entry들), v4→v5(문서 통화 → 지갑별 통화)
  마이그레이션도 여기서 한다. 스키마 버전을 올릴 때 마이그레이션 게이트를
  `SCHEMA_VERSION`으로 판정하지 말 것 — 그러면 버전을 올릴 때마다 과거
  마이그레이션이 다시 돈다. 일정 이관 게이트는 `SCHEDULE_MIGRATION_VERSION`
  처럼 고정 상수로 둔다.
- 지갑 상한 `MAX_WALLETS` = 5.
- **빌드 식별자는 커밋 해시다.** `vite.config.js`의 `define`이
  `__APP_VERSION__`을 박고(`WORKERS_CI_COMMIT_SHA` → `git rev-parse` →
  `"dev"` 순), 같은 값을 `/version.json`으로도 내보낸다. `vitest.config.js`가
  같은 `define`을 다시 선언한다 — vite 설정을 안 읽으므로 빠뜨리면 그 상수를
  읽는 모듈이 전부 파싱에서 죽는다.
- **배포 버전은 KV가 아니라 정적 자산에서 읽는다.** KV는 "마지막으로 쓴
  기기의 버전"을 기록할 뿐이라 배포본 버전과 무관하다. `/version.json`은
  VitePWA 기본 `globPatterns`(js,css,html,ico,png,svg) 밖이라 precache되지
  않고 네트워크로 나간다 — 그래서 답이 신선하다.
- JSON 내보내기의 `appVersion`은 **추적용이다. 마이그레이션 게이트로 쓰지
  말 것.** 배포마다 바뀌므로 게이팅하면 과거 마이그레이션이 매번 다시 돈다.
  판정은 `version`(= `SCHEMA_VERSION`)만 본다.

## 코드베이스에서 안 드러나는 것

- **테스트가 두 러너로 갈린다.** `src/worker.test.js`만
  `@cloudflare/vitest-pool-workers`(miniflare)에서 돌고 나머지는 jsdom.
  새 worker 테스트를 다른 파일명으로 만들면 jsdom에서 돌다 실패한다 —
  worker 테스트는 `src/worker.test.js`에 추가할 것.
- **색상은 `src/index.css`의 `--st-*` 토큰이 단일 소스.**
  `tailwind.config.js`가 이를 매핑한다. JSX에 hex 직접 쓰지 말 것 (현재 0건).
- **커버리지 임계값은 래칫**이다. 현재 수준을 잠근 값이지 목표치가 아니다.
  미달하면 임계값을 낮추는 게 아니라 테스트를 쓴다.
  `src/App.jsx`, `src/lib/categoryIcons.jsx`, `src/lib/cloudSync.js`는 제외 상태.
- **샘플 지갑은 개발 모드에서만, 로드 시점에 날짜를 옮겨서 심는다.**
  게이트는 `storage.js`의 `SAMPLE_SEED_ENABLED`(`import.meta.env.DEV`, 빌드 상수 —
  환경 변수로 못 켠다). `sampleData.js`가 지갑별 오프셋 하나로 전체를 밀어
  최신 거래를 오늘로 맞춘다. `samples/*.json`은 절대 다시 쓰지 말 것 —
  트래킹되는 파일이라 워킹 트리가 6500줄짜리 디프로 더러워진다.
- 커밋 메시지는 한국어, `feat:` / `fix:` / `chore:` 접두어.

## 검증 계층

세 층이 자동으로 돈다. 따로 실행할 필요 없다.

| 시점 | 무엇 | 어디 |
|---|---|---|
| 파일 편집 직후 | 그 파일만 lint | `.claude/hooks/post-edit-lint.mjs` |
| 턴 종료 시 | `src/` 변경이 있었으면 테스트 전체 | `.claude/hooks/stop-verify.mjs` |
| 커밋 직전 | build + staged 파일 lint | `.githooks/pre-commit` |
| PR 생성 시 | lint·test·build 클린룸 재실행 | `.github/workflows/ci.yml` |

`.githooks`는 `npm install`의 `prepare` 스크립트가 `core.hooksPath`로 등록한다.

**CI는 `pull_request`에서만 돈다.** main에 직접 커밋하는 경로에는 자동 검증이
없다는 뜻이므로, **main을 원격에 푸시하기 전에 반드시 아래 셋을 직접 실행하고
전부 통과한 것을 확인한다.**

```
npm run lint && npm run test:coverage && npm run build
```

하나라도 실패하면 푸시하지 않는다. 커밋별 pre-commit은 build와 staged lint만
보므로, 여러 커밋이 쌓인 뒤의 테스트 전체 결과는 이 시점에만 확인된다.

`npm test`가 아니라 `test:coverage`인 이유는 CI가 강제하는 것이 후자이기
때문이다. 커버리지 임계값 미달은 `npm test`로는 드러나지 않으므로, 로컬
점검을 `npm test`로 두면 CI가 잡는 것을 로컬이 놓치는 구간이 생긴다.

로컬에서 재현할 수 없는 것이 하나 남는다: CI의 `npm ci`는 lockfile만 보고
빈 상태에서 설치하지만, 로컬은 이미 설치된 `node_modules`에서 돈다. 그래서
`package.json`에 없는데 로컬에만 깔린 패키지를 import해도 로컬은 통과한다.
의존성을 추가·제거했다면 `docker build`(내부에서 `npm ci`를 돈다)로 한 번
확인하는 것이 가장 가깝다.

**검증을 통과시키려고 규칙 자체를 완화하지 말 것.** ESLint 규칙 하향,
커버리지 임계값 인하, CI 스텝 제거, `--no-verify` 커밋은 전부 이 파일에
이유를 남기고 승인받은 뒤에만.

자동화가 못 하는 것은 하나뿐이다 — **UI를 바꿨으면 실제로 앱을 띄워
확인할 것.** 테스트 통과는 화면이 의도대로 보인다는 증거가 아니다.

## 회귀 규칙

<!-- 버그를 고칠 때마다: 재발 방지 테스트를 추가하고,
     테스트로 표현 못 하는 제약이면 여기 한 줄. -->

- UI에 기존과 같은 문구의 버튼을 추가하면 기존 테스트의 전역 `getByText` /
  `getByRole` 쿼리가 모호해져 깨질 수 있다. 쿼리는 dialog 등 컨테이너
  범위로 한정할 것.
- **원장의 거래 행은 저장된 entry다.** occurrence 뷰(`occurrenceDate`, 해석된
  `category`/`labels`)를 그대로 저장 경로에 펼쳐 넣지 말 것 — 낡은 `category`
  스냅샷이 `signedAmount`의 부호를 뒤집는다. 저장은 `id` + 에디터 payload로만
  재구성한다. (v4 이전엔 행이 템플릿에서 계산된 값이라 날짜를 잠가야 했다.
  지금은 저장된 레코드라 잠글 이유가 없다 — 회차 하나만 자유롭게 고친다.)
- **아직 안 일어난 거래는 entry가 아니라 schedule이다.** 저장 시 규칙은 하나다:
  반복이 있거나 날짜가 미래면 `scheduled[]`, 아니면 `entries[]`. 원장 버킷은
  오늘에서 끊기므로 미래 날짜 entry는 화면에서 사라진다. `upsertEntry`가 양방향
  으로 이 규칙을 지킨다(미래로 고치면 schedule이 되고, 과거로 당기면 즉시 실체화).
- **`state.updatedAt`만으로 로컬과 원격의 승자를 정하지 말 것.** `updatedAt`은
  서버가 푸시를 확인해줬을 때만 전진한다. 그래서 푸시가 실패한 기기는 내용은
  앞서 있으면서 리비전은 서버의 옛 값을 그대로 들고 있고, 리비전만 비교하면
  낡은 서버가 이겨서 편집분이 조용히 사라진다. 실제로 이렇게 잃었다.
  판정은 `decideInitialSync`가 하고, `PENDING_SYNC_KEY`(기기 로컬 플래그,
  문서 밖)가 리비전 비교보다 우선한다. 이 플래그는 CSV·KV 페이로드에 절대
  넣지 말 것 — `LAST_ENTRY_DATE_KEY`와 같은 규칙이다.
- **원격 읽기는 마운트 때 한 번이 아니라 포그라운드로 돌아올 때마다 한다.**
  iOS 홈 화면 웹앱은 다시 열어도 *재로드가 아니라 재개*다 — 얼려둔 페이지가
  React 트리째 깨어나므로 마운트 효과가 다시 돌지 않는다. 마운트에서만 읽으면
  며칠 전 문서를 계속 보여준다. `visibilitychange(visible)`, `pageshow`
  (bfcache 복원), `online`에서 다시 읽고, `PULL_MIN_INTERVAL_MS`가 탭 전환
  때마다 요청이 나가는 것을 막는다. 판정은 시작할 때와 같은
  `decideInitialSync`이므로 미전송 편집이 있으면 재개해도 로컬이 이긴다.
- **서비스 워커 갱신도 복귀 때 직접 물어봐야 한다.** 브라우저는 `sw.js`를
  다시 받아 바이트로 비교해 새 버전을 판정하는데, 그 재요청은 등록·내비게이션·
  `registration.update()` 때만 일어난다. 재개는 그 셋 중 아무것도 아니라
  배포가 영영 안 보인다. `main.jsx`가 `visibilitychange`/`pageshow`에서
  `checkForServiceWorkerUpdate()`를 부른다 — 원격 읽기와 같은 이유, 같은 자리.
- **푸시 실패는 최종이 아니라 일시적인 것으로 다룬다.** 백오프 재시도 +
  `online` 재시도가 있고, `pagehide`/`visibilitychange(hidden)`에서
  `keepalive: true`로 마지막 flush를 한다. iOS는 백그라운드로 넘어간
  standalone 웹앱을 즉시 동결하므로 아직 안 터진 디바운스 타이머는 영영 안
  터진다. 이 flush 경로를 제거하지 말 것.
- **인증 벽은 200으로 온다.** Cloudflare Access는 인증 없는 요청에 로그인
  페이지로 302를 주고, `fetch`가 이를 따라가므로 최종 응답이 200 text/html이
  된다. `response.ok`가 true라 상태 코드 검사를 전부 통과한다. 실제로 쓰기
  경로가 이걸 성공으로 보고해서, 저장되지 않은 편집을 동기화됨으로 표시하고
  지웠다. `cloudSync.js`의 `isAuthWall`이 리다이렉트와 content-type 둘 다
  보고 걸러낸다. **상태 코드만으로 성공을 판정하지 말 것.**
- `fetchRemoteState`의 `ok`는 "서버가 응답했는가"다. **빈 서버와 못 닿는
  서버는 다르게 다뤄야 한다** — 빈 서버는 로컬로 채우고, 못 닿는 서버는
  건드리지 않는다. 후자에 푸시하면 `If-Match` 없이 나가서 읽어본 적 없는
  리비전을 덮어쓴다.
- 예약 거래를 지우는 UI는 확인 하나뿐이다. "반복만 중단"은 템플릿을 살려둬야
  과거 행이 계속 계산되던 옛 모델의 잔재이므로 되살리지 말 것.
