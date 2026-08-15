---
id: DS-013
status: CLOSED
severity: P1
type: ADD
category: Component / State / UX
---

# DS-013 — Skeleton/Shimmer 컴포넌트 추가

## Problem
로딩 상태를 표현하는 Skeleton 컴포넌트가 없다. 배지 목록, 드랍 피드, 인벤토리 등 JAM! 서비스의 대부분의 화면이 비동기 데이터를 기다리는 상태를 갖는다. 현재는 DS 없이 각 화면에서 직접 구현하거나 빈 화면으로 방치한다.

## Evidence
```
components/feedback/
  Toast.jsx
  ModalToast.jsx
  WanderingEyesLoader.jsx    ← 전체 화면 로더만 존재
  /* Skeleton.jsx — 없음 */  ← 인라인 콘텐츠 로딩 표현 불가
```

## Reference
기존 DS에도 없음. 서비스 코드에서 로딩 상태는 대부분 조건부 렌더링(`isLoading ? null : <Content />`)으로 처리 중 — 빈 화면이 깜빡이는 CLS(Cumulative Layout Shift) 문제가 있다.

## Recommendation
```jsx
/* Skeleton.jsx */
export function Skeleton({ width = '100%', height = 16, borderRadius, className = '', style = {} }) {
  return (
    <div
      className={className}
      aria-hidden="true"   /* 스크린리더에서 숨김 — 콘텐츠가 아님 */
      style={{
        width,
        height,
        borderRadius: borderRadius ?? 'var(--radius-sm)',
        background: 'var(--color-surface)',
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(90deg, transparent 0%, var(--color-border) 50%, transparent 100%)',
        animation: 'ds-shimmer 1.4s var(--ease-linear) infinite',
        backgroundSize: '200% 100%',
      }} />
    </div>
  );
}
```
`@keyframes ds-shimmer`는 DS-010(Button Spinner 리팩토링) 작업과 함께 `styles.css`에 추가.

## Impact
- 신규 파일 1개 추가
- `styles.css`에 `@keyframes ds-shimmer` 추가 (DS-010과 함께 진행 가능)
- `feedback.card.html` 데모 업데이트

## Risk
- `aria-hidden="true"`: 스크린리더가 Skeleton을 읽지 않으므로 로딩 상태 알림은 부모 레벨의 `aria-live` 또는 `role="status"`로 별도 처리해야 함 → 사용 가이드 문서화 필요

## Acceptance Criteria
- [ ] `Skeleton.jsx` 구현, `Skeleton.d.ts` 동반
- [ ] shimmer 애니메이션이 `--ease-linear`, `--color-surface`, `--color-border` 토큰으로 표현됨
- [ ] `aria-hidden="true"` 적용
- [ ] `width`, `height`, `borderRadius` prop으로 다양한 형태 표현 가능
- [ ] `feedback.card.html`에 카드형, 텍스트형 Skeleton 예시 추가

---
## 완료 기록
- **날짜**: 2026-08-14
- **구현**: `Skeleton.jsx` + `Skeleton.d.ts` 신규 추가. `aria-hidden="true"`, width/height/borderRadius prop, shimmer overlay(`ds-shimmer` keyframe from styles.css). @keyframes를 styles.css에 통합(DS-010과 동시).
- **추가 파일**: `components/feedback/Skeleton.jsx`, `Skeleton.d.ts`
- **잔여**: `feedback.card.html` 데모 업데이트 미진행
