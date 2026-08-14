---
id: DS-003
status: OPEN
severity: P0
type: FIX
category: Accessibility / Component
---

# DS-003 — Card `onClick` 키보드 접근성 부재

## Problem
`Card` 컴포넌트에 `onClick` prop이 제공될 때 `role="button"`, `tabIndex={0}`, `onKeyDown` 처리가 없다. 마우스로는 클릭 가능하지만 키보드 사용자는 Tab으로 포커스 자체가 이동하지 않으며, Enter/Space로 활성화도 불가능하다. WCAG 2.1 SC 2.1.1 (키보드), 4.1.2 (이름·역할·값) 위반.

## Evidence
```jsx
/* Card.jsx */
export function Card({ tone = 'default', children, className = '', style = {}, onClick, ...rest }) {
  return (
    <div
      onClick={onClick}         /* onClick 있어도 */
      style={{ ... }}
      {...rest}                 /* role, tabIndex, onKeyDown 없음 */
    >
      {children}
    </div>
  );
}
```
`<div>`는 기본적으로 포커스를 받지 않고 키보드 이벤트를 발생시키지 않는다.

## Reference
기존 DS의 `Card.tsx`는 `onClick` 없이 컨테이너로만 사용됨 — 인터랙티브 Card는 이번 신규 DS에서 추가된 개념이므로 접근성 처리가 필요하다.

## Recommendation
`onClick`이 존재할 때 자동으로 인터랙티브 속성을 적용한다.

```jsx
export function Card({ tone = 'default', children, className = '', style = {}, onClick, ...rest }) {
  const interactive = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(e);
        }
      } : undefined}
      style={{
        cursor: interactive ? 'pointer' : undefined,
        ...
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
```

## Impact
- `Card`에만 영향 — 다른 컴포넌트 변경 없음
- `onClick` 없는 Card는 동작 변화 없음
- `onClick` 있는 Card는 Tab 포커스, Enter/Space 활성화 가능해짐

## Risk
- `role="button"`이 추가되면 스크린리더가 "버튼"으로 읽음 — `onClick`이 있는 Card는 실제로 버튼이므로 올바른 동작
- `...rest`에 소비자가 `role`을 직접 넘길 경우 충돌 가능 → `role={rest.role ?? (interactive ? 'button' : undefined)}` 로 방어

## Acceptance Criteria
- [ ] `onClick` 없는 Card: `role`, `tabIndex`, `onKeyDown` 없음 (정적 컨테이너)
- [ ] `onClick` 있는 Card: Tab으로 포커스 이동, Enter/Space로 클릭 작동
- [ ] focus-visible 스타일이 Card에 표시됨 (전역 `*:focus-visible` 이미 적용됨)
- [ ] 소비자가 `role`을 override할 수 있음
