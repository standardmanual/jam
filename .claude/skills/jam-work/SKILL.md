---
name: jam-work
description: JAM! 프로젝트의 표준 개발 워크플로우. 버그 수정·기능 개선·디자인 시스템·컨텐츠·DB·문서 등 모든 작업 요청을 유형별로 라우팅해 티켓 검토 → 채원 사전 판정 → 구현 → 게이트 리뷰 → 채원 사후 리뷰 → 승인 후 머지·문서 갱신까지 처리한다. "/jam-work", "이거 고쳐줘", "이 기능 추가해줘", "리뷰 파이프라인으로 처리해줘" 같은 요청에 사용.
---

# /jam-work — JAM! 표준 작업 워크플로우

> **담당**: 카리나(오케스트레이터=나) · 채원(`jam-designer`) · 아현(`jam-developer`) ·
> 민지(`jam-reviewer`) — 콜사인은 전부 본인 이름과 같다.
>
> 평소 개발 흐름에 관여하는 건 이 넷이다. 혜린·윈터·윤진·카즈하·하니는 상황이 있을 때만
> 부른다 (각 정의는 `.claude/agents/`).
>
> 이 문서는 **규칙만** 적는다. 규칙이 생긴 경위·실측·티켓 번호는
> `.claude/skills/jam-work/references/rationale.md`에 절 번호별로 있다 — 규칙을 풀거나 바꿀 때만 읽는다.

## 0. 유형 판정 — 레인저 모자를 쓴다 (위임하지 않음)

### 0.0 단계 판정

카리나의 판정은 두 겹이다. **0.2절의 유형 판정보다 먼저**, 이 요청이 여섯 단계(카리나 주도
Define→Plan→Build→Verify→Review→Ship) 중 어디에 있는지부터 정한다. 대부분의 요청은 이미
BUILD부터 시작한다(티켓이 있고 완료 조건이 채워져 있음) — 이때는 이 표를 속으로만 확인하고
넘어가면 된다. DEFINE·PLAN이 필요해 보이면(무엇을 만들지 안 정해짐, 티켓이 여러 개로 쪼개져야
함) `/jam-plan`(혜린)으로 먼저 보낸다.

| 단계 | 진입 조건 (카리나가 확인) | 실행 주체 | 사용자 승인 |
|---|---|---|---|
| DEFINE | 무엇을 만들지 정해지지 않았거나 가정이 필요한 요청 | 혜린 문답 | 반쪽 요약 확인 |
| PLAN | 정의가 승인됐고 티켓이 둘 이상이거나 순서가 불명확 | 혜린 분해 → 카리나 티켓 생성 | 기획서·분해안 승인 |
| BUILD | 완료 조건이 채워진 티켓 존재. `ui`·`ds`면 채원 판정 존재 | 아현 (+채원①) | 없음 (needs_approval 항목만) |
| VERIFY | 아현 제출물 + 검사 통과 기록(CI 도장) | 훅·검사 스크립트, 아현 자기 검증 | 없음 |
| REVIEW | 검토 범위(baseSha..commitSha) 확정 | 민지 ∥ 채원② | 머지 승인 |
| SHIP | staging 검증 완료 + 롤백 계획 작성 + 팬아웃 GO | 카리나 (+보안·테스트 페르소나) | 배포 승인 |

**가정 목록**: 요청이 모호해 DEFINE 성격이 섞여 있는데도 바로 BUILD로 보내야 할 때(예: 사용자가
"그냥 진행해"라고 답함), 아현을 부르기 전에 "이런 가정으로 진행합니다: …" 목록을 사용자에게
보여 주고 확인받는다. 목록이 없으면 그 가정은 카리나 혼자 판단한 것이 되어 나중에 되짚기
어렵다. 형식은 짧은 불릿 목록이면 충분하다 — 별도 문서를 만들지 않는다.

**정지 조건의 단일 원천**은 `.claude/skills/jam-work/references/stop-conditions.md`다. 3.0절·
아현 정의(`jam-developer.md`)·`jam-work.js`가 모두 이 문서를 참조한다 — 서술을 각자 옮겨 적지
않는다.

### 0.1 경미 수정 여부 먼저 확인 — 해당하면 아래 단계를 전부 건너뛴다

다음 두 조건을 **모두** 만족하면 Workflow 호출(1~4단계 전체) 없이 오케스트레이터가 직접
처리한다:

1. **규모**: 변경 파일이 1~2개, diff가 대략 10줄 이내로 예상된다.
2. **명백성**: 원인과 수정 내용을 조사 없이 바로 설명할 수 있다 (예: 오탈자, 상수 하나 조정,
   조건 연산자 하나 수정처럼 원인-결과가 1:1로 명확한 버그 수정). 원인이 불확실하거나 영향
   범위가 여러 파일·여러 기능에 걸치면 해당하지 않는다.

확신이 없으면 안전하게 아래 유형 판정으로 넘어간다 — jam-reviewer가 판정을 확신하지
못할 때 FAIL 쪽으로 기우는 것과 같은 원칙이다.

해당하면:
- 오케스트레이터가 직접 구현한다 (jam-developer 위임 없음, review 브랜치도 없음 — 리뷰어가
  없으므로 머지할 대상 자체가 없다).
- 변경 파일에 한해 `npx eslint <파일>`로 최소 검증한다. 전체 `npm run lint`는 생략한다 — push
  시점 `.githooks/pre-push`가 전체 lint를 기계적으로 재검증한다.
- 1번 규칙대로 티켓은 반드시 남긴다 (`status: OPEN`으로 생성 후 완료 기록 작성, CLOSED 처리는
  기존과 동일하게 사용자 승인 후 오케스트레이터가 한다).
- staging에 직접 commit한다.

해당하지 않으면 아래 유형 판정으로 진행한다.

### 0.1.5 경로 3단 분기

0.1의 경미 수정에 해당하지 않으면 아래 세 경로 중 하나로 진행한다. **카리나가 유형 판정 때
경로를 정해 사용자에게 먼저 알린다.**

| 경로 | 대상 | 절차 | Workflow 인자 |
|---|---|---|---|
| ① 경미 | 파일 1~2개·10줄 이내, 원인·수정이 명백 | 0.1절 — 카리나 직접, Workflow 호출 없음 | 해당 없음 |
| ② 가벼운 UI | 로직 변경 없는 스타일·문구 수정이고 고칠 내용이 티켓에 확정됨 | 아현 → 민지 (채원①·② 생략) | `route: 'light'` |
| ③ 표준 | 그 외 전부 | 채원① → 아현 → 민지 → 채원② | 생략(기본값) |

경로 ②는 `ui`·`ds` 유형이어도 채원①·②를 건너뛴다는 점에서 0.2절의 유형별 분기표와 다르다 —
`route: 'light'`가 유형 판정보다 우선한다. 확신이 없으면 경로 ③으로 기운다(경미 판정과 같은
원칙).

### 0.2 유형 자동 판정

인자로 유형이 주어지면(`/jam-work ui`) 그대로 쓴다. **없으면 요청 내용으로 판정하고,
작업 시작 전에 "○○ 유형으로 진행합니다"라고 사용자에게 먼저 알린다.** (사용자가 바로잡을 수 있도록)

### 유형별 파이프라인 분기표

**디자인 파이프라인** — 채원① 사전 판정 → 구현 → 게이트 리뷰(민지)·채원② 사후 리뷰 **동시 실행**
(diff가 15줄 미만이면 채원②는 생략된다 — 아현이 보고하는 `devResult.diffLineCount` 기준)

| 유형 | 대상 | 추가 절차 | 티켓 카테고리 |
|---|---|---|---|
| `ui` | 서비스 화면·기능 | 채원①·② (워크플로가 자동 호출) | UI / Feature |
| `ds` | MODULAR 디자인 시스템 | 채원①·② + Story 동반 확인. 채원①이 **연결 범위**를 함께 판정한다 | UI |

**일반 파이프라인** — 구현 → 게이트 리뷰

| 유형 | 대상 | 추가 절차 | 티켓 카테고리 |
|---|---|---|---|
| `bug` | 버그 수정 | 회귀 재현 경로 집중 | Service / Feature |
| `engine` | 배지·드랍 엔진 | ④ 엔진 문서 대조 (확률·정책). 민지는 시뮬레이터 검증 결과를 근거로 판정한다 | BadgeEngine |
| `db` | DB 스키마·마이그레이션 | **SQL 파일 작성만, 실행은 4단계.** 확장→전환→축소 분할·되돌림 SQL 규칙의 단일 원천은 `.claude/skills/jam-work/references/db-migration-rules.md` — 여기서는 반복하지 않는다 | Infra |
| `api` | API 라우트 | ① PRD 갱신 트리거 | API |

**라이트** — 구현 → 게이트 리뷰

| 유형 | 대상 | 추가 절차 | 티켓 카테고리 |
|---|---|---|---|
| `content` | 컨텐츠 데이터(배지·아이템북·POI) | ③ 컨텐츠 문서 동기화 | Content |
| `copy` | UX Writing 문안 | 가이드라인 전수 점검 | Content |
| `admin` | 어드민 화면 | **MODULAR 적용 제외** (탐색 생략). 실렌더 검증은 `DEV_PROCESS_GUARDRAILS.md` 패턴 13(로컬 `ADMIN_EMAILS` 셸 환경변수)으로 한다 — staging 배포까지 미루지 않는다 | Admin |
| `infra` | 환경·배포·설정 | 설정 파일 단일성 확인 | Infra |

**단독** — 서브에이전트 없이 오케스트레이터가 직접 수행

| 유형 | 대상 | 절차 | 티켓 카테고리 |
|---|---|---|---|
| `docs` | 문서 정리·체계 갱신 | `/jam-docs` 규칙 적용 | 해당 영역 카테고리 |
| `research` | 조사·감사·보고서 (코드 무변경) | 조사 후 티켓에 결과 기록. 다시 쓸 결론은 티켓에만 두지 않고 `docs/specs/`·`jam-doc/planning/`의 해당 문서로 환류한다 | 해당 영역 카테고리 |

> 유형은 **파이프라인 라우팅 키**, 티켓 카테고리는 **문서 분류 키**로 축이 다르다.
> 카테고리 8종(Admin·Service·Feature·Content·BadgeEngine·Infra·UI·API)은 `/jam-docs` 참조.

## 1. 사전 준비 (모든 유형 공통, 위임하지 않음)

1. `docs/tickets/`에서 유사·관련 티켓 검토 (재구현 방지, 미채택 대안 확인)
2. `_TEMPLATE.md` 형식으로 신규 티켓을 `status: OPEN`으로 생성.
   파일명 `YYYYMMDD_HHMM_[카테고리]_[제목].md` — **모든 유형에서 티켓을 만든다.**
   `HHMM`은 **티켓을 만드는 시각(KST)** 이다. 기존 파일을 훑어 번호를 계산하지 않는다(시각은
   조회 없이 정해지므로 병렬 세션과 경합하지 않는다).
   **우선순위(P0~P3)도 함께 판정**해 frontmatter `priority:`를 채우고 `docs/tickets/
   p{0-3}-{라벨}/` 폴더 안에 만든다 (기준은 `/jam-docs` 참조). `- 관련 파일:`에는 경로만이
   아니라 고칠 함수 이름·대략 줄 위치(지도)까지 적는다 — 아현이 탐색 없이 그 구간을 연다.
3. **규모 사전 판정**: 「관련 파일」에 적은 파일 수와 예상 변경 줄 수를
   `.claude/skills/jam-work/references/stop-conditions.md`의 `plan_only` 임계값과 견준다. 넘길
   것 같으면 아현을 부르기 전에 둘 중 하나를 한다 — (a) 티켓을 쪼갠다 (b) 「구현 계획」을 파일
   단위(경로 + 함수명·줄 위치)로 적고 **첫 호출부터** `planOnlyWaiver`에 사유를 넣는다(면제
   조건 (a)(b)를 이 시점에 충족시킨다). 아현의 `plan_only`는 이 판정이 빗나갔을 때만 발동하는
   안전망이다 — 아현이 탐색만 하고 돌아온 뒤 면제를 받아 같은 탐색을 다시 하는 왕복을 여기서
   막는다.
4. 티켓 경로와 사용자 요청 원문을 다음 단계 컨텍스트로 준비

### 1.5 UI 판정은 채원이 한다 (위임한다)

**오케스트레이터가 직접 MODULAR을 탐색하지 않는다.** `ui`·`ds` 유형이면 Workflow의 첫 단계에서
채원(`jam-designer`) 모드 ①이 재사용/확장/서비스 전용을 판정하고, 쓸 컴포넌트·토큰, 텍스트
배치도, 상태 목록, 완료 조건, 승인 필요 항목까지 반환한다. `ds` 유형이면
`.claude/skills/jam-work/references/ds-connection-scope.md` 기준 **연결 범위**도 함께 판정한다.

- 같은 화면에 대한 **이전 판정이 이미 있으면** 그 내용을 `reuseDecision` 인자로 넘긴다.
  값이 있으면 채원①을 건너뛰고 그 판정을 그대로 쓴다 (중복 호출 방지). `reuseDecision`은
  Workflow가 이전에 반환한 `designDecision` 객체를 그대로 넣는다 — 채원①이 구조화 출력
  (`StructuredOutput`)으로 반환하므로 문자열로 옮겨 적지 않는다.
- 채원①이 `needsApproval: true`를 반환했으면(새 토큰·새 컴포넌트·눈에 보이는 변경), Workflow가
  아현을 호출하지 않고 **여기서 자동으로 멈춘다** (`stoppedAt: '채원 사전 판정'`). 이 판단은 표
  안 글자 검색이 아니라 스키마 필드(`needsApproval`)로 내려진다. 카리나는 `needsApprovalItems`를
  사용자에게 그대로 보고하고 승인 여부를 묻는다. 승인되면 `reuseDecision`에 `designDecision`을
  넣어 Workflow를 다시 호출한다(채원①은 건너뛰고 아현부터 이어서 돈다). 거절되면 티켓 방향을
  다시 논의한다.
- 판정 결과는 승인 후 처리 단계에서 티켓 완료 기록에 남긴다.

## 2. Workflow 호출

`docs`·`research` 유형은 이 단계를 건너뛰고 오케스트레이터가 직접 수행한다.

파이프라인 스크립트는 `.claude/workflows/jam-work.js`에 있다. `Workflow` 도구를 아래처럼 호출한다.

```
Workflow(name: 'jam-work', args: { ticketPath, userRequest, workType, reuseDecision, retryReason, retryBranch, route, planOnlyWaiver, batch, gateOnly, branch, commitRange, devResult })
```

- `name`은 `.claude/workflows/`의 사전 정의 워크플로를 가리킨다. 파일 경로로 직접 지정하려면
  `scriptPath: '.claude/workflows/jam-work.js'`를 쓴다(`scriptPath`가 `name`보다 우선한다).
- `args`는 스크립트에 전역 `args`로 그대로 노출된다. 문자열화하지 말고 실제 JSON 값으로 넘긴다.
- `ticketPath`·`workType`은 0~1단계 값으로 채운다.
- `userRequest`는 **짧게 줄인다** — 티켓 경로와 한 줄 지시면 충분하다("이 티켓을 읽고 구현을
  진행하라" 정도). 아현·민지 등은 정의상 `핵심 요약` 절부터 읽으므로 요청문에 상세 요구사항을
  다시 풀어 쓸 필요가 없다. 예외: 티켓에 없는 추가 지시(재시도 시 구체적 수정 방향 등)가 있을
  때만 그 지시를 덧붙인다.
- `reuseDecision`은 **선택**이다. 같은 화면에 대한 이전 채원 사전 판정이 있을 때, 또는 채원①의
  `needs_approval`을 사용자가 승인했을 때 그 내용을 넣는다. 없으면 비운다(비우면 워크플로가
  채원①을 호출한다).
- `retryReason`은 최초 실행 시 비우고, 재시도 시에만 이전 재작업 사유(`reworkReasons`)를 넣는다.
- `retryBranch`도 최초 실행 시 비우고, 재시도 시에만 직전 시도의 review 브랜치명
  (`devResult.branch`)을 넣는다. 값이 있으면 아현이 새 브랜치를 만들지 않고 그 브랜치를
  체크아웃해 커밋을 이어서 쌓는다.
- `route`는 0.1.5절의 경로 값이다. 경로 ②(가벼운 UI)면 `route: 'light'`를 넘긴다 — 채원①·②를
  건너뛴다. 경로 ③(표준)이면 비운다(기본값).
- `planOnlyWaiver`는 **선택**이다. 비우면 워크플로가 아현 프롬프트에 "계획 반환 면제가 없다"는
  줄을 넣어, 크기 기준을 넘긴 아현이 구현하지 않고 `plan_only`로 멈춘다. 사유 문자열을 넣으면
  `계획 반환 면제: <값>` 줄이 대신 들어간다. 부여 조건은 1단계 3번과 `stop-conditions.md`에
  있다. 면제는 이 인자로만 넘긴다 — `userRequest`에 그 줄을 직접 적으면 "면제 없음" 줄과
  모순된다. 워크플로는 이전 실행을 기억하지 않으므로 재시도(`retryReason`·`retryBranch`)에도
  같은 면제가 필요하면 다시 넘긴다.
- `batch`는 **선택**이다. Workflow 스크립트는 파일시스템·Node API·`import()`를 쓸 수 없으므로
  하위 티켓 조회는 워크플로 밖에서 먼저 한다: `node scripts/batch-tickets.mjs <상위 티켓 ID>`를
  실행해 하위 티켓 목록(JSON: `parentTicket`, 티켓별 `id`·`path`·`status`·`category`·
  `workType`·`sequence`를 담은 `subTickets`, `plannedStopAt`)을 얻는다. 그 출력 객체를 그대로
  `batch` 인자에 넣어 Workflow를 호출하면, 워크플로는 `subTickets` 중 `status: 'OPEN'`인 것만
  순서대로 표준 파이프라인(채원①→아현→민지∥채원②)에 태운다 — 워크플로는 `docs/tickets/`를 읽지
  않고 받은 목록만 실행한다. 기본은 비움(단일 티켓 모드) — 사용자가 상위 티켓 분해안을 승인하며
  "묶음 실행"을 명시했을 때만 스크립트를 먼저 돌려 채운다.
  정지 조건(`stop-conditions.md`)에 걸리면 그 하위 티켓에서 멈추고 이후 하위 티켓은 실행하지
  않는다 — 결과에는 그때까지 처리한 티켓별 결과와 `tokenUsage`(`tokenUsageByTicket`, 티켓 ID로
  나뉨)가 담긴다. `db`·`engine` 유형의 하위 티켓, 또는 유형을 자동으로 정할 수 없는 티켓은
  `batch-tickets.mjs`가 이미 `plannedStopAt`으로 알려준다 — 워크플로는 그 지점 앞에서 실행하지
  않고 멈춘다(정지 조건 3번). 그 티켓은 단독 호출로 사용자 확인을 받는다.
  **머지는 순차로 한다.** 하위 티켓의 review 브랜치는 모두 `origin/staging`에서 분기하므로,
  앞 하위 티켓을 머지한 뒤에는 `origin/staging`이 바뀐다 — 4단계 머지 전 오염 검사
  (`git merge-base --is-ancestor origin/staging <브랜치>`)를 다음 하위 티켓마다 다시 실행한다.
  실패하면(뒤 티켓이 옛 `origin/staging` 기준으로 분기해 최신 커밋을 조상으로 물지 않음) 그
  티켓만 `git fetch origin staging && git rebase origin/staging`으로 재분기시킨 뒤 다시 push
  하게 하고, 나머지 절차는 그대로 4단계를 따른다.
- `gateOnly`는 **선택**이다. 좁은 재작업(적용 조건은 3.1절 "게이트만 재실행" 참고)일 때
  채원①·아현을 건너뛰고 민지(와 해당 시 채원②)만 다시 부른다. `true`면
  `ticketPath`·`branch`·`commitRange`(`baseSha..commitSha`)·`devResult`(카리나가 적은 패치
  요약 — 아현이 반환하던 `summary` 형식과 같다. 문자열 또는 `{ summary, diffLineCount }`
  객체 둘 다 받는다)가 필수다. 하나라도 비면 워크플로가 오류로 멈춘다. 반환 스키마는 표준
  경로와 같다(`gate`·`designReview`·`needsRework`·`tokenUsage`) — `tokenUsage`에
  `jam-developer` 항목은 없고 `orchestrator-patch: 0`으로 아현을 부르지 않았음을 명시한다.
  기본은 비움(단일 티켓 모드).
- **드라이런**은 `node scripts/batch-tickets.mjs <상위 티켓 ID>`를 Workflow 호출 없이 그
  출력만 보는 것이다 — 실측 전 목록·순서·정지 예정 지점을 먼저 확인하고 싶으면 스크립트만
  실행해 결과를 사용자에게 보여주고, 그 단계에서는 Workflow를 부르지 않는다.
- 스크립트를 고쳐야 하면 `.claude/workflows/jam-work.js`를 직접 편집한 뒤 다시 호출한다
  (같은 세션에서 이어 돌릴 때는 `resumeFromRunId`를 함께 넘긴다).

## 3. 결과 보고 — 예외 신호 처리를 포함한다

**`node scripts/batch-tickets.mjs <상위 티켓 ID>`만 실행했을 때(Workflow 호출 전, 드라이런)**:
Workflow를 아직 부르지 않았으므로 3.0~3.1절 판정 처리는 없다. 출력의 `subTickets`(티켓별
`id`·`path`·`status`·`category`·`workType`·`sequence`)를 그대로 사용자에게 표로 보여주고,
`plannedStopAt`이 있으면 어느 하위 티켓에서 왜 멈출 예정인지(db·engine 진입 또는 유형 미매핑,
정지 조건 3번) 알린다. `plannedStopAt`이 없으면 실제 실행 시(이 출력을 그대로 `batch` 인자에
넣어 Workflow 호출) 모든 OPEN 하위 티켓이 최소한 정지 조건 3번에는 걸리지 않고 파이프라인까지는
들어간다는 뜻이다 — 그 이후(게이트 FAIL·plan_only 등)는 실제로 돌려야 알 수 있다.

**`batch`로 Workflow를 호출했을 때**: 결과의 `results`(티켓 ID별 단일 티켓 결과 객체)와
`tokenUsageByTicket`을 받는다. `stoppedBatchAt`이 있으면 그 티켓에서 멈춘 이유가 담겨
있다 — 이미 끝낸 하위 티켓까지는 아래 3.0~3.1절대로 각각 보고·처리하고, 멈춘 티켓은 그
사유(정지 조건 번호)를 사용자에게 알린 뒤 다음 행동을 묻는다. `stoppedBatchAt`이 없으면
모든 하위 티켓이 끝까지 돈 것이다 — 마지막 하위 티켓까지 순서대로 3.1절 승인 절차를 밟는다.

### 3.0 구현 단계 중단 처리 (Workflow 결과 수신 직후, 판정 보고 전)

0. **`stoppedAt: '채원 사전 판정'`**: 채원①이 `needs_approval`에 항목을 올려 아현 호출 전에
   멈췄다는 뜻이다(1.5절). `needsApprovalItems`를 사용자에게 그대로 보고하고 승인 여부를 묻는다.
   승인되면 `reuseDecision: designDecision`으로 다시 호출한다.
1. **`stoppedAt: '구현'`**: 아현이 게이트 진입 전에 멈췄다는 뜻이다. `devStatus`별로:
   - `plan_only` — 작업이 크다. 판정 기준·면제 부여 조건의 단일 원천은
     `.claude/skills/jam-work/references/stop-conditions.md`다. 구현 계획을 사용자에게 보고하고
     **티켓을 쪼갤지** 묻는다. 승인되면 계획을 티켓 「구현 계획」에 옮기고(파일 경로 + 함수명·줄
     위치까지 — 2차 호출의 아현이 탐색 없이 그 구간을 바로 열도록), `userRequest`에도 넣고,
     승인 사실을 `planOnlyWaiver`에 넣어 다시 호출한다(면제가 없으면 아현이 또 멈춘다). 이
     경로에 오는 것 자체가 1단계 규모 사전 판정이 빗나갔다는 뜻이므로, 무엇을 놓쳤는지 「주요
     의사결정」에 한 줄 남긴다.
   - `needs_design` — UI 작업인데 채원 사전 판정이 없다. 유형 판정을 `ui`로 고쳐 다시 호출한다
     (그러면 워크플로가 채원①부터 돈다).
   - `halted` — `[중단]` 급 이상을 발견했다. **즉시 사용자에게 보고**하고 다음 행동을 묻는다.
2. **`alerts` 확인**: `[중단]` 항목이 있으면 게이트 결과와 무관하게 즉시 보고한다.
   `[참고]`·`[주의]`는 사용자 보고 시 별도 섹션으로 요약한다 (판정과 분리).
3. **확신도 확인**: `확신도: 낮음`이면 "아현이 낮은 확신을 표명했습니다 — 리뷰 진행 전에
   확인하시겠습니까?"라고 알린다.

### 3.1 판정별 후속

재작업 여부는 `needsRework` 하나로 판단한다 — 게이트 `FAIL` **또는** 채원② 중대 문제다.

- **재작업 (`needsRework: true`)**: `reworkReasons`를 그대로 보고하고 재시도 여부를 **사용자에게
  묻는다.** 임의 재시도 금지. 승인받아 재시도할 때는 `reworkReasons`를 `retryReason`에, 직전
  `devResult.branch`를 `retryBranch`에 넣어 다시 호출한다 (같은 실수 반복 방지, 아현이 기존
  review 브랜치를 이어받는다).
  **동일 티켓에서 재작업이 2회 연속 발생하면**, 재시도 전에 "워크플로우 규칙이나 티켓 스펙 자체에
  문제가 있을 수 있습니다 — 규칙을 검토할까요?"라고 먼저 묻는다 (정책 갱신 피드백 루프).
  - **게이트만 재실행(`gateOnly`)**: `reworkReasons`가 **파일 2개·10줄 이내로 고쳐지고, 로직
    판단이 새로 필요하지 않을 때만** 아현을 다시 부르지 않고 카리나가 직접 패치한다. 확신이
    없으면 아래 일반 재작업 경로(아현 재호출)로 기운다 — 경미 판정과 같은 원칙이다. 적용될
    때의 절차:
    1. 카리나는 **메인 트리에서 브랜치를 전환하지 않는다**(병렬 세션 공유). `git fetch origin
       <review 브랜치>`로 최신을 받은 뒤 `git worktree add -b <임시 브랜치> .claude/worktrees/
       <이름> origin/<review 브랜치>`로 임시 워크트리를 만들어 그 안에서만 패치·커밋한다
       (`claude/jamwork-*` 이름은 쓰지 않는다 — pre-push가 그 이름의 staging push를 막는다).
    2. 커밋 후 같은 review 브랜치 이름으로 `git push`한다.
    3. 끝나면 임시 워크트리를 제거한다(`git worktree remove`).
    4. `Workflow(name: 'jam-work', args: { gateOnly: true, ticketPath, workType, branch:
       '<review 브랜치>', commitRange: '<patch 전 baseSha>..<patch 후 commitSha>', devResult:
       '<무엇을 왜 고쳤는지 요약>' })`로 호출해 민지(와 `ui`·`ds` 유형이고 diff 15줄 이상이면
       채원②)만 판정받는다.
    적용 조건을 벗어나면(파일 3개 이상, 10줄 초과, 원인 조사가 필요한 로직 판단) `gateOnly`를
    쓰지 않고 아래 일반 재작업 경로로 아현을 다시 부른다.
- **WARN**: WARN 사유를 사용자에게 알리되, 사후 단계는 정상 진행한다.
  사용자가 WARN 사유에 대해 추가 조치를 원하면 그때 처리한다.
- **PASS**: 구현 요약 + PASS 근거 + 아현의 `문서 갱신안` + 채원② 제안을 한 번에 요약하고,
  **머지 승인 여부를 명시적으로 묻는다.**
- **채원② 사후 리뷰**(`designReview`가 있을 때): 중대 문제가 없으면 "디자인 리뷰 제안" 섹션으로
  `proposals`와 `promotionCandidates`를 요약한다. 제안형이라 머지를 막지 않는다.
  `designReview`가 `null`이면 diff 규모(15줄 미만) 또는 유형 때문에 생략됐다는 사실을 밝힌다 —
  필요하면 사용자가 수동으로 요청할 수 있다.
- **한국어 자연스러움**(민지 체크리스트 12번, `copy`·`ui`·`content` 유형이고 사용자 노출
  문구가 있었을 때): 이건 별도 리뷰 단계가 아니라 게이트 판정 자체의 일부다. 지적됐으면
  `reasons`·`checked`에 이미 포함되어 있으므로 그대로 요약하면 된다. 판정에 실질적으로
  영향을 주므로(FAIL/WARN 사유가 될 수 있음) 사용자에게 별도로 "제안형"이라고 안내하지
  않는다.

### 3.2 범위 밖 발견물 처리 — 자동 티켓화

민지의 `sideFindings`(위험을 줄이는 개선점 포함)와 채원②의 `proposals`·`promotionCandidates` 중
이번 티켓에서 처리하지 않을 항목이 있으면, **승인 없이 항목마다 자동으로** 1번 규칙대로
`status: OPEN` 티켓을 만든다 — 카테고리·우선순위(P0~P3)는 내용으로 판단해 frontmatter에 채우고
해당 우선순위 폴더에 생성한다(기준은 `/jam-docs` 참조). 민지 `sideFindings`의 `[축/신호]` 접두는
우선순위 기본값을 준다 — 중단은 P1, 주의는 P2, 참고는 P3(내용을 보고 조정할 수 있다).
`spawn_task`는 쓰지 않는다 — 같은 발견물을 칩과 티켓 두 곳에서 동시에 추적하지 않기 위함이다.

개선 리뷰 단계는 없다. 개선점은 전부 이 경로로만 들어온다.

사용자 보고 시 "범위 밖 발견물" 섹션에 생성된 티켓 경로를 우선순위와 함께 나열한다.

## 4. 승인 후 처리 — 카리나가 직접 처리한다 (위임하지 않음)

1. review 브랜치(`claude/jamwork-*`)를 **staging에 머지**한다 (push는 아직 하지 않는다 —
   아래 「staging push는 티켓당 한 번」 참고)
   - **머지 전에 반드시 오염 여부를 확인한다**:
     `git fetch origin staging && git merge-base --is-ancestor origin/staging claude/jamwork-{ticket-id}-{slug}`
     종료 코드가 0이 아니면(= review 브랜치가 최신 `origin/staging` 위에서 분기하지 않음) 머지를
     멈추고 사용자에게 경위를 보고한다 — 다른 진행 중 티켓의 미승인 커밋을 조상으로 물고 들어왔을
     가능성이 있다.
   - **CI 상태도 함께 확인한다**: `gh run list --branch claude/jamwork-{ticket-id}-{slug} --limit 1`로 최근 실행을,
     `gh run view <run-id>` 또는 `gh api repos/{owner}/{repo}/commits/{sha}/check-runs`로 결과를
     본다. 상태가 없거나 실패면 머지를 멈추고 원인을 먼저 본다 — 민지 점검표 1번과 같은 기준이다.
2. 아현이 브랜치에서 직접 고친 문서를 확인한다. `docs/`와 `jam-doc/`이 한 저장소에 있으므로
   1번의 머지에 문서 변경까지 함께 들어온다. 카리나가 따로 반영하거나 별도로 커밋할 일은 없다
   - 민지가 점검표 11번에서 문서 누락을 지적했거나 아현이 빠뜨린 문서가 보이면, 이 시점에
     `/jam-docs` 규칙에 맞게 직접 보완한다
3. 티켓을 `status: CLOSED`로 변경하고 완료 기록 작성 (`ui`·`ds` 유형이면 채원① 판정 결과와
   연결 범위도 함께 기록). Workflow 결과의 `tokenUsage`(에이전트별 출력 토큰)를 완료 기록에
   함께 남긴다. **전체 토큰(입력 포함)·소요 시간·에이전트 수는 Workflow 완료 알림의 `<usage>`
   블록(`subagent_tokens`·`duration_ms`·`agent_count`)에서 그대로 옮겨 적는다** — 이 값이 티켓
   간 비교의 기준 수치다. **`_TEMPLATE.md`의 「실행 지표」 고정 표를 채운다**(헤더는 템플릿과
   글자 단위로 일치시킨다). 재작업이 있으면 실행 행을 추가하고 마지막 행은 `합계`로 둔다 —
   `scripts/ticket-metrics.mjs`가 이 헤더로 티켓을 찾아 주간 집계를 낸다.
4. jam-developer가 SQL 마이그레이션 파일을 남겼다면 **이 시점에** 사용자 승인 하에 직접 실행
   (jam-developer는 파일 작성까지만 했음)
5. 1~4가 모두 끝난 뒤 **`git push origin staging`을 한 번만** 실행한다 (문서 변경도 같은
   저장소에 있으므로 이 push 한 번으로 함께 올라간다)
6. 프로덕션 반영은 `/jam-ship`으로 별도 진행 — main 머지는 사용자 명시 승인이 있을 때만

### 4.1 staging push는 티켓당 한 번

**커밋할 때마다 push하지 않는다.** `origin/staging`에 push할 때마다 Vercel이 배포를 하나
만들고, 그게 곧 Build CPU 청구다.

- 구현 커밋·문서 갱신·티켓 CLOSED를 **로컬에 다 쌓은 뒤** 마지막에 한 번 push한다
- review 브랜치(`claude/jamwork-*`) push는 종전대로 자유롭게 한다 — `ignoreCommand`가
  프로덕션 대상이 아닌 배포를 전부 차단하므로 빌드가 돌지 않는다
- staging 배포를 눈으로 확인해야 하는 티켓은 **확인이 필요한 시점에만** push한다.
  확인 후 나오는 수정·문서 커밋은 다시 묶어서 한 번에 올린다
- 예외: 병렬 세션이 같은 파일을 건드리고 있어 먼저 올려두는 편이 안전할 때. 이때는
  사유를 사용자에게 한 줄로 알린다

**문서만 바꾼 push는 빌드를 만들지 않는다** — `jam-web/` 밖(`docs/`·`.claude/` 등)만
바뀐 구간은 `ignoreCommand`가 건너뛴다. 판정 기준은 직전 커밋이 아니라 **직전에 실제로 빌드한
커밋**이라, 한 push에 코드 커밋과 문서 커밋이 섞여도 코드 변경을 놓치지 않는다
(`jam-web/scripts/vercel-ignore.sh`).

## 참고 — 절차에 필요한 사실만

- 서브에이전트는 `.claude/agents/`에 **영어로** 정의돼 있고 fresh context로 스폰된다. 정의는
  영어, 출력은 한국어다. 모델은 각 정의의 `model` 키로 고정되며, 모드별로 다른 모델을 쓰는
  에이전트(채원·윈터·카즈하·하니)는 호출부가 `model` 옵션으로 덮어쓴다. 한국어 출력·티켓 우선
  검토 같은 규칙은 정의에 들어 있으므로 프롬프트에서 반복할 필요는 없지만, **티켓 경로·작업
  유형·요청 원문은 반드시 전달**해야 한다.
- `CLAUDE.md`는 서브에이전트 호출마다 자동으로 포함되며 선택 제외는 불가능하다 — 그래서 그
  파일에는 전원에게 필요한 규칙만 둔다.
- 이 스킬 호출 자체가 Workflow 툴 사용에 대한 명시적 opt-in이다.
- `copy`·`ui`·`content` 유형의 한국어 문구는 **구현 단계**에서 아현이
  `.claude/output-styles/fluent-korean.md` 지침을 따라 쓰고, **게이트 리뷰**에서 민지가
  체크리스트 12번으로 자연스러움을 판정한다(판정에 실질적으로 영향, `docs/specs/SLOP_DICTIONARY.md`
  §4 기준). 패턴 매칭 가능한 금칙어·금지 문장은 `scripts/check-slop.mjs`가 `verify.sh` 단계에서
  먼저 기계적으로 거른다.
- 민지의 점검표 12개 항목 중 유형에 해당하지 않는 항목은 `해당없음`으로 처리한다 — 표는
  `jam-reviewer.md`의 「Checklist」 절에 있다.
- 채원② 사후 리뷰의 점검표는 `.claude/skills/jam-design/references/ui-review-checklist.md`다.
  라이팅 품질은 게이트(민지)가 담당하므로 점검표에서 의도적으로 뺐다.
- 채원②는 `devResult.diffLineCount`(아현이 `git diff --numstat`으로 잰 jam-web 변경 라인 수)가
  `SMALL_DIFF_LINE_THRESHOLD`(15) 미만이면 건너뛴다. 값이 없으면 안전하게 실행 쪽으로 기운다.
  민지(게이트)와 채원②는 둘 다 아현의 결과만 참조하므로 전역 `parallel()`(배리어, 실패한 작업은
  null)로 동시에 호출한다 — 그래서 실행 여부는 병렬 시작 **전에** 알 수 있는 아현의 값으로
  정한다. 민지가 FAIL이어도 채원②는 계속 진행되며 그 결과는 참고용이다. 두 호출이 동시에
  진행돼 `tokenUsage`에는 `gate+jam-designer-post` 하나로 합산해 기록한다. 채원②의 모델은 `ds`
  유형만 Sonnet, 나머지는 Haiku다(파급 범위 기준).
- 기계 검사는 `scripts/verify.sh` 하나로 통합됐다(lint·typecheck·test·ds:check·slop 등). 아현이
  제출 전에 직접 돌리고, 리뷰 브랜치 push는 CI(GitHub Actions `verify`)가 같은 검사를 돌려
  결과를 커밋 상태로 남긴다. `wf_*` 워크트리에서의 리뷰 브랜치 push는 pre-push가 verify를
  건너뛰고 CI에 맡긴다(기준 방어 검사는 그대로 걸린다). 아현은 CI를 기다리지 않고 반환하며,
  민지가 판독 마지막에 CI 상태를 확인하고 상태가 없을 때만 직접 재실행한다.
- `jam-web`의 `npm run lint`·`lint:ci`는 ESLint 캐시(`--cache`)를 쓴다. `npm run typecheck`는
  `.next/types` 캐시를 먼저 지우고 `tsc --noEmit`을 돌린다 — 지우고도 남는 에러는 실제 타입
  에러다.
- **토큰 측정**: `jam-work.js`의 `tokenUsage`는 `budget.spent()` 전후 차이로 잰 에이전트별
  **출력 토큰**만 담는다. 전체 토큰·소요 시간·에이전트 수는 Workflow 완료 알림의 `<usage>`
  블록에서 옮겨 적는다(4단계 3번).
- **워크트리 최신성**: `isolation: 'worktree'`의 격리 워크트리는 **기본 브랜치(main) 기준으로
  생성된다.** staging에만 있는 변경은 보이지 않으므로 아현의 첫 명령은 `git fetch origin
  staging && git checkout --detach origin/staging`이다(`jam-work.js`가 프롬프트에 넣는다).
  민지·채원②에게는 아현이 push한 `baseSha..commitSha`를 `jam-work.js`가 그대로 넘긴다 — 두
  에이전트는 그 고정된 두 커밋 사이의 diff만 보므로 워크트리의 `origin/staging` 참조가 뒤처져
  있어도 결과가 흔들리지 않는다. 아현이 범위를 채우지 못한 예외 상황에서만 "먼저 `git fetch
  origin staging`을 실행하라"는 폴백을 쓴다.
- **스킬 라우팅 평가** (선택 실행): `scripts/skill-eval-cases.json`에 요청 문장 → 기대
  스킬·기대 유형 사례가 있다. 카리나가 요청받았을 때만 돈다 — `verify.sh`에는 넣지 않는다.
  절차: ① 각 `.claude/skills/*/SKILL.md`의 frontmatter `description`을 모은다. ② Haiku
  서브에이전트를 불러 그 설명문 목록과 사례의 `request`를 주고, 각 사례마다 가장 맞는 스킬(과
  `jam-work`면 0.2절 유형)을 판정시켜 `{ id, predictedSkill, predictedWorkType }` 배열을 받는다.
  ③ 그 배열을 JSON 파일로 저장하고 `node scripts/skill-eval.mjs <파일 경로>`로 사례와
  대조한다 — 일치율(스킬·유형 각각)과 틀린 사례 목록이 나온다. 틀린 사례는 해당 스킬의
  `description`을 고치는 티켓으로 분리한다(설명문에 실제 사용자 어휘가 빠졌다는 뜻이다 — 사례
  문장을 스킬에 끼워 맞추지 않는다).
