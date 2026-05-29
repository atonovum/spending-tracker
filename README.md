# SpendingTracker

가계부 하이브리드 웹앱. **로컬 우선**(`localStorage`)이지만 **Cloudflare Workers + KV**로 원격 동기화도 동시에 지원합니다. PWA 오프라인 동작, 한국어/영어 UI 토글.

> 본 README는 [`docs/features.md`](./docs/features.md)와 함께 새 팀원의 1차 온보딩 문서입니다. 깊은 기능 설명은 `features.md`, 초기 설계 메모는 `docs/plan.md`(아카이브) 참조.

---

## 1. 개발 스펙

### 프레임워크 / 빌드
- **React 18.3** + **Vite 6** (`@vitejs/plugin-react`)
- **Mantine 7.13** (`@mantine/core`, `hooks`, `notifications`)
- **Tailwind CSS 3.4** + PostCSS / Autoprefixer
- **dayjs 1.11**, **@tabler/icons-react 3.17**
- 언어: ES Modules, `.jsx`/`.js` (TypeScript 미사용)
- `package.json`은 `"type": "module"` — ESM only

### PWA / 오프라인
- `vite-plugin-pwa` v1.0 — `registerType: "autoUpdate"`, manifest는 `vite.config.js`에 인라인
- `src/main.jsx`에서 `registerSW({ immediate: true })` 호출

### 배포 / 런타임
- **Cloudflare Workers** (`@cloudflare/vite-plugin` + `wrangler 4.87`)
  - `wrangler.jsonc`: SPA assets binding(`ASSETS`) + KV namespace `STATE_KV` (id `ce5e71147026485b9b8d5c2978184368`)
  - `src/worker.js`가 워커 엔트리 — `/api/state` GET/PUT/DELETE 라우팅, 그 외는 SPA 정적 파일로 폴백
- **Docker** (`Dockerfile`): `node:20-alpine` 위에서 `npm run dev` 실행 — **개발 모드 컨테이너**(5173 포트). `VITE_INCLUDE_SAMPLE=true`가 강제 설정되어 2y/3y/5y 샘플 지갑이 자동 시드됨. `nginx.conf`도 저장소에 있지만 현재 Dockerfile에서는 사용하지 않음

### 스크립트
| 명령 | 동작 |
|---|---|
| `npm run dev` | Vite 개발 서버 (`http://localhost:5173`) |
| `npm run build` | `vite build` → `dist/` |
| `npm run preview` | 빌드 후 `wrangler dev` — 로컬에서 Worker + KV로 미리보기 |
| `npm run deploy` | 빌드 후 `wrangler deploy` — Cloudflare로 배포 |

### 환경 변수
| 변수 | 효과 |
|---|---|
| `VITE_INCLUDE_SAMPLE=true` | 초기 시드에 2y/3y/5y 샘플 지갑 포함 (Dockerfile 기본값) |

### 디렉토리 구조
```
src/
├── App.jsx              # 메인 컴포넌트 (≈1700 줄, AppRoot/App/EntryEditor/차트 컴포넌트 통합)
├── main.jsx             # MantineProvider, SW 등록
├── worker.js            # Cloudflare Worker 엔트리 (/api/state KV 동기화)
├── index.css            # Tailwind + 글로벌 스타일
├── lib/
│   ├── finance.js       # 반복 거래 전개, 버킷 그룹핑, 통화 포맷 등
│   ├── storage.js       # localStorage I/O, state 정규화, 샘플 시드
│   ├── i18n.jsx         # ko/en 사전, formatMoney, I18nProvider/useT/useI18n
│   ├── cloudSync.js     # /api/state fetch/PUT 래퍼
│   └── categoryIcons.jsx# 카테고리 아이콘 매핑
└── settings/
    ├── Settings.jsx     # 카드 컴포지션 (Wallets→Categories→Labels→Scheduled→Preferences 순)
    ├── PreferencesCard, WalletsCard, CategoriesCard, LabelsCard, ScheduledCard
    └── shared.jsx       # 공통 ConfirmModal 등
samples/                 # default-seed + 2y/3y/5y 샘플 지갑
scripts/generate-sample-data.js
```

---

## 2. 핵심 기능

### 정보 구조
하단 고정 탭 4개: **Ledger / Stats / Search / Settings** (`src/App.jsx`의 `TAB_KEYS`).
Ledger·Stats 탭에는 공통 sticky 헤더 — 지갑 선택 + 기간(`week`/`month`/`year`) 선택.

### Ledger
- 상단 카드 2개: **Total Cash Flow**(선택 기간까지의 누적 잔액), **Weekly/Monthly/Yearly Cash Flow**(선택 기간 순흐름). 카드 클릭으로 차트 모드 전환(`balance` 꺾은선 ↔ `flow` 이중 막대)
- 막대/점 클릭 → 해당 버킷 선택, 양 끝 클릭 시 페이지가 한 칸 시프트(`maybeShiftLedgerPage`)
- 예정 반복 거래 영역(접힘/펼침) — 일자별 그룹 + 합계
- 일별 거래 목록: 20개 단위 IntersectionObserver 무한 스크롤 (`PaginatedEntryList`)
- 우측 하단 **FAB**(`IconPlus`)로 거래 추가 모달

### Stats
- 상단 카드: Stats 전용 누적 잔액 + 기간 흐름
- `BucketScroller` — 자연 너비 칩, 선택 칩 자동 중앙 정렬, 좌우 화살표로 prev/next
- 라벨별 수입/지출 표 — 금액 클릭으로 카테고리 통계 필터링 (활성 라벨: 굵게 + 밑줄)
- 총 수입 / 총 지출 토글
- 카테고리 도넛 파이 — 슬라이스 → 가는 연결선 → 아이콘 → 퍼센트
- 카테고리 행 클릭 → 해당 카테고리·기간의 거래 목록 모달
- 다른 탭으로 이동하면 라벨 필터 자동 해제

### Search
- 키워드 + 지갑 + 기간(`all` / `7d` / `30d` / `90d` / `custom`) 필터
- Custom 기간은 시작·종료 둘 다 입력해야 결과 노출
- `searchActive` 플래그 — 사용자가 입력해야만 결과 표시, 탭 이탈 시 초기화
- sticky 필터, 결과는 20개 단위 페이지네이션

### Settings
- **Preferences** — 언어 ko/en 즉시 전환 + 영구 저장
- **Wallets** — 최대 5개, 별표로 활성 지갑 변경(헤더 Select 드롭다운도 동일 역할), 수정 모달(이름·삭제), JSON 내보내기/가져오기 (새 지갑 또는 기존 지갑에 병합)
- **Categories** — 수입/지출 탭, 사용량(N지갑×M거래) 표시, 체크박스 다중 선택 → 병합(거래 함께 이동, 원본 삭제), 삭제는 cascade
- **Labels** — 인라인 추가, 수정/삭제(cascade)
- **Scheduled Transactions** — 반복 거래 한 줄당 한 행, 행 클릭 시 거래 편집 모달

### 반복 거래 (`src/lib/finance.js`)
- 옵션 8종: `none`, `daily`, `every_other_day`, `weekday`, `weekend`, `biweekly`, `fourweekly`, `monthly`
- `expandEntry(entry, start, end)` — 범위 내 모든 발생 전개 (가드 4000회로 무한 루프 방지)
- `nextOccurrenceOnOrAfter(entry, target, hardEnd)` — 다음 1건만 계산
- `groupOccurrences(occurrences, mode)` — 버킷 + 누적 잔액

### Cloud Sync (Cloudflare KV)
- `AppRoot` 마운트 시 `fetchRemoteState()` 호출 → 원격이 있으면 정규화해서 state 교체
- state 변경 시 1.5초 디바운스로 `pushRemoteState(state)` → Worker가 KV의 `state` 키로 JSON 통째 저장
- 로컬과 원격이 모두 살아 있으며, **원격이 단일 진실 공급원이 아니라 보조 동기화** (브라우저 간 동기화·세션 복구용)

### i18n
- `src/lib/i18n.jsx` — `I18nProvider`, `useT`, `useI18n`, `formatMoney(value, lang)`
- 통화: ko `1,234원`, en `$1,234`
- 사용자 입력값(카테고리·라벨 이름, 메모, 지갑 이름)은 번역 안 함

---

## 3. 데이터 모델

### 저장소
- 로컬: `localStorage["spending-tracker-v3"]` (v2/v1는 마이그레이션 fallback)
- 원격: Cloudflare KV (`STATE_KV` 바인딩, 키 `state` — 전체 state JSON 1개)

### State 스키마 (정규화 후, `storage.js` 참조)
```js
{
  version: 3,
  selectedWalletId: string,
  language: "ko" | "en",
  wallets: Wallet[],     // 최대 5
  categories: Category[],
  labels: Label[],
}
```

### Wallet
```js
{
  id: string,
  name: string,
  entries: Entry[],
}
```

### Entry
```js
{
  id: string,              // 16자 hex (uid())
  date: "YYYY-MM-DD",
  amount: number,          // 양수, 부호는 category.type으로 결정
  categoryId: string,
  labelIds: string[],      // 다중 라벨. 레거시 `labelId`(단수)는 정규화 시 흡수
  note: string,
  repeat: "none"|"daily"|"every_other_day"|"weekday"|"weekend"|"biweekly"|"fourweekly"|"monthly",
  repeatEndDate: "YYYY-MM-DD" | "",  // 빈 문자열이면 무기한
}
```

### Category
```js
{
  id: string,
  name: string,
  type: "income" | "expense",
  color: string,           // hex
  icon: string,            // categoryIcons 키 (house, food, cart, bus, salary, ...)
}
```

### Label
```js
{
  id: string,
  name: string,
  // 색상 필드는 모델에 없음. UI 번역키 settings.labels.field.color 는 잔재.
}
```

### Export/Import 페이로드
```js
{
  version: 3,
  exportedAt: ISO,
  wallet: Wallet,          // 단일 지갑
  categories: Category[],  // 그 시점 전역 카테고리
  labels: Label[],
}
```

---

## 4. 빠른 시작

```bash
npm install
npm run dev          # http://localhost:5173 (Vite 단독)

npm run build        # dist/ 빌드
npm run preview      # 빌드 후 wrangler dev — Worker + KV 미리보기
npm run deploy       # 빌드 후 wrangler deploy — Cloudflare 배포
```

### Docker (개발 모드 컨테이너)
샘플 데이터(2y/3y/5y 지갑)가 자동 시드되는 개발 모드 컨테이너입니다. **운영 빌드가 아닙니다.**

```bash
docker build -t spending-tracker .
docker run -d -p 5173:5173 --name spending-tracker spending-tracker
# http://localhost:5173
```

운영 배포는 Docker가 아닌 Cloudflare Workers(`npm run deploy`)를 사용합니다.

---

## 5. 알려진 문서 ↔ 코드 차이 (문서 정비 작업용)

본 README는 아래 정정을 반영했지만, 동일한 차이가 `docs/features.md` / `docs/plan.md`에는 아직 남아 있습니다. 후속 PR로 정리 예정.

| # | 위치 | 차이 |
|---|---|---|
| 1 | `docs/features.md` 데이터 모델 표 | `entry.labelId`(단수) → 실제는 `labelIds: string[]` |
| 2 | `docs/features.md` (Labels) | "이름 + 색상" → 모델에 색상 없음 |
| 3 | `docs/features.md` 컴포넌트 트리 | Preferences가 첫 카드처럼 표기됨 → 실제 렌더 순서는 Wallets → Categories → Labels → Scheduled → **Preferences** |
| 4 | `docs/plan.md` 반복 옵션 | 5종으로 표기 → 실제 8종 |
| 5 | `docs/plan.md` 기간 토글(7/30/365), 우측 고정 패널, prev/next 페이지 버튼 | 현 구현은 헤더 셀렉트(week/month/year), 중앙 모달, 양끝 클릭 시프트 |
| 6 | `src/lib/finance.js` `formatMoney` | 어디서도 import 되지 않는 데드 코드 (앱은 `useI18n().formatMoney` 사용) |

---

## 더 자세한 문서

- [docs/features.md](./docs/features.md) — 기능 상세
- [docs/plan.md](./docs/plan.md) — 초기 설계 메모 (아카이브)
