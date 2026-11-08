---
id: "20261108_1854"
category: UI
priority: P3
status: CLOSED
created: 2026-11-08
closed: 2026-11-08
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
## 완료 기록

### 구현 내용 요약

- `RarityBadge.stories.tsx`(3건)와 `BadgeLevelChip.stories.tsx`(4건)의 `RowSize` 스토리 `play`에서 `getBoundingClientRect().height`·`.width`를 `toBe(N)`으로 비교하던 단정을 `toBeCloseTo(N, 0)`으로 바꿨다(높이 20·16·22, 폭 52). 줄높이가 `calc(1/0.75)`라 부동소수 오차가 나도 실패하지 않는다.

### 변경된 파일
```
jam-web/design-system/components/cards/RarityBadge.stories.tsx
jam-web/design-system/components/cards/BadgeLevelChip.stories.tsx
```

### 테스트 결과
- **Storybook에서 두 `RowSize` 스토리를 직접 실행했다(로컬, Interactions 패널).** `RarityBadge`: PASS(`expect("12px").toBe("12px")`, `toBeCloseTo(20, 0)`·`(16, 0)`·`(22, 0)` 모두 통과). `BadgeLevelChip`: PASS(`"12px"`, `toBeCloseTo(20, 0)`·`(52, 0)`·`(16, 0)`·`(22, 0)` 모두 통과). eslint 통과.
- 허용 오차를 둔 단정이 실제로 오차 때문에 실패했는지는 확인하지 못했다(원래 `toBe`도 이 환경에서는 통과했을지 모른다). 이번 수정은 위험을 줄이는 변경이다.

### 주요 의사결정 / 핵심 메모
- 경미 수정(파일 2개, 단정 7줄)이라 직접 처리했다. 단독 `iframe`으로 스토리를 열면 `storybook/test` 스토어 오류가 나고 `data-testid` 요소가 칩이 아니라 감싸는 요소라 24px로 보이므로, 통과 여부는 Storybook 매니저의 Interactions 패널로 봐야 한다.

### 잔여 이슈
- 없음.

### 실행 지표

에이전트 0(경미 수정 판정, 카리나 직접 처리). 별도 토큰 집계 없음.
