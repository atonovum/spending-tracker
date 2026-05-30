# 팀 워크플로 — Multica ↔ GitHub 동기화 및 머지 규약

> 본 문서는 GitHub 위키의 **Development-Workflow** 페이지와 짝을 이룬다.
> 위키 = *무엇을 따라야 하는가(규칙)*, 본 문서 = *어떻게 강제되는가(메커니즘)*.
> Tech Lead가 정의한 7개 규칙(EUN-15)의 enforcement layer만 정리한다.
>
> - 대상 독자: TL / FE / BE 에이전트, 신규 합류 인간 멤버.
> - 갱신 주체: TL (문서 정합성 책임).
> - 규칙 자체가 바뀌면 위키와 본 문서를 **함께** 갱신한다.

---

## 1. Multica → GitHub 이슈 동기화

### 1.1 동기화 메커니즘 — Multica Autopilot

Multica 이슈와 GitHub 이슈의 1:1 미러링은 **Multica Autopilot**으로 처리한다.
CI(GitHub Actions)와는 완전히 분리된 경로이다 — CI는 PR/push 이벤트 기반,
autopilot은 Multica 이슈 라이프사이클 이벤트 기반.

#### 권장 Autopilot 설정 — "Mirror to GitHub"

| 필드 | 값 |
|---|---|
| Title | `Mirror Multica issue → GitHub` |
| Agent | Tech Lead (또는 dedicated sync agent) |
| Mode | `create_issue` 트리거 + 후속 update 핸들링 |
| Trigger | `on issue create`, `on issue update` (status / title / description / labels 변경) |
| Skip 조건 | `label == "discussion"` 인 이슈는 GitHub로 미러링하지 않음 |
| Create action | `gh issue create --repo atonovum/spending-tracker --title "<Multica title>" --body "<desc + Multica 이슈 링크>"` → 반환된 GitHub 이슈 번호를 Multica 이슈 metadata 키 `github_issue_url` / `github_issue_number`에 핀 |
| Update action | `github_issue_number` 메타데이터 존재 시 `gh issue edit <num>` 로 title/body 동기화. status=done 은 PR 머지 후 close (§2 참조) |

생성 명령 예시:

```bash
multica autopilot create \
  --title "Mirror Multica issue -> GitHub" \
  --agent "Tech Lead" \
  --mode create_issue \
  --description "Create/update mirror GitHub issue for every Multica issue except 'discussion'."
```

#### 식별자 매핑

브랜치 컨벤션의 `issue-number` 자리는 두 형태 중 하나여야 한다 (regex로 검증 가능):

```
^(feat|fix)/((#[0-9]+)|((EUN|MUL)-[0-9]+))$
```

| 형태 | 의미 | 예시 |
|---|---|---|
| `#<n>` | GitHub 이슈 번호 | `feat/#42`, `fix/#57` |
| `<KEY>-<n>` | Multica 키 (앞에 `#` 없음) | `feat/EUN-15`, `fix/EUN-22` |

`#` 는 GitHub 이슈 번호 한정 prefix이다 — Multica 키 앞에는 절대 붙이지 않는다.
권장: 새 작업은 GitHub 이슈 번호 우선(`feat/#42`). 위키/디자인 토론 단계 등 GitHub
이슈가 아직 만들어지지 않은 단계에서는 Multica 키도 허용.

### 1.2 역방향 (GitHub → Multica) — TODO

GitHub에서 직접 생성된 이슈/PR 이벤트를 Multica로 역동기화하는 경로는 **현재 미구현**.
구현 시 필요한 것:

- `.github/workflows/sync-to-multica.yml` — `issues` / `pull_request` 이벤트 트리거.
- 워크플로 내부에서 `multica` CLI 호출 (시크릿 `MULTICA_TOKEN` 필요).
- 루프 차단: autopilot이 만든 미러 이슈가 다시 GitHub→Multica 로 돌아오지 않도록
  마커 라벨 또는 body fingerprint 사용.

→ **Follow-up**: TL이 별도 Multica 이슈로 등록 후 본 섹션에 링크.

---

## 2. Multica 이슈 완료 → PR 머지 규약

규칙 3 ("Multica done = PR merged + GitHub issue closed 동시") 의 강제는
**워크플로 컨벤션**으로 한다. 자동화는 없다 — 인간/에이전트의 순서 준수가 핵심이다.

### 2.1 순서 (불변)

1. 작업 브랜치 (`feat/#42` 등)에서 PR open.
2. CI 통과 + 리뷰어 1명 approve + TL approve.
3. **PR을 main에 머지.** (squash merge 권장)
4. 에이전트(또는 인간)가 머지 커밋 SHA를 Multica 이슈에 코멘트로 **먼저** 게시:
   `Merged: https://github.com/atonovum/spending-tracker/commit/<sha>`
5. **그 후에** `multica issue status <id> done` 실행.
6. GitHub 이슈는 PR 머지 시 `Closes #<num>` 트레일러로 자동 닫힘 (PR description에 항상 포함).
7. 머지 SHA를 Multica issue metadata `merge_sha` 에 핀 (선택).

### 2.2 왜 머지가 먼저인가

- "done이지만 PR이 미머지" 상태가 절대 존재하면 안 된다 (배포 누락).
- 머지 SHA를 Multica 코멘트로 남기면 추적 가능.
- 머지 실패 / 충돌 시 done 처리하지 않고 다시 `in_progress` 로 복귀.

### 2.3 PR description 템플릿 (필수 트레일러)

```
Closes #<github-issue-number>
Multica: <mention://issue/<multica-issue-id>>
```

**중요**: GitHub의 auto-close 키워드(`Closes` / `Fixes` / `Resolves`)는 **GitHub 이슈 번호**
형태(`#42`)만 인식한다. `Fixes EUN-22` 같은 Multica 키 표기는 GitHub에 평문으로
인식되어 자동 close 가 동작하지 않는다. Multica 이슈 close 는 §2.1 5번 단계에서
별도로 처리한다.

---

## 3. Branch Protection — main 브랜치

규칙 4 (배포는 main push에서만) 및 규칙 5 (PR 별 vitest + coverage) 의 신뢰성은
main 보호 규칙에 의존한다.

### 3.1 GitHub Settings → Branches → `main` 권장 구성

- [x] **Require a pull request before merging**
  - [x] Require approvals: **1**
  - [x] Dismiss stale approvals when new commits pushed
  - [x] Require review from Code Owners (CODEOWNERS 매핑 참조)
- [x] **Require status checks to pass before merging**
  - 필수 체크: `test` (`.github/workflows/ci.yml` 의 job 이름과 정확히 일치)
  - [x] Require branches to be up to date before merging
- [x] **Require conversation resolution before merging**
- [x] **Do not allow bypassing the above settings** (admin 포함)
- [x] **Restrict who can push to matching branches** — 직접 푸시 금지, PR 머지만 허용
- [ ] Allow force pushes — **OFF**
- [ ] Allow deletions — **OFF**

> Required status check 이름은 ci.yml 의 `jobs.<id>.name` 값과 **정확히 일치**해야 한다.
> 현재 ci.yml 의 job 이름은 `test` 하나뿐이다. 별도 coverage 체크가 필요하면 ci.yml 에
> 새 job 을 추가한 뒤 protection 설정에도 추가한다.

### 3.2 CODEOWNERS

`.github/CODEOWNERS` 에 영역별 소유자를 명시한다. 단, CODEOWNERS의 핸들은 **실제로
존재하는 GitHub username 또는 org team slug**여야 한다. 실재하지 않는 핸들은 GitHub가
조용히 무시하므로 "Require review from Code Owners" 가 무력화된다.

권장 구성 (실제 핸들로 치환 필요):

```
# 전 영역 — TL 최종 승인 필수
*           @atonovum

# 영역별 소유자가 분리되면 아래처럼 확장 (예시):
# src/                @atonovum/frontend
# src/settings/       @atonovum/frontend
# src/lib/i18n.jsx    @atonovum/frontend
# src/worker.js       @atonovum/backend
# src/lib/storage.js  @atonovum/backend
# wrangler.jsonc      @atonovum/backend
```

- 팀 슬러그(`@<org>/<team>`)를 쓰려면 해당 team이 atonovum 조직에 존재하고 **레포 write
  권한**을 가져야 한다.
- 사용자 핸들만 쓸 경우 해당 사용자가 collaborator로 등록되어 있어야 한다.

### 3.3 배포 분리

- `ci.yml` — `pull_request` 이벤트에서 실행. test + coverage 코멘트.
- `deploy.yml` — `push: branches: [main]` 으로만 트리거. wrangler deploy 실행.
- **PR 단계에서는 절대로 deploy 잡이 돌지 않는다** — 시크릿 노출 방지 + 비용.

---

## 4. Epic 라벨 정책

규칙 6 (Epic 은 모든 sub-issue 가 닫힌 후에만 닫음) 의 운영 규약.

### 4.1 Epic 라벨 부여 기준

다음 중 **하나 이상** 해당 시 `Epic` 라벨을 단다:

- 2개 이상의 sub-issue 를 가진 부모 이슈.
- FE + BE 양쪽 작업이 모두 필요한 이슈.
- 데이터 모델 / KV 스키마 마이그레이션을 포함하는 이슈.
- 추정 작업량이 1주(스프린트 절반) 초과.

Epic 라벨이 붙은 이슈는 **본인이 직접 코드를 작성하지 않는다** — 반드시 sub-issue
로 분해해 FE/BE 에 배분.

### 4.2 닫기 규칙 (cascade-close)

- Epic 이슈는 **모든 sub-issue 가 `done`** 일 때만 `done` 처리 가능.
- 자식 조회: 현재 `multica issue list` 에 `--parent` 플래그가 없으므로 다음 중 한 방법:
  - Epic 이슈 본문의 sub-issue 체크리스트를 사람이 확인.
  - 전체 이슈 list 를 받아 `parent_issue_id` 로 필터:
    ```bash
    multica issue list --output json \
      | jq --arg p "<epic-id>" '[.[] | select(.parent_issue_id == $p)]'
    ```
- 미완 sub-issue 가 있으면 Epic 은 `in_progress` 유지.
- 닫을 때 모든 sub-issue 의 PR merge SHA 를 Epic 코멘트로 요약 게시 권장.

### 4.3 향후 자동화 (planned autopilot)

다음과 같은 autopilot 으로 cascade-close 를 강제할 수 있다 (현재 미구현):

- Trigger: `on issue update` where `status -> done` AND `label contains "Epic"`.
- Action: 자식 이슈 전수 조회 → 미완 자식이 있으면 status 를 `in_progress` 로
  되돌리고 차단 사유를 코멘트로 게시.

→ **Follow-up**: TL 이 별도 Multica 이슈로 등록.

---

## 5. 본 문서와 위키의 역할 분리

| 위치 | 역할 |
|---|---|
| GitHub Wiki (`Development-Workflow`) | 규칙 자체 (what) — 신규 합류자가 첫날 읽는 페이지 |
| `docs/team-workflow.md` (본 문서) | 강제 메커니즘 (how) — autopilot, branch protection, CODEOWNERS, cascade |
| `docs/features.md` | 프로덕트 기능 명세 |
| `docs/plan.md` | 로드맵 (아카이브) |
| `CLAUDE.md` | Multica 에이전트 런타임 지침 |

위키와 본 문서가 충돌하면 **위키가 규칙의 source of truth**, 본 문서는 enforcement detail.
