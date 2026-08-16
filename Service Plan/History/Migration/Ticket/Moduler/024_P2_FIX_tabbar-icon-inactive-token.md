---
id: DS-024
status: CLOSED
severity: P2
type: FIX
category: Component / Theming
---

# DS-024 — TabBar 비활성 아이콘 `rgba(0,0,0,0.35)` 토큰화

## Problem
`TabBar.jsx:78`의 비활성 아이콘 색상이 `rgba(0,0,0,0.35)`로 하드코딩되어 있다.
TabBar 배경이 `--color-bg-inverse`(흰색)로 교체된 DS-007 이후, 흰 배경 위에서는 시각적으로 작동하나 토큰 체계 밖에 있어 테마 일관성 위반이다.

## Evidence
```jsx
/* TabBar.jsx:78 */
<span style={{ color: isActive ? 'var(--color-primary)' : 'rgba(0,0,0,0.35)' }}>
```

## Recommendation
- `--color-icon-inactive` 시맨틱 토큰 신설 → `--color-base-grey-700` (#2a2a2a, #333333에 가장 가까운 기존 토큰) 참조
- 사용자 지정 색상: #333333. 기존 토큰 중 `--color-base-grey-700: #2a2a2a`가 최근접

## Impact
- `tokens/colors.css` + `TabBar.jsx` 변경

## Acceptance Criteria
- [x] `--color-icon-inactive` 토큰 추가 (`--color-base-grey-700` 참조)
- [x] `TabBar.jsx` `rgba(0,0,0,0.35)` → `var(--color-icon-inactive)` 교체

## 완료 기록
- **구현**: `tokens/colors.css`에 `--color-icon-inactive: var(--color-base-grey-700)` 추가, `TabBar.jsx:78` 교체
- **변경 파일**: `tokens/colors.css`, `components/navigation/TabBar.jsx`
- **배포**: 2026-08-14, design-system-staging/v2
