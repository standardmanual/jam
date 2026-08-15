---
id: DS-015
status: CLOSED
severity: P2
type: ADD
category: Component / UX
---

# DS-015 — EmptyState 컴포넌트 추가

## Problem
빈 목록, 검색 결과 없음, 오류 화면, 온보딩 첫 진입 등 다양한 "컨텐츠가 없는 상태"를 표현하는 컴포넌트가 없다. 이 상태는 UX에서 매우 중요하며, 통일된 시각 언어가 없으면 화면마다 제각각 처리된다. JAM! 서비스에서는 배지 미보유, 드랍 없음, 인벤토리 비어있음 등에서 반복적으로 필요하다.

## Evidence
```
components/feedback/
  Toast.jsx, ModalToast.jsx, WanderingEyesLoader.jsx, Skeleton.jsx(DS-013 예정)
  /* EmptyState.jsx — 없음 */
```

## Reference
기존 DS 및 서비스 코드에서 EmptyState는 인라인으로 처리 — 통일성 없음.

## Recommendation
```jsx
/* EmptyState.jsx */
export function EmptyState({
  icon,          /* ReactNode — 선택. 없으면 기본 아이콘 */
  title,
  description,
  action,        /* { label: string, onClick: () => void } — 선택 */
  className = '',
  style = {},
}) {
  return (
    <div
      role="status"
      className={className}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 'var(--layout-element-gap)',
        padding: 'var(--layout-section-gap) var(--layout-card-padding)',
        textAlign: 'center',
        ...style,
      }}
    >
      {icon && <div style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>{icon}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 'var(--text-h4)', fontWeight: 'var(--weight-h4)', color: 'var(--color-text)' }}>
          {title}
        </p>
        {description && (
          <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)' }}>
            {description}
          </p>
        )}
      </div>
      {action && (
        <Button variant="primary" onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  );
}
```

## Impact
- 신규 파일 추가 — 기존 컴포넌트 영향 없음
- `Button` 컴포넌트 의존성 추가 (action prop 사용 시)

## Risk
- `action` prop에서 `Button` import가 필요 — 컴포넌트 간 순환 의존성이 없는지 확인
- `role="status"`가 적합한지 재검토 — 비어있는 상태가 동적으로 바뀔 때만 `aria-live`가 의미 있음. 정적이면 `role` 없어도 됨

## Acceptance Criteria
- [ ] title, description, icon, action 모두 선택적(optional)
- [ ] action 있을 때 Button 렌더링, 없으면 버튼 없음
- [ ] `var(--layout-*)` 토큰으로 여백 처리
- [ ] `.d.ts` 파일 동반
- [ ] `feedback.card.html` 데모에 3가지 변형 예시 (아이콘 있음, 없음, action 있음)

## 완료 기록

- **구현 내용**: `components/feedback/EmptyState.jsx` + `EmptyState.d.ts` 신규 생성
- **변경 파일**: `components/feedback/EmptyState.jsx`, `components/feedback/EmptyState.d.ts`
- **주요 의사결정**:
  - `role="status"` 유지 (동적 상태 변화 시 AT 알림 목적)
  - `icon` prop에 `null` 전달 시 아이콘 숨김, `undefined` 시 기본 SVG 표시 (스텁 empty-box 아이콘)
  - `action` prop에 `{ label, onClick }` 전달 시 Button 컴포넌트 렌더링
- **배포**: 2026-08-14, design-system-staging/v2
