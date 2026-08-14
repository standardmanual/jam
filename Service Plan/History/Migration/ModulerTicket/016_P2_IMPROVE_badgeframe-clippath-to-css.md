---
id: DS-016
status: OPEN
severity: P2
type: IMPROVE
category: Component / Architecture
---

# DS-016 — BadgeFrame JS clipPath → CSS clip-path 이관

## Problem
`BadgeFrame.jsx`가 JS로 clipPath를 계산해 SVG `<clipPath>` 요소를 동적으로 생성한다. CSS `clip-path` 속성으로 이관하면 GPU 합성 레이어를 활용할 수 있어 렌더링 성능이 향상되고, 코드가 단순해진다.

## Evidence
`BadgeFrame.jsx`는 수정 미진입 파일로, 원본(`project/`)에서 그대로 복사된 상태. 구체적 구현 방식은 파일 직접 확인 필요.

## Reference
기존 DS에 BadgeFrame 없음 — v2 신규 컴포넌트. CSS `clip-path: polygon(...)` 또는 `clip-path: path(...)` 사용 시 JS 계산 불필요.

## Recommendation
현재 JS로 계산하는 clipPath 값을 CSS `clip-path` 속성의 `polygon()` 함수로 직접 표현한다.

```jsx
/* Before (JS-computed) */
<svg><clipPath id={...}><polygon points={computedPoints} /></clipPath></svg>

/* After (CSS-only) */
<div style={{ clipPath: 'polygon(...)' }}>
  {children}
</div>
```
단, `clip-path: path()`는 Safari에서 지원이 제한적이므로 `polygon()`으로 표현 가능한 형태인지 먼저 확인.

## Impact
- `BadgeFrame.jsx`만 영향
- SVG `<clipPath>` DOM 요소 제거 → HTML 구조 단순화
- JS 계산 로직 제거

## Risk
- `clip-path: polygon()`이 기존 SVG clipPath와 픽셀 단위로 동일한 결과를 보장하는지 브라우저별 검증 필요
- Safari에서 `clip-path: path()` 미지원 — 곡선 포함 시 대안 필요
- 현재 BadgeFrame 구현 방식을 먼저 확인해야 리스크를 정확히 평가 가능 (수정 미진입 파일)

## Acceptance Criteria
- [ ] `BadgeFrame.jsx`에서 JS clipPath 계산 코드 제거
- [ ] CSS `clip-path` 속성으로 동일한 모양 재현
- [ ] Chrome, Safari, Firefox에서 시각적 결과 동일
- [ ] 렌더링 성능 측정: compositing layer 활성화 확인 (DevTools > Layers)
