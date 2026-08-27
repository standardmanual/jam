---
id: 20260816_003
category: Infra
status: CLOSED
created: 2026-08-16
closed: 2026-08-16
---

# 티켓 20260816_003

**카테고리:** Infra  
**제목:** Storybook — MODULAR 컴포넌트 전체 Story 연결  
**상태:** CLOSED  
**생성일:** 2026-08-16  
**완료일:** 2026-08-16

---

## 요청 내용

Storybook 기본 설정(티켓 20260816_002) 완료 후, MODULAR에 정의된 실제 컴포넌트 전체를 Storybook에 연결.

**작업 원칙:**
1. 실제 MODULAR 컴포넌트를 직접 import
2. Story 전용 컴포넌트 만들지 않음
3. 실제 API에 존재하지 않는 variant 만들지 않음
4. 가능한 모든 의미 있는 state를 Story로 표현
5. 실제 서비스에서 사용하는 대표 상태를 우선

---

## 구현 내용 요약

총 **19개 Story 파일** 신규 생성:

| 카테고리 | 컴포넌트 | Story 수 |
|---|---|---|
| Buttons | IconButton | 8 |
| Cards | Card | 6 |
| Cards | RarityBadge | 5 |
| Cards | ShapeTag | 7 |
| Cards | BadgeFrame | 8 |
| Navigation | TopNav | 6 |
| Navigation | TabBar | 7 |
| Navigation | BottomSheet | 5 |
| Navigation | SlidingTabs | 4 |
| Navigation | Accordion | 4 |
| Feedback | Toast | 5 |
| Feedback | ModalToast | 6 |
| Feedback | WanderingEyesLoader | 5 |
| Feedback | Skeleton | 6 |
| Feedback | EmptyState | 6 |
| Forms | Input | 7 |
| Forms | Textarea | 7 |
| Forms | Select | 6 |
| Forms | Checkbox | 8 |

**총 Story 수 (신규):** 약 121개

이전 세션(티켓 002)에서 완료한 Button.stories.tsx + Foundation 6개 포함 시 총 **약 128개** Story.

---

## 변경 파일 목록

```
jam-web/design-system/components/buttons/IconButton.stories.tsx
jam-web/design-system/components/cards/Card.stories.tsx
jam-web/design-system/components/cards/RarityBadge.stories.tsx
jam-web/design-system/components/cards/ShapeTag.stories.tsx
jam-web/design-system/components/cards/BadgeFrame.stories.tsx
jam-web/design-system/components/navigation/TopNav.stories.tsx
jam-web/design-system/components/navigation/TabBar.stories.tsx
jam-web/design-system/components/navigation/BottomSheet.stories.tsx
jam-web/design-system/components/navigation/SlidingTabs.stories.tsx
jam-web/design-system/components/navigation/Accordion.stories.tsx
jam-web/design-system/components/feedback/Toast.stories.tsx
jam-web/design-system/components/feedback/ModalToast.stories.tsx
jam-web/design-system/components/feedback/WanderingEyesLoader.stories.tsx
jam-web/design-system/components/feedback/Skeleton.stories.tsx
jam-web/design-system/components/feedback/EmptyState.stories.tsx
jam-web/design-system/components/forms/Input.stories.tsx
jam-web/design-system/components/forms/Textarea.stories.tsx
jam-web/design-system/components/forms/Select.stories.tsx
jam-web/design-system/components/forms/Checkbox.stories.tsx
```

---

## 테스트 결과

- Storybook (localhost:6006) 에서 전체 렌더링 확인 ✅
  - ModalToast Success/Error/Info/BadgeFrame슬롯/Interactive ✅
  - WanderingEyesLoader Default/Slow/Fast/CustomColors ✅
  - Skeleton Default/Avatar/CardLoading/TextLines/BadgeGrid ✅
  - EmptyState Default/WithAction/NoIcon/TitleOnly/CustomIcon ✅
  - Input/Textarea/Select/Checkbox 각 state ✅
  - Forms/Checkbox Group (약관 동의 전체/개별 토글) ✅
- TypeScript 오류 확인 → **story 파일 오류 0개** ✅
  - `TabBar.stories.tsx`: `useState<string>` → `useState<TabKey>` 수정
  - iCloud 중복 파일(`.d 2.ts`, `.d 3.ts`)의 오류는 기존에도 존재하던 문제, 본 작업과 무관

---

## 배포 정보

- **브랜치:** staging
- **커밋:** `3fb33c0`
- **Push 완료:** 2026-08-16
- **환경:** staging (Storybook은 로컬 개발 도구, Vercel 배포 불필요)

---

## 주요 의사결정

### Interactive Story 패턴
`BottomSheet`, `TabBar`, `SlidingTabs`, `Toast`, `ModalToast`, `Input`, `Textarea`, `Select`, `Checkbox`처럼 open/active 상태가 있는 컴포넌트는 `useState` + `render()` 함수로 인터랙티브 Story를 별도 제공.

### iCloud 중복 파일 처리
Storybook glob 패턴(`design-system/**/*.stories.tsx`)이 `파일명 2.tsx` 형태의 iCloud 중복 파일을 감지할 수 있으나, `.stories.` 패턴이 없으므로 오류 없이 무시됨. 원본 파일만 대상으로 작업.

### ModalToast `iconSlot` 패턴
배지 획득 연출에서 `BadgeFrame`을 `iconSlot`으로 전달하는 대표 사용 패턴을 `WithBadgeFrame`, `WithMythicBadge` Story로 문서화.

### TabKey 타입 수정
`TabBar`의 `onChange` prop이 `(key: TabKey) => void` 타입이므로 Interactive story에서 `useState<string>` → `useState<TabKey>` 변경 필요.

---

## 잔여 이슈

- `src/stories/` 디렉터리가 untracked 상태로 존재 (Storybook 기본 예제 파일로 추정) — 정리 여부 결정 필요
- Storybook에서 `Button.jsx`의 default export 부재로 콘솔 경고 발생 (기존 문제, MODULAR 파일 수정 금지 원칙에 따라 유지)
