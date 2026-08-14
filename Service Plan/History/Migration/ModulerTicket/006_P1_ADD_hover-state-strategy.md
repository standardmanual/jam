---
id: DS-006
status: OPEN
severity: P1
type: ADD
category: State / UX / Architecture
---

# DS-006 — Hover state 전략 수립 및 구현

## Problem
DS v2의 모든 컴포넌트가 inline style 방식을 사용하므로 CSS `:hover` pseudo-selector를 적용할 수 없다. 데스크탑 포인팅 환경에서 Button, Card, IconButton 등 모든 인터랙티브 요소에 hover 피드백이 전혀 없다. 요소가 클릭 가능한지 아닌지를 hover로 확인하는 사용자 패턴을 완전히 차단한다.

## Evidence
```jsx
/* Button.jsx — hover 처리 없음 */
<button style={{ cursor: 'pointer', ... }}>

/* Card.jsx — onClick 있어도 hover 없음 */
<div onClick={onClick} style={{ cursor: 'pointer', ... }}>

/* styles.css — focus-visible만 있고 hover 없음 */
*:focus-visible { outline: 2px solid var(--color-primary); }
button:active:not(:disabled) { transform: scale(var(--scale-press)); }
/* button:hover { ... } — 없음 */
```

## Reference
기존 DS(`jam-web/src/`)는 Tailwind를 사용하므로 `hover:` prefix로 hover가 자연스럽게 처리됨. v2에서 Tailwind를 제거하면서 대안 없이 hover 자체가 사라졌다.

## Recommendation
`styles.css`에 전역 hover 레이어를 추가한다. 두 가지 방식 중 선택:

**Option A — 전역 opacity 방식 (권장, 단순)**
```css
/* styles.css */
button:hover:not(:disabled),
[role="button"]:hover,
a:hover {
  opacity: 0.82;
  transition: opacity var(--duration-micro) ease;
}
```
장점: 컴포넌트별 코드 변경 없음. 단점: 모든 버튼이 동일한 hover 표현.

**Option B — 컴포넌트별 CSS class 방식**
각 컴포넌트에 `className`을 추가하고 `styles.css`에 `.ds-btn:hover`, `.ds-card--interactive:hover` 정의.
장점: 컴포넌트별 맞춤 hover. 단점: 컴포넌트 수만큼 코드 변경 필요.

P1 수준에서는 Option A로 빠르게 해결하고, P2에서 Option B로 세분화 권장.

## Impact
- `styles.css` 추가 — 모든 `<button>`, `[role="button"]`, `<a>` 자동 적용
- Card, IconButton, TabBar 버튼에 자동으로 hover 피드백 생김
- `disabled` 상태는 기존 `opacity: 0.4`와 충돌하지 않음 (`:not(:disabled)` 가드)

## Risk
- 기존에 `opacity`를 명시한 컴포넌트(예: loading 상태 `opacity: 0.4`)와 누적될 경우 시각 변화
- `@media (hover: none)`으로 터치 전용 기기에서 hover 효과 제외 권장 (터치 기기에서 hover가 stuck되는 현상 방지)

## Acceptance Criteria
- [ ] Button hover 시 시각적 피드백이 발생함 (opacity 변화 또는 다른 방식)
- [ ] `disabled` 버튼은 hover 효과 없음
- [ ] 터치 기기(`@media (hover: none)`)에서 hover 효과가 발생하지 않음
- [ ] active (press) 효과와 hover 효과가 충돌하지 않음
- [ ] Card `onClick` 있는 경우 hover 효과 적용됨
