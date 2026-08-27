---
id: DS-002
status: CLOSED
severity: P0
type: FIX
category: Token / Color / Component
---

# DS-002 — ShapeTag `textColor` 하드코딩 리터럴

## Problem
`ShapeTag.jsx`의 `textColor`가 `'#fff'` / `'#111'` 리터럴 값으로 하드코딩되어 있다. DS v2 전체에서 유일하게 남은 하드코딩 컬러이며, 토큰 체계 일관성을 깨뜨린다. 테마 변경 시 이 컴포넌트만 자동으로 따라오지 않는다.

## Evidence
```jsx
/* ShapeTag.jsx L38 */
const textColor = surface === 'dark' ? '#fff' : '#111';
```
반면 동일한 `surface` prop을 쓰는 Button은 토큰을 사용한다:
```jsx
/* Button.jsx */
dark: { primary: { color: 'var(--color-text-on-primary)' } }
/* IconButton.jsx */
const color = surface === 'dark' ? 'var(--color-bg-inverse)' : 'var(--color-text)';
```

## Reference
기존 DS에서도 텍스트 색상은 항상 CSS 변수로 참조. ShapeTag는 신규 DS에서만 존재하는 컴포넌트지만, 리터럴을 쓰면 안 된다는 원칙은 동일하다.

## Recommendation
`surface` 값에 따라 semantic token을 참조하도록 교체한다.

```jsx
const textColor = surface === 'dark'
  ? 'var(--color-text)'          /* 다크 배경 위 — 흰색 텍스트 */
  : 'var(--color-text-inverse)'; /* 밝은 배경 위 — 검정 텍스트 */
```

단, `#111`이 아닌 `--color-text-inverse`를 써야 진짜 토큰 기반이다. `--color-text-inverse`가 `--color-base-black(#000000)`이므로 시각 차이는 미미하다.

## Impact
- ShapeTag 텍스트 색상만 영향 — 다른 컴포넌트 영향 없음
- 라이트 테마 추가 시 자동으로 따라옴

## Risk
- `#111` → `#000000`으로 미세 색상 변화 (육안 식별 불가 수준)
- 영향 범위가 ShapeTag 한 컴포넌트로 제한됨 — 위험도 낮음

## Acceptance Criteria
- [ ] ShapeTag 코드에 `'#fff'`, `'#111'` 리터럴이 없음
- [ ] `surface="dark"` → `var(--color-text)` 참조
- [ ] `surface="light"` → `var(--color-text-inverse)` 참조
- [ ] DS 전체에서 리터럴 컬러 사용 컴포넌트가 0개

---

## 완료 기록

- **날짜**: 2026-08-14
- **구현**: `ShapeTag.jsx`의 `textColor` 리터럴 `'#fff'`/`'#111'`을 `var(--color-text)` / `var(--color-text-inverse)` semantic token으로 교체
- **변경 파일**: `design-system-staging/v2/components/cards/ShapeTag.jsx`
- **AC 충족**: DS 전체 리터럴 컬러 사용 컴포넌트 0개
