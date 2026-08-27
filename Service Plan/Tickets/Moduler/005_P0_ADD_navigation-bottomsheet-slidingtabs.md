---
id: DS-005
status: CLOSED
severity: P0
type: ADD
category: Component / UX / Accessibility
---

# DS-005 — 모바일 핵심 패턴 추가 (BottomSheet, SlidingTabs)

## Problem
모바일 앱에서 가장 빈번하게 쓰이는 두 패턴 — BottomSheet(바텀시트)와 SlidingTabs(슬라이딩 탭) — 이 DS에 없다. 배지 상세, 아이템 상세, 필터 패널, 컨텍스트 메뉴 등 JAM! 서비스 곳곳에서 바텀시트가 사용되고 있으며, 이 DS 없이는 각 화면에서 제각각 구현하게 된다.

## Evidence
```
components/navigation/
  TabBar.jsx    ← 존재
  TopNav.jsx    ← 존재
  /* BottomSheet.jsx — 없음 */
  /* SlidingTabs.jsx — 없음 */
```
실제 서비스 코드(`jam-web/src/`)에서 바텀시트 패턴을 인라인으로 구현 중.

## Reference
기존 DS에도 없는 컴포넌트. 서비스 수준에서 직접 구현해온 패턴을 DS로 흡수하는 작업이다.

## Recommendation

**BottomSheet.jsx**
- props: `open`, `onDismiss`, `title?`, `children`, `snapPoints?: number[]`
- 패턴: 전체화면 반투명 overlay + 아래서 slide-up 패널
- 접근성: `role="dialog"` `aria-modal="true"` `aria-labelledby`, focus trap, Escape 키 (ModalToast와 동일 패턴)
- 제스처: overlay 클릭으로 닫힘
- 애니메이션: `--ease-bounce` slide-up, `--ease-smooth-out` dismiss
- safe-area: `padding-bottom: var(--spacing-safe-bottom)` 적용

**SlidingTabs.jsx**
- props: `tabs: [{key, label}]`, `active`, `onChange`
- 패턴: 가로 스크롤 가능한 pill 탭 바 (TabBar와 달리 콘텐츠 내 탭)
- 활성 탭 배경: `--color-primary`, 비활성: `--color-surface`
- `aria-selected`, `role="tab"`, `role="tablist"` 패턴

## Impact
- 신규 파일 2개 추가 — 기존 컴포넌트 영향 없음
- BottomSheet는 ModalToast와 focus trap 로직 공유 가능 → 유틸 추출 검토

## Risk
- BottomSheet 스와이프 제스처(위아래 드래그)는 이번 최소 구현에서 제외 권장 — touch 이벤트 복잡도 높음
- SlidingTabs의 가로 스크롤 snap 처리는 CSS `scroll-snap-type`으로 충분

## Acceptance Criteria
- [ ] `BottomSheet.jsx`: open/close 애니메이션, overlay 클릭 닫힘, Escape 닫힘, focus trap
- [ ] `BottomSheet.jsx`: iOS safe area 하단 여백 적용
- [ ] `SlidingTabs.jsx`: `aria-selected`, `role="tab/tablist"` 올바르게 적용
- [ ] `SlidingTabs.jsx`: 탭 수가 화면 너비 초과 시 가로 스크롤 가능
- [ ] 각 컴포넌트 `.d.ts` 파일 동반
- [ ] `navigation.card.html` 데모에 두 컴포넌트 예시 추가

---

## 완료 기록

- **날짜**: 2026-08-14
- **구현**: `BottomSheet.jsx`, `SlidingTabs.jsx` 신규 구현
  - BottomSheet: `role="dialog"`, `aria-modal`, focus trap, Escape 닫힘, `--ease-bounce` slide-up, iOS safe-area `padding-bottom`, 스와이프 제스처 제외(touch 복잡도 → 향후 이터레이션)
  - SlidingTabs: `role="tablist"`, `aria-selected`, ArrowLeft/Right 키보드 탐색, CSS scroll-snap, 가로 스크롤 가능
- **추가 파일**: `BottomSheet.jsx/.d.ts`, `SlidingTabs.jsx/.d.ts`
- **잔여 이슈**: `navigation.card.html` 데모 업데이트 미진행 (P1 작업으로 별도 처리 가능)
