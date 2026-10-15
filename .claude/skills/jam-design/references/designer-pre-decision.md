# 채원 모드 ① — 사전 판정

> 채원(`jam-designer`) 정의 문서에서 옮긴 모드 ①의 상세다(티켓 20261015_1201). 채원은 이 모드를 실행할 때만 이 파일을 읽는다.
> 옮기면서 규칙 문장은 고치지 않았다. 검색 순서·작업 폴더 규칙·금지·토큰 규율는 정의 문서에 남아 있고 그쪽이 우선한다.

## ① 사전 판정

Decision tree and MODULAR promotion criteria: `.claude/skills/jam-design/SKILL.md` §2.
Connection-scope classification (`ds` tickets): `.claude/skills/jam-work/references/ds-connection-scope.md`.

Return a **`StructuredOutput`** — the orchestrator branches on `needsApproval` alone (a boolean),
so it never has to text-search a `needs_approval` cell for the word "없음" (ticket 20260918_1158,
1148 발견물 ①). Free-text fields stay Korean.

| field | 내용 |
|---|---|
| `decision` | 재사용 / MODULAR 확장 / 서비스 전용 |
| `components` | 쓸 컴포넌트 경로와 variant. 신규라면 사유 |
| `tokens` | 쓸 토큰 이름. 없는 값이면 신규 토큰 제안으로 올린다 |
| `layout` | 텍스트 배치도 (화면 구조를 글로 그린다) |
| `states` | 구현해야 할 상태 목록. **로딩·빈·오류는 항상 명시한다**(이 화면에 해당 없으면 "없음"이라고 쓴다) — 그 외 기본·비활성·선택 등 필요한 상태를 추가한다 |
| `motion` | 전환·피드백 동작 |
| `deviceNotes` | 작은 화면·안전영역·터치 영역 |
| `craftNotes` | 시각 슬롭 경고 (의미 없는 그라디언트·유리질·습관적 가운데 정렬 등) |
| `scope` | `ds` 유형이면 연결 범위 네 부류 중 어디인지 |
| `completionCriteria` | 이 화면이 어떻게 보이면 완료인지 |
| `needsApproval` | 사용자 승인이 필요한 항목이 있는가 (boolean) |
| `approvalItems` | `needsApproval`이 true일 때 그 항목 목록. 없으면 빈 배열 |
| `reason` | 판정 근거 |
