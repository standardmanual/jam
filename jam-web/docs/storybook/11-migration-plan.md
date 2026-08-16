# MODULAR Legacy → Storybook 마이그레이션 플랜
> 2026-08-16 · Storybook 안정화 후 역할 재정의

---

## 배경

Storybook 구축 전 MODULAR는 다음 스택으로 컴포넌트를 탐색·공유했다.

```
_ds_manifest.json   ← 컴포넌트·토큰 메타데이터 (기계 읽기용)
_ds_bundle.js       ← 컴파일된 UMD 번들 (브라우저 런타임용)
*.card.html         ← iFrame 임베드 카드 (dashboard가 렌더링)
guidelines/*.html   ← 파운데이션 가이드라인 카드
dashboard.html      ← 전체를 통합하는 SPA 뷰어
```

Storybook이 도입된 이후, 이 스택의 역할이 어느 부분에서 중복되는지 판단하고
각 파일의 향후 역할을 정의한다.

---

## 판단 기준

| 기준 | 설명 |
|------|------|
| **A** | Storybook이 이미 동일한 역할을 제공하는가? |
| **B** | 기존 파일에 Storybook이 대체할 수 없는 기능이 있는가? |
| **C** | 제거 시 기존 MODULAR workflow에 문제가 생기는가? |
| **D** | Claude Code (SKILL.md)가 해당 파일을 계속 참조해야 하는가? |

---

## 1. `dashboard.html` — KEEP AS LEGACY

### 현재 역할

- MODULAR 전체를 하나의 SPA로 탐색하는 대시보드
- 왼쪽 사이드바: Components / Brand / Colors / Foundations / Spacing / Type / Shapes / Patterns / JAM! App
- 각 섹션: `guidelines/*.html` 또는 `*.card.html`을 iFrame으로 렌더링
- `_ds_manifest.json`과 `_ds_bundle.js`를 의존

### Storybook과의 역할 비교

| 기능 | dashboard.html | Storybook |
|------|---------------|-----------|
| 컴포넌트 갤러리 | ✅ iFrame 카드 | ✅ **스토리 (더 풍부)** |
| 인터랙티브 controls | ❌ 없음 | ✅ Controls 패널 |
| 접근성 검사 | ❌ 없음 | ✅ addon-a11y |
| 핫 리로딩 | ❌ 새로고침 필요 | ✅ HMR |
| 디자인 토큰 뷰 | ✅ guidelines/*.html | ⚠️ 아직 MDX 미작성 |
| 색상 팔레트 | ✅ colors-*.html | ⚠️ 아직 MDX 미작성 |
| 타이포그래피 스케일 | ✅ type-*.html | ⚠️ 아직 MDX 미작성 |
| 스페이싱/레이디어스 | ✅ spacing/radius.html | ⚠️ 아직 MDX 미작성 |
| Do's & Don'ts | ✅ dos-donts.html | ❌ Storybook 미지원 |
| 로고/브랜드 가이드 | ✅ logo.html | ❌ Storybook 미지원 |
| 배지 프레임 (클립 쉐입) | ✅ badge-frames.html | ❌ Storybook 미지원 |
| JAM! App 클릭스루 | ✅ ui_kits/jam-app | ❌ Storybook 미지원 |

### 판단

**컴포넌트 갤러리 역할** → Storybook이 완전 대체 (기준 A: ✅).  
**가이드라인/브랜드 역할** → Storybook 미지원 콘텐츠 존재 (기준 B: ✅).  
**AI 에이전트 참조** → 제거 시 SKILL.md 기반 작업에 브랜드 context 감소 (기준 D: 부분적).

→ **KEEP AS LEGACY** : guidelines MDX 페이지가 Storybook에 작성될 때까지 유지.  
&nbsp;&nbsp;최종 제거 조건: `guidelines/*.html` 콘텐츠 전체가 Storybook MDX로 마이그레이션 완료.

### SKILL.md 업데이트 제안

현재 `design-system/SKILL.md`는 dashboard.html을 직접 명시하지 않지만, `readme.md`를 읽도록 안내한다. `readme.md`의 Index 섹션에 다음을 추가하는 것을 권고한다:

```markdown
* `(Storybook)` — 컴포넌트 인터랙티브 탐색 도구. 로컬: http://localhost:6006
  dashboard.html보다 최신 컴포넌트를 더 완전하게 반영한다.
* `dashboard.html` — 레거시 뷰어 (가이드라인 섹션만 유효; 컴포넌트 목록은 Storybook 참조)
```

---

## 2. `components/*/[category].card.html` (6개) — STORYBOOK REPLACEMENT

### 대상 파일

| 파일 | 담당 컴포넌트 |
|------|--------------|
| `buttons/buttons.card.html` | Button, IconButton |
| `cards/cards.card.html` | Card, BadgeFrame, RarityBadge, ShapeTag |
| `feedback/feedback.card.html` | Toast, ModalToast |
| `forms/forms.card.html` | Input |
| `navigation/navigation.card.html` | TopNav, TabBar |
| `patterns/patterns.card.html` | BadgeGridCard, ListRowCard, CollectionGridCard |

### 현재 역할

- dashboard.html 안에서 iFrame으로 렌더링되는 카드 뷰
- CDN React + Babel + `_ds_bundle.js`를 브라우저에서 런타임 컴파일
- `_ds_manifest.json`의 `cards` 배열에 메타데이터로 등록됨

### Storybook과의 비교

Storybook 스토리가 다음 모든 측면에서 우세하다:

- 각 카드 1개 vs Storybook 스토리 다수 (variants/states 커버리지)
- 정적 iframe vs 인터랙티브 controls
- CDN 의존 런타임 vs HMR 빌드 파이프라인
- 새 컴포넌트(Accordion, BottomSheet, SlidingTabs, Checkbox, Textarea, Select, EmptyState, Skeleton) 미포함 vs Storybook은 포함

### 판단

기준 A: ✅ Storybook이 완전 대체.  
기준 B: ❌ Storybook이 줄 수 없는 기능 없음.  
기준 C: dashboard.html을 유지하는 동안 card.html도 필요 → 즉시 제거 불가.

→ **STORYBOOK REPLACEMENT** : dashboard.html 제거 시 함께 제거.  
&nbsp;&nbsp;현재는 dashboard.html의 의존성으로만 존재하며, 독립적 가치 없음.

---

## 3. `guidelines/*.html` (9종) — KEEP AS LEGACY

### 대상 파일

| 파일 | 내용 | Storybook 대체 가능? |
|------|------|---------------------|
| `colors-primary.html` | Primary/Secondary 팔레트 | ⚠️ MDX 작성 시 가능 |
| `colors-neutral.html` | Neutral/Surface/Border 팔레트 | ⚠️ MDX 작성 시 가능 |
| `colors-rarity.html` | 배지 희귀도 4색 팔레트 | ⚠️ MDX 작성 시 가능 |
| `type-headings.html` | 헤딩 스케일 (Display→H4) | ⚠️ MDX 작성 시 가능 |
| `type-body.html` | Body/Small/Caption | ⚠️ MDX 작성 시 가능 |
| `type-bold.html` | Bold Display (900 weight) | ⚠️ MDX 작성 시 가능 |
| `spacing-scale.html` | 4px 기본 단위 스페이싱 | ⚠️ MDX 작성 시 가능 |
| `radius-scale.html` | 반경 스케일 | ⚠️ MDX 작성 시 가능 |
| `badge-frames.html` | 7종 클립 쉐입 배지 프레임 | ❌ Storybook 미지원 (비컴포넌트) |
| `dos-donts.html` | 시스템 전체 Do/Don't 규칙 | ❌ Storybook에 해당 기능 없음 |
| `loader.html` | WanderingEyes + NavigationLoader | ⚠️ 스토리 있으나 시간 정책 설명 없음 |
| `logo.html` | JAM! 워드마크 사용 규칙 | ❌ 브랜드 자산, 컴포넌트 아님 |
| `shapes.html` | ShapeTag + RarityBadge 상태 | ⚠️ 스토리로 대체 가능 |

### 판단

색상·타이포·스페이싱·반경 관련 파일 (8개) → Storybook MDX 작성 시 **STORYBOOK INTEGRATION** 가능.  
`badge-frames.html`, `dos-donts.html`, `logo.html` (3개) → 브랜드/자산 참조 문서. Storybook보다 독립 HTML이 더 적합.

→ **KEEP AS LEGACY** (전체): 파운데이션 MDX 작성 전까지 유지.  
&nbsp;&nbsp;우선 마이그레이션 대상: colors-*.html → Storybook `Foundations/Colors.mdx`

---

## 4. `_ds_manifest.json` — KEEP

### 현재 역할

- 컴포넌트 레지스트리 (이름, 소스 경로)
- 카드 메타데이터 (경로, 그룹, 뷰포트, 이름, 부제목)
- **전체 디자인 토큰 인벤토리** (CSS 변수명, 실제 값, 종류, 정의 파일)
- 글로벌 CSS 경로, 폰트 정보

### Storybook과의 비교

Storybook은 컴포넌트를 직접 임포트해 렌더링하지만, **디자인 토큰을 기계 읽기용 JSON으로 노출하는 기능이 없다**. `_ds_manifest.json`의 `tokens` 배열은 모든 CSS 변수의 이름·값·종류를 JSON으로 제공하여 다음에 활용된다:

- Claude Code 에이전트가 "현재 사용 가능한 색상 토큰 목록"을 즉시 파악
- 빌드 도구가 `_ds_bundle.js`를 재생성할 때 컴포넌트 목록 참조
- 미래의 Figma 토큰 동기화, 테마 생성 등 자동화

### 현재 상태

- `_ds_manifest.json`의 컴포넌트 목록이 **구버전**이다: 최근 추가된 Accordion, BottomSheet, SlidingTabs, Checkbox, Textarea, Select, EmptyState, Skeleton이 누락됨
- card.html 경로도 구버전 (patterns/patterns.card.html만 추가된 상태)

### 판단

기준 A: ❌ Storybook이 JSON 토큰 레지스트리를 대체하지 않음.  
기준 D: ✅ AI 에이전트가 참조하는 기계 읽기용 문서로서 계속 유효.

→ **KEEP** : 영구 유지. 다만 컴포넌트 목록을 현재 상태로 업데이트 필요.

**권고:** `_ds_manifest.json`의 `components` 배열을 현재 `design-system/components/`의 실제 목록과 동기화하는 별도 작업 필요 (Accordion, BottomSheet, SlidingTabs, Checkbox, Textarea, Select, EmptyState, Skeleton 추가).

---

## 5. `_ds_bundle.js` — KEEP AS LEGACY

### 현재 역할

- 모든 MODULAR 컴포넌트를 `window.JAMShopifyDesignSystem_f8de83` 전역 네임스페이스로 노출하는 UMD 번들
- `dashboard.html`과 `*.card.html`에서 `<script>` 태그로 직접 로드
- CDN React + Babel과 함께 빌드 도구 없이 브라우저에서 컴포넌트를 렌더링

### 현재 상태

- 번들에 포함된 컴포넌트: 15개 (manifest 기준)
- 누락된 컴포넌트: Accordion, BottomSheet, SlidingTabs, Checkbox, Textarea, Select, EmptyState, Skeleton (최근 추가분)
- 번들은 **수동으로 재생성해야** 하며 자동 갱신 메커니즘 없음
- Storybook은 `_ds_bundle.js`를 전혀 사용하지 않음 (JSX를 직접 임포트)

### 판단

기준 A: ✅ Storybook이 컴포넌트 렌더링 역할을 대체.  
기준 B: ❌ Storybook이 동일하거나 더 나은 방식으로 렌더링.  
기준 C: ✅ dashboard.html/card.html이 살아있는 동안 필요.

→ **KEEP AS LEGACY** : dashboard.html 및 card.html 파일이 제거될 때 함께 제거.  
&nbsp;&nbsp;현재는 재생성하지 않는다 — 구버전 상태로 유지하되, 번들을 신규 용도에 사용하지 않는다.

---

## 전체 요약 테이블

| 파일 | 분류 | 제거 조건 |
|------|------|-----------|
| `dashboard.html` | **KEEP AS LEGACY** | guidelines MDX 전체 Storybook 마이그레이션 완료 후 |
| `components/buttons/buttons.card.html` | **STORYBOOK REPLACEMENT** | dashboard.html 제거 시 함께 |
| `components/cards/cards.card.html` | **STORYBOOK REPLACEMENT** | dashboard.html 제거 시 함께 |
| `components/feedback/feedback.card.html` | **STORYBOOK REPLACEMENT** | dashboard.html 제거 시 함께 |
| `components/forms/forms.card.html` | **STORYBOOK REPLACEMENT** | dashboard.html 제거 시 함께 |
| `components/navigation/navigation.card.html` | **STORYBOOK REPLACEMENT** | dashboard.html 제거 시 함께 |
| `components/patterns/patterns.card.html` | **STORYBOOK REPLACEMENT** | dashboard.html 제거 시 함께 |
| `guidelines/colors-*.html` (3개) | **KEEP AS LEGACY** | Storybook Foundations/Colors.mdx 완성 후 |
| `guidelines/type-*.html` (3개) | **KEEP AS LEGACY** | Storybook Foundations/Typography.mdx 완성 후 |
| `guidelines/spacing-scale.html` | **KEEP AS LEGACY** | Storybook Foundations/Spacing.mdx 완성 후 |
| `guidelines/radius-scale.html` | **KEEP AS LEGACY** | Storybook Foundations/Spacing.mdx 완성 후 |
| `guidelines/loader.html` | **KEEP AS LEGACY** | 시간 정책 설명이 스토리에 포함된 후 |
| `guidelines/shapes.html` | **KEEP AS LEGACY** | ShapeTag/RarityBadge 스토리 커버리지 확인 후 |
| `guidelines/badge-frames.html` | **KEEP** | 영구 유지 (클립 쉐입 참조 문서, 비컴포넌트) |
| `guidelines/dos-donts.html` | **KEEP** | 영구 유지 (브랜드 가이드라인, Storybook 미지원) |
| `guidelines/logo.html` | **KEEP** | 영구 유지 (브랜드 자산 참조, Storybook 미지원) |
| `_ds_manifest.json` | **KEEP** | 영구 유지 (컴포넌트 목록 업데이트 필요) |
| `_ds_bundle.js` | **KEEP AS LEGACY** | dashboard.html 제거 시 함께 |

---

## 다음 단계 권고 (우선순위 순)

### 단기 (Storybook 안정화 병행)

1. **readme.md 업데이트** — Index 섹션에 Storybook 언급 추가 (컴포넌트 탐색 1순위로 명시)
2. **`_ds_manifest.json` 컴포넌트 목록 동기화** — 최근 추가 컴포넌트 8개 누락 해소

### 중기 (가이드라인 Storybook 통합)

3. **Storybook MDX 파운데이션 페이지 작성** — `colors-*.html` → `Foundations/Colors.mdx` 등
4. **dashboard.html 역할 명시** — "가이드라인 전용, 컴포넌트는 Storybook" 안내 배너 추가 (코드 최소 변경)

### 장기 (Storybook 완전 안정화 후)

5. **card.html 및 `_ds_bundle.js` 제거** — dashboard.html 가이드라인 섹션을 MDX로 이관 완료 후
6. **dashboard.html 제거** — 모든 콘텐츠가 Storybook MDX + Storybook 스토리로 이관된 후
