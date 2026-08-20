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
| `ui` | 서비스 화면·기능 | **0.5단계 탐색·재사용 판정 필수** | UI / Feature |
| `ds` | MODULAR 디자인 시스템 | 0.5단계 + Story 동반 확인 | UI |
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

## 2. Workflow 호출

`docs`·`research` 유형은 이 단계를 건너뛰고 오케스트레이터가 직접 수행한다.

```js
export const meta = {
  name: 'jam-work',
  description: 'JAM! 개발자/리뷰어 분리 파이프라인',
  phases: [{ title: '구현' }, { title: '게이트 리뷰' }, { title: '개선 리뷰' }],
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

return { devResult, gate, progressive }
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

### 3.2 범위 밖 발견물 처리

gate 또는 progressive의 `sideFindings`가 비어있지 않으면:
- 사용자 보고 시 "범위 밖 발견물" 섹션으로 별도 요약한다
- 사용자 승인 후 `spawn_task`로 각 발견물을 별도 작업 칩으로 분리한다

## 4. 승인 후 처리 — 베이스캠프 모자를 쓴다 (위임하지 않음)

1. review 브랜치(`claude/jamwork-*`)를 **staging에 머지**하고 `git push origin staging`
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
