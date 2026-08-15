---
id: DS-009
status: CLOSED
severity: P1
type: FIX
category: Accessibility / Component
---

# DS-009 — ModalToast overlay `aria-hidden` 미적용

## Problem
`ModalToast.jsx`의 배경 overlay `<div>`에 `aria-hidden` 처리가 없다. 스크린리더 사용자가 dialog 바깥의 overlay 영역을 Tab 탐색하거나 가상 커서로 접근할 수 있다. `aria-modal="true"`를 선언했지만 일부 구형 스크린리더(NVDA, JAWS 구버전)는 이를 무시하고 페이지 전체를 탐색한다.

## Evidence
```jsx
/* ModalToast.jsx */
return (
  <div
    onClick={onDismiss}
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', ... }}
    /* aria-hidden 없음 — 스크린리더 탐색 가능 */
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
      ...
    >
```
WCAG 2.1 SC 1.3.1, 4.1.2 관련.

## Reference
기존 DS에 ModalToast 없음. W3C ARIA Authoring Practices의 modal dialog 패턴은 dialog 외부 컨텐츠를 `aria-hidden="true"`로 숨기거나 `inert` attribute 적용을 권장한다.

## Recommendation
모달이 열릴 때 `document.body`의 나머지 자식들을 `aria-hidden`으로 숨기거나, 더 단순하게 overlay 자체에 접근 차단을 적용한다.

**Option A — 단순 inert 방식 (권장)**
```jsx
/* overlay div에 추가 */
<div
  onClick={onDismiss}
  aria-hidden="true"      /* overlay 자체를 스크린리더에서 숨김 */
  style={{ ... }}
>
  <div role="dialog" aria-modal="true" aria-labelledby={labelId} ...>
```
단, overlay에 `aria-hidden`을 걸면 dialog도 숨겨지므로, dialog는 overlay 자식이 아닌 별도 Portal로 분리하는 것이 올바른 패턴이다.

**Option B — body 자식 inert 방식**
모달 open 시 `useEffect`에서 dialog container 외부 요소에 `inert` attribute를 추가하고 close 시 제거.

현실적 단기 해결: 적어도 overlay의 `tabIndex`를 `-1`로 설정해 Tab 포커스 탐색에서 제외하고, `onClick={onDismiss}` 외 인터랙션을 막는다.

## Impact
- `ModalToast.jsx`만 영향
- focus trap이 이미 구현되어 있으므로 overlay `aria-hidden` 추가가 가장 저비용 개선

## Risk
- `aria-hidden`과 `role="dialog"` 조합이 잘못되면 dialog 자체가 숨겨짐 — 구조적 분리 필요
- `inert` attribute는 일부 구형 브라우저 미지원 (polyfill 필요 여부 검토)

## Acceptance Criteria
- [ ] 스크린리더가 ModalToast 열림 시 dialog 외부 요소를 탐색하지 않음
- [ ] Tab 포커스가 dialog 내부에만 머묾 (기존 focus trap과 조합)
- [ ] dialog `role="dialog"` `aria-modal="true"` `aria-labelledby` 유지
- [ ] overlay 클릭 dismiss 기능 유지

---
## 완료 기록
- **날짜**: 2026-08-14
- **구현**: `ModalToast.jsx`에 `useEffect` 내 body sibling inert + aria-hidden 토글 추가. 모달 open 시 dialog 외부 모든 sibling에 `inert`와 `aria-hidden="true"` 적용, close 시 복원.
- **변경 파일**: `design-system-staging/v2/components/feedback/ModalToast.jsx`
- **채택 방식**: body sibling inert 방식 (Option B) — overlay aria-hidden 구조 분리 불필요
