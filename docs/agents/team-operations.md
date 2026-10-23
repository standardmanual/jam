---
type: workflow-rule
description: "에이전트 9인의 역할과 권한, 작업이 흐르는 경로, 격리 워크트리의 동작, 각 에이전트가 볼 수 있는 범위, 예약 자동화 루틴을 한 장에 모은 운영 지도다."
tags: [워크플로]
---

# 에이전트 팀 운영 지도

이 문서는 **"누가, 어디서, 무엇을 볼 수 있고, 무엇을 할 수 있는가"** 를 한 장에 모은 것이다.
개별 규칙의 원문은 각 정의 파일에 있고, 여기에는 그것들이 서로 어떻게 맞물리는지를 적는다.

> **갱신 규칙.** 아래 다섯 가지 중 하나라도 바뀌면 같은 작업 안에서 이 문서를 함께 고친다.
> 티켓 완료 기록에 어느 절을 고쳤는지 한 줄로 남긴다.
>
> 1. 에이전트를 추가·삭제하거나 역할·도구·모델을 바꿀 때
> 2. 파이프라인 단계나 순서가 바뀔 때 (`.claude/workflows/jam-work.js`)
> 3. 워크트리 생성·정리 방식이 바뀔 때 (`scripts/workspace-setup.sh`)
> 4. 예약 루틴을 켜고 끄거나 주기·담당을 바꿀 때
> 5. 접근 범위(어느 에이전트가 어디를 읽고 쓰는가)가 바뀔 때
>
> **생성 구간(`<!-- BEGIN generated: ... -->`)은 손으로 고치지 않는다.** 근거가 되는 설정
> 파일을 고친 뒤 `node scripts/gen-team-doc.mjs`를 실행한다. 손으로 고치면 pre-commit이 막는다.
> **이 문서의 시각화 `docs/agents/team-map.html`도 손으로 고치지 않는다.** 에이전트 카드·콜사인·
> 호출 관계도·파이프라인·워크트리 구조·스킬 콜사인·접근 범위·예약 루틴을 같은 근거 파일과 이
> 문서의 표에서 `scripts/gen-team-map.mjs`가 생성한다. 근거를 고친 뒤
> `node scripts/gen-team-map.mjs`를 실행한다(`--open`이면 브라우저로 바로 연다). 낡으면
> pre-commit·`verify.sh`·CI가 막는다.
> 환경에 대한 새 주장을 이 문서에 적을 때는 `docs/agents/contract.json`에 검사 줄을 함께
> 추가한다. 검사받지 않는 주장은 반드시 낡는다.

---

## 1. 한눈에 보기

> 아래 표는 `.claude/agents/*.md`의 frontmatter에서 **자동 생성**된다. 손으로 고치지 말고
> 정의 파일을 고친 뒤 `node scripts/gen-team-doc.mjs`를 실행한다. 어긋나면 커밋이 막힌다.

<!-- BEGIN generated: agent-table -->
| 이름 | 역할 | 정의 파일 | 기본 모델 | 도구 | 쓰기 권한 | 평소 관여 |
|---|---|---|---|---|---|---|
| 카리나 | 오케스트레이터 (메인 대화) | `docs/agents/orchestrator.md` | 세션 설정 | 전부 | **있음** | 항상 |
| 아현 | 구현 | `.claude/agents/jam-developer.md` | Sonnet | Read·Write·Edit·Bash·Grep·Glob | **있음** | 항상 |
| 민지 | 게이트 리뷰 · 배포 전 점검 | `.claude/agents/jam-reviewer.md` | Sonnet | Read·Grep·Glob·Bash | 없음 | 항상 · 배포 시 병렬 호출 |
| 채원 | 디자인 | `.claude/agents/jam-designer.md` | Sonnet | Read·Grep·Glob·Bash | 없음 | UI·DS 작업 시 |
| 혜린 | 기획 | `.claude/agents/jam-pm.md` | Sonnet | Read·Grep·Glob | 없음 | 호출 시 |
| 윈터 | 세계관 | `.claude/agents/jam-tribe.md` | Sonnet | Read·Grep·Glob·WebSearch | 없음 | 호출 시 · 월간 |
| 윤진 | 마케팅 | `.claude/agents/jam-marketer.md` | Sonnet | Read·Grep·Glob·WebSearch·WebFetch·Bash | 없음 | 호출 시 · 주간 · 월간 |
| 카즈하 | 운영·리스크 | `.claude/agents/jam-ops.md` | Haiku | Read·Grep·Glob·Bash | 없음 | 주간 |
| 하니 | 문서 체계 | `.claude/agents/jam-guide.md` | Haiku | Read·Grep·Glob | 없음 | 월간 |
<!-- END generated: agent-table -->

**쓰기 권한을 가진 주체는 둘뿐이다.** 카리나와 아현이며, 아현조차 자기 review 브랜치에만 쓴다.
나머지 일곱은 읽고 판단만 한다. 이 비대칭이 팀 구조의 뼈대다.

---

## 2. 에이전트끼리는 서로를 부를 수 없다

**모든 위임은 카리나를 거친다.** 서브에이전트는 다른 서브에이전트를 호출하는 도구를 갖고 있지
않으며, 이는 설계 의도다. 아현이 "디자인 판단이 필요하다"고 느껴도 채원을 직접 부르지 못하고
`needs_design`을 반환하며 멈춘다. 판단의 책임이 한곳에 모여야 누가 무엇을 결정했는지 추적할 수
있기 때문이다.

실제로 정보는 이렇게 흐른다.

```
채원① 판정  ──┐
              ├─→ 카리나가 받아서 ──→ 아현 프롬프트에 박아 넣음
티켓 문서    ──┘

아현 결과   ──→ 카리나가 커밋 범위(baseSha..commitSha)를 뽑아 ──→ 민지·채원②에게 전달
```

민지와 채원②는 브랜치 이름이 아니라 **아현이 보고한 두 커밋 사이의 diff**만 본다. 브랜치를
다시 fetch해 비교하면 그 사이에 다른 티켓이 섞여 들어올 수 있고, 실제로 그런 사고가 있었다
(티켓 20260918_1148·1158).

---

## 3. 작업이 흐르는 경로

요청이 들어오면 카리나가 먼저 경로를 판정한다. 분기표 원문은
`.claude/skills/jam-work/SKILL.md`에 있다.

| 경로 | 조건 | 흐름 |
|---|---|---|
| ① 경미 수정 | 파일 1~2개, 10줄 이내, 고칠 내용이 명백 | 카리나가 직접 |
| ② 가벼운 UI | 작은 화면 조정 | 채원 판정 후 카리나 또는 아현 |
| ③ 표준 파이프라인 | 그 외 전부 | 아래 4단계 |

재작업은 위 경로와 별개로 두 갈래가 있다. 아현을 다시 부르는 **재시도**(`retryReason`·`retryBranch`)와,
좁은 재작업(파일 2개·10줄 이내)을 카리나가 직접 패치한 뒤 민지만 다시 부르는 **`gateOnly`** 경로다.
절차는 `.claude/skills/jam-work/SKILL.md` 3.1절이 단일 원천이다.

### 표준 파이프라인 (`/jam-work`)

```
채원① 사전 판정 ─→ 아현 구현 ─→ ┌ 민지 게이트 리뷰  ┐ ─→ 카리나 승인 요청 ─→ 머지
 (UI·DS 유형만)   (격리 워크트리)  └ 채원② 사후 리뷰  ┘     (사용자 승인)
                                    (병렬 실행)
```

- 민지와 채원②는 서로를 참조하지 않으므로 **병렬로 돈다**(티켓 20260918_1158). 민지가 FAIL을
  내도 채원②는 끝까지 진행하되 결과는 참고용으로만 쓴다.
- 채원② 사후 리뷰는 diff가 15줄 미만이거나 UI·DS 유형이 아니면 생략한다.
- 개선 리뷰 단계는 없다. 범위 밖 개선점은 민지의 `sideFindings`와 채원②의 `proposals`로
  받아 카리나가 **승인 없이 자동으로** `status: OPEN` 티켓을 만든다. `sideFindings`는
  `[축/신호]` 접두로 분류되고 신호가 우선순위 기본값이 된다(축·신호 표는
  `review-verdict-format.md`, 기본값은 `/jam-work` 3.2절, 티켓 20260922_1521).
- **정지 조건**(게이트 FAIL·`[중단]`·`db`/`engine` 진입·되돌릴 수 없는 작업·채원
  `needsApproval`·아현 `plan_only`/`needs_design`/`halted`·같은 티켓 2회 연속 재작업)의 단일
  원천은 `.claude/skills/jam-work/references/stop-conditions.md`다(티켓 20260921_2305). 상위
  티켓의 하위 티켓을 순서대로 실행하는 **묶음 실행 모드**(`Workflow` 인자 `batch`)도 같은
  목록을 쓴다 — 기본은 꺼져 있고, 사용자가 상위 티켓 분해안을 승인하며 명시했을 때만 켠다.

### 머지와 배포의 경계

| 대상 | 누가 | 막는 장치 |
|---|---|---|
| review 브랜치 (`claude/jamwork-*`) | 아현이 push | pre-push가 기준 방어는 항상 실행하고, `verify.sh`는 메인 트리·`wf_`가 아닌 워크트리에서만 실행한다(`wf_*` 링크드 워크트리는 CI에 맡긴다, 티켓 20260922_1755). 브랜치 삭제 push는 검증할 코드가 없어 `verify.sh`를 건너뛴다(티켓 20261014_1442). CI(GitHub Actions `verify`)가 같은 검사를 돌려 결과를 커밋 상태로 남긴다 |
| `staging` | 카리나가 사용자 승인 후 머지·push | pre-push가 `jam-web` lint와 기준 방어 실행. 에이전트 작업 공간(`wf_*`)과 리뷰 브랜치(`claude/jamwork-*`)에서 오는 push는 **차단**. CI는 돌지 않는다 |
| `main` (프로덕션) | 카리나가 `/jam-ship`으로만 | pre-push가 직접 push를 **차단**, `JAM_SHIP=1`이 유일한 통로 |
| DB | 카리나만 실행 | 아현에게 DB 도구를 주지 않음 |

아현은 `main`과 `staging`에 push하지 않으며, 티켓 상태를 `CLOSED`로 바꾸지도 못한다. 후자는
프롬프트 규칙만으로 세 번 뚫린 뒤 `.githooks/pre-commit`이 기계적으로 막게 됐다.

---

## 4. 워크트리 — 누가 어디서 도는가

<!-- BEGIN generated: worktree-isolation -->
격리 워크트리에서 도는 에이전트는 **민지(`jam-reviewer`) · 채원(`jam-designer`) · 아현(`jam-developer`)** 뿐이다. 나머지 에이전트는 메인 작업 폴더에서 읽는다.
<!-- END generated: worktree-isolation -->

근거는 `.claude/workflows/jam-work.js`의 `isolation: 'worktree'` 호출이며, 위 문장은 그 파일에서
자동 생성된다.

이유는 동시성이다. 여러 `/jam-work`가 병렬로 돌 때 모두 메인 트리에서 `git checkout`을 하면
서로의 작업을 덮어쓴다. 처음에는 브랜치를 만들고 커밋하는 아현만 격리했다. 이후 민지가 공유 작업
폴더에서 `git checkout --detach`를 실행하는 일이 두 번 있어, 워크플로 게이트의 민지·채원②와
`/jam-ship` 5단계의 민지도 격리 워크트리에서 부른다(티켓 20261002_1905). 채원① 사전 판정
(`jam-designer-pre`)은 사고 이력이 없어 격리하지 않으므로 메인 작업 폴더에서 돈다.

### 워크트리에 무엇이 들어 있나

| 항목 | 상태 |
|---|---|
| 저장소 추적 파일 전체 (`jam-web/`, **`docs/`**, `scripts/`, `.claude/`) | 실제 파일로 체크아웃됨 |
| `jam-web/node_modules` | 메인 작업 폴더로 향하는 **심볼릭 링크** (`scripts/workspace-setup.sh link`) |
| 시크릿 파일 (`.env.local` 등) | 없음 |

> **2026-09-20 이전과 달라진 점.** 기획·운영 문서(`jam-doc/`)는 별도 저장소여서 워크트리에 아예 따라오지
> 않았다. 아현은 기획·운영 문서를 **읽지도 못한 채** 그 문서의 수정안을 써야 했고, 이것이
> 「문서 갱신안」 우회 절차가 반복해서 어긋난 근본 원인이었다. 저장소를 재통합하면서
> (티켓 20260920_1412) 이제 워크트리에 실제 폴더로 따라오며, 아현이 직접 고쳐 커밋한다.

### 워크트리 수명

1. **생성**: Workflow 도구가 `.claude/worktrees/wf_*` 아래에 만든다. 기본 브랜치(`main`) 기준으로
   생성되므로, 아현의 첫 명령은 반드시 `git fetch origin staging && git checkout --detach origin/staging`이다.
   민지·채원②의 첫 명령은 리뷰 커밋을 체크아웃하는 `git fetch origin <review 브랜치> && git checkout --detach <commitSha>`다
   (커밋 범위가 없으면 아현과 같다). 이 지시가 없으면 `staging`에만 있는 변경이 보이지 않아 "없는 파일"로 오판한다(티켓 20260918_1158).
2. **연결**: `scripts/workspace-setup.sh link "$(pwd)"`로 `node_modules`를 잇는다. `npm install`을
   다시 돌리지 않기 위함이다.
3. **정리**: `scripts/workspace-setup.sh cleanup`이 staging에 머지됐고 미커밋 변경이 없는
   워크트리와, 연결 워크트리가 없는 `worktree-wf_*`·staging에 병합된 `claude/jamwork-*` 로컬
   브랜치를 제거한다(아래 「알려진 빈틈」 참고). 세션 시작 훅에서 **백그라운드(`async`)로** 돌고
   출력을 세션에 싣지 않는다 — `git fetch`가 최악 19초 걸려 세션 시작을 막았고, 제거 로그가 매
   세션 컨텍스트를 차지했다(티켓 20260928_2339). 결과는 `scripts/workspace-setup.sh cleanup`을
   직접 실행해 확인한다.

---

## 5. 접근 범위 — 각자 어디를 보는가

「탐지 영역」은 두 층으로 나뉜다. **도구가 물리적으로 막는 범위**와 **정의 문서가 지시하는
범위**다. 전자는 뚫리지 않고, 후자는 프롬프트 규칙이라 어긋날 수 있다.

| 에이전트 | 읽는 곳 | 쓰는 곳 | 물리적 제약 |
|---|---|---|---|
| 카리나 | 전부 | 전부 | 없음 (채팅에서 받는 사용자 승인이 유일한 제약. Supabase MCP의 SQL 실행 도구는 자동 허용이라 도구 프롬프트가 관문 역할을 하지 않는다) |
| 아현 | 워크트리 전체 | 워크트리 안, 자기 브랜치 | DB 도구 없음 · `CLOSED` 커밋 차단 · main/staging push 차단 |
| 민지 | 지정된 커밋 범위의 diff + 티켓 + 스펙 | 없음 | Write·Edit 도구 자체가 없음 · 워크플로 게이트와 `/jam-ship` 5단계에서 격리 워크트리에 실행(티켓 20261002_1905) · 공유 작업 폴더에서 HEAD·작업 트리를 옮기는 git 명령을 막는 정의 frontmatter 훅은 등록돼 있으나 클라우드 세션의 실제 호출에서 걸리지 않음 |
| 채원 | `jam-web/design-system/`, Storybook, 지정된 diff | 없음 | Write·Edit 도구 자체가 없음 · 사후 리뷰(②)만 워크플로 게이트에서 격리 워크트리에 실행 · 민지와 같은 frontmatter 훅(같은 상태) |
| 혜린 | 티켓·PRD·컨텐츠 문서 | 없음 | 〃 (Bash도 없음) |
| 윈터 | `docs/service/content/TRIBES.md` 중심 + 웹 | 없음 | 〃 |
| 윤진 | `docs/marketing/`, 리포트 + 웹 | 세션: `docs/assets/`의 묶음 폴더 3곳(`badge-bundles/`·`mission-bundles/`·`home-feed-bundles/`의 `<묶음 ID>/`, 모드 ⑧ 한정, Bash) | Bash 도구는 물리적으로 좁혀지지 않는다. `render.mjs`·`list-presets.mjs` 실행·묶음 폴더 쓰기·`register-*.mjs --dry-run`만 허용한다는 것은 정의 문서의 지시(프롬프트 규칙)다. 예약 실행은 이미지를 만들지 않는다(티켓 20260930_1519). 등록(`--dry-run` 없음·`--undo`)·프리셋 생성·수정·DB·스토리지 쓰기·git은 금지 |
| 카즈하 | 리포트·티켓·지표 API | 없음 | 〃 |
| 하니 | 문서 체계 전반 | 없음 | 〃 (Bash도 없음) |

### 읽기 범위를 좁게 유지하는 이유

전부 읽을 수 있다고 해서 전부 읽으면 안 된다. 토큰이 선형으로 늘고, 관련 없는 파일이 판단을
흐린다. 그래서 정의마다 "필요한 것만 읽어라"가 명시돼 있고, 새 세션의 읽기 순서도 정해져
있다(`CLAUDE.md` 「새 세션 시작 시 읽기 순서」). **코드부터 탐색하지 않는 것**이 원칙이다.

### 문서 검사기가 보는 범위

`scripts/doc-check.mjs`와 `scripts/check-slop.mjs`가 커밋·push 때 자동으로 돈다.

| 검사기 | 범위 | 제외 |
|---|---|---|
| `doc-check` (링크·frontmatter) | `docs/` 전체 | `docs/archive/`, `docs/assets/`, `docs/operations/reports/`, `docs/tickets/modular/` |
| `check-slop` (한국어 슬롭) | `jam-web/`, `docs/` | `docs/tickets/`, `docs/archive/`, `docs/assets/`, `docs/operations/inbox/trends/`, 7-6 컨텐츠 입력의 데이터 파일(`jam-web/scripts/jam2-content/pairing.json`과 마이그레이션 `*_content_overwrite_backup.sql`·`*_tribe_content_*.sql`, 티켓 20261022_1137) |

---

## 6. 예약 자동화 루틴

**클라우드 예약 작업**(claude.ai/code/routines)에서 돌도록 설계됐다. PC 상태와 무관하다. 원문 스펙은
`.claude/skills/jam-work/references/scheduled-jobs.md`에 있다. **2026-10-07 사용자가 루틴을 모두 삭제해 지금은
하나도 돌지 않는다**(확인 방법·후속 정리는 그 문서 머리말).

| 루틴 | 주기 (KST) | 담당 | 산출물 | 상태 |
|---|---|---|---|---|
| 주간 브리핑 | 화 09:00 | 카즈하 → 윤진 | `docs/operations/reports/weekly/YYYY-Www.md` | 삭제됨(2026-10-07) |
| 선별 (무인 적격 판정) | 매일 06:00 | 카즈하 | `docs/operations/reports/triage/YYYY-MM-DD.md` | 삭제됨(2026-10-07) |
| 주간 배포 확인 | 목 15:00 | 무인 카리나 | Slack 리마인더 게시 | 삭제됨(2026-10-07) |
| 주간 배포 실행 | 목 23:59 | 무인 카리나 | 프로덕션 배포 | 삭제됨(2026-10-07) |
| 월간 트렌드·문서 점검 | 매월 1일 09:00 | 윈터·윤진 → 하니 | `docs/operations/reports/monthly/YYYY-MM.md` | 삭제됨(2026-10-07) |

### 무인 실행에 거는 제약

무인 세션은 **지시를 받지 않는다.** 이것이 예약 실행의 제1원칙이다. 열린 지시를 따르면
안전하지 않기 때문이다.

| 허용 | 금지 |
|---|---|
| 저장소 읽기 | 코드 수정 |
| 리포트 저장·커밋 | 티켓 종료·우선순위 확정 |
| 리포트 본문에 `[분류 대기 초안]` 기록 (티켓 파일 생성 없음, `scheduled-jobs.md` 4-3) | DB 변경 |
| Slack `#jam-alert`·`#jam-report` 게시 | Slack 외 외부 발행 |
| | 경제 수치 제안 |

**머지·배포 금지에는 예외가 하나뿐이다.** 「주간 배포 승인」 루틴이며, 이것도 원칙을 어기지
않는다. 새 지시를 받는 것이 아니라 **자신이 전주에 올린 리마인더 스레드 하나**에서 예·아니오
이진 신호만 확인하기 때문이다(티켓 20260918_1650, 사용자 명시 승인). 다른 루틴에는 이 예외가
적용되지 않는다.

### 세션을 열 때 자동으로 도는 것

<!-- BEGIN generated: session-hooks -->
| 실행 | 하는 일 |
|---|---|
| `scripts/ticket-dashboard.mjs` | 열려 있는 티켓 현황판과 오케스트레이터 카드를 출력한다 |
| `scripts/check-routine-reports.mjs` | 예정 시각이 지났는데 예약 리포트가 없으면 경고한다 |
| `scripts/workspace-setup.sh` | staging에 머지된 격리 워크트리와 연결 워크트리 없는 브랜치를 정리한다 |
| `scripts/ensure-hooks-path.sh` | 이 클론의 core.hooksPath가 이 저장소의 .githooks로 해석되지 않으면 .githooks로 맞춘다 |
<!-- END generated: session-hooks -->

위 표는 `.claude/settings.json`의 `SessionStart` 훅에서 자동 생성된다. 무인 루틴이 실패했을 때
사람이 알아차리는 경로이므로, 훅을 지우면 그 경로가 사라진다.

### 무엇을 예약하고 무엇을 예약하지 않나

- **예약한다**: 점검형(카즈하·하니)과 형식이 고정된 반복 초안(윤진의 홈피드 7일치).
- **예약하지 않는다**: 되묻기가 핵심인 일(혜린의 기획, 윈터의 창작, 윤진의 시즌 제안).
  백그라운드 실행은 중간에 사용자에게 물을 수 없기 때문이다. 이런 일은 세션에서 `/jam-plan`,
  `/jam-story`로 대화하며 진행한다.

---

## 7. 모델 배정과 비용

기본 모델은 각 정의의 `model` 키로 고정하고, 모드에 따라 호출부가 덮어쓴다.

| 배정 | 대상 | 근거 |
|---|---|---|
| Sonnet 고정 | 아현·민지·혜린·윈터·윤진 | 판단의 질이 결과를 좌우한다 |
| Haiku 기본, 필요 시 Sonnet | 카즈하·하니 | 수집·대조가 주된 일이라 평소에는 가벼운 모델로 충분하다 |
| 유형별 분기 | 채원② 사후 리뷰 | `ds` 유형만 Sonnet, 나머지는 Haiku (파급 범위 차이) |

카리나(메인 세션)의 모델은 사용자가 `/model`로 정한다. 기본은 Sonnet이고, 구조 설계처럼 판단이
많은 세션만 Opus로 올린다.

토큰은 Workflow 완료 알림의 `<usage>` 블록(`subagent_tokens`·`duration_ms`·`agent_count`)에서
읽어 티켓 완료 기록에 남긴다. 이 값이 티켓 간 비교의 기준 수치다.

---

## 8. 규칙이 왜 이렇게 생겼나 — 사고 이력

지금의 제약 대부분은 설계가 아니라 **사고의 결과**다. 새 규칙을 만들거나 기존 규칙을 풀 때
이 목록을 먼저 본다.

| 사고 | 반복 | 지금의 장치 |
|---|---|---|
| 아현이 스스로 티켓을 `CLOSED`로 마킹 | 3회 | pre-commit이 review 브랜치에서 `CLOSED` 커밋 차단 |
| 워크트리가 `main` 기준으로 생성돼 `staging` 변경을 못 봄 | 1회 (중단) | 아현의 첫 명령을 `fetch staging`으로 못 박음 |
| 민지가 뒤처진 `origin/staging`과 비교 | 1회 | 커밋 범위(SHA)를 프롬프트에 직접 박아 넣음 |
| 서비스플랜이 버전 사본 15개로 증식 | 누적 | pre-commit이 버전 사본 차단 |
| `badges` 조회에 `deleted_at` 필터 누락 | 10회 이상 | pre-commit 경고 |
| `searchParams`를 단수 `string`으로 선언해 런타임 500 | 2회 | pre-commit 차단 |
| lint 에러가 183건까지 누적 | 누적 | pre-push가 staging에서 전체 lint 실행 |
| 문서 갱신안 우회 (아현이 `jam-doc`을 못 읽음) | 7개 티켓 | 저장소 재통합으로 원인 제거 (20260920_1412) |
| 확인하지 않은 환경 주장이 문서마다 모순 — `jam-developer.md` 규칙 9는 "`jam-doc`이 심볼릭 링크로 연결된다", `jam-work/SKILL.md`는 "워크트리에 `jam-doc`이 없다"고 적은 채 방치. 확인 비용은 `ls` 한 줄이었고 같은 종류의 드리프트가 세 건 더 나왔다 | 4건 | `CLAUDE.md` 규칙 5(확인한 결과만 적는다) + `contract.json` 계약 검사 (20260920_1907) |
| 티켓 번호를 "당일 최대 +1"로 계산해 병렬 세션이 같은 번호를 동시에 선점 | 충돌 32건 + 재번호 커밋 (2026-08-27) | 번호 = 생성 시각(`HHMM`), 조회 없이 정해져 경합 구간이 없다 (20260918_1101) |
| 아현이 `git checkout -b`로 현재 브랜치를 물려받아 남의 미승인 커밋을 조상으로 끌어옴 | 1회 | 분기는 항상 `origin/staging` 기준, 머지 전 `merge-base --is-ancestor` 오염 검사 (20260820_019) |
| 아현이 낡은 워크트리를 미커밋·미push 확인 없이 강제 제거 (격리 제약 아래, 유실은 없었음) | 1회 | `cleanup-stale-worktree.sh`가 검사 후 종료 코드 2로 거부 — 판단을 기억에 맡기지 않는다 (20260922_1056) |
| 브라우저 검증 중 실제 배지 이미지에 쓰기 버튼을 눌러 덮어씀, 복구 불가 | 1회 | 실데이터 쓰기 금지, `[TEST]` 더미 또는 API 응답 형태만 확인 (`DEV_PROCESS_GUARDRAILS.md` 패턴 13) |
| 함수 인자 수를 바꾸며 옛 시그니처를 안 지워 오버로드가 남고 런타임 `is not unique` | 1회 | `DROP FUNCTION IF EXISTS` 선행 (패턴 14, 20260911_1259) |
| 민지가 읽기 명령에 `git checkout --detach`를 섞어 공유 작업 폴더의 HEAD를 `staging`에서 분리 (정의는 이미 금지, 제자리 복구로 유실 없음) | 2회 (2026-10-02, 두 번째는 권한 단계에서 거부됨) | 1차: 민지·채원 정의 frontmatter에 `PreToolUse` 훅(`scripts/guard-shared-head.mjs`)을 등록했으나 실제 호출에서 걸리지 않았다(2026-10-02, 2026-10-04 `git clean -n`이 그대로 실행됨, 원인 미확인). 2차: 워크플로 게이트의 민지·채원②와 `/jam-ship` 5단계의 민지를 격리 워크트리에서 불러 공유 폴더에 서지 않게 한다 (20261002_1905) |
| 격리 워크트리에서 `git push`가 osxkeychain 자격 증명 프롬프트에 멈춤 | 1회 (2026-09-22) | `-c credential.helper=!gh auth git-credential`로 push (아현 정의 「CI stamp」) |
| 아현 반환 요약이 30줄 형식을 세 건 연속 위반하고 diff 원문까지 포함 — 카리나·민지·채원② 세 곳에 실림 | 3회 | `DEV_RESULT.summary` 스키마 `maxLength: 3000` (20260922_0620 → 20260922_1755) |
| 커밋마다 staging push → Vercel 배포 1,212개(20일), Build CPU $66.15 | 누적 (2026-09-06 실측) | 티켓당 push 1회, `jam-web/` 밖만 바뀐 push는 `vercel-ignore.sh`가 건너뜀 |
| 정의·`CLAUDE.md`·`SKILL.md`에 사고 경위·티켓 번호가 규칙과 섞여 호출마다 실림 | 누적 | 규칙만 남기고 경위는 이 표와 `jam-work/references/rationale.md`로 (20260922_1800) |

**패턴이 보인다.** 프롬프트 규칙만으로 막은 것은 예외 없이 다시 뚫렸고, 훅으로 막은 것은 뚫리지
않았다. 중요한 제약은 기계가 막게 한다.

---

## 9. 알려진 빈틈

현재 구조에 남아 있는 취약점이다. 아직 사고로 이어지지 않았거나, 감수하기로 한 것들이다.
해결된 항목은 지우지 않고 무엇으로 막았는지 남긴다.

**① 문서와 실제가 어긋나는 문제 — 기계 검사로 막았다 (티켓 20260920_1907).**
`jam-developer.md` 규칙 9는 "`jam-doc`이 심볼릭 링크로 연결된다"고 적었고 `jam-work/SKILL.md`는
"워크트리에 `jam-doc`이 없다"고 적었다. 두 문장이 정면으로 모순된 채 며칠간 방치됐고, 실제로는
후자가 맞았다. 후속 조사에서 같은 종류의 드리프트가 세 건 더 나왔다. 근원은 **검사의
비대칭**이었다. 코드는 lint·typecheck·test·ds:check로 4중 검사를 받는데 문서는 링크와
frontmatter 형식만 검사받으면서, 에이전트에게는 코드와 똑같은 구속력을 가졌다.

지금은 `scripts/check-contract.mjs`가 `docs/agents/contract.json`의 주장을 실제 환경과
대조하고, `scripts/gen-team-doc.mjs`가 이 문서의 사실 표를 설정에서 생성한다. 둘 다
`verify.sh`와 pre-commit에 물려 있어 어긋나면 커밋이 막힌다. **남은 위험**은 검사 선언 자체가
빈약해지는 것이다. 새로운 환경 주장을 문서에 적을 때는 `contract.json`에 검사 줄을 함께
추가한다.

**② 워크트리 정리 — 세션 시작에 자동화했다 (티켓 20260920_1907, 브랜치 정리는 20260921_2309).**
`workspace-setup.sh cleanup`은 누가 부르지 않으면 돌지 않았고, 티켓 0045 작업이 끝난 뒤에도
워크트리 하나와 브랜치 두 개가 남아 있었다. 지금은 세션을 열 때마다 자동으로 돌며, staging에
머지됐고 미커밋 변경이 없는 워크트리를 지운 뒤, 연결 워크트리가 없는 `worktree-wf_*` 로컬
브랜치와 staging에 병합된 로컬 `claude/jamwork-*` 브랜치도 함께 지운다. 워크트리가 아직
연결된 브랜치는 지우지 않는다. 원격 리뷰 브랜치는 `cleanup --remote`가 목록만 보여 주고
`--remote --yes`일 때만 지운다(세션 훅은 부르지 않으며, 카리나가 사용자 승인 후 실행). **남은
위험**은 (a) 대량으로 쌓인 기존 브랜치의 첫 실측·정리는 사람이 한 번 손으로 확인해야 한다는
것(이 티켓의 후속 범위), (b) `git worktree remove`가 절대경로에서 실패하는 사례(한글 폴더명
NFC/NFD 표기 차이로 추정, 원인 미확인)가 상대경로 재시도로도 막히지 않으면 "제거 실패"로만
보고되고 해당 워크트리·브랜치는 계속 남는다는 것이다.

**③ 예약 루틴 실패 감지 — 훅을 실제로 만들었다 (티켓 20260920_1907).**
`scheduled-jobs.md`는 "세션 시작 hook이 예정 시각이 지났는데 리포트가 없으면 감지한다"고 적어
두었으나 그런 훅도 스크립트도 없었다. 서술만 있고 구현이 없는 상태가 빈틈 ①의 전형이었다.
지금은 `scripts/check-routine-reports.mjs`가 세션마다 주간·월간 리포트의 존재를 확인하고,
없으면 경고한다. Slack 채널(`#jam-alert`·`#jam-report`)은 개설돼 있어 루틴 자체의 알림 경로도
살아 있다. **남은 위험**은 리포트 파일이 있으면서 내용이 부실한 경우다. 존재만 보고 품질은
보지 않는다.

**④ 원격 세션은 shallow clone이다.**
클라우드 세션의 저장소는 이력이 잘려 있다(`jam` 73커밋). `git log`로 과거 결정을 추적하는 일이
로컬과 다르게 동작한다. 티켓 번호로 `git log --grep` 하는 편이 안전하다.

**⑤ 서브에이전트 전원이 `CLAUDE.md`를 받는다.**
코드 규칙이 필요 없는 윤진·윈터·하니도 프로젝트 전체 규칙을 매 호출마다 받는다. 선택적으로
빼는 공식 기능이 없기 때문이다(2026-09-18 확인). 토큰 낭비이지만 현재 우회 수단이 없다.

**⑥ 배포 안전 관문이 사람이 있는 경로에만 걸려 있었다 — 저장소 안과 루틴 저장 프롬프트를 모두 막았다 (티켓 20260921_2303에서 발견, 20260922_0001에서 막았다).**
`/jam-ship`의 「배포 전 점검표」·「롤백 계획」·「완료 기준」·「배포 후 검증」은 세션에서 사람과 함께
배포할 때만 적용됐다. 목요일 무인 배포는 「사전 확인」·「main 승격」·「배포 검증」만 수행했고,
배포 확인도 `curl` 200 응답에 그쳤다. Vercel은 롤백 뒤에 프로덕션 도메인 자동 할당을 끄는데,
그 상태에서는 새 배포가 공개되지 않아도 옛 배포가 200으로 응답하므로 무인 확인이 그대로
통과했다.

지금은 `scripts/deploy-gate.mjs`가 두 가지를 맡는다. `check`는 git만으로 되는 점검(비밀값, 신규 번호
마이그레이션의 되돌림 SQL, 신규 API 라우트의 인증 확인)을 사람 경로(`/jam-ship`)와 무인 경로가 같은
코드로 돌리게 한다. `served`는 프로덕션 도메인이 서빙 중인 배포 id(응답 HTML의 `?dpl=dpl_…`)를
Vercel 인증 없이 읽어, 배포 뒤 새 배포가 공개됐는지를 본다. 마이그레이션 번호 기준선과 공개 라우트
목록은 `docs/agents/contract.json`의 `deploy_gate`에 선언하고 `check-contract.mjs`가 실제와
대조한다. 무인 경로에 적용하는 점검과 적용하지 않는 점검, 그 사유는 `scheduled-jobs.md`
「주간 배포 승인」의 「무인 경로에 적용하는 점검」 표가 단일 원천이다.

**남은 위험.** (a) 두 루틴의 저장 프롬프트는 2026-09-22 07:04 KST에 교체했지만 실제 무인 실행에서는 아직
검증되지 않았다(첫 실행 2026-09-24). 저장 프롬프트는 저장소 밖에 있고 "문서와 충돌하면 이 지시가 우선한다"고
적고 있어 `check-contract.mjs`가 대조하지 못한다. 그래서 `scheduled-jobs.md`의 해당 절을 고칠 때는
프롬프트도 함께 고쳐야 하며, 반영 상태는 그 문서의 「저장된 프롬프트 반영」 줄이 단일 원천이다.
(b) 서빙 id 확인은 프로덕션 응답 HTML에 `dpl=` 값이 노출되는 데 기댄다. 2026-09-22에 프로덕션 응답에서
노출을 확인했다. 노출이 사라지면 `served`가 종료 코드 3을 내고, 무인 경로는 "확인 불가"로 기록하며
배포는 막지 않는다. (c) `verify.sh`·`npm audit`·환경변수·마이그레이션 적용 여부 대조는 무인 환경에서
실행할 수 없어 리뷰 브랜치 CI와 사람이 하는 `/jam-ship`에 남는다.

**⑦ '통과했다'는 사실을 기계가 어디에도 남기지 않았다 (티켓 20260921_2207에서 발견, 20260921_2304에서 막았다).**
CLOSED 59건 중 22건(37%)에서 민지가 `verify.sh`·테스트를 다시 돌렸다. push가 통과했다는 근거가
재실행뿐이었기 때문이다. 지금은 GitHub Actions(`.github/workflows/verify.yml`)가 `claude/**`와
`staging` push에서 `scripts/verify.sh`(문서만 바뀐 push는 가벼운 검사와 `.claude/workflows/*.test.mjs`만)를 훅 없이 직접 실행해 커밋
상태(check)로 남긴다. 민지 점검표 1번은 이 상태를 읽는다. 실측(2026-09-22, 이 티켓의 구현
커밋): 전체 검사 2분 20~40초대(`npm ci` 포함), 가벼운 검사(문서만 바뀐 push, `npm ci` 없음)
18초. **남은 위험**은 `main` push에는 CI가 없다는 것과, 훅 실행 결과와 CI 실행 결과가
서로 다른 환경(로컬 vs 러너)에서 나올 수 있다는 것이다. `staging`은 처음에 저장소가 비공개였을 때의
Actions 무료 한도 때문에 제외했으나(2026-09-22 결정), 2026-10-23 저장소를 공개로 전환해 그 제약이
없어져 추가했다(티켓 20260922_0205, 구현 20261023_2318).

**⑧ 워크트리·리뷰 브랜치에서 staging으로 바로 push해도 막을 장치가 없었다 (티켓 20260921_2207 #4에서 발견, 20260921_2304에서 막았다).**
아현의 `staging` push 금지는 프롬프트 규칙일 뿐이었고, pre-push는 `main`만 차단했다. 지금은
pre-push가 (a) 폴더 이름이 `wf_`로 시작하는 링크드 워크트리, (b) 로컬 브랜치가
`claude/jamwork-*`인 경우의 staging push를 차단한다(우회 변수 없음). **남은 위험**은 카리나의
수동 격리 워크트리(처리 규칙표 17행)가 `claude/jamwork-*` 이외의 이름을 쓰는 것에 의존한다는
것 — 이름 규칙이 깨지면 다시 뚫린다.

---

## 10. 함께 읽을 문서

| 문서 | 담는 것 |
|---|---|
| `CLAUDE.md` | 절대 규칙, 문서 체계, 문서를 읽을 때 지킬 폴더 규칙 (폴더별 쓰기 방식 표는 `docs/README.md`) |
| `docs/agents/team-map.html` | 이 문서의 시각화 — 팀 카드·콜사인·호출 관계도·파이프라인·워크트리 구조를 한 화면에 (자동 생성, 브라우저로 연다) |
| `docs/agents/orchestrator.md` | 카리나의 운영 규칙, PC별 경로, DB 실행 절차 |
| `docs/agents/issue-tracker.md` | 티켓 체계 |
| `docs/agents/domain.md` | 저장소 구조도 |
| `.claude/skills/jam-work/SKILL.md` | 경로 판정 분기표, 파이프라인 단계별 상세 |
| `.claude/skills/jam-work/references/scheduled-jobs.md` | 예약 루틴 전체 스펙 |
| `.claude/skills/jam-work/references/handling-rules.md` | 상황별 처리 규칙표 |
| `docs/agents/DEV_PROCESS_GUARDRAILS.md` | 반복된 실패 패턴과 방지책 |
| `docs/agents/workflow/README.md` | 도입 구상·결정 배경의 동결된 기록(2026-09-22 이후 수정 불가, 참고용) — 현재 규칙 아님 |
