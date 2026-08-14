---
id: DS-019
status: OPEN
severity: P2
type: ADD
category: Token / Color / Architecture
---

# DS-019 — 라이트 테마 토큰 레이어 설계

## Problem
DS v2는 다크 전용 `:root` 토큰만 정의한다. 라이트 테마 지원이 전혀 없어 `@media (prefers-color-scheme: light)` 환경이나 명시적 `data-theme="light"` 적용 시 색상이 반전되지 않는다. TabBar의 흰색 배경처럼 이미 내부에 라이트 컬러가 섞여 있는데, 공식 라이트 테마가 없으니 혼재가 더 커진다.

## Evidence
```css
/* colors.css — 다크 전용, 라이트 오버라이드 없음 */
:root {
  --color-bg: var(--color-base-black);         /* 항상 검정 */
  --color-surface: var(--color-base-grey-800); /* 항상 어두운 표면 */
  /* @media (prefers-color-scheme: light) { ... } — 없음 */
  /* :root[data-theme="light"] { ... }          — 없음 */
}
```

## Reference
기존 DS(`jam-web/src/app/globals.css`)는 라이트 테마 기반이며 다크 테마 오버라이드가 없다. v2는 반대 방향. 향후 서비스에서 시스템 테마를 따르거나 사용자 테마 선택을 지원하려면 이 레이어가 필요하다.

## Recommendation
`colors.css`에 라이트 테마 오버라이드 블록을 추가한다.

```css
/* 라이트 테마 오버라이드 */
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --color-bg: var(--color-base-white);
    --color-bg-tint: var(--color-base-grey-200);
    --color-surface: var(--color-base-grey-200);
    --color-text: var(--color-base-black);
    --color-text-secondary: var(--color-base-grey-600);
    --color-border: rgba(0,0,0,0.12);
    /* rarity, tag 색상은 그대로 유지 (기능적 색상은 테마 무관) */
  }
}

:root[data-theme="light"] {
  /* 위와 동일한 오버라이드 */
}
```

## Impact
- `colors.css`에 오버라이드 블록 추가
- 모든 컴포넌트가 semantic 토큰을 올바르게 참조하고 있다면 자동으로 라이트 테마 지원
- TabBar 배경(DS-007 해결 후 토큰 참조 전환 시) 포함

## Risk
- 라이트 테마에서 rarity 색상의 대비 검증 필요 (`--color-rarity-common: #6b6b6b`는 흰색 배경에서 4.6:1 통과하는지 확인)
- 일부 컴포넌트가 여전히 리터럴 색상을 사용 중이라면 라이트 테마에서 부적절하게 렌더링됨 → DS-002(ShapeTag), DS-007(TabBar) 선행 완료 필요

## Acceptance Criteria
- [ ] `prefers-color-scheme: light` 환경에서 배경이 흰색, 텍스트가 검정으로 전환됨
- [ ] `data-theme="dark"` 명시 시 라이트 시스템 설정 무시하고 다크 유지
- [ ] `data-theme="light"` 명시 시 강제 라이트 적용
- [ ] 라이트 테마에서 rarity 색상 WCAG AA 대비 재검증
- [ ] DS-002, DS-007 선행 완료 후 진행
