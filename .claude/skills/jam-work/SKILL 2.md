---
name: jam-work
description: JAM! 프로젝트의 개발자/리뷰어 분리 워크플로우. 버그 수정·기능 개선 요청을 받아 티켓 검토 → jam-developer 구현 → conservative-reviewer(게이트) → progressive-reviewer(개선 제안) 순으로 진행하고, 사용자 최종 승인 후 merge·문서 갱신까지 처리한다. "/jam-work", "이 버그 고쳐줘 (풀 워크플로우로)", "리뷰 파이프라인으로 처리해줘" 같은 요청에 사용.
---

# /jam-work — JAM! 개발/리뷰 분리 워크플로우

이 스킬이 호출되면 아래 순서를 **그대로** 따른다. 각 단계의 책임 분리는 고정된 의사결정이므로 임의로 순서를 바꾸지 않는다.

> **크루 콜사인** (역할 정체성 — 실행 로직은 바뀌지 않음, 명칭·톤만 부여):
> 베이스캠프(오케스트레이터, 나 자신) · 레인저(PM/SOT, 나 자신이 겸함) ·
> 트레일메이커(jam-developer) · 체크포인트(conservative-reviewer) · 스카우트(progressive-reviewer)

## 0. 사전 준비 — 레인저 모자를 쓴다 (오케스트레이터 = 나 자신이 직접 수행, 위임하지 않음)

1. `Service Plan/History/Migration/Ticket/`에서 유사·관련 티켓을 먼저 검토한다 (재구현 방지, 미채택 대안 확인).
2. 없으면 `_TEMPLATE.md` 형식으로 신규 티켓을 `status: OPEN`으로 생성한다. 파일명: `YYYYMMDD_NNN_[카테고리]_[제목].md` (당일 최대 번호 확인 후 +1).
3. 티켓 파일 경로와 사용자 요청 원문을 다음 단계로 넘길 컨텍스트로 준비한다.

## 1. Workflow 호출 (개발 → 게이트 리뷰 → 개선 리뷰)

`Workflow` 툴로 아래 구조의 파이프라인을 실행한다 (pipeline 사용 — 이 흐름은 각 단계가 이전 단계 결과에 의존하는 순차 체인이라 barrier 불필요):

```js
export const meta = {
  name: 'jam-work',
  description: 'JAM! 개발자/리뷰어 분리 파이프라인',
  phases: [
    { title: '구현' },
    { title: '게이트 리뷰' },
    { title: '개선 리뷰' },
  ],
}

phase('구현')
const devResult = await agent(
  `티켓 문서: ${ticketPath}\n\n요청: ${userRequest}\n\n이 티켓을 읽고 구현을 진행하라.`,
  { agentType: 'jam-developer', label: 'jam-developer' }
)

phase('게이트 리뷰')
const gate = await agent(
  `티켓 문서: ${ticketPath}\n\n개발자 구현 요약:\n${devResult}\n\n스펙대로 동작하는지 판정하라.`,
  { agentType: 'conservative-reviewer', label: 'conservative-reviewer' }
)

let progressive = null
if (gate.includes('PASS')) {
  phase('개선 리뷰')
  progressive = await agent(
    `티켓 문서: ${ticketPath}\n\n개발자 구현 요약:\n${devResult}\n\n게이트 리뷰 결과(PASS):\n${gate}\n\n개선 제안·UX 라이팅·문서 갱신 필요 여부를 검토하라.`,
    { agentType: 'progressive-reviewer', label: 'progressive-reviewer' }
  )
}

return { devResult, gate, progressive }
```

- `ticketPath`, `userRequest`는 0단계에서 준비한 값을 그대로 문자열로 채운다.
- gate 결과가 FAIL이면 progressive-reviewer는 호출하지 않는다 (동작 안 하는 걸 개선 제안할 이유 없음).

## 2. 결과 정리 및 사용자에게 보고

Workflow 결과를 받으면:

- **FAIL인 경우**: FAIL 사유를 그대로 사용자에게 보고하고, 재시도할지(같은 파이프라인을 다시 돌릴지) 사용자에게 물어본다. 임의로 재시도하지 않는다.
- **PASS인 경우**: jam-developer의 구현 요약 + conservative-reviewer의 PASS 근거 + progressive-reviewer의 개선 제안/문서 갱신 제안을 한 번에 요약해서 사용자에게 제시하고, **merge 승인 여부를 명시적으로 묻는다.** (git push to main은 안전 규칙상 사용자 확인이 필요한 행동)

## 3. 사용자 승인 후 처리 — 베이스캠프 모자를 쓴다 (오케스트레이터 = 나 자신이 직접 수행, 위임하지 않음)

승인을 받으면:

1. jam-developer가 push한 review 브랜치(`claude/jamwork-{ticket-id}-*`)를 main으로 merge (또는 PR 생성 후 merge — 사용자에게 어느 쪽을 원하는지 확인).
2. `git push origin main`.
3. progressive-reviewer가 제안한 문서 갱신 항목을 CLAUDE.md 문서 체계(①~⑤)에 맞게 실제로 반영한다.
4. 티켓을 `status: CLOSED`로 변경하고 완료 기록(구현 요약/변경 파일/테스트 결과/배포 정보/의사결정/잔여 이슈)을 채운다.
5. jam-developer가 SQL 마이그레이션 파일을 남겼다면, 이 시점에 사용자 승인 하에 직접 실행한다 (jam-developer는 파일 작성까지만 했음을 상기할 것).

## 참고

- jam-developer/conservative-reviewer/progressive-reviewer는 `.claude/agents/`에 정의된 JAM! 프로젝트 전용 서브에이전트다. 세 에이전트 모두 fresh context로 스폰되므로, 한국어 출력·티켓 우선 검토 등 규칙은 각 에이전트 정의 파일 안에 이미 하드코딩되어 있다 — 프롬프트에서 다시 반복할 필요는 없지만, 티켓 경로와 요청 원문은 반드시 전달해야 한다.
- 이 스킬은 Workflow 툴 사용에 대한 명시적 opt-in으로 간주된다 (사용자가 `/jam-work`를 호출하는 것 자체가 동의).
