# MODULAR + Storybook 최종 검증 보고서
> 2026-08-16 · 기준: WCAG 2.2 AA, UX Writing 가이드라인

---

## 요약

| 영역 | 결과 | FAIL | WARN |
|------|------|------|------|
| 1. MODULAR | ✅ PASS | 0 | 1 |
| 2. Storybook | ⚠️ WARN | 0 | 1 |
| 3. Source Integrity | ✅ PASS | 0 | 0 |
| 4. UX Writing | ❌ FAIL | 2 | 2 |
| 5. Accessibility | ⚠️ WARN | 0 | (09-accessibility-audit.md 참조) |
| 6. Service Compatibility | ✅ PASS | 0 | 1 |
| 7. Documentation | ✅ PASS | 0 | 0 |

**전체: FAIL 2건 · WARN 5건**

---

## 1. MODULAR

### 1.1 Tokens — ✅ PASS

`design-system/styles.css`가 `tokens/` 하위 6개 파일(fonts, colors, typography, spacing, radius, motion)을 모두 정상 import하며, Storybook의 `.storybook/preview.ts`가 이를 전역으로 주입한다. 모든 CSS 변수가 스토리에서 정상 해석된다.

### 1.2 Components — ✅ PASS

컴포넌트 소스(`.jsx`) 23개와 스토리(`.stories.tsx`) 23개가 1:1로 대응한다.

| 카테고리 | 소스 수 | 스토리 수 |
|----------|--------|---------|
| buttons | 2 | 2 |
| cards | 4 | 4 |
| feedback | 5 | 5 |
| forms | 4 | 4 |
| navigation | 5 | 5 |
| patterns | 3 | 3 |
| **합계** | **23** | **23** |

### 1.3 Type Definitions — ✅ PASS

`.d.ts` 파일이 모든 23개 컴포넌트에 대해 존재하며, 각 파일의 props 인터페이스가 소스 구현과 일치한다. 특이사항:

- `IconButton.d.ts` → `label: string` (required, non-optional) — 소스 구현의 개발 모드 경고와 일치
- `Card.d.ts` → `'white'` variant 제거 주석이 명시적으로 기록됨
- `ShapeTag.d.ts` → `dark: boolean` deprecated, `surface` prop으로 대체 — 서면 기록됨

### 1.4 API 변경 여부 — ✅ PASS

서비스 코드(`src/`)에서 `design-system/`을 import하는 경로가 없어 API 변경이 서비스에 영향을 주지 않는다. MODULAR 내부 API는 변경되지 않았다.

### 1.5 WARN: `_ds_manifest.json` 컴포넌트 목록 불일치

`_ds_manifest.json`에 등록된 컴포넌트는 15개이지만 실제 소스는 23개다. 누락: Accordion, BottomSheet, SlidingTabs, Checkbox, Textarea, Select, EmptyState, Skeleton. manifest가 최신 상태가 아니다. AI 에이전트 참조 정확도에 영향을 줄 수 있다 (Storybook 동작에는 영향 없음).

---

## 2. Storybook

### 2.1 빌드 성공 — ✅ PASS

```
Storybook build completed successfully
Output: storybook-static/ (150MB)
```

빌드 오류 없음. Vite 청크 크기 경고만 출력되었으며 빌드 실패 요인이 아니다.

### 2.2 Stories 수량 — ✅ PASS

| 항목 | 수량 |
|------|------|
| 전체 Stories | 166 |
| Docs 페이지 | 3 |
| MODULAR 컴포넌트 타이틀 | 23 |
| MODULAR Foundations 타이틀 | 6 |

### 2.3 갤러리 구조 — ✅ PASS

빌드된 index.json 기준으로 다음 타이틀 계층이 정상 구성된다:

```
MODULAR/
  Buttons/     Button, IconButton
  Cards/       BadgeFrame, Card, RarityBadge, ShapeTag
  Feedback/    EmptyState, ModalToast, Skeleton, Toast, WanderingEyesLoader
  Forms/       Checkbox, Input, Select, Textarea
  Foundations/ Colors, Fonts, Motion, Radius, Spacing, Typography
  Navigation/  Accordion, BottomSheet, SlidingTabs, TabBar, TopNav
  Patterns/    BadgeGridCard, CollectionGridCard, ListRowCard
```

### 2.4 WARN: Example/* 보일러플레이트가 빌드에 포함됨

`.storybook/main.ts`에 `'!../src/stories/**'` 네거티브 패턴이 적용되어 있으나 빌드 결과에 여전히 포함된다:

```
Configure your project  (소개 Docs)
Example/Button          (Primary / Secondary / Large / Small)
Example/Header          (Logged In / Logged Out)
Example/Page            (Logged Out / Logged In)
```

Storybook v10에서 `stories` 배열의 네거티브 글로브 패턴이 빌드 시 완전히 적용되지 않는 알려진 동작이다. MODULAR 스토리 동작에는 영향 없으나 갤러리에 불필요한 노이즈가 생긴다.

**수정 방법:** `src/stories/` 디렉토리 자체를 삭제하거나, `main.ts`의 `stories` 글로브를 `'../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'` 대신 `'../src/!(stories)/**/*.stories.@(js|jsx|mjs|ts|tsx)'`로 변경한다.

---

## 3. Source Integrity

### 3.1 스토리 → 실제 MODULAR 컴포넌트 import — ✅ PASS

전체 23개 스토리 파일이 동일 디렉토리의 `.jsx` 소스를 상대 경로로 import한다. 예:

```ts
import { Button } from './Button';          // buttons/Button.stories.tsx
import { Accordion } from './Accordion';    // navigation/Accordion.stories.tsx
```

`@ds/*` alias나 `design-system/*` 절대 경로를 우회하는 케이스 없음.

### 3.2 컴포넌트 복제 없음 — ✅ PASS

Storybook 전용 래퍼 컴포넌트 또는 복제 컴포넌트가 없다. 스토리는 소스 컴포넌트를 직접 사용한다.

### 3.3 토큰 복제 없음 — ✅ PASS

스토리 파일 어디에도 CSS 변수 값을 하드코딩하거나 별도 정의한 위치가 없다. 모든 스타일 값은 `var(--color-*)`, `var(--spacing-*)` 등 토큰으로 참조된다.

---

## 4. UX Writing

### 4.1 FAIL: `TabBar.jsx` — `'인벤토리'` 하드코딩

**위치:** `design-system/components/navigation/TabBar.jsx:45`

```js
{ key: 'inventory', label: '인벤토리' },
```

**문제:** UX Writing 가이드라인 금칙어. 공식 표기는 `'인벤'`. 이 레이블이 `aria-label`로 노출되어 스크린리더가 "인벤토리"를 읽는다. UX Writing 위반 + 접근성 이중 문제.

**수정 방법:**

```js
// TabBar.jsx:45
{ key: 'inventory', label: '인벤' },
```

변경 범위: 1줄. 서비스(`src/`)는 자체 TabBar 구현을 사용하므로 영향 없음.

---

### 4.2 FAIL: `Skeleton.stories.tsx` — `'조합'` 사용

**위치:** `design-system/components/feedback/Skeleton.stories.tsx:29`

```tsx
name: '카드 로딩 (조합)',
```

**문제:** `조합`은 UX Writing 가이드라인 금칙어(JAM!의 믹스 기능을 가리키는 구 용어). Storybook 스토리 이름에서 개발자에게 노출된다. 맥락상 "여러 Skeleton을 조합한 레이아웃"을 의미하나, 금칙어 사용은 가이드라인 위반이다.

**수정 방법:**

```tsx
// 수정 전
name: '카드 로딩 (조합)',

// 수정 후 — "복합" 또는 "여러 항목"으로 대체
name: '카드 로딩 (복합 레이아웃)',
```

---

### 4.3 WARN: `ModalToast.jsx` — dismiss 버튼 `"확인"` 하드코딩

**위치:** `design-system/components/feedback/ModalToast.jsx`

```jsx
<button ref={dismissRef} onClick={onDismiss}>
  확인
</button>
```

**문제:** `확인`은 CTA 금칙어. 가이드라인은 동작을 서술하는 동사를 요구한다 (`닫기`, `완료했어요` 등).

**권고 수정:** `dismissLabel` prop 추가, 기본값 `'닫기'` 설정. 이번 단계에서 수정하지 않음 — 별도 티켓으로 처리.

---

### 4.4 WARN: `Checkbox.stories.tsx` — `'동의합니다'` 합니다체

**위치:** `design-system/components/forms/Checkbox.stories.tsx:19,24`

```tsx
args: { label: '동의합니다', ... }
```

**문제:** 합니다체 (`해요`체 원칙 위반). `07-content-audit.md`에서 **DECISION REQUIRED** 항목으로 분류됨 — 약관 동의 등 법적 맥락에서는 합니다체가 관례적으로 허용되므로 정책 결정이 필요하다. 결정 전까지 현행 유지.

---

## 5. Accessibility

이번 단계에서 새로 발견된 FAIL 항목 없음. 접근성 감사 전체 결과는 [`09-accessibility-audit.md`](./09-accessibility-audit.md)에 기록되어 있다.

**FAIL 0건 · WARN 8건** (컴포넌트별):

| 컴포넌트 | WARN 요약 |
|----------|-----------|
| Input / Textarea | label 패턴 스토리 부재 |
| Select | `aria-describedby` 없음 |
| Checkbox | 1px 숨김 input 포커스 링 노출 불확실 |
| SlidingTabs | tabpanel 연결 예시 없음 |
| TabBar | `인벤토리` 하드코딩 (§4.1 FAIL과 동일) |
| Toast | 키보드 dismiss 불가 |
| ModalToast | dismiss 버튼 `"확인"` (§4.3 WARN과 동일) |
| IconButton | label 미제공 시 접근 가능한 이름 없음 |

---

## 6. Service Compatibility

### 6.1 서비스 코드 격리 — ✅ PASS

`src/` 어디에도 `design-system/`을 import하는 경로가 없다. MODULAR와 서비스 코드는 완전히 격리되어 있다. Storybook 작업이 서비스 동작에 영향을 주지 않는다.

### 6.2 WARN: 서비스 테스트 파일 TS 에러 (기존 문제)

`npx tsc --noEmit` 실행 시 다음 파일에서 vitest 타입 미설치 에러 발생:

```
src/lib/badge-engine/__tests__/walking-badges-v4.test.ts
src/lib/badge-engine/__tests__/conditions.test.ts
src/lib/points/__tests__/reasons.test.ts
src/app/api/users/search/__tests__/search-logic.test.ts
```

모두 `describe`, `it`, `expect` 미선언 에러로, vitest의 `@types/vitest` 또는 `globals: true` 설정이 누락된 기존 문제다. 이번 Storybook 작업과 무관하며, **Storybook 빌드에 영향을 주지 않는다.** (`skipLibCheck: true` + Storybook은 Vite 빌드 파이프라인 사용)

---

## 7. Documentation

### 7.1 스토리 구조 일관성 — ✅ PASS

전체 23개 스토리 파일이 동일한 구조를 따른다:

```tsx
const meta: Meta<typeof Component> = {
  title: 'MODULAR/[카테고리]/[이름]',
  component: Component,
  parameters: { layout: 'centered' | 'fullscreen' | 'padded' },
};
export default meta;
type Story = StoryObj<typeof Component>;
export const [스토리명]: Story = { ... };
```

### 7.2 API 일치 — ✅ PASS

스토리의 `args` 사용과 `.d.ts`의 props 정의가 일치한다. 스토리에서 존재하지 않는 prop을 사용하는 케이스 없음.

### 7.3 Foundations MDX 6개 — ✅ PASS

`MODULAR/Foundations/` 하위에 Colors, Fonts, Motion, Radius, Spacing, Typography MDX 페이지가 빌드에 포함된다.

---

## FAIL 항목 — 즉시 수정 완료 (2026-08-16)

| # | 파일 | 이슈 | 상태 |
|---|------|------|------|
| F-1 | `TabBar.jsx:45` | `'인벤토리'` → `'인벤'` | ✅ 수정 완료 |
| F-2 | `Skeleton.stories.tsx:29` | `'카드 로딩 (조합)'` → `'카드 로딩 (복합 레이아웃)'` | ✅ 수정 완료 |

---

## WARN 항목 — 이번 단계에서 수정하지 않음

| # | 위치 | 이슈 | 비고 |
|---|------|------|------|
| W-1 | `_ds_manifest.json` | 컴포넌트 목록이 구버전 (15/23) | 별도 업데이트 필요 |
| W-2 | Storybook 빌드 | Example/* 보일러플레이트 갤러리에 포함 | `src/stories/` 삭제로 해소 가능 |
| W-3 | `ModalToast.jsx` | dismiss 버튼 `"확인"` CTA 금칙어 | `dismissLabel` prop 추가로 해소 |
| W-4 | `Checkbox.stories.tsx` | `'동의합니다'` 합니다체 | DECISION REQUIRED (정책 결정 후) |
| W-5 | `src/__tests__/` 다수 | vitest 타입 미설치 TS 에러 | 기존 문제, Storybook 무관 |
| W-6 | 접근성 8건 | `09-accessibility-audit.md` 참조 | 별도 티켓으로 처리 |
