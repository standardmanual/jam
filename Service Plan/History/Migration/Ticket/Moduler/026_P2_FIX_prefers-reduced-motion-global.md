---
id: DS-026
status: CLOSED
severity: P2
type: FIX
category: Accessibility
---

# DS-026 — `prefers-reduced-motion` 전역 처리 누락

## Problem
WanderingEyesLoader만 자체적으로 `prefers-reduced-motion` 처리됨. 나머지 6개 애니메이션 컴포넌트(Skeleton, BottomSheet, Toast, SlidingTabs, Accordion, Checkbox)에 처리 없음 — WCAG 2.1 SC 2.3.3 위반.

## Evidence
- `styles.css` — 전역 처리 없음
- `Skeleton.jsx` — `ds-shimmer` animation
- `BottomSheet.jsx` — `ds-bottomsheet-in` animation
- `Toast.jsx` — transform + opacity transition
- `SlidingTabs.jsx` — background/color transition
- `Accordion.jsx` — grid-template-rows + transform transition
- `Checkbox.jsx` — background transition

## Recommendation
`styles.css`에 전역 reduced-motion 블록 추가. 0.01ms 패턴은 상태 변화를 보존하면서 지각적 모션을 제거하는 WCAG 권장 방식.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

WanderingEyesLoader의 자체 `animation: none` 규칙과 충돌 없음 — `animation-name: none`이 duration보다 우선.

## Impact
- `styles.css`만 변경

## Acceptance Criteria
- [x] `styles.css`에 전역 `prefers-reduced-motion` 블록 추가
- [x] WanderingEyesLoader 기존 규칙과 충돌 없음 확인 (animation-name:none이 duration보다 우선)

## 완료 기록
- **구현**: `styles.css` 말단에 `@media (prefers-reduced-motion: reduce)` 블록 추가, 0.01ms 패턴 적용
- **변경 파일**: `styles.css`
- **배포**: 2026-08-14, design-system-staging/v2
