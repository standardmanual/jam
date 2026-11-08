---
id: "20261108_1854"
category: UI
priority: P3
status: OPEN
created: 2026-11-08
closed: ""
parent: "20261106_2322"
specs: []
---

# [UI] RarityBadge·BadgeLevelChip row 스토리의 높이 단정을 허용 오차로 바꾼다

## 핵심 요약

- 요구사항: `row` 크기를 더한 `20261106_2322`의 스토리 `RowSize`(`RarityBadge.stories.tsx`, `BadgeLevelChip.stories.tsx`)의 `play`가 `getBoundingClientRect().height`를 `toBe(20)`처럼 정확히 비교한다. 줄높이가 `var(--text-xs--line-height)`(`calc(1/0.75)`)라 부동소수 오차로 19.99처럼 나올 수 있다. `toBeCloseTo(20, 0)` 같은 허용 오차 비교로 바꾼다.
- 구현 계획: 두 스토리의 `play` 단정만 고친다. `sm`(16)·`md`(22)·`Lv.128` 폭(52) 단정도 같은 방식으로 본다.
- 관련 파일: `jam-web/design-system/components/cards/RarityBadge.stories.tsx`, `BadgeLevelChip.stories.tsx`(`RowSize`).
- 담당 에이전트: 카리나(경미 수정 판정), 필요하면 아현.

## 배경 / 문제 정의

`20261106_2322`의 채원 사후 리뷰가 제안했고 아현도 이 `play`를 Storybook에서 아직 실행하지 않았다고 보고했다. 처음 돌릴 때 값이 아니라 단정문 때문에 실패할 위험이 있다. 실제로 오차가 나는지는 확인하지 못했다. `20261106_2322`가 머지돼야 이 스토리가 staging에 들어오므로 그 뒤에 한다.

## 완료 조건

- 스토리 `play`의 높이·폭 단정이 허용 오차로 비교한다.
- Storybook에서 `RowSize` 스토리가 통과한다(실행 확인).

---
## 완료 기록 *(작업 후 작성)*
