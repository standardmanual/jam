---
id: 20260816_002
category: Infra
status: CLOSED
created: 2026-08-16
closed: 2026-08-16
---

# 티켓: Storybook 기본 설정 + MODULAR Foundation Tokens 문서화

| 항목 | 내용 |
|---|---|
| **티켓 ID** | 20260816_002 |
| **카테고리** | Infra |
| **상태** | CLOSED |
| **생성일** | 2026-08-16 |
| **완료일** | 2026-08-16 |

---

## 요구사항

### Request A — Storybook 기본 설정
1. `main.ts` framework 설정 검증
2. `preview.tsx` 설정
3. `design-system/styles.css` global CSS 연결
4. `design-system/tokens/` 토큰 연결
5. fonts 연결 (서비스 기준 Pretendard)
6. asset 연결
7. Next.js 환경 호환성 확인
8. `design-system/components/`에서 import 가능한 구조
9. Storybook 정상 실행 확인

**핵심 원칙:**
- 실제 MODULAR 컴포넌트를 직접 Story에서 사용
- Storybook 전용 UI 컴포넌트 만들지 않음
- 기존 컴포넌트 복제 금지
- MODULAR token을 Storybook에서도 동일하게 사용
- 서비스의 기존 동작 변경 금지
- MODULAR 파일 구조 불필요한 변경 금지
- `design-system/` 안의 iCloud 중복 파일 무시, 원본만 사용

### Request B — Design Token Foundation 문서화
대상: Colors, Typography, Spacing, Radius, Motion, Fonts

**원칙:**
- Token 값을 Storybook에 하드코딩 금지
- `jam-web/design-system/tokens/`의 실제 CSS variable 사용
- Storybook용 별도 token 만들지 않음
- 현재 MODULAR 정의 변경 금지

각 Foundation: 시각적 Preview + token name + 실제 value + 사용 목적 + 사용 예시

---

## 구현 내용

### 패키지 설치
- Storybook v10.5.8 (`@storybook/nextjs-vite` framework)
- 어드온: `@chromatic-com/storybook`, `@storybook/addon-vitest`, `@storybook/addon-a11y`, `@storybook/addon-docs`, `@storybook/addon-mcp`

### 설정 파일

#### `.storybook/main.ts`
- **ESM `__dirname` 오류 해결**: `main.ts`가 ESM 모듈로 실행되어 `__dirname` 사용 불가 → `fileURLToPath(import.meta.url)` 패턴으로 대체
- `design-system/**/*.stories.*` 패턴 추가
- `@ds` 경로 alias 등록 (`design-system/` 디렉토리)
- `staticDirs`에 `design-system/assets` 추가 (`/ds-assets`로 서빙)

#### `.storybook/preview.tsx`
- **CSS import 순서**: `design-system/styles.css` → `globals.css` (Pretendard 재정의가 나중에 적용)
- **CSS specificity 충돌 해결**: `data-theme="dark"` 즉시 설정
  - 원인: MODULAR `colors.css`의 `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { --color-bg: white } }` 규칙이 specificity (0,1,0)으로 우세 → 라이트 모드 시스템에서 토큰 반전
  - 해결: 모듈 레벨에서 `document.documentElement.setAttribute('data-theme', 'dark')` 즉시 실행
- backgrounds: dark/inverse (JAM! 서비스는 항상 다크 테마)
- decorator: `fontFamily: var(--font-family-base)` 래퍼

#### `tsconfig.json`
- `@ds/*` 경로 alias 추가 (`./design-system/*` 매핑)

#### `.claude/launch.json`
- Storybook 실행 설정 추가 (port 6006, `npm run storybook`)

### Foundation Stories (`design-system/foundations/`)

| 파일 | 내용 |
|---|---|
| `Colors.stories.tsx` | 색상 스와치 + 토큰명 + 실제값 동적 표시, 배지 희귀도/태그 색상 쌍 |
| `Typography.stories.tsx` | 타입 스케일 시각화, 폰트 override 경고 (MODULAR=Noto→서비스=Pretendard) |
| `Spacing.stories.tsx` | 4px 기반 스케일 시각적 바, Layout semantic 토큰, Special (touch target) |
| `Radius.stories.tsx` | 4단계 반경 스케일 시각화 + backward-compat alias |
| `Motion.stories.tsx` | duration/easing 인터랙티브 데모 (▶ 토글/재생 버튼) |
| `Fonts.stories.tsx` | 폰트 스택 + 굵기 팔레트 + 한국어 렌더링 테스트 |

**공통 구현 원칙:**
- CSS variable 동적 읽기: `getComputedStyle(document.documentElement).getPropertyValue(name).trim()`
- 하드코딩 없음, MODULAR token을 그대로 참조

### 컴포넌트 Story
- `design-system/components/buttons/Button.stories.tsx`: Button named export (`export function Button`) → `import { Button }` 사용 (default import 오류 수정)

---

## 발견된 문제 및 해결

| 문제 | 원인 | 해결 |
|---|---|---|
| `ReferenceError: __dirname is not defined` | `main.ts`가 ESM 모듈, `__dirname`은 CommonJS 전용 | `fileURLToPath(import.meta.url)` 패턴 |
| `--color-bg: #ffffff` 반전 | CSS specificity: media + not 선택자 (0,1,0) > `:root` (0,0,1), 라이트 모드 시스템에서 토큰 반전 | `data-theme="dark"` 즉시 설정 |
| Button default import 오류 | `Button.jsx`는 named export만 있음 (`export function Button`) | `import { Button } from './Button'` 로 수정 |

## 미해결 / 알려진 이슈

- **Button docgen 콘솔 오류**: `SyntaxError: Button.jsx does not provide an export named 'default'` — Storybook 내부 docgen/test runner가 default export를 기대하는 현상. **story 렌더링에는 영향 없음.** MODULAR 파일 구조 변경 금지 원칙에 따라 Button.jsx에 default export를 추가하지 않음.
- **Icons Foundation**: `design-system/assets/` 폴더에 아이콘 파일 없음 — 추후 아이콘 시스템 구축 시 추가

---

## 테스트 결과

| Story | 렌더링 | 확인 |
|---|---|---|
| MODULAR/Foundations/Colors | ✅ | 스크린샷 확인 |
| MODULAR/Foundations/Typography | ✅ | 스크린샷 확인 |
| MODULAR/Foundations/Spacing | ✅ | 스크린샷 확인 |
| MODULAR/Foundations/Radius | ✅ | 스크린샷 확인 |
| MODULAR/Foundations/Motion | ✅ | 스크린샷 확인 |
| MODULAR/Foundations/Fonts | ✅ | 스크린샷 확인 |
| MODULAR/Buttons/Button (Primary/Secondary/Ghost/Loading) | ✅ | 스크린샷 확인 |

CSS 변수 상태 (`data-theme="dark"` 설정 후):
- `--color-bg`: `#000000` ✅
- `--color-text`: `#ffffff` ✅
- `--color-primary`: `#e8461f` ✅
- `--font-family-base`: `"Pretendard Variable"` ✅
- `--radius-card`: `16px` ✅

---

## 배포 정보

- **환경**: local (Storybook localhost:6006)
- **브랜치**: staging
- **커밋**: `0c5f7ac`
- **push**: staging 브랜치

## 변경 파일 목록

```
jam-web/.storybook/main.ts          (신규)
jam-web/.storybook/preview.tsx      (신규)
jam-web/design-system/foundations/Colors.stories.tsx     (신규)
jam-web/design-system/foundations/Typography.stories.tsx  (신규)
jam-web/design-system/foundations/Spacing.stories.tsx    (신규)
jam-web/design-system/foundations/Radius.stories.tsx     (신규)
jam-web/design-system/foundations/Motion.stories.tsx     (신규)
jam-web/design-system/foundations/Fonts.stories.tsx      (신규)
jam-web/design-system/components/buttons/Button.stories.tsx (신규)
jam-web/.claude/launch.json         (수정: Storybook 실행 설정 추가)
jam-web/tsconfig.json               (수정: @ds/* alias 추가)
jam-web/package.json                (수정: Storybook 패키지 추가)
jam-web/package-lock.json           (수정)
jam-web/eslint.config.mjs           (수정: Storybook 설정)
jam-web/vitest.config.ts            (수정: Storybook vitest 통합)
```
