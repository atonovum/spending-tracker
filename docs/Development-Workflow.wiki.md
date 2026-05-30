# Development Workflow

신규 팀원을 위한 spending-tracker 개발 워크플로우 가이드입니다.
이슈 추적부터 배포까지 전체 흐름을 다룹니다.

> 본 페이지는 **GitHub Wiki `Development-Workflow` 페이지의 원본**이다.
> 위키 페이지 갱신 시 본 파일을 함께 업데이트하여 정합성을 유지한다.
> 강제 메커니즘(autopilot, branch protection, CODEOWNERS, cascade close)은
> [`docs/team-workflow.md`](./team-workflow.md) 참조.

---

## 1. 개요

- **레포지토리**: [atonovum/spending-tracker](https://github.com/atonovum/spending-tracker)
- **스택**: React 18 + Vite 6 (FE) / Cloudflare Workers + KV (BE)
- **이슈 트래커**: Multica (마스터) ↔ GitHub Issues (1:1 미러)
- **기본 브랜치**: `main` (보호 브랜치)
- **CI**: GitHub Actions
  - `.github/workflows/ci.yml` — PR 검증 + 커버리지 코멘트
  - `.github/workflows/deploy.yml` — main 푸시 시 Cloudflare 배포
- **테스트 프레임워크**: vitest 4.1 + @vitest/coverage-v8
- **배포 타깃**: Cloudflare Workers (`wrangler deploy`)

> 모든 작업은 **Multica 이슈에서 시작**해 **GitHub PR 로 끝난다**. 이슈 없이 PR 을 열지 않는다.

---

## 2. Multica ↔ GitHub 이슈 동기화 규칙

- Multica 이슈는 `discussion` 라벨이 붙은 것을 제외하고 **모두 GitHub 이슈와 1:1 로 동기화**된다.
- 동기화 항목: 제목, 본문, 상태(open/closed), 담당자 매핑, 라벨.
- 이슈 키 표기 두 가지 모두 허용:
  - Multica 키: `EUN-15`, `MUL-123`
  - GitHub 이슈 번호: `#42`
- **Multica 이슈가 `done` 으로 닫힐 때**: 연결된 PR 이 머지되어야 하고, 동시에 GitHub
  이슈도 닫혀야 한다. (`Closes #42` 자동 클로즈 키워드 사용)
- `discussion` 라벨 이슈는 GitHub 에 동기화되지 않으며, 코드 변경 없이 Multica 내부
  논의용으로만 사용한다.

### 작업 시작 시 체크

- [ ] 이슈 상태를 `in_progress` 로 변경했는가
- [ ] GitHub 측에 대응 이슈 번호가 있는지 확인했는가 (없으면 autopilot 이 곧 생성)
- [ ] 작업 브랜치를 만들기 전에 이슈 번호를 메모해 두었는가

---

## 3. 브랜치 명명 규칙

이슈 번호는 **Multica 키** 또는 **GitHub 이슈 번호** 둘 다 허용. 단, `#` 는 GitHub 이슈
번호에만 붙이고 Multica 키 앞에는 절대 붙이지 않는다.

검증 정규식:

```
^(feat|fix)/((#[0-9]+)|((EUN|MUL)-[0-9]+))$
```

| 작업 유형 | 패턴 | 예시 |
|-----------|------|------|
| 기능 추가 | `feat/#{issue-number}` | `feat/#42`, `feat/EUN-15`, `feat/MUL-123` |
| 버그 수정 | `fix/#{issue-number}` | `fix/#57`, `fix/EUN-22` |

### 브랜치 생성 예시

```bash
git checkout main
git pull origin main

# 기능 (GitHub 이슈 번호 기반)
git checkout -b feat/#42

# 버그 수정 (Multica 키 기반)
git checkout -b fix/EUN-22
```

### 커밋 메시지

Conventional Commits 형식.

```bash
git commit -m "feat: add monthly summary card (#42)"
git commit -m "fix: prevent duplicate scheduled entries (EUN-22)"
```

---

## 4. PR & 테스트/커버리지 규칙

### PR 생성 전 로컬 검증

```bash
npm test                 # vitest run
npm run test:coverage    # 커버리지 리포트 생성
npm run build            # 빌드 검증
```

### PR 필수 조건

- [ ] PR 제목에 이슈 번호 포함 (예: `feat: add summary card (#42)`)
- [ ] 본문에 **GitHub 이슈 번호 기반** auto-close 키워드 명시: `Closes #42`
  - 주의: `Fixes EUN-22` 같은 Multica 키는 GitHub auto-close 가 동작하지 **않는다**.
    Multica 이슈 close 는 머지 후 별도로 처리한다.
- [ ] 본문에 Multica 이슈 링크도 함께 명시: `Multica: <mention://issue/<id>>`
- [ ] **vitest 전 항목 통과** — `ci.yml` 이 PR 마다 자동 실행
- [ ] **커버리지 요약이 PR 코멘트로 게시됨** — CI 가 자동 게시
- [ ] 최소 1명의 리뷰어 approve (FE/BE PR 은 TL approve 필수)
- [ ] 머지 충돌 해소, `main` 과 최신 상태 동기화

### PR description 템플릿

```
## 요약
<무엇을 / 왜>

## 변경 사항
- ...

## 테스트
- ...

Closes #<github-issue-number>
Multica: <mention://issue/<multica-issue-id>>
```

### `ci.yml` 이 수행하는 것

- `npm ci` → `npm run test:coverage` (json-summary + json + text reporter)
- 커버리지 결과를 PR 에 코멘트로 게시 (라인 / 분기 / 함수 / 구문)
- 테스트 실패 또는 필수 체크 미통과 시 머지 차단

> 테스트를 우회하거나 hook 을 스킵하지 않는다 (`--no-verify` 금지).

---

## 5. 머지 & 배포 흐름

```
feat/#42 ──► PR open ──► CI green + review ──► squash merge ──► main ──► Cloudflare deploy
```

### 머지 규칙

- **Squash merge** 권장.
- 머지 시점에 연결된 GitHub 이슈가 자동 close 되어야 한다 (`Closes #N`).
- 머지 직후 머지 SHA 를 Multica 이슈에 코멘트로 게시한 뒤 `multica issue status <id> done`.

### 배포 (`main` → Cloudflare)

- 배포는 **오직 `main` 브랜치에 push (머지) 된 경우에만** 실행된다.
- `.github/workflows/deploy.yml` 이 다음을 수행:
  1. `npm ci`
  2. `npm run build` (vite build)
  3. `cloudflare/wrangler-action@v3` 로 `wrangler deploy` 실행 — `STATE_KV` 바인딩 포함
- PR 브랜치 및 fork 에서는 배포가 트리거되지 않는다.
- 필요 시크릿 (Repo Settings → Secrets and variables → Actions):
  - `CLOUDFLARE_API_TOKEN` — Workers Scripts:Edit + Account Settings:Read 권한
  - `CLOUDFLARE_ACCOUNT_ID`

### 롤백

```bash
git checkout main && git pull
git revert <merge-sha>
git push origin HEAD:revert/<merge-sha>
gh pr create --title "revert: <reason>" --body "Reverts #<pr-number>"
```

---

## 6. Epic 이슈 라벨 정책

- 여러 하위 이슈를 묶는 **상위(부모) 이슈**에는 `Epic` 라벨을 부여한다.
- Epic 이슈는 **모든 서브 이슈가 `done` 으로 닫힌 후에만** 닫을 수 있다.
- 서브 이슈가 하나라도 열려 있는 동안 Epic 을 `done` 으로 옮기지 않는다.
- Epic 이슈 본문에는 다음을 포함:
  - 목표 (Why)
  - 서브 이슈 체크리스트 (`- [ ] #42 summary card`)
  - 완료 기준 (Definition of Done)

### Epic 닫기 체크리스트

- [ ] 모든 서브 이슈가 closed
- [ ] 각 서브 PR 이 main 에 머지됨
- [ ] 배포(Cloudflare) 후 동작 검증 완료
- [ ] 관련 문서(README, `docs/features.md`) 갱신

---

## 7. 새 팀원 체크리스트

### 환경 세팅

- [ ] Node.js LTS 설치 (`node -v`)
- [ ] 레포지토리 클론
  ```bash
  git clone https://github.com/atonovum/spending-tracker.git
  cd spending-tracker
  npm ci
  ```
- [ ] 로컬 개발 서버 실행 확인
  ```bash
  npm run dev          # Vite dev server
  npm run preview      # build + wrangler dev (Worker 포함)
  ```
- [ ] 테스트 실행 확인
  ```bash
  npm test
  npm run test:coverage
  ```

### 계정 & 권한

- [ ] GitHub `atonovum/spending-tracker` write 권한 받기
- [ ] Multica 워크스페이스 초대 수락
- [ ] (배포 담당자만) Cloudflare 계정 접근 권한
- [ ] `gh` CLI 인증 (`gh auth login`)

### 첫 작업 따라가기

- [ ] Multica 에서 `good first issue` 라벨 이슈 선택
- [ ] 이슈 상태를 `in_progress` 로 변경
- [ ] `feat/#{n}` 또는 `fix/#{n}` 브랜치 생성
- [ ] 코드 작성 → 테스트 추가 → `npm run test:coverage` 통과
- [ ] PR 생성, 본문에 `Closes #N` 포함
- [ ] CI green 확인, 커버리지 코멘트 확인
- [ ] 리뷰어 지정 (TL 포함)
- [ ] approve 후 squash merge
- [ ] Multica 이슈 `done` 처리, GitHub 이슈 자동 close 확인

### 참고 문서

- `README.md` — 프로젝트 개요
- `docs/features.md` — 기능 명세
- `docs/team-workflow.md` — **본 규칙의 강제 메커니즘**
- `docs/plan.md` — 로드맵 (아카이브)
- `CLAUDE.md` — Multica 에이전트 런타임 가이드
- `wrangler.jsonc` — Cloudflare Workers 설정
- 워크플로우 파일
  - `.github/workflows/ci.yml`
  - `.github/workflows/deploy.yml`

---

질문이 있으면 Multica 에서 Tech Lead 에게 디스커션 이슈(`discussion` 라벨)로 남긴다.
