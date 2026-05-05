# 핵심 기능

## 데이터 모델

| 필드 | 설명 |
|---|---|
| `state.wallets` | 지갑 목록 (최대 5) |
| `state.categories` | 수입/지출 카테고리 (이름·아이콘·색상·type) |
| `state.labels` | 라벨 (이름·색상) |
| `state.selectedWalletId` | 현재 활성 지갑 |
| `state.language` | UI 언어 (`ko` / `en`) |
| `wallet.entries[]` | `{ id, date, amount, categoryId, labelId, note, repeat, repeatEndDate }` |

저장: `localStorage.spending-tracker-v3` (JSON 직렬화).

## Ledger

- 상단 카드 2개: **Total Cash Flow** (선택 기간까지의 누적 잔액), **Weekly/Monthly/Yearly Cash Flow** (선택 기간의 순흐름)
- 차트 모드: balance(꺾은선, 누적), flow(이중 막대 — 수입/지출)
- 막대/점 클릭 → 기간 선택. 좌·우 끝 클릭 시 페이지가 1칸 시프트하여 선택 항목이 좌측 두 번째 위치
- 예정된 반복 거래 영역: 접힘 상태에서 N개 표시, 클릭하면 일별 펼침
- 일별 거래 목록: 20개씩 페이지네이션, 스크롤 도달 시 + 20

## Stats

- 상단 카드: Stats용 누적 잔액 + 기간 흐름
- 기간 탭 (`BucketScroller`): 자연 너비 칩, 선택된 칩이 자동 중앙 정렬, 좌우 화살표는 prev/next 칩 선택
- Labels 표: 라벨별 수입/지출 합계. 클릭 시 카테고리 통계가 그 라벨로 필터링 (활성 라벨은 굵은 텍스트 + 밑줄)
- 총 수입 / 총 지출 토글 (모노톤)
- 카테고리 도넛 파이: 슬라이스 → 가는 연결선 → 아이콘 → 퍼센트 (아이콘 색 = 카테고리 색)
- 카테고리 표 행 클릭 → 해당 카테고리·기간의 거래 목록 모달
- 다른 탭으로 이동하면 라벨 필터 자동 해제

## Search

- 키워드 / 지갑 / 기간(전체·7·30·90·custom)
- Custom 기간은 시작/종료 둘 다 입력될 때만 결과 노출
- 결과는 사용자가 입력하기 시작할 때만 표시 (탭 이탈 시 초기화)
- 상단 필터 영역 sticky 고정, 결과는 페이지 스크롤 + 20개 페이지네이션

## Settings

### Preferences
- 언어: 한국어 / English (즉시 반영, 영구 저장)

### Wallets
- 별표 클릭 → 활성 지갑 변경
- 수정 모달: 이름 변경 + 지갑 삭제 (마지막 지갑 보호)
- 가져오기 모달: 파일 선택 후 `새 지갑` 또는 `기존 지갑에 병합` 선택
- 내보내기: 지갑 단위 JSON 다운로드

### Categories
- 카드 클릭 → 매니저 모달 (모바일 fullScreen, iPad/웹 80%)
- 수입/지출 탭, 카테고리 행에 사용량(N개 지갑의 M개 거래)
- 체크박스 다중 선택 → "선택 병합" 으로 다른 카테고리에 머지 (거래도 함께 이동, 원본 카테고리 삭제)
- 추가/수정은 모달 내부 인라인 폼 (이름·아이콘·색상)
- 삭제는 cascade — 해당 카테고리 거래도 함께 삭제

### Labels
- 매니저 모달 안에 인라인 추가 (이름 + 색상)
- 수정은 별도 모달
- 삭제는 cascade

### Scheduled Transactions
- 카드 클릭 → 모달
- 반복 거래 정의 한 줄당 한 행: 카테고리 / 라벨 / 반복 주기 배지 / 시작일 · 종료일(또는 무기한) · 다음 발생일
- 행 클릭 시 거래 편집 모달이 위에 뜨고 배경 목록 유지

## i18n

- `src/lib/i18n.jsx` — `I18nProvider`, `useT`, `useI18n`, `formatMoney(value, lang)`
- 사용자 입력값(카테고리·라벨 이름, 메모, 지갑 이름)은 번역하지 않음
- 통화: ko `1,234원`, en `$1,234`

## 반복 규칙 (`finance.js`)

- `none` / `daily` / `every_other_day` / `weekday` / `weekend` / `biweekly` / `fourweekly` / `monthly`
- `expandEntry(entry, start, end)` — 범위 내 모든 발생을 펼침
- `nextOccurrenceOnOrAfter(entry, target, hardEnd)` — 다음 1건만 계산 (Settings의 Scheduled 행)
- `groupOccurrences(occurrences, mode)` — 차트용 버킷 + 누적 잔액

## 컴포넌트 트리

```
AppRoot (state owner)
└── I18nProvider
    └── App
        ├── Tabs.Panel ledger (LedgerChart, PaginatedEntryList, pending dropdown)
        ├── Tabs.Panel stats  (BucketScroller, PieChart, label/category tables)
        ├── Tabs.Panel search (sticky filters + PaginatedEntryList)
        └── Tabs.Panel settings
            ├── PreferencesCard
            ├── WalletsCard (rows + edit modal + import modal)
            ├── CategoriesCard (manager + inline form + merge)
            ├── LabelsCard (manager + inline add)
            └── ScheduledCard (entry-per-row modal)
```
