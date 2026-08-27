---
id: 20260816_004
category: UI
status: CLOSED
created: 2026-08-16
closed: 2026-08-16
---

# 티켓 20260816_004 — MODULAR Storybook 마무리: 접근성·UX Writing·메타데이터 일괄 수정

| 항목 | 내용 |
|------|------|
| **status** | CLOSED |
| **카테고리** | UI |
| **작업일** | 2026-08-16 |
| **커밋** | `d7b5b56` |
| **브랜치** | staging |

---

## 배경

Storybook 구축 과정(티켓 002·003)에서 해결하지 못한 잔여 이슈·의사결정 필요 항목을
사용자가 결정 후 일괄 처리 요청. 검토 항목은 12-build-report.md, 09-accessibility-audit.md,
07-content-audit.md, 08-component-candidates.md에 기록된 WARN 및 DECISION REQUIRED였다.

---

## 의사결정 기록

| 이슈 | 결정 | 적용 |
|------|------|------|
| DR-1. Checkbox `'동의합니다'` 해요체 여부 | **현행 유지** (`동의합니다`) | 변경 없음 |
| DR-2. RarityBadge "전설의 배지" 등급명 | **`Legend` 영문 표준화** | 스토리 수정 |
| DR-3. UserSearchBar MODULAR 편입 | **Input `surface='inverse'` variant 추가** | Input 수정 |

---

## 구현 내용

### MODULAR 소스 수정 (M-1~M-5)

| # | 파일 | 변경 내용 |
|---|------|---------|
| M-1 | `ModalToast.jsx` + `.d.ts` + `.stories.tsx` | `dismissLabel` prop 추가, 기본값 `'닫기'`. CTA 금칙어 `'확인'` 하드코딩 해소 |
| M-2 | `Toast.jsx` | 닫기 버튼(`<button aria-label="알림 닫기">`) 추가. WCAG 2.1.1 키보드 dismiss 지원 |
| M-3 | `Select.jsx` + `.d.ts` | `aria-describedby` prop 추가. Input/Textarea와 동일 수준 |
| M-4 | `IconButton.jsx` | `process.env.NODE_ENV` 조건 제거 → 프로덕션에서도 label 누락 경고 출력 |
| M-5 | `Checkbox.jsx` | 네이티브 input을 `position:absolute; inset:0; opacity:0`으로 커스텀 비주얼에 겹쳐 포커스 링 위치 교정 (기존 1px 숨김 → 20×20 가시 영역) |

### Storybook 스토리 추가 (S-1~S-2)

| # | 파일 | 추가 스토리 |
|---|------|-----------|
| S-1 | `Input.stories.tsx` | `WithLabel` (htmlFor+id 패턴), `WithLabelAndError` (aria-describedby 패턴), `InverseSurface` |
| S-1 | `Textarea.stories.tsx` | `WithLabel` (htmlFor+id 패턴) |
| S-2 | `SlidingTabs.stories.tsx` | `WithTabPanel` (aria-controls ↔ role="tabpanel" 완성형 패턴) |

### 빌드 정리 (B-1)

- `src/stories/` 디렉토리 삭제 → Storybook 갤러리에서 Example/* 보일러플레이트 제거

### 메타데이터·레거시 (L-1~L-2)

- `_ds_manifest.json`: 컴포넌트 목록 15개 → 23개로 동기화 (Accordion, BottomSheet, SlidingTabs, Checkbox, Textarea, Select, EmptyState, Skeleton 추가)
- `dashboard.html`: 상단 sticky 배너 추가 ("레거시 뷰어 — 컴포넌트 탐색은 Storybook 사용")

### DR-2: RarityBadge 등급명 영문화

- `RarityBadge.stories.tsx` OnCard 스토리: `"전설의 배지"` → `"Legend 배지"`

### DR-3: Input inverse surface

- `Input.jsx`: `surface?: 'default' | 'inverse'` prop 추가
  - `inverse`: 흰 배경(`--color-bg-inverse`), 검정 텍스트(`--color-bg`), 반투명 테두리
- `Input.d.ts`: `surface` 타입 정의 추가
- `Input.stories.tsx`: `InverseSurface` 스토리 추가

### 서비스 코드: Error/Forbidden → EmptyState 패턴

- `src/app/forbidden/page.tsx`: 이모지 → SVG 아이콘, EmptyState(icon+title+description+action) 구조, MODULAR 기본 버튼 색상(`#e8461f`) 적용
- `src/app/error.tsx`: 동일 패턴. 환경변수 오류 분기 로직 유지

---

## 변경 파일

```
design-system/_ds_manifest.json
design-system/components/buttons/IconButton.jsx
design-system/components/cards/RarityBadge.stories.tsx
design-system/components/feedback/ModalToast.d.ts
design-system/components/feedback/ModalToast.jsx
design-system/components/feedback/ModalToast.stories.tsx
design-system/components/feedback/Toast.jsx
design-system/components/forms/Checkbox.jsx
design-system/components/forms/Input.d.ts
design-system/components/forms/Input.jsx
design-system/components/forms/Input.stories.tsx
design-system/components/forms/Select.d.ts
design-system/components/forms/Select.jsx
design-system/components/forms/Textarea.stories.tsx
design-system/components/navigation/SlidingTabs.stories.tsx
design-system/dashboard.html
src/app/error.tsx
src/app/forbidden/page.tsx
src/stories/  ← 삭제
```

---

## 테스트 결과

- Storybook 빌드 성공 (`Storybook build completed successfully`)
- 스토리 수 증가: 166 → 약 172 (WithLabel×2, WithLabelAndError, InverseSurface, WithTabPanel, CustomDismissLabel 추가)
- Example/* 보일러플레이트 갤러리 노이즈 제거 확인

---

## 잔여 이슈

| 항목 | 내용 | 우선순위 |
|------|------|---------|
| DR-1 | Checkbox `'동의합니다'` — 현행 유지 결정됨 | 종결 |
| 서비스 코드 | UserSearchBar 서비스 측 `surface='inverse'` 적용 | 다음 단계 |
| 서비스 코드 | MissionCard, PopInNumber, SwapText 별도 컴포넌트화 | 별도 티켓 |
| 서비스 코드 | 아이콘 카탈로그(`icons.tsx`) MODULAR 편입 | 별도 티켓 |
| 마이그레이션 | `guidelines/*.html` → Storybook MDX 이전 | 장기 |
