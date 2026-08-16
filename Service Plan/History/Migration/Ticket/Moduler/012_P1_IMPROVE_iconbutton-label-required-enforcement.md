---
id: DS-012
status: CLOSED
severity: P1
type: IMPROVE
category: Accessibility / Component
---

# DS-012 — IconButton `label` 필수 prop 런타임 미검증

## Problem
`IconButton.d.ts`에서 `label: string`이 필수 prop으로 선언되어 있으나, JSX 구현(`IconButton.jsx`)에서는 `label`이 `undefined`여도 렌더링이 진행된다. TypeScript를 사용하지 않는 환경(plain JavaScript, `.jsx`)에서는 `label` 없이 사용해도 아무 경고 없이 `aria-label=""`인 버튼이 생성된다.

## Evidence
```jsx
/* IconButton.jsx L25 */
export function IconButton({ icon = 'chevron-left', label, onClick, surface = 'light', ...rest }) {
  return (
    <button aria-label={label} ...>  /* label이 undefined면 aria-label="" — WCAG 실패 */
```
```ts
/* IconButton.d.ts */
label: string;  /* required — 하지만 JSX에서는 강제되지 않음 */
```

## Reference
접근성 요구사항: WCAG 2.1 SC 4.1.2 — 모든 UI 컴포넌트는 이름(name)이 있어야 한다. `aria-label=""`는 이름이 없는 것과 동일하게 처리된다.

## Recommendation
JSX 내에서 런타임 경고를 추가한다.

```jsx
export function IconButton({ icon = 'chevron-left', label, onClick, surface = 'light', ...rest }) {
  if (process.env.NODE_ENV !== 'production' && !label) {
    console.warn('[DS] IconButton: `label` prop이 없습니다. 스크린리더 사용자가 이 버튼의 역할을 알 수 없습니다.');
  }

  return (
    <button
      aria-label={label || undefined}  /* 빈 문자열도 제외 */
      ...
    >
```

`aria-label={label || undefined}`로 빈 문자열을 방어하면 `aria-label` 자체가 없는 것보다 이름 없음 상태를 명확히 드러낸다.

## Impact
- `IconButton.jsx`만 변경
- 개발 환경에서만 console.warn 발생 — 프로덕션 영향 없음

## Risk
- 기존에 `label=""` 또는 `label={undefined}`로 사용 중인 코드가 있다면 경고 발생 → 수정 유도 목적으로 의도된 동작

## Acceptance Criteria
- [ ] `label` 없이 IconButton 사용 시 개발 환경 console.warn 출력
- [ ] `aria-label={label || undefined}` 방어 처리
- [ ] `label=""` (빈 문자열)도 경고 대상
- [ ] 프로덕션 빌드(`NODE_ENV=production`)에서는 경고 없음

---
## 완료 기록
- **날짜**: 2026-08-14
- **구현**: `IconButton.jsx`에 개발환경 console.warn 추가 (`label` falsy 시). `aria-label={label || undefined}` 빈 문자열 방어 처리.
- **변경 파일**: `design-system-staging/v2/components/buttons/IconButton.jsx`
