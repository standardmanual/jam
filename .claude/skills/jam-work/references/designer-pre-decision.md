# 채원 모드 ① — 사전 판정

채원(`jam-designer`)은 이 모드를 실행할 때만 이 파일을 읽는다.

## ① 사전 판정

Judge against the canonical list `docs/service/prd/ui-components/README.md`; its 「UI 규칙」 section is
the single source for what screen code may do. Pick one `decision`:

| decision | 언제 | 승인 |
|---|---|---|
| 재사용 | 목록의 정본을 조합하고 배치(위치·크기·간격)만 하면 화면이 된다 | 필요 없음 |
| 정본 변형 추가 | 목록의 정본에 prop·variant를 더하면 된다 | 필요 |
| 새 정본 | 조합으로도 변형으로도 안 된다 | 필요 |

- Reuse first; prefer a variant of the closest canonical component over a new one.
- A look tied to domain data (a badge card, a mission state) still belongs in
  `jam-web/src/components/ui/`; the screen keeps only the layout.
- Every new canonical component, variant or token goes into `approvalItems` with `needsApproval: true`,
  together with the closest listed alternative and what would change on screen if that alternative
  were used. A value no token covers is a new-token proposal, not a literal.

Return a **`StructuredOutput`** — the orchestrator branches on `needsApproval` alone (a boolean).
Free-text fields stay Korean.

| field | 내용 |
|---|---|
| `decision` | 재사용 / 정본 변형 추가 / 새 정본 |
| `components` | 쓸 정본 컴포넌트 경로와 variant. 변형·새 정본이면 사유 |
| `tokens` | 쓸 토큰 이름. 없는 값이면 신규 토큰 제안으로 올린다 |
| `layout` | 텍스트 배치도 (화면 구조를 글로 그린다) |
| `states` | 구현해야 할 상태 목록. **로딩·빈·오류는 항상 명시한다**(이 화면에 해당 없으면 "없음"이라고 쓴다) — 그 외 기본·비활성·선택 등 필요한 상태를 추가한다 |
| `motion` | 전환·피드백 동작 |
| `deviceNotes` | 작은 화면·안전영역·터치 영역 |
| `craftNotes` | 시각 슬롭 경고 (의미 없는 그라디언트·유리질·습관적 가운데 정렬 등) |
| `completionCriteria` | 이 화면이 어떻게 보이면 완료인지 |
| `needsApproval` | 사용자 승인이 필요한 항목이 있는가 (boolean) |
| `approvalItems` | `needsApproval`이 true일 때 그 항목 목록. 없으면 빈 배열 |
| `reason` | 판정 근거 |
