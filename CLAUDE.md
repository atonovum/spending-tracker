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
| `src/lib/storage.js` | 정규화 + localStorage 영속화 |
| `src/lib/csv.js` | CSV 가져오기/내보내기 |
| `src/lib/cloudSync.js` | Worker KV 동기화 |
| `src/lib/i18n.jsx` | 번역 (ko/en) |
| `src/worker.js` | Cloudflare Worker (KV 바인딩 `STATE_KV`) |
| `src/App.jsx` | 화면 전체 (2500줄 이상) |

계산 로직은 `finance.js`에 이미 있는지 먼저 확인할 것. 중복 구현 금지.

## 상태 스키마

정확한 정의는 `src/lib/storage.js`의 `normalizeState`가 진실이다. 아래는 형태만.

```
state    { version: 3, selectedWalletId, language: "ko"|"en",
           currency: "KRW"|"USD", wallets[], categories[], labels[] }
wallet   { id, name, entries[] }
entry    { id, date: "YYYY-MM-DD", amount: number, categoryId,
           labelIds[], note, repeat, repeatEndDate }
category { id, name, type: "expense"|"income", color, icon }
label    { id, name }
```

- `repeat` 허용값은 `finance.js`의 `REPEAT_OPTIONS`.
- localStorage 키는 `spending-tracker-v3` (`ACTIVE_STORAGE_KEY`).
  `STORAGE_KEYS`에 v1·v2가 남아 있는 건 마이그레이션 경로다.
- **`normalizeState`가 유일한 정화 지점.** 외부에서 들어온 상태(가져오기,
  KV 동기화, 구버전)는 전부 여기를 통과한다. 검증을 다른 곳에 흩뿌리지 말 것.
- 지갑 상한 `MAX_WALLETS` = 5.

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
| push 후 | lint·test·build 클린룸 재실행 | `.github/workflows/ci.yml` |

`.githooks`는 `npm install`의 `prepare` 스크립트가 `core.hooksPath`로 등록한다.

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
- **원장의 거래 행은 저장된 entry가 아니라 occurrence다** (`occurrenceDate`,
  해석된 `category`/`labels`가 붙어 있다). occurrence를 그대로 저장 경로에
  펼쳐 넣지 말 것 — 반복 시리즈의 시드 `date`가 밀리고, 낡은 `category`
  스냅샷이 `signedAmount`의 부호를 뒤집는다. 저장은 `id` + 에디터 payload로만
  재구성한다. 반복 회차의 날짜는 에디터에서 잠겨 있고, 시리즈 시작일은
  설정 > 예약 거래(시드 entry)에서만 바꾼다.
