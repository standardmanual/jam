---
id: DS-025
status: CLOSED
severity: P2
type: FIX
category: Theming
---

# DS-025 — ModalToast / BottomSheet 오버레이 `rgba(0,0,0,0.6)` 토큰화

## Problem
`ModalToast.jsx:70`과 `BottomSheet.jsx:58` 모두 `rgba(0,0,0,0.6)`를 backdrop 배경으로 하드코딩. 토큰 체계 밖에 있어 일관성 위반.

## Evidence
```jsx
/* ModalToast.jsx:70 */
background: 'rgba(0,0,0,0.6)'
/* BottomSheet.jsx:58 */
background: 'rgba(0,0,0,0.6)'
```

## Recommendation
`--color-overlay: rgba(0, 0, 0, 0.6)` 시맨틱 토큰 신설.

## Impact
- `tokens/colors.css` + `ModalToast.jsx` + `BottomSheet.jsx` 변경

## Acceptance Criteria
- [x] `--color-overlay` 토큰 추가
- [x] 두 컴포넌트 모두 토큰 참조로 교체

## 완료 기록
- **구현**: `tokens/colors.css`에 `--color-overlay: rgba(0, 0, 0, 0.6)` 추가, `ModalToast.jsx:70`, `BottomSheet.jsx:58` 교체
- **변경 파일**: `tokens/colors.css`, `components/feedback/ModalToast.jsx`, `components/navigation/BottomSheet.jsx`
- **배포**: 2026-08-14, design-system-staging/v2
