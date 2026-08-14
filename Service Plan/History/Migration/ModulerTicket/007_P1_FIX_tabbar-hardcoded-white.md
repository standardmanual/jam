---
id: DS-007
status: CLOSED
severity: P1
type: FIX
category: Token / Color / Component
---

# DS-007 — TabBar 배경색 하드코딩 흰색

## Problem
`TabBar.jsx`의 배경이 `'#ffffff'`로 하드코딩되어 있다. DS v2는 다크 테마(흑색 캔버스)를 기반으로 하는데, TabBar만 흰색으로 고정되어 있어 의도적인 선택인지 오류인지 불명확하다. 향후 테마 토큰이 변경되어도 TabBar는 자동으로 따라오지 않는다.

## Evidence
```jsx
/* TabBar.jsx L58 */
<nav style={{
  ...
  background: '#ffffff',          /* 하드코딩 흰색 */
  boxShadow: 'inset 0 0 0 1px var(--color-border)',  /* border는 토큰 사용 — 불일치 */
}}>
```

## Reference
기존 DS의 TabBar(`jam-web/src/components/ui/TabBar.tsx`)도 흰색 배경을 사용하지만, 이는 라이트 테마 DS이기 때문이다. v2는 다크 테마이므로 `--color-bg-inverse`를 쓰거나 TabBar 전용 semantic 토큰이 필요하다.

## Recommendation
TabBar는 다크 캔버스 위에 "밝은 섬"으로 떠 있는 디자인이다 — 이것이 의도라면 토큰으로 표현해야 한다.

**Option A — 기존 semantic 토큰 사용**
```jsx
background: 'var(--color-bg-inverse)',   /* --color-base-white = #ffffff */
```

**Option B — TabBar 전용 토큰 추가**
```css
/* colors.css */
--color-surface-nav: var(--color-base-white);   /* 네비게이션 표면 */
```
```jsx
background: 'var(--color-surface-nav)',
```

Option A가 단순하고 즉시 해결 가능. Option B는 의미를 더 명확히 함.

## Impact
- `TabBar.jsx`만 영향 — 시각적 변화 없음 (값은 동일하게 #ffffff)
- 테마 전환 시 자동으로 따라오는 구조가 됨
- `--color-surface-nav` 추가 시 `colors.css` 변경

## Risk
- 시각적 변화 없음 (리팩토링에 가까운 수정)
- `--color-bg-inverse`를 TabBar에 쓰면 의미론적으로 "역전된 배경"인데, 이것이 TabBar의 본질과 맞는지 팀 검토 필요

## Acceptance Criteria
- [ ] TabBar 배경에 `'#ffffff'` 리터럴 없음
- [ ] `var(--color-bg-inverse)` 또는 semantic 토큰 참조
- [ ] 시각적 결과는 이전과 동일 (흰색 배경 유지)
- [ ] 토큰을 변경하면 TabBar 배경이 자동으로 반영됨

---
## 완료 기록
- **날짜**: 2026-08-14
- **구현**: TabBar.jsx 배경 `'#ffffff'` → `var(--color-bg-inverse)` 교체. 시각 결과 동일, 테마 연동 구조로 전환.
- **변경 파일**: `design-system-staging/v2/components/navigation/TabBar.jsx`
- **채택 옵션**: Option A (--color-bg-inverse) — 단순, 즉시 해결
