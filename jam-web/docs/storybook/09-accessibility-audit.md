# MODULAR Accessibility Audit
> WCAG 2.2 AA 기준 · 2026-08-16

## 개요

Storybook에 등록된 핵심 MODULAR 컴포넌트 14개를 WCAG 2.2 AA 기준으로 감사했다.  
발견된 문제는 **MODULAR 컴포넌트 문제 / Service 문제 / Storybook 설정 문제**로 구분했다.  
기존 서비스 동작은 변경하지 않았으며, 모든 수정은 권고(WARN) 또는 필수(FAIL)로만 분류했다.

---

## 글로벌 스타일 (`styles.css`) — PASS

| 항목 | 상태 | 근거 |
|------|------|------|
| `*:focus-visible` 2px solid outline | ✅ PASS | WCAG 2.4.7, 2.4.11 충족 |
| `prefers-reduced-motion` | ✅ PASS | WCAG 2.3.3 충족, `0.01ms` 패턴 |
| `button:active` 피드백 (CSS) | ✅ PASS | JS 의존 없이 CSS로 처리 |
| `@media (hover: hover)` 가드 | ✅ PASS | 터치 기기에서 hover 잔류 없음 |

---

## 컴포넌트별 결과

### 1. Button — ✅ PASS

| 기준 | 결과 |
|------|------|
| 네이티브 `<button>` | ✅ |
| `type` prop 기본값 `'button'` | ✅ |
| `disabled` 속성 | ✅ |
| `aria-busy={loading}` | ✅ |
| Spinner `aria-hidden="true"` | ✅ |
| 터치 타겟 `minHeight: 44` | ✅ |

**WARN (경미):**
- disabled 상태가 `opacity: 0.4`만으로 표현됨 → 색상 외 비활성화 표시 없음 (WCAG 1.4.1 위반은 아니지만 권고 수준)

**카테고리:** MODULAR 문제 (경미)

---

### 2. Input — ⚠️ WARN

| 기준 | 결과 |
|------|------|
| `aria-label` / `aria-describedby` 전달 가능 | ✅ |
| `aria-invalid={state === 'error'}` | ✅ |
| `id`, `name` prop | ✅ |
| 높이 44px | ✅ |

**WARN (중요):**
- 컴포넌트 자체에 visible label 없음 — 소비자가 `<label htmlFor>` 또는 `aria-label`을 반드시 제공해야 함
- Storybook 스토리에 label 연결 예시가 없어 접근성 패턴이 문서화되지 않음

**카테고리:** Storybook 설정 문제 (패턴 예시 부재)

---

### 3. Textarea — ⚠️ WARN

Input과 동일한 패턴. 동일한 WARN 적용.

**카테고리:** Storybook 설정 문제

---

### 4. Select — ⚠️ WARN

| 기준 | 결과 |
|------|------|
| 네이티브 `<select>` | ✅ |
| `aria-label` | ✅ |
| `aria-invalid` | ✅ |
| 장식 chevron `aria-hidden="true"` | ✅ |

**WARN:**
- `aria-describedby` prop 없음 — Input/Textarea와 달리 오류 메시지 연결 불가
- `placeholder` 옵션이 `disabled hidden`으로 처리됨 — iOS Safari에서 초기 빈 값 선택 불가 (UX 제한)

**카테고리:** MODULAR 문제

---

### 5. Checkbox — ⚠️ WARN

| 기준 | 결과 |
|------|------|
| `<label htmlFor>` 래핑 | ✅ |
| 네이티브 input이 a11y 트리에 존재 | ✅ |
| 커스텀 시각 요소 `aria-hidden="true"` | ✅ |
| `aria-invalid` | ✅ |
| 터치 타겟 `minHeight: 44` | ✅ |

**WARN (중요):**
- 네이티브 input이 `clip: rect(0,0,0,0)` + `width:1, height:1`로 숨김
- `*:focus-visible` 전역 outline이 적용되지만, 1px 크기에 적용되어 **포커스 링이 시각적으로 보이지 않을 수 있음**
- 커스텀 체크박스 `<span>`은 `aria-hidden`이라 포커스 링을 받지 않음

**카테고리:** MODULAR 문제

---

### 6. BottomSheet — ✅ PASS

| 기준 | 결과 |
|------|------|
| `role="dialog"`, `aria-modal="true"` | ✅ |
| `aria-labelledby` (title 있을 때) | ✅ |
| 열릴 때 포커스 이동 | ✅ |
| 포커스 트랩 (Tab/Shift+Tab) | ✅ |
| Escape 닫기 | ✅ |
| 닫힐 때 포커스 복원 | ✅ |
| `tabIndex={-1}` 패널 (포커스 가능 요소 없을 때 fallback) | ✅ |
| 장식 drag handle `aria-hidden="true"` | ✅ |

**WARN (경미):**
- `title` 없을 때 `aria-labelledby` 미부여 → 다이얼로그에 접근 가능한 이름 없음. 소비자가 `aria-label` 대신 `title`로 레이블을 항상 제공해야 함
- 포커스 트랩이 열릴 시점에 한 번만 계산됨 → 동적으로 추가되는 focusable 요소 미포함

**카테고리:** MODULAR 문제 (경미)

---

### 7. SlidingTabs — ⚠️ WARN

| 기준 | 결과 |
|------|------|
| `role="tablist"` | ✅ |
| 각 버튼 `role="tab"` | ✅ |
| `aria-selected={isActive}` | ✅ |
| 로빙 탭인덱스 (`tabIndex 0/-1`) | ✅ |
| ArrowLeft/ArrowRight 키보드 이동 | ✅ |
| `aria-label="탭 목록"` on tablist | ✅ |
| 터치 타겟 `minHeight: 36` (WCAG 2.5.8 24px 최소 충족) | ✅ |

**WARN:**
- 연결된 `role="tabpanel"` 없음 — 소비자가 `aria-controls`에 대응하는 패널을 반드시 구현해야 함. Storybook 스토리에 tabpanel 연결 예시 없음
- 탭 활성화 상태가 배경색 변경만으로 표현됨 → 색상 외 표시 없음 (선택된 탭 텍스트가 bold로 변하므로 경미)

**카테고리:** Storybook 설정 문제 (tabpanel 연결 예시 부재)

---

### 8. TabBar — ⚠️ WARN

| 기준 | 결과 |
|------|------|
| `<nav>` 시맨틱 랜드마크 | ✅ |
| 각 버튼 `aria-label={t.label}` | ✅ |
| `aria-current="page"` (활성 탭) | ✅ |
| SVG `aria-hidden="true"` | ✅ |
| dot indicator `<span>` (텍스트 없음) | ✅ (스크린리더 무시) |
| 터치 타겟 (flex 1, height 64, 6등분) | ✅ (~66px) |

**WARN:**
- **컴포넌트 소스의 `tabs` 상수에 `'인벤토리'` 하드코딩** → UX Writing 가이드라인 위반 (`인벤` 이어야 함). `aria-label="인벤토리"`, visible label 없음이지만 스크린리더에 "인벤토리"로 읽힘
- `<nav>`에 `aria-label` 없음 → 페이지에 nav가 여러 개일 때 구분 어려움

**카테고리:** MODULAR 문제 (UX Writing 위반 + nav label)

---

### 9. Accordion — ✅ PASS

| 기준 | 결과 |
|------|------|
| 트리거: `aria-expanded`, `aria-controls` | ✅ |
| 패널: `role="region"`, `aria-labelledby` | ✅ |
| ID 연결 (`React.useId`) | ✅ |
| 트리거 `minHeight: 44` | ✅ |
| CHEVRON `aria-hidden="true"` | ✅ |
| 키보드: Enter/Space 토글 (네이티브 button) | ✅ |

**WARN (경미):**
- WAI-ARIA Accordion 패턴은 ArrowDown/ArrowUp 키로 헤더 간 이동을 권고하지만 미구현. Tab으로만 이동 가능 (필수 요건은 아님)

**카테고리:** MODULAR 문제 (경미, 권고 수준)

---

### 10. TopNav — ✅ PASS

| 기준 | 결과 |
|------|------|
| `<header>` 시맨틱 요소 | ✅ |
| `<h1>` 타이틀 | ✅ |
| 뒤로 버튼 `aria-label="뒤로"` | ✅ |
| 뒤로 버튼 44×44px | ✅ |
| SVG `aria-hidden="true"` | ✅ |
| `sticky` 포지셔닝 | ✅ |

**WARN (경미):**
- `<h1>`이 TopNav 내부에 있어 페이지의 기존 heading 계층과 충돌 가능. 소비자가 페이지 내 heading 계층을 관리해야 함

**카테고리:** MODULAR 문제 (경미, 소비자 책임)

---

### 11. Toast — ⚠️ WARN

| 기준 | 결과 |
|------|------|
| `role="status"`, `aria-live="polite"` | ✅ |
| 아이콘 `aria-hidden="true"` | ✅ |
| 텍스트 메시지 | ✅ |

**WARN (중요):**
- `onClick={onDismiss}`만 있고 `onKeyDown`이 없음 → 키보드 사용자가 닫을 수 없음
- 컴포넌트 자체에 자동 닫힘 타이머 없음. 소비자가 관리하지 않으면 영구 노출 → 키보드 트랩은 아니지만 UX 불편
- 닫기 버튼(`<button>`) 없음. 토스트를 클릭 대신 버튼으로 닫는 패턴 권고

**카테고리:** MODULAR 문제

---

### 12. ModalToast — ⚠️ WARN

| 기준 | 결과 |
|------|------|
| `role="dialog"`, `aria-modal="true"`, `aria-labelledby` | ✅ |
| 열릴 때 dismiss 버튼으로 포커스 이동 | ✅ |
| 닫힐 때 포커스 복원 | ✅ |
| Escape 닫기 | ✅ |
| 오버레이 클릭 닫기 | ✅ |
| 형제 요소 `inert`+`aria-hidden` 처리 | ✅ |

**WARN:**
- **dismiss 버튼 레이블이 `"확인"` 하드코딩** → UX Writing CTA 금칙어. 컴포넌트 소스를 수정하거나, 소비자가 덮어쓸 수 있도록 `dismissLabel` prop을 추가해야 함
- `iconSlot`의 접근성(alt text, aria 속성)은 소비자 책임 → 문서화 필요

**카테고리:** MODULAR 문제 (UX Writing CTA 위반)

---

### 13. EmptyState — ✅ PASS

| 기준 | 결과 |
|------|------|
| `role="status"` | ✅ |
| 기본 아이콘 `aria-hidden="true"` | ✅ |
| `icon={null}` 시 아이콘 숨김 | ✅ |
| action → `<Button>` (접근 가능) | ✅ |
| `...rest` spread로 aria 속성 오버라이드 가능 | ✅ |

**WARN (경미):**
- 정적 빈 상태에 `role="status"`가 불필요할 수 있음. 동적 맥락(필터 결과 등)에만 필요. 소비자가 `...rest`로 제거 가능

**카테고리:** MODULAR 문제 (경미)

---

### 14. IconButton — ⚠️ WARN

| 기준 | 결과 |
|------|------|
| `aria-label={label}` | ✅ |
| label 없을 때 개발 모드 `console.warn` | ✅ |
| 44×44px 터치 타겟 | ✅ |
| SVG `aria-hidden="true"` | ✅ |

**WARN (중요):**
- `label` prop이 없으면 `aria-label={undefined}` → 버튼에 접근 가능한 이름 없음. 스크린리더에서 아이콘 이름으로 fallback되거나 무음 처리됨
- 개발 경고만으로는 프로덕션 버그 방지 불충분 → `label` prop을 필수로 만들거나, 기본값을 아이콘 이름 문자열로 설정 권고

**카테고리:** MODULAR 문제

---

## 전체 요약

| 컴포넌트 | 결과 | 주요 이슈 |
|----------|------|-----------|
| Button | ✅ PASS | — (opacity disabled 경미) |
| Input | ⚠️ WARN | label 패턴 스토리 없음 |
| Textarea | ⚠️ WARN | 위와 동일 |
| Select | ⚠️ WARN | `aria-describedby` 없음 |
| Checkbox | ⚠️ WARN | 포커스 링 시각 노출 불확실 |
| BottomSheet | ✅ PASS | — (title 없을 때 a11y name 없음) |
| SlidingTabs | ⚠️ WARN | tabpanel 연결 예시 없음 |
| TabBar | ⚠️ WARN | `인벤토리` 하드코딩 (UX Writing) |
| Accordion | ✅ PASS | — (Arrow키 이동 미구현 권고) |
| TopNav | ✅ PASS | — (heading 계층 소비자 책임) |
| Toast | ⚠️ WARN | 키보드 dismiss 불가 |
| ModalToast | ⚠️ WARN | dismiss 버튼 `"확인"` 하드코딩 |
| EmptyState | ✅ PASS | — |
| IconButton | ⚠️ WARN | label 미제공 시 접근 가능한 이름 없음 |

**PASS: 6개 / WARN: 8개 / FAIL: 0개**

---

## 문제 분류

### MODULAR 컴포넌트 문제 (소스 수정 필요)

| 우선순위 | 컴포넌트 | 문제 | 권고 수정 |
|----------|----------|------|-----------|
| 높음 | TabBar | `tabs` 상수의 `'인벤토리'` → `'인벤'` 필요 | 소스 수정 |
| 높음 | ModalToast | dismiss 버튼 `"확인"` → `dismissLabel` prop 추가 | 소스 수정 |
| 높음 | Toast | `onClick`에만 dismiss → `onKeyDown` 추가 또는 닫기 `<button>` 추가 | 소스 수정 |
| 높음 | IconButton | `label` 미제공 시 접근 가능한 이름 없음 → TypeScript에서 required 처리 | 소스 수정 |
| 중간 | Select | `aria-describedby` prop 없음 → 추가 | 소스 수정 |
| 중간 | Checkbox | 포커스 링 노출 여부 → clip 대신 `opacity: 0` + `position: absolute` 권고 |  소스 수정 |

### Storybook 설정 문제 (스토리 수정 필요)

| 컴포넌트 | 문제 | 권고 수정 |
|----------|------|-----------|
| Input | 접근성 패턴(label 연결) 예시 스토리 없음 | `<label>` + `id` 연결 스토리 추가 |
| Textarea | 위와 동일 | 위와 동일 |
| SlidingTabs | tabpanel 연결 예시 없음 | `role="tabpanel"` 연결 Complete 스토리 추가 |

### Service 문제

없음 — 이번 감사는 MODULAR 컴포넌트만 대상으로 했음.

---

## 다음 단계 권고

아래 수정은 기존 서비스 동작에 영향을 주지 않는 **최소한의 MODULAR 소스 수정**이다.

1. **TabBar** — `tabs` 상수의 `'인벤토리'` → `'인벤'` (1줄 수정)
2. **ModalToast** — `dismissLabel` prop 추가, 기본값 `'닫기'` (UX Writing 준수)
3. **Toast** — 닫기 `<button>` 추가 또는 `onKeyDown` 핸들러 추가
4. **IconButton** — `label` prop을 TypeScript에서 `required`로 선언
5. **Select** — `aria-describedby` prop 추가
6. **Storybook 스토리** — Input/Textarea label 패턴 스토리, SlidingTabs tabpanel 연결 스토리 추가
