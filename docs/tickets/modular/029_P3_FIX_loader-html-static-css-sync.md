---
id: DS-029
status: CLOSED
severity: P3
type: FIX
category: Implementation Integrity
---

# DS-029 — `guidelines/loader.html` STATIC_CSS 구버전

## Problem
`guidelines/loader.html`의 STATIC_CSS 내 `eyeColor`/`pupilColor` CSS fallback이 구버전 hex 값(`#f8fafc`, `#0f172a`) 그대로. `WanderingEyesLoader.jsx`(DS-023)에서 업데이트된 DS 토큰과 불일치.

또한 컴포넌트 prop 기본값도 구버전(`eyeColor='#f8fafc'`)이 가이드라인에 노출됨.

## Impact
- 가이드라인 페이지가 소스 컴포넌트와 다른 동작을 보여줌
- 소비자 혼란 가능

## Acceptance Criteria
- [x] `loader.html` STATIC_CSS의 CSS fallback → `var(--color-bg-inverse)`, `var(--color-text-inverse)`
- [x] prop 기본값 → `var(--color-bg-inverse)`, `var(--color-text-inverse)`
- [x] `var(--color-text-tertiary)` (deprecated) → `var(--color-text-secondary)` 교체 (loader.html 내 추가 발견)

## 완료 기록
- **구현**: `loader.html` STATIC_CSS fallback 및 JSX prop 기본값 DS 토큰으로 교체. `var(--color-text-tertiary)` deprecated 사용도 함께 제거.
- **변경 파일**: `guidelines/loader.html`
- **배포**: 2026-08-14, design-system-staging/v2
