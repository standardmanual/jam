---
id: DS-017
status: CLOSED
severity: P2
type: ADD
category: Component / UX
---

# DS-017 — ModalToast `iconSlot` prop 추가 (BadgeFrame 통합)

## Problem
`ModalToast`의 아이콘 영역이 내부 ICONS 맵(success/error/info SVG)으로 고정되어 있다. 배지 획득 등 성취 순간에는 `BadgeFrame` 컴포넌트를 아이콘 자리에 넣어야 하는데, 현재 구조상 불가능하다. ModalToast는 JAM!에서 배지 획득 알림의 핵심 UI인데, 배지를 보여줄 수 없다는 것은 설계 공백이다.

## Evidence
```jsx
/* ModalToast.jsx L75–82 */
<div style={{
  width: 56, height: 56, borderRadius: '50%',
  background: 'var(--color-primary)',
  ...
}}>
  {ICONS[type]}    /* success/error/info만 가능 — BadgeFrame 삽입 불가 */
</div>
```

## Reference
기존 DS에 ModalToast 없음. 서비스 코드에서 배지 획득 팝업은 별도 구현 — DS로 흡수 시 iconSlot이 필수.

## Recommendation
`iconSlot` prop을 추가하고, 제공 시 기본 아이콘 원형 컨테이너를 교체한다.

```jsx
export function ModalToast({ message, type = 'success', open = true, onDismiss, iconSlot }) {
  return (
    ...
    {iconSlot
      ? <div style={{ marginBottom: 4 }}>{iconSlot}</div>     /* BadgeFrame 등 외부 슬롯 */
      : <div style={{ width: 56, height: 56, borderRadius: '50%', ... }}>{ICONS[type]}</div>
    }
    ...
  );
}
```

사용 예:
```jsx
<ModalToast
  message="새 배지를 획득했습니다!"
  type="success"
  iconSlot={<BadgeFrame rarity="rare" size={80}>{badgeIcon}</BadgeFrame>}
  onDismiss={handleDismiss}
/>
```

## Impact
- `ModalToast.jsx`에 prop 추가 — 기존 사용처(iconSlot 없음)는 변경 없음
- `ModalToast.d.ts` 업데이트 필요

## Risk
- `iconSlot`의 크기가 가변적일 경우 ModalToast 내부 레이아웃 틀어짐 → 슬롯 wrapping div에 `overflow: hidden` 또는 크기 제한 권장
- `iconSlot`이 `BadgeFrame` 외 임의의 ReactNode를 받으므로 접근성(alt text 등)은 소비자 책임임을 문서화

## Acceptance Criteria
- [ ] `iconSlot` 없을 때 기존 동작 동일 (success/error/info 기본 아이콘)
- [ ] `iconSlot` 있을 때 해당 ReactNode가 아이콘 자리에 렌더링됨
- [ ] `ModalToast.d.ts`에 `iconSlot?: ReactNode` 추가
- [ ] `feedback.card.html` 데모에 iconSlot 예시 (BadgeFrame 포함) 추가

## 완료 기록

- **구현 내용**: `ModalToast.jsx`에 `iconSlot` prop 추가. 제공 시 기본 아이콘 원형 컨테이너를 대체.
- **변경 파일**: `components/feedback/ModalToast.jsx`, `components/feedback/ModalToast.d.ts`
- **배포**: 2026-08-14, design-system-staging/v2
