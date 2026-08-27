---
id: DS-027
status: CLOSED
severity: P3
type: FIX
category: Implementation Integrity
---

# DS-027 — `WanderingEyesLoader.d.ts` 기본값 주석 구버전

## Problem
DS-023에서 `WanderingEyesLoader.jsx`의 `eyeColor`/`pupilColor` 기본값이 DS 토큰으로 교체됐으나, `.d.ts` JSDoc 주석은 여전히 구버전 hex 값(`#f8fafc`, `#0f172a`)을 표시.

## Evidence
```ts
/** 흰자 색상 — default "#f8fafc" */  /* 실제: var(--color-bg-inverse) */
/** 눈동자 색상 — default "#0f172a" */  /* 실제: var(--color-text-inverse) */
```

## Impact
- `.d.ts` 주석만 변경

## Acceptance Criteria
- [x] JSDoc 주석이 실제 구현 기본값(`var(--color-bg-inverse)`, `var(--color-text-inverse)`)을 반영

## 완료 기록
- **구현**: `WanderingEyesLoader.d.ts` eyeColor/pupilColor JSDoc default 값 수정
- **변경 파일**: `components/feedback/WanderingEyesLoader.d.ts`
- **배포**: 2026-08-14, design-system-staging/v2
