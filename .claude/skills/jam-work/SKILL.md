---
name: jam-work
description: JAM! 프로젝트의 표준 개발 워크플로우. 버그 수정·기능 개선·디자인 시스템·컨텐츠·DB·문서 등 모든 작업 요청을 유형별로 라우팅해 티켓 검토 → 구현 → 게이트 리뷰 → 개선 리뷰 → 승인 후 머지·문서 갱신까지 처리한다. "/jam-work", "이거 고쳐줘", "이 기능 추가해줘", "리뷰 파이프라인으로 처리해줘" 같은 요청에 사용.
---

# /jam-work — JAM! 표준 작업 워크플로우

> **크루 콜사인**: 베이스캠프(오케스트레이터=나) · 레인저(PM/SOT, 나가 겸함) ·
> 트레일메이커(jam-developer) · 체크포인트(conservative-reviewer) · 스카우트(progressive-reviewer)

## 0. 유형 판정 — 레인저 모자를 쓴다 (위임하지 않음)

인자로 유형이 주어지면(`/jam-work ui`) 그대로 쓴다. **없으면 요청 내용으로 판정하고,
작업 시작 전에 "○○ 유형으로 진행합니다"라고 사용자에게 먼저 알린다.** (사용자가 바로잡을 수 있도록)

### 유형별 파이프라인 분기표

**풀 파이프라인** — 구현 → 게이트 리뷰 → 개선 리뷰

| 유형 | 대상 | 추가 절차 | 티켓 카테고리 |
|---|---|---|---|
| `ui` | 서비스 화면·기능 | **0.5단계 탐색·재사용 판정 필수** + 게이트 통과 후 **인터랙션 리뷰**(apple-design 기준, 제안형) | UI / Feature |
| `ds` | MODULAR 디자인 시스템 | 0.5단계 + Story 동반 확인 + **1.6단계(모듈러-서비스 연결 범위 표기) 필수** | UI |
| `bug` | 버그 수정 | 회귀 재현 경로 집중 | Service / Feature |
| `engine` | 배지·드랍 엔진 | ④ 엔진 문서 대조 (확률·정책) | BadgeEngine |
| `db` | DB 스키마·마이그레이션 | **SQL 파일 작성만, 실행은 5단계** | Infra |
| `api` | API 라우트 | ① PRD 갱신 트리거 | API |

**라이트** — 구현 → 게이트 리뷰 (개선 리뷰 생략)

| 유형 | 대상 | 추가 절차 | 티켓 카테고리 |
|---|---|---|---|
| `content` | 컨텐츠 데이터(배지·아이템북·POI) | ③ 컨텐츠 문서 동기화 | Content |
| `copy` | UX Writing 문안 | 가이드라인 전수 점검 | Content |
| `admin` | 어드민 화면 | **MODULAR 적용 제외** (탐색 생략) | Admin |
| `infra` | 환경·배포·설정 | 설정 파일 단일성 확인 | Infra |

**단독** — 서브에이전트 없이 오케스트레이터가 직접 수행

| 유형 | 대상 | 절차 | 티켓 카테고리 |
|---|---|---|---|
| `docs` | 문서 정리·체계 갱신 | `/jam-docs` 규칙 적용 | 해당 영역 카테고리 |
| `research` | 조사·감사·보고서 (코드 무변경) | 조사 후 티켓에 결과 기록 | 해당 영역 카테고리 |

> 유형은 **파이프라인 라우팅 키**, 티켓 카테고리는 **문서 분류 키**로 축이 다르다.
> 카테고리 8종(Admin·Service·Feature·Content·BadgeEngine·Infra·UI·API)은 `/jam-docs` 참조.

## 1. 사전 준비 (모든 유형 공통, 위임하지 않음)

1. `Service Plan/History/Migration/Ticket/`에서 유사·관련 티켓 검토 (재구현 방지, 미채택 대안 확인)
2. `_TEMPLATE.md` 형식으로 신규 티켓을 `status: OPEN`으로 생성.
   파일명 `YYYYMMDD_NNN_[카테고리]_[제목].md` (당일 최대 번호 +1) — **모든 유형에서 티켓을 만든다.**
3. 티켓 경로와 사용자 요청 원문을 다음 단계 컨텍스트로 준비

### 1.5 UI 탐색·재사용 판정 (`ui`·`ds` 유형만, 위임하지 않음)

구현을 위임하기 **전에** 오케스트레이터가 직접:

1. `jam-web/design-system/_ds_manifest.json` → `readme.md` 색인 → `**/*.stories.*` 순으로 탐색
2. `/jam-design` 스킬의 의사결정 트리로 **재사용 / MODULAR 확장 / 서비스 전용**을 판정
3. 판정 결과와 근거(재사용할 컴포넌트명 또는 신규 사유)를 **티켓에 기록**하고 구현 프롬프트에 포함

이 단계를 건너뛰면 jam-developer가 이미 있는 컴포넌트를 다시 만든다.

### 1.6 모듈러-서비스 연결 범위 표기 (`ds` 유형 필수, 위임하지 않음)

> `ui` 유형이라도 `design-system/`을 건드리면 이 절을 함께 적용한다
> (예: 서비스 화면용 신규 MODULAR 패턴을 등록하는 티켓).

**용어 정의** — "모듈러"는 `jam-web/design-system/`의 **소스코드**를 가리킨다. Storybook은
그 소스코드를 브라우저에서 훑어보기 위한 뷰어일 뿐 별도 실체가 아니다.

**스토리북 배포는 이미 자동화돼 있다** — `jam-web/package.json`의 `build`가 호출하는
`jam-web/scripts/build.mjs`가 **`VERCEL_ENV` 기준으로**(브랜치 기준이 아니다) 빌드를 가른다.

| `VERCEL_ENV` | 해당 환경 | 실행 단계 |
|---|---|---|
| `production` 이외 전부<br>(없음 / `preview` / `development`) | 로컬, staging 배포 | `storybook build` → `public/storybook` 복사 → `next build` |
| `production` | main 배포 | `next build`만 |

따라서 4단계에서 review 브랜치를 staging에 머지하고 `git push origin staging`하는 순간
Vercel이 staging을 재빌드하면서 스토리북도 함께 다시 구워져 배포된다. **별도의 "스토리북
배포" 단계를 추가할 필요가 없다.** 스토리북 확인은 staging 도메인
`https://jam-stage.vercel.app/storybook`에서 한다 — 프로덕션(`j-a-m.app`)에는 스토리북이
의도적으로 나가지 않으므로 `/storybook`이 404다.

**모듈러 변경은 실제 서비스 화면에도 반영된다** *(2026-08-23 실측 기준 — 2026-08-20까지는
"미연결"이었으나 이후 연결 작업이 진행됐다)*. 다만 컴포넌트마다 상태가 달라 **세 부류를
구분해야 한다.**

- **토큰 — 서비스에 즉시 반영.**
  `src/app/globals.css`가 `design-system/tokens/` 6종(colors·typography·spacing·radius·
  motion·materials)을 직접 `@import`한다. 토큰을 고치면 서비스 화면이 바로 따라온다.
  (`colors.light.css`만 의도적으로 제외 — 서비스는 다크 전용)

- **연결된 컴포넌트 9종 — 서비스에 즉시 반영.**
  서비스 27개 파일이 `@ds/*`를 **47건** import한다. 실사용 목록:
  `Button` · `IconButton` · `Card` · `RarityBadge` · `EmptyState` · `ProgressBar` ·
  `WanderingEyesLoader` · `Carousel` · `TopNav`

- **병존 구현 8종 — 스토리북에만 반영. ⚠️ 양쪽을 함께 고쳐야 한다.**
  `TabBar` · `BottomSheet` · `Toast` · `SlidingTabs` · `BadgeGridCard` ·
  `CollectionGridCard` · `ListRowCard` · `Skeleton`
  → `src/components/ui/`에 동명의 서비스 구현이 따로 있고 값만 수동으로 맞춰둔 상태다.
  DS만 고치면 서비스는 따라오지 않는다. 서비스 구현이 DS보다 기능이 많은 경우도 있으므로
  (`BottomSheet`의 드래그-투-클로즈, `Skeleton`의 cross-fade reveal) 단순 스왑도 위험하다.

- **미도입 8종 — 스토리북 전용.**
  `Checkbox` · `Input` · `Select` · `Textarea` · `ModalToast` · `ShapeTag` · `BadgeFrame` · `Accordion`
  → 서비스에 대응 개념이 없다. 티켓 20260820_010에서 "유지/보류"로 확정됐으므로 **새로
  도입하려면 별도 판단이 필요하다** (임의로 서비스에 끌어다 쓰지 말 것).

`ds` 유형 티켓은 완료 기록에 다음을 명시한다:
- 이번 변경이 위 네 부류 중 어디에 해당하는지 (토큰 / 연결된 컴포넌트 / 병존 구현 / 미도입)
- 서비스에 반영된다면 어떤 호출부가 영향받는지
- **병존 구현을 고쳤다면 `src/components/ui/`의 대응 파일도 함께 고쳤는지**

> 이 목록은 연결 작업이 진행될수록 바뀐다. 정확한 현황이 필요하면 실측할 것:
> `grep -rho "@ds/components/[a-zA-Z]*/[A-Za-z]*" src/ | sort -u`

## 2. Workflow 호출

`docs`·`research` 유형은 이 단계를 건너뛰고 오케스트레이터가 직접 수행한다.

```js
export const meta = {
  name: 'jam-work',
  description: 'JAM! 개발자/리뷰어 분리 파이프라인',
  phases: [{ title: '구현' }, { title: '게이트 리뷰' }, { title: '개선 리뷰' }, { title: '인터랙션 리뷰' }],
}

// 게이트 판정은 자유 텍스트가 아니라 구조화 출력으로 받는다.
// (FAIL 판정문 본문에 "PASS"라는 단어가 들어가도 오라우팅되지 않도록)
const VERDICT = {
  type: 'object',
  properties: {
    verdict: { enum: ['PASS', 'WARN', 'FAIL'] },
    reasons: { type: 'array', items: { type: 'string' } },
    checked: { type: 'array', items: { type: 'string' } },
    sideFindings: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'reasons'],
}

phase('구현')
const devResult = await agent(
  `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n요청: ${userRequest}\n` +
  `${reuseDecision ? `\nUI 재사용 판정(오케스트레이터 결정, 이대로 따를 것):\n${reuseDecision}\n` : ''}` +
  `${retryReason ? `\n이전 게이트 리뷰 FAIL 사유 — 반드시 해결할 것:\n${retryReason}\n` : ''}` +
  `\n이 티켓을 읽고 구현을 진행하라.`,
  { agentType: 'jam-developer', label: 'jam-developer' }
)

phase('게이트 리뷰')
const gate = await agent(
  `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n개발자 구현 요약:\n${devResult}\n\n` +
  `스펙대로 동작하는지 판정하라.`,
  { agentType: 'conservative-reviewer', label: 'conservative-reviewer', schema: VERDICT }
)

let progressive = null
// 라이트 유형(content·copy·admin·infra)은 개선 리뷰를 생략한다.
// WARN도 "동작은 한다"이므로 개선 리뷰는 진행한다 (사용자 알림은 3단계에서).
const FULL = ['ui', 'ds', 'bug', 'engine', 'db', 'api']
if ((gate.verdict === 'PASS' || gate.verdict === 'WARN') && FULL.includes(workType)) {
  phase('개선 리뷰')
  progressive = await agent(
    `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n개발자 구현 요약:\n${devResult}\n\n` +
    `게이트 리뷰 PASS 근거:\n${gate.reasons.join('\n')}\n\n` +
    `개선 제안·UX 라이팅·문서 갱신 필요 여부·MODULAR 승격 후보를 검토하라.`,
    { agentType: 'progressive-reviewer', label: 'progressive-reviewer' }
  )
}

let interactionReview = null
// 어드민은 admin 유형(별도 라이트 파이프라인)이라 여기 들어오지 않는다 — ui만 대상.
if ((gate.verdict === 'PASS' || gate.verdict === 'WARN') && workType === 'ui') {
  phase('인터랙션 리뷰')
  interactionReview = await agent(
    `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n개발자 구현 요약:\n${devResult}\n\n` +
    `.claude/skills/apple-design/SKILL.md를 읽고 그 기준(제스처 반응성, 스프링 곡선과 인터럽트 ` +
    `가능성, depth·재질감, 타이포그래피, reduced-motion 등)으로 이번 변경의 실제 git diff를 검토해 ` +
    `개선 제안을 제시하라. 이건 머지를 막는 게이트가 아니라 제안형 리뷰다 — PASS/FAIL 판정 없이 ` +
    `발견한 점과 제안만 나열하라.`,
    { agentType: 'general-purpose', label: 'interaction-reviewer' }
  )
}

return { devResult, gate, progressive, interactionReview }
```

- `ticketPath`·`userRequest`·`workType`·`reuseDecision`은 0~1.5단계 값으로 채운다.
- `retryReason`은 최초 실행 시 비우고, 재시도 시에만 이전 FAIL 사유를 넣는다.

## 3. 결과 보고 — 예외 신호 처리를 포함한다

### 3.0 구현 단계 예외 처리 (Workflow 결과 수신 직후, 판정 보고 전)

1. **HALT 알림 확인**: devResult에서 `alerts`를 파싱한다. `[HALT]`가 포함된 항목이 있으면
   게이트 리뷰 결과와 무관하게 **즉시 사용자에게 HALT 내용을 보고**하고 다음 행동을 묻는다.
2. **confidence 확인**: devResult에서 `confidence: low`이면 사용자에게
   "개발자가 구현에 낮은 확신을 표명했습니다 — 리뷰 진행 전에 확인하시겠습니까?"라고 알린다.
3. **INFO/WARN 알림**: 사용자 보고 시 별도 섹션으로 요약한다 (판정과 분리).

### 3.1 판정별 후속

- **FAIL**: `gate.reasons`를 그대로 보고하고 재시도 여부를 **사용자에게 묻는다.** 임의 재시도 금지.
  승인받아 재시도할 때는 **FAIL 사유를 `retryReason`에 넣어** 다시 호출한다 (같은 실수 반복 방지).
  **동일 티켓에서 FAIL이 2회 연속 발생하면**, 재시도 전에 "워크플로우 규칙이나 티켓 스펙 자체에
  문제가 있을 수 있습니다 — 규칙을 검토할까요?"라고 먼저 묻는다 (정책 갱신 피드백 루프).
- **WARN**: WARN 사유를 사용자에게 알리되, 개선 리뷰는 정상 진행한다.
  사용자가 WARN 사유에 대해 추가 조치를 원하면 그때 처리한다.
- **PASS**: 구현 요약 + PASS 근거 + 개선 제안/문서 갱신 제안을 한 번에 요약하고,
  **머지 승인 여부를 명시적으로 묻는다.**
- **인터랙션 리뷰**(`ui` 유형, `interactionReview`가 있을 때): 개선 제안과 별도 섹션
  "인터랙션 리뷰 제안"으로 요약한다. 제안형이라 판정에 영향을 주지 않으며, 머지 승인 여부와
  무관하게 참고용으로만 제시한다.

### 3.2 범위 밖 발견물 처리

gate 또는 progressive의 `sideFindings`가 비어있지 않으면:
- 사용자 보고 시 "범위 밖 발견물" 섹션으로 별도 요약한다
- 사용자 승인 후 `spawn_task`로 각 발견물을 별도 작업 칩으로 분리한다

## 4. 승인 후 처리 — 베이스캠프 모자를 쓴다 (위임하지 않음)

1. review 브랜치(`claude/jamwork-*`)를 **staging에 머지**하고 `git push origin staging`
   - **머지 전에 반드시 오염 여부를 확인한다**:
     `git fetch origin staging && git merge-base --is-ancestor origin/staging claude/jamwork-{ticket-id}-{slug}`
     종료 코드가 0이 아니면(= review 브랜치가 최신 `origin/staging` 위에서 분기하지 않음) 머지를
     멈추고 사용자에게 경위를 보고한다 — 다른 진행 중 티켓의 미승인 커밋을 조상으로 물고 들어왔을
     가능성이 있다 (jam-developer.md 5번, 티켓 20260820_019 사고 참고).
2. progressive-reviewer가 제안한 문서 갱신을 `/jam-docs` 규칙에 맞게 반영
3. 티켓을 `status: CLOSED`로 변경하고 완료 기록 작성
4. jam-developer가 SQL 마이그레이션 파일을 남겼다면 **이 시점에** 사용자 승인 하에 직접 실행
   (jam-developer는 파일 작성까지만 했음)
5. 프로덕션 반영은 `/jam-ship`으로 별도 진행 — main 머지는 사용자 명시 승인이 있을 때만

## 참고

- 세 서브에이전트는 `.claude/agents/`에 정의돼 있고 fresh context로 스폰된다. 한국어 출력·티켓 우선
  검토 같은 규칙은 각 정의 파일에 하드코딩돼 있으므로 프롬프트에서 반복할 필요는 없지만,
  **티켓 경로·작업 유형·요청 원문은 반드시 전달**해야 한다.
- 이 스킬 호출 자체가 Workflow 툴 사용에 대한 명시적 opt-in이다.
- 경미 수정(1파일·수 줄·로직 무변경, 예: 오타)은 파이프라인 없이 직접 처리해도 된다.
  단 티켓은 남긴다.
