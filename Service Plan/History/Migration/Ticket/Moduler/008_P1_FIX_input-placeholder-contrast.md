---
id: DS-008
status: CLOSED
severity: P1
type: FIX
category: Accessibility / Token / Color
---

# DS-008 — Input placeholder 색상 미정의 (WCAG AA 실패 가능)

## Problem
`Input.jsx`가 `::placeholder` 색상을 정의하지 않아 브라우저 기본값을 사용한다. 대부분의 브라우저 기본 placeholder 색상(Chrome: rgba(0,0,0,0.54) ≈ #767676, Firefox: rgba(0,0,0,0.4) ≈ #999999)은 `--color-bg-tint(#1a1a1a)` 위에서 WCAG AA 4.5:1을 충족하지 못한다. v2가 수고스럽게 `--color-text-secondary`를 4.6:1로 올렸는데, placeholder가 그 아래 수준이면 의미가 없다.

## Evidence
```jsx
/* Input.jsx — ::placeholder 정의 없음 */
<input
  style={{
    color: 'var(--color-text)',
    background: 'var(--color-bg-tint)',
    /* placeholder 색상 미지정 → 브라우저 기본값 사용 */
  }}
/>
```
브라우저 기본 placeholder는 흑색 계열 + 40~54% opacity → 다크 배경 위에서 너무 어둡거나 대비 부족.

## Reference
기존 DS(`jam-web/src/app/globals.css`)에도 placeholder 색상 정의 없음 — 기존 DS는 라이트 배경이라 우연히 통과했지만 v2 다크 배경에서는 문제가 된다.

## Recommendation
`styles.css`에 전역 placeholder 규칙을 추가한다.

```css
/* styles.css */
::placeholder {
  color: var(--color-text-secondary);   /* #b2b2b2 — 4.6:1 on dark bg (WCAG AA) */
  opacity: 1;                           /* Firefox는 기본 opacity 0.54를 적용하므로 명시 필요 */
}
```

`--color-text-secondary`는 이미 WCAG AA 기준(4.6:1)으로 올려진 토큰이므로 바로 재사용 가능하다.

## Impact
- `styles.css`에 전역 규칙 추가 — Input 외에도 placeholder를 쓰는 모든 요소에 적용
- Textarea 추가 시 자동으로 적용됨

## Risk
- `opacity: 1` 명시가 기존 placeholder 스타일링과 충돌하는 경우 거의 없음
- DS 소비자가 직접 placeholder 색상을 지정했다면 해당 규칙이 specificity로 이길 수 있음 (문제 없음)

## Acceptance Criteria
- [ ] `::placeholder` 색상이 `var(--color-text-secondary)` 참조
- [ ] `opacity: 1` 명시 (Firefox 대응)
- [ ] 다크 배경(`--color-bg-tint`) 위에서 placeholder 대비 4.5:1 이상 확인
- [ ] Input, Textarea(추가 예정) 모두 동일 스타일 적용

---
## 완료 기록
- **날짜**: 2026-08-14
- **구현**: `styles.css`에 전역 `::placeholder` 규칙 추가. `color: var(--color-text-secondary)` + `opacity: 1` (Firefox 기본값 override).
- **변경 파일**: `design-system-staging/v2/styles.css`
