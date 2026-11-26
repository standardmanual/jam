# 현황판 — 생성 방식

> 현황판은 **저장 파일 없이 매번 즉석 생성**한다 — 커밋 파일이 없으니 병렬 세션 충돌도 없다.

## 생성 방식

세션 시작 hook(`.claude/settings.json`의 `SessionStart`)이 `scripts/ticket-dashboard.mjs`를
실행해 그 출력을 카리나에게 바로 전달한다. 스크립트는 `docs/tickets/`의 frontmatter를
훑어 `OPEN`·`IN_PROGRESS`·`WAITING` 티켓 목록을 stdout에 출력할 뿐, 파일에 쓰지 않는다.

- **진행 중**: `status: OPEN` 또는 `IN_PROGRESS`인 티켓.
- **승인 대기**: `status: WAITING`인 티켓.
- 우선순위·id 순으로 정렬해 `- [상태] 우선순위 id — 제목` 형식으로 출력한다.
- 뒤이어 `docs/agents/orchestrator.md`의 "카리나 카드"(`CARD:START`~`CARD:END` 마커 사이)를
  그대로 출력한다. 원본은 `orchestrator.md` 한 곳에 유지한다.

"최근 결정 · 다음 할 일" 같은 수동 메모 구간은 두지 않는다. 티켓 상태와 티켓 본문의 "결정 기록"이
그 역할을 대신한다(공통 규칙 20번). 이 문서는 `scripts/ticket-dashboard.mjs`의 계약만 정의한다.
