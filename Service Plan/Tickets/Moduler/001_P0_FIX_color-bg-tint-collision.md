---
id: DS-001
status: CLOSED
severity: P0
type: FIX
category: Token / Color
---

# DS-001 — `--color-bg-tint`와 `--color-surface` 토큰 값 충돌

## Problem
`--color-bg-tint`와 `--color-surface`가 동일한 값(`--color-base-grey-800 = #1a1a1a`)을 참조하고 있어, Card `default` tone과 `tint` tone이 시각적으로 구별되지 않는다. 토큰 이름이 다른 의미를 의도하지만 실제로는 동일한 색상을 렌더링한다.

## Evidence
```css
/* tokens/colors.css */
--color-bg-tint: var(--color-base-grey-800);   /* #1a1a1a */
--color-surface: var(--color-base-grey-800);   /* #1a1a1a — 동일 값 */
```
```jsx
/* Card.jsx */
default: { background: 'var(--color-surface)', ... },
tint:    { background: 'var(--color-bg-tint)', ... },  /* 눈에 보이는 차이 없음 */
```

## Reference
기존 DS(`jam-web/src/app/globals.css`)에는 `--color-main`과 `--color-sub`가 명확히 다른 역할로 분리됨. v2에서 `tint`는 "약간 밝은 표면"을 의미해야 하나 값이 동일해 의미가 없다.

## Recommendation
`--color-bg-tint`에 별도 base 색상을 할당한다. `#222222` 또는 신규 `--color-base-grey-750: #222222`를 추가하고 참조를 교체한다.

```css
--color-base-grey-750: #222222;   /* 새 base 추가 */
--color-bg-tint: var(--color-base-grey-750);   /* surface보다 명도 높음 */
```

## Impact
- `Card tone="tint"` — 배경색이 달라져 시각적으로 구별됨
- `--color-bg-tint`를 참조하는 다른 컴포넌트(`Input.jsx` background) 외관 변화
- base palette에 grey-750 추가

## Risk
- Input 배경이 현재 `--color-bg-tint`를 사용 중 → 밝아지는 시각 변화 발생
- 기존 스크린샷/디자인 시안과 색상 불일치 가능성

## Acceptance Criteria
- [ ] Card `tone="default"`와 `tone="tint"`가 나란히 놓였을 때 시각적으로 구별됨
- [ ] `--color-bg-tint !== --color-surface` (값이 다름)
- [ ] Input 배경이 tint 변경 후에도 border와 충분한 대비를 가짐
- [ ] `--color-base-grey-750` 추가 시 base palette 주석에 명도 위치 명기

---

## 완료 기록

- **날짜**: 2026-08-14
- **구현**: `tokens/colors.css`에 `--color-base-grey-750: #222222` 추가, `--color-bg-tint`를 `var(--color-base-grey-750)`로 교체하여 `--color-surface(#1a1a1a)`와 명확히 분리됨
- **변경 파일**: `design-system-staging/v2/tokens/colors.css`
- **AC 충족**: Card default/tint 시각적 구별됨, 토큰 값 분리 완료
