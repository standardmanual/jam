---
id: DS-014
status: CLOSED
severity: P1
type: IMPROVE
category: Token / Typography
---

# DS-014 — Typography tracking 토큰 이원화 (통합 vs 개별 병존)

## Problem
`typography.css`에 통합 tracking 토큰 3종(`--tracking-heading`, `--tracking-label`)과 per-scale 개별 토큰(`--tracking-h1: -1.4px`, `--tracking-h2: -1.1px`, `--tracking-h3: -0.28px`, `--tracking-h4: -0.24px`, `--tracking-bold-display: -2px`, `--tracking-bold-lg: -1px`)이 혼재한다. 소비자가 어느 것을 써야 하는지 불명확하고, 두 계층이 병존하면 유지보수 시 하나만 수정하고 다른 하나를 놓치는 상황이 발생한다.

## Evidence
```css
/* typography.css — 개별 per-scale 정의 */
--text-h1: 56px;  --tracking-h1: -1.4px;
--text-h2: 44px;  --tracking-h2: -1.1px;

/* 통합 역할 토큰도 별도 존재 */
--tracking-heading: -0.8px;   /* h3/h4 level용 */
--tracking-label: 0.4px;      /* uppercase labels용 */
```
`RarityBadge.jsx`, `ShapeTag.jsx`는 `--tracking-label`을 사용하고, `TopNav.jsx`는 `--tracking-h4`를 사용 — 같은 DS 내에서 서로 다른 계층을 사용한다.

## Reference
기존 DS는 Tailwind의 `tracking-*` 유틸리티만 사용 — 별도 tracking 토큰 체계 없음. v2에서 새롭게 설계한 개념이므로 방향성을 명확히 해야 한다.

## Recommendation
방향 결정 후 일원화한다.

**Option A — per-scale 개별 토큰 중심 (권장)**
각 텍스트 스케일(`--text-h1`, `--text-h2` 등)에 tracking이 내장되어 있으므로, 역할 토큰(`--tracking-heading`)을 제거하고 개별 토큰만 유지한다. 사용이 명확하고 사이즈별 세밀 조정이 가능하다.

```css
/* 제거 */
/* --tracking-heading: -0.8px; */

/* 유지 */
--tracking-h3: -0.28px;
--tracking-h4: -0.24px;
--tracking-label: 0.4px;   /* uppercase label은 스케일과 독립적이므로 유지 */
```

**Option B — 역할 토큰 중심**
개별 토큰을 역할 토큰의 alias로 교체. `--tracking-h1: var(--tracking-heading-xl)` 등으로 계층화.

단기적으로 Option A가 단순하고 기존 컴포넌트 변경이 없어 권장.

## Impact
- `typography.css` 토큰 정리
- 제거하는 토큰(`--tracking-heading`)을 현재 참조 중인 컴포넌트 확인 후 per-scale 토큰으로 교체

## Risk
- 서비스 코드가 `--tracking-heading`을 직접 참조하는 경우 값 무효화

## Acceptance Criteria
- [ ] tracking 토큰의 사용 계층이 단일화됨 (개별 or 역할, 혼재 없음)
- [ ] `typography.css` 주석에 "어느 토큰을 써야 하는가" 가이드 명시
- [ ] 모든 컴포넌트가 결정된 단일 계층의 토큰만 참조

---
## 완료 기록
- **날짜**: 2026-08-14
- **구현**: `--tracking-heading: -0.8px` 제거(어떤 컴포넌트에서도 미참조 확인). per-scale 토큰(`--tracking-h1~h4`, `--tracking-bold-*`)만 유지. `--tracking-label` 예외 유지(역할 기반, 사이즈 독립적). typography.css 주석에 사용 가이드 명시.
- **변경 파일**: `design-system-staging/v2/tokens/typography.css`
- **채택 옵션**: Option A (per-scale 중심)
