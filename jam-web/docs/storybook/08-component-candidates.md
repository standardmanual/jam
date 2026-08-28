# Component Candidates — 서비스 전용 UI 분류

> 기준 문서: `jam-web/docs/storybook/01-modular-audit.md` §5, §10
> 작성일: 2026-08-16
> 목적: 서비스(jam-web/src/)에만 존재하는 UI가 MODULAR 편입 대상인지 평가

---

## 분류 기준

각 항목을 아래 6가지 기준으로 평가한 뒤, 5가지 결과 중 하나로 분류한다.

**평가 기준:**

| 기호 | 기준 |
|------|------|
| ① | 여러 화면에서 반복 사용하는가? |
| ② | 동일한 interaction을 가지는가? |
| ③ | 디자인 토큰에 기반하는가? |
| ④ | 향후 재사용 가능성이 높은가? |
| ⑤ | 이미 존재하는 MODULAR component의 확장으로 해결 가능한가? |
| ⑥ | 특정 도메인/페이지에만 종속되는가? |

**결과 분류:**

| 분류 | 의미 |
|------|------|
| **A** | Existing MODULAR 재사용 — 이미 있는 컴포넌트로 대체 가능 |
| **B** | Existing MODULAR 확장 후보 — MODULAR 컴포넌트에 기능/변형 추가 필요 |
| **C** | New MODULAR Component 후보 — 새 컴포넌트로 MODULAR에 추가 권장 |
| **D** | Pattern으로 관리 — 컴포넌트가 아닌 패턴/가이드라인으로 문서화 |
| **E** | Service-specific 유지 — MODULAR 대상 아님 |

---

## 요약표

| 컴포넌트 | 분류 | 핵심 이유 |
|----------|------|-----------|
| `icons.tsx` | **C** | 서비스 전체 아이콘 시스템, MODULAR 독립 카탈로그 가치 — **편입 완료(티켓 20260828_2043), `components/icons/IconCatalog.jsx`. 서비스 `icons.tsx`는 계속 단일 소스, 수동 동기화 필요** |
| `LoadingSpinner.tsx` | **E** | NavigationLoader 전용 1회 사용, WanderingEyesLoader로 충분 |
| `PopInNumber.tsx` | **C** | 숫자 전환 모션, 재사용 가치 높은 독립 모션 컴포넌트 |
| `SwapText.tsx` | **C** | 텍스트 교체 모션, 재사용 가치 높은 독립 모션 컴포넌트 |
| `Footer.tsx` | **E** | 앱 고유 정보성 컴포넌트, 패턴 일반화 불가 |
| `dotm-hex-8.tsx` | **D** | dotmatrix-core 라이브러리 종속, MODULAR 독립 편입 불가 |
| `dotm-square-3.tsx` | **D** | 동일 이유 |
| `NavigationLoader.tsx` | **E** | Next.js 라우팅 이벤트 종속, 서비스 전용 래퍼 |
| `wandering-eyes.css` | **E** | NavigationLoader 전용 CSS, 서비스 전용 |
| `InventoryGrid.tsx` | **E** | 인벤토리 도메인 전용 레이아웃 |
| `MapView.tsx` | **E** | Leaflet 외부 라이브러리 종속 |
| `StravaStatusCard.tsx` | **E** | Strava 통합 전용 상태 UI |
| `StravaLink.tsx` | **E** | OAuth 플로우 전용 |
| `LocalDate.tsx` | **E** | UI 컴포넌트가 아닌 포맷 유틸리티 |
| `transitions-pages.ts/.css` | **D** | 서비스 모션 시스템, 패턴 문서화 대상 |
| `transitions.css` | **D** | PopInNumber·SwapText의 CSS 기반, 모션 패턴 문서화 대상 |
| `UserSearchBar.tsx` | **B** | 2개 화면에서 재사용, Input + Button 조합 확장 패턴 |
| `FeedSection.tsx` | **E** | 서비스 데이터 로직 + 피드 레이아웃, 도메인 종속 |
| `BadgeDetailSheet.tsx` | **A** | 이미 MODULAR BottomSheet 재사용 중 |
| `InventoryItemHistorySheet.tsx` | **A** | 이미 MODULAR BottomSheet 재사용 중 |
| 미션 카드 (MissionsListClient 인라인) | **C** | 3개 이상 화면 패턴 반복, MissionCard 컴포넌트화 가치 — **컴포넌트 신설 완료(티켓 20260828_2043), `components/cards/MissionCard.jsx`. 서비스 `MissionsListClient.tsx` 교체 연결은 잔여 작업** |
| Error/Forbidden 화면 | **A** | MODULAR EmptyState로 대체 가능 — **`error.tsx`만 전환 완료(티켓 20260828_2043). `forbidden/page.tsx`는 어드민 전용 화면이라 프로젝트 규칙(어드민은 MODULAR 미적용)에 따라 제외** |

---

## 상세 평가

### A. Existing MODULAR 재사용

#### `BadgeDetailSheet.tsx`, `InventoryItemHistorySheet.tsx`

**현황:** 두 파일 모두 `import BottomSheet from '@/components/ui/BottomSheet'`로 MODULAR BottomSheet를 이미 재사용 중.

**기준 평가:** ①○ ②○ ③○ ④○ ⑤○ ⑥✗

**결론:** 이미 올바르게 MODULAR를 재사용하고 있음. 추가 조치 불필요.

---

#### Error/Forbidden 화면 (`error.tsx`, `forbidden/page.tsx`)

**현황:** 하드코딩 `bg-[#0A0A0A]`, `#AEEA00` 사용 중. 빈 화면 직접 구성.

**기준 평가:** ①○ ②✗ ③✗ ④○ ⑤○ ⑥✗

**결론:** MODULAR `EmptyState` 컴포넌트로 대체 가능. 하드코딩 색상은 토큰으로 교체 후 EmptyState 사용 가능.

**구체적 작업 (구현 시):**
- `error.tsx`: `<EmptyState title="오류가 발생했어요" description="..." action={...} />` 패턴
- `forbidden/page.tsx`: `<EmptyState title="접근할 수 없어요" description="..."  />` 패턴
- `bg-[#0A0A0A]` → `var(--color-bg)`, `#AEEA00` → 별도 토큰 필요 여부 판단

---

### B. Existing MODULAR 확장 후보

#### `UserSearchBar.tsx`

**현황:**
- 사용처: `(main)/page.tsx`, `(main)/search/page.tsx` — 2개 화면
- MODULAR의 `Input` 컴포넌트와 유사한 입력 필드이나, `inverse` surface(어두운 배경에 밝은 텍스트)로 구성
- `Button` + `Input`(네이티브) + `SearchIcon` 조합
- 현재 MODULAR `Input` 컴포넌트는 `default` surface만 지원

**기준 평가:** ①○ ②○ ③○ ④○ ⑤○ ⑥✗

**결론:** MODULAR `Input`에 `surface='inverse'` variant 추가 후 패턴화 가능. 단, SearchBar는 단순 Input 확장을 넘어 Button과 조합된 복합 컴포넌트이므로 **D(Pattern)** 병행 가능.

**선택지:**
- `Input`에 `surface` prop 추가 (`'default' | 'inverse'`) — MODULAR 확장
- SearchBar 패턴을 Pattern으로 문서화 — 코드 변경 없이 가이드라인 제공

---

### C. New MODULAR Component 후보

> **C는 즉시 구현하지 않는다.** 아래는 검토 기록이며, 구현 시점은 별도 티켓으로 결정한다.

#### `icons.tsx` — Icon Catalog

**현황:** `SearchIcon`, `MedalIcon`, `PackageIcon`, `GiftIcon` 등 서비스 전역 사용 아이콘 세트. `currentColor` 기반으로 토큰 호환.

**기준 평가:** ①○ ②✗ ③○ ④○ ⑤✗ ⑥✗

**MODULAR 편입 이유:**
- 서비스 전체에서 참조하는 핵심 리소스
- 디자인 토큰(`currentColor`, `--color-text-*`) 준수
- Storybook 아이콘 카탈로그로 전체 아이콘 파악 가능

**편입 방식 (안):**
- `design-system/components/icons/` 디렉토리 신설
- `icons.tsx`를 MODULAR로 이전 또는 링크
- `icons.stories.tsx` — 전체 아이콘 그리드 카탈로그

---

#### `PopInNumber.tsx` — Motion / 숫자 팝인

**현황:** 숫자 갱신 시 각 자리가 아래에서 블러와 함께 들어오는 모션. `ProfileClient` 1곳 사용.

**기준 평가:** ①✗(현재) ②○ ③✗(transitions.css 의존) ④○ ⑤✗ ⑥✗

**MODULAR 편입 이유:**
- 팔로워 수, 포인트 잔액, 미션 카운터 등 숫자 표현에 범용 재사용 가능
- `transitions.css`를 MODULAR에 포함하면 독립 가능
- WanderingEyesLoader와 유사한 "모션 컴포넌트" 카테고리로 분류 가능

**전제 조건:** `transitions.css`의 `t-digit-group` / `t-digit` 클래스를 MODULAR 토큰 체계로 이식해야 함.

---

#### `SwapText.tsx` — Motion / 텍스트 스왑

**현황:** 같은 자리에서 텍스트가 위로 빠지고 아래에서 들어오는 모션. `ProfileClient` 1곳 사용.

**기준 평가:** ①✗(현재) ②○ ③✗(transitions.css 의존) ④○ ⑤✗ ⑥✗

**MODULAR 편입 이유:**
- 팔로우/팔로잉 버튼 라벨, 상태 전환 문구("확인 중…" → "완료") 등에 범용 재사용 가능
- PopInNumber와 함께 `design-system/components/motion/` 카테고리로 분류 가능

**전제 조건:** `transitions.css`의 `t-text-swap` 클래스 및 `cssDurationMs` 유틸을 MODULAR에 포함해야 함.

---

#### 미션 카드 — Service Card Pattern

**현황:** `MissionsListClient.tsx`에 미션 카드 전체가 인라인. 하드코딩 색상 7개. 컴포넌트화 미완성.

**기준 평가:** ①○(미션 목록·상세·홈 피드) ②○ ③✗(하드코딩) ④○ ⑤○(Card + RarityBadge 활용 가능) ⑥✗

**MODULAR 편입 이유:**
- 미션 목록·미션 상세·홈 피드(FeedSection) 등 여러 화면에서 동일 패턴 반복
- `Card` + `RarityBadge` + `Button` 조합으로 구성 가능
- 하드코딩 색상을 토큰으로 교체하면 DS 준수 가능

**편입 방식 (안):** `design-system/components/cards/MissionCard.*` 신설

---

### D. Pattern으로 관리

> **컴포넌트가 아닌 패턴/가이드라인으로 문서화한다. 코드 이전 없음.**

#### `dotm-hex-8.tsx`, `dotm-square-3.tsx` — DotMatrix 로더 패밀리

**현황:** `@/lib/dotmatrix-core` 및 `@/lib/dotmatrix-hooks` 라이브러리 종속. 이 라이브러리 없이는 동작 불가.

**기준 평가:** ①✗ ②○ ③○(일부) ④○ ⑤✗ ⑥✗

**MODULAR 편입 불가 이유:**
- `dotmatrix-core` 라이브러리가 서비스 전용 (`@/lib/` 경로) — MODULAR 독립 패키지에 편입 불가
- 외부 패키지로 분리되지 않는 한 MODULAR에서 단독으로 배포 불가

**관리 방식:** 서비스 내 DotMatrix 컴포넌트 사용 패턴을 Storybook의 **서비스 전용 Story 섹션**으로 문서화.

---

#### `transitions-pages.ts/.css`, `transitions.css` — 서비스 모션 시스템

**현황:** Next.js 라우팅 기반 페이지 전환 + `t-digit-group`, `t-text-swap` 모션 클래스 정의.

**기준 평가:** ①○ ②○ ③○ ④○ ⑤✗ ⑥✗

**MODULAR 편입 고려:**
- PopInNumber·SwapText를 MODULAR 편입할 경우(C항목), 이 CSS도 함께 이전 필요
- 페이지 전환 CSS는 Next.js App Router 종속이므로 별도 관리

**관리 방식:** Storybook의 **Motion 가이드** 페이지로 전환 패턴 문서화. PopInNumber·SwapText Story에서 실제 CSS 기반 시연.

---

### E. Service-specific 유지 (MODULAR 대상 아님)

| 컴포넌트 | 이유 |
|----------|------|
| `LoadingSpinner.tsx` | NavigationLoader 전용 1회 사용. MODULAR에 `WanderingEyesLoader` 이미 존재. 중복 불필요. |
| `Footer.tsx` | 앱 고유 법적 정보·링크. 범용화 가치 없음. |
| `NavigationLoader.tsx` | Next.js `usePathname` / `usePrevPathname` 훅에 종속. 서비스 라우팅 레이어 전용. |
| `wandering-eyes.css` | NavigationLoader와 1:1 대응. 서비스 전용. |
| `InventoryGrid.tsx` | 인벤토리 도메인 전용 그리드 레이아웃. 재사용 경로 없음. |
| `MapView.tsx` | Leaflet 외부 라이브러리 종속. DS 범위 외. |
| `StravaStatusCard.tsx` | Strava API 데이터 의존. 서비스 통합 전용. |
| `StravaLink.tsx` | OAuth 플로우 전용 링크. 서비스 로직 종속. |
| `LocalDate.tsx` | UI 컴포넌트가 아닌 포맷 유틸리티. MODULAR 범위 외. |
| `FeedSection.tsx` | 서비스 DB 쿼리 + 피드 도메인 로직 포함. 재사용 불가. |
| `MissionDetailClient.tsx` | 미션 상세 페이지 레이아웃. 도메인 종속. |
| `DropsClient.tsx` | MapView(Leaflet) 종속 드랍 지도 + 목록. 도메인 종속. |

---

## MODULAR 편입 우선순위 (C/B 항목만)

| 순위 | 컴포넌트 | 이유 |
|------|----------|------|
| 1 | `icons.tsx` → Icon Catalog | 서비스 전체 의존, 가장 높은 Storybook 가치 — **완료(20260828_2043)** |
| 2 | 미션 카드 → MissionCard | 다중 화면 반복, 하드코딩 해소 기회 — **컴포넌트 신설 완료(20260828_2043), 서비스 연결은 별도 판단 필요** |
| 3 | `UserSearchBar.tsx` → Input 확장 또는 Pattern | 2개 화면 재사용, 코드 중복 |
| 4 | `PopInNumber.tsx` + `SwapText.tsx` → Motion 카테고리 | transitions.css 이전 전제 필요 |

---

## 비고

- C·D 항목은 이 문서에서 **기록만** 한다. 구현은 별도 티켓으로 진행한다.
- A 항목 중 Error/Forbidden 화면은 하드코딩 토큰 교체와 함께 EmptyState 마이그레이션 가능 — 작업량 소규모.
- B 항목 `UserSearchBar`는 `Input`에 `surface` prop 추가가 MODULAR 수정을 수반하므로 DECISION REQUIRED 상태.
- **2026-08-31(티켓 20260828_2043)**: `icons.tsx`·미션 카드·Error 화면 3건 편입 완료. `PopInNumber`·`SwapText`·`UserSearchBar`는 기존 MODULAR API 변경·다른 스토리 회귀 위험으로 이번 범위에서 제외됐다(사용자 확인).
