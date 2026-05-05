# SpendingTracker

가계부 하이브리드 웹앱. React + Vite + Mantine + Tailwind, PWA, 로컬 스토리지 기반.
한국어/영어 UI 토글 지원.

## 기능 요약

- **Ledger** — 막대/꺾은선 그래프로 주간·월간·연간 현금 흐름, 일별 거래 목록 (20개씩 무한 스크롤), 일자별 합계 표시, 예정 반복 거래 펼침/접힘
- **Stats** — 라벨별 / 카테고리별 통계, 도넛 파이 차트(아이콘 + 퍼센트), 카테고리 클릭 시 일별 거래 모달, 기간 탭(좌우 화살표 + 자동 중앙 스크롤)
- **Search** — 키워드 / 지갑 / 기간 필터, 사용자가 입력해야만 결과 노출
- **Settings**
  - Preferences (언어 ko/en)
  - Wallets (최대 5개, 가져오기·내보내기, 새 지갑 또는 기존 지갑에 병합)
  - Categories (수입/지출 탭, 인라인 추가 폼, 다중 선택 → 병합)
  - Labels (인라인 추가, 수정·삭제)
  - Scheduled Transactions (반복 거래 정의 1행 단위 표시 + 다음 발생일)
- **PWA** — Service Worker 캐시, 오프라인 지원

## 빠른 시작

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/ 빌드
```

### Docker로 운영 빌드 띄우기

```bash
docker build -t spending-tracker .
docker run -d -p 8080:8080 --name spending-tracker spending-tracker
```

## 데이터

- 모든 데이터는 브라우저 `localStorage` 키 `spending-tracker-v3` 에 저장
- 지갑 단위로 JSON 내보내기/가져오기 가능 (Settings → Wallets → 내보내기/가져오기)
- 가져오기 시 새 지갑 또는 기존 지갑에 병합 선택

## 더 자세한 문서

- [docs/features.md](./docs/features.md) — 핵심 기능 상세
- [docs/plan.md](./docs/plan.md) — 초기 설계 메모
