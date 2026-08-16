# Design Renewal Specification
**버전:** 1.0  
**작성일:** 2026-08-15  
**목적:** JAM! 서비스 UI 리뉴얼 시 Claude Code가 따라야 하는 의사결정된 디자인 기준  
**근거:** 2026-08-15 Figma 와이어프레임 vs 스테이징 비교 분석 + 사용자 확정 결정

> 이 문서는 Figma를 설명하지 않는다. Figma 와이어프레임을 참고 자료로 분석한 뒤,
> 사용자가 내린 의사결정을 코드 구현 기준으로 정리한 것이다.
> Figma와 이 문서가 충돌하면 모듈러에 추가 한다. 의사결정이 필요한 경우 즉시 확인한다.

---

## 1. Renewal Goals

이번 리뉴얼이 해결하려는 문제는 다음과 같다.

### 핵심 문제
1. **시각 언어 일관성 부재** — 모듈러 토큰이 도입됐지만 일부 화면은 여전히 하드코딩 값, 레거시 컴포넌트, 용어 혼재 상태
2. **사용자 노출 텍스트 오류** 
3. **컴포넌트 혼재** — 동일한 기능(버튼, 필터, 탭)이 화면마다 다른 컴포넌트로 구현됨
4. **정보 밀도 불균형** 
5. **모바일 UX 이질감** 

### 리뉴얼 범위
- 스테이징 서비스 리뉴얼 : 사용자 대면 전체 화면
- 모듈러 업데이트 : 제공한 피그마 파일의 구성요소를 모듈러에 추가. 토큰 완전 적용

### 리뉴얼 제외 범위
- 어드민 패널 (`/admin/`)
- 배지 엔진·드랍 엔진 로직
- API 라우트

---

## 2. Design Principles

리뉴얼 이후 모든 화면이 반드시 지켜야 할 원칙.

1. **토큰 우선** — 색상·간격·반경·폰트 크기는 반드시 모듈러 토큰(`var(--…)`)으로 표현한다. Tailwind arbitrary value도 `var()` 참조를 통해서만 사용한다. `#hex`, `px` 리터럴 직접 사용 금지.

2. **블랙 캔버스 단일 테마** — JAM!은 다크 전용 앱이다. 라이트 모드 대응 코드(`prefers-color-scheme: light`) 작성 금지. 단, 흰 surface 위에 놓이는 컴포넌트(카드 내부 라이트 요소)는 `surface-inverse` 토큰 사용.

3. **컴포넌트 재사용 강제** — 새로운 버튼, 탭, 필터, 카드를 만들 때 DS 컴포넌트(`Button`, `SlidingTabs`, `Card`)를 먼저 사용한다. 컴포넌트로 표현할 수 없는 경우에만 새 컴포넌트를 설계하여 모듈러에 추가한다.
4. 모듈러 컴포넌트 강화 - 모듈러에 정의 되지 않은 컴포넌트가 필요한 경우 설계후 추가한다. 기준은 기존의 모듈러 정책을 따른다.
5. 모듈러 컴포넌트 패턴 추가 - 현재 모듈러에 정의된 카드 타입 구분과 같이 서비스에서 주로 사용되는 컴포넌트 그룹을 패턴화 하여 모듈러 및 서비스 소스코드에 추가한다. 이를 위해 모듈러내에 패턴 색션을 추가하고 시스템화 함 (예 : 배지 목록에서의 1개의 배지 카드, 미션 목록의 한 행의 카드 덩어리, 유저 검색 목록/팔로워 목록/리더보드등에서 사용되는 유저 목록 등)

6. **모션은 토큰으로** — 모든 트랜지션·애니메이션은 `globals.css`의 모션 토큰(`var(--duration-*)`, `var(--ease-*)`)을 참조한다. 임의 ms 값 사용 금지.

7. **터치 타겟 44pt** — 모든 인터랙티브 요소(버튼, 탭, 카드 내 CTA)의 최소 터치 영역은 44×44pt.

8. **그림자는 inset border만** — 드롭섀도(`box-shadow: 0 N px`) 사용 금지. `var(--shadow-subtle)` (inset 1px border)만 허용.

9. **UX Writing 선검증** — 사용자에게 노출되는 모든 문자열은 코드 작성 전 `UX_WRITING_GUIDELINE.md` 검증.
10. 정의 되지 않은 것은 위의 기준으로 처리하고 이문서내용으로 처리 되지 못하는 경우 현재 스테이징에 구현된 상태를 유지하는 것으로 한다.
11. 제공했던 피그마 파일은 개념적 디자인 리뉴얼의 방향을 확인하기 위함이었음. 주요 화면의 레이아웃 구성과 배지, 미션등의 단위별 UI 및 각 컨텐츠의 상세/목록화면의 카드 디자인을 업그레이드 하기 위한 방향이 포함되어 있다.

---

## 3. Visual Direction

여기서 의미하는 모듈러는 제공한 피그마의 신규 요소 및 토큰을 포함한 것을 의미함
아래 내용구성에 피그마의 요소가 없는 경우 추가 필수
### Typography

**폰트:** Pretendard Variable (CDN 유지, 변경 금지)

**타이포그래피 스케일 -모듈러 기준**

| 역할 | 토큰 | 크기 | Line Height |
|---|---|---|---|
| 디스플레이 | `--text-display` | 96px | 1.08 |
| 헤딩 | `--text-heading` | 44px | 1.1 |
| 헤딩 SM | `--text-heading-sm` | 28px | 1.2 |
| 서브헤딩 | `--text-subheading` | 24px | 1.3 |
| 본문 | `--text-body` | 16px | 1.5 |
| 소문자 | `--text-small` | 14px | 1.43 |
| 캡션 | `--text-caption` | 12px | 1.4 |

**규칙:**
- Font weight는 400(Regular) Medium 사용 금지.
- 제목·레이블의 letter-spacing: `var(--tracking-label)` (0.4px).
- 텍스트 색상: 기본 `var(--color-text)`, 보조 `var(--color-text-secondary)`.

### Color

**팔레트 — 모듈러 시맨틱 토큰만 사용**

| 역할 | 토큰 | 값 |
|---|---|---|
| 캔버스 배경 | `--color-bg` | #000000 |
| 카드/raised surface | `--color-surface` | #1a1a1a |
| 배경 틴트 | `--color-bg-tint` | #222222 |
| 기본 텍스트 | `--color-text` | #ffffff |
| 보조 텍스트 | `--color-text-secondary` | #b2b2b2 |
| 브랜드 강조 (CTA) | `--color-primary` | #e8461f (레드-오렌지) |
| 구분선 | `--color-border` | #2a2a2a |
| 반전 텍스트 | `--color-text-inverse` | #000000 |
| 오버레이 | `--color-overlay` | rgba(0,0,0,0.6) |

**희귀도 토큰 (배지 전용)**

| 등급 | 배경 토큰 | 텍스트 토큰 |
|---|---|---|
| COMMON | `--color-rarity-common` (#6b6b6b) | `--color-rarity-common-text` |
| RARE | `--color-rarity-rare` (#00cc7a) | `--color-rarity-rare-text` |
| LEGEND | `--color-rarity-legend` (#f5a300) | `--color-rarity-legend-text` |
| MYTHIC | `--color-rarity-mythic` (#ff2d87) | `--color-rarity-mythic-text` |

**금지:**
- `jam-*` 팔레트(`--color-jam-orange` 등) 신규 화면 사용 금지. 기존 참조 화면 리뉴얼 시 제거.
- `--color-main`, `--color-sub` (어드민 테마 전용) 사용자 화면 적용 금지.
- hex 리터럴 직접 사용 금지.

### Spacing

**4px base scale — 모듈러 스페이싱 토큰**

```
--spacing-4   4px   (마이크로 간격, 배지 내부 등)
--spacing-8   8px   (아이콘 gap, 인라인 요소 간격)
--spacing-12  12px  (소형 컴포넌트 내부 패딩)
--spacing-16  16px  (기본 element gap)
--spacing-24  24px  (카드 패딩, 섹션 내 그룹 간격)
--spacing-32  32px  (버튼 수평 패딩)
--spacing-40  40px  (섹션 간 여백 소)
--spacing-48  48px  (섹션 간 여백 표준)
--spacing-64  64px  (대형 섹션 구분)
--spacing-96  96px  (페이지 top 여백)
```

**시맨틱 레이아웃 토큰:**
- `--layout-card-padding: var(--spacing-24)` — 카드 내부 패딩 표준
- `--layout-section-gap: var(--spacing-48)` — 섹션 간 여백
- `--layout-element-gap: var(--spacing-16)` — 요소 간 기본 gap

### Density

- **카드:** 내부 패딩 `var(--layout-card-padding)` (24px), 요소 간 gap `var(--layout-element-gap)` (16px)
- **리스트:** 아이템 간 gap 최소 `var(--spacing-12)`, 클릭 영역 min-height 44px
- **배지 그리드:** 3열 고정(`grid-cols-3`), gap `var(--spacing-8)` 또는 `var(--spacing-12)`
- **믹스 슬롯:** 2행 5열(`grid-cols-5`), 10슬롯 고정
- **인벤토리 그리드:** 3열 고정(`grid-cols-3`)

### Hierarchy

정보 위계 표현 규칙:
- 1차 정보: `--text-heading-sm` 이상, `--color-text`
- 2차 정보: `--text-body`, `--color-text`
- 3차 정보(보조/설명): `--text-small` 또는 `--text-caption`, `--color-text-secondary`
- 상태/분류 레이블(뱃지·chip): `--text-caption`, 희귀도 토큰 또는 `--color-primary`
- 섹션 eyebrow: `--text-caption`, `--color-text-secondary`, letter-spacing `var(--tracking-label)`

### Radius

| 용도 | 토큰 | 값 |
|---|---|---|
| 버튼·pill | `--radius-pill` / `--radius-buttons` | 9999px |
| 카드 | `--radius-card` / `--radius-cards` | 16px |
| 인풋 | `--radius-inputs` | 8px |
| 소형 chip/뱃지 | `--radius-xs` | 4px |
| 태그·pill chip | `--radius-tags` | 9999px |

### Shadow

- **허용:** `var(--shadow-subtle)` = `inset 0 0 0 1px var(--color-border)` — 카드·구분선 전용
- **허용:** `var(--shadow-subtle-2)` = `inset 0 0 0 1px var(--color-border-inverse)` — 라이트 surface 위
- **금지:** 드롭섀도(`box-shadow: 0 Npx Mpx …`) 사용 금지
- **금지:** `filter: drop-shadow(…)` 사용 금지

### Motion

모든 트랜지션·애니메이션은 `globals.css`의 모션 토큰을 참조한다.

**주요 duration 기준:**

| 케이스 | 토큰 | 값 |
|---|---|---|
| 탭 전환 | `--tabs-dur` | 300ms |
| 모달 열기 | `--modal-open-dur` | 250ms |
| 모달 닫기 | `--modal-close-dur` | 150ms |
| 페이지 전환 | `--page-slide-dur` | 250ms |
| 토스트 | `--toast-open` | 350ms |
| 배지 획득 강조 | `--duration-very-slow` | 500ms |
| 버튼 피드백 | `--duration-quick` | 150ms |

**주요 easing 기준:**

| 케이스 | 토큰 |
|---|---|
| 패널/모달 열기·닫기 | `--ease-smooth-out` |
| 아이콘 스왑 | `--ease-in-out` |
| 배지 pop | `--ease-bounce` |
| 스피너·shimmer | `--ease-linear` |

**접근성:**
- `prefers-reduced-motion: reduce` 시 모든 트랜지션 `duration: 0.01ms`로 단축. shimmer 애니메이션 비활성화.

---

## 4. Component Rules

### Button

**모듈러 Button 컴포넌트(`Button.tsx`) 사용 필수.**

| variant | 사용 케이스 |
|---|---|
| `primary` | 화면 내 주요 CTA 1개 (믹스하기, 동기화하기 등) |
| `outline` | 보조 액션, 취소, 세컨더리 CTA |
| `arrow` | 링크성 텍스트 버튼 (더 보기 →) |

| surface | 사용 케이스 |
|---|---|
| `main` (기본) | 검정 캔버스 위 — pill은 흰 채움 |
| `sub` | 라이트 카드(`--color-surface-inverse`) 위 — pill은 레드-오렌지 채움 |

**규칙:**
- 인라인 `<button>` 직접 사용 금지. 반드시 `Button` 컴포넌트 사용.
- 한 화면에 `primary` 버튼은 최대 1개. 병렬 CTA는 `outline` 사용.
- 비활성(disabled) 상태: `opacity: 0.4`, 클릭 차단. 별도 스타일 오버라이드 금지.
- 로딩 상태: `loading={true}` prop 사용. 스피너 자동 삽입.
- `fullWidth` 사용 케이스: 바텀시트 내부, 단일 CTA 전체 폭 버튼.

### SlidingTabs

**SlidingTabs 컴포넌트 사용 필수.** 수동 탭 버튼 행 구현 금지.

| variant | 사용 케이스 |
|---|---|
| `onSurface` (기본) | 검정 배경 위 — 활성 pill 흰색 |
| `onCard` | 라이트 카드 위 — 활성 pill 레드-오렌지 |

| size | 사용 케이스 |
|---|---|
| `lg` (44px) | 터치 영역 필요한 모든 탭 (기본 사용) |
| `md` (30px) | 콤팩트 세그먼트 컨트롤 (어드민 전용) |

**규칙:**
- 탭 수: 최대 4개. 5개 이상은 스크롤 탭 또는 필터 칩으로 대체.
- 미션 목록 3탭(진행중/참가중/종료), 배지도감 3탭(액티비티/장소/아이템북) 유지.

### Card

**`Card` 컴포넌트 사용.** 반경 `var(--radius-card)`, 패딩 `var(--layout-card-padding)`.

### Chip / Badge

**희귀도 chip:** `--color-rarity-*` 토큰 사용, `--radius-tags` (pill).  
**상태 chip(NEW/참가중/상시):** `--color-primary`(NEW) 또는 `--color-border-light`(그 외), `--radius-tags`.  
**완성 chip:** `--color-rarity-legend`(#f5a300), `--radius-tags`.

### Filter Dropdown

네이티브 유지

### State Rules

모든 인터랙티브 컴포넌트는 다음 상태를 정의해야 한다:
- **Default** — 기본 상태
- **Active/Selected** — 선택/활성 상태 (DS 토큰으로 표현)
- **Disabled** — `opacity: 0.4`, `cursor: not-allowed`
- **Loading** — 스피너 또는 스켈레톤 (컴포넌트별 정의)

Hover 상태는 마우스 환경 보조 피드백으로만 허용. 모바일 핵심 UX에서 hover 의존 금지.

---

## 5. Layout Rules

### Container

- **최대 폭:** 모바일 웹 전용 (`max-width: 430px`, 센터 정렬)
- **페이지 수평 패딩:** `var(--spacing-16)` (양측)
- **탭바 높이:** 고정 (safe-area-inset-bottom 포함)
- **안전 영역:** `padding-bottom: var(--spacing-safe-bottom)` 탭바 하단

### Grid

| 화면 | 그리드 | gap |
|---|---|---|
| 배지도감 | 3열 | `var(--spacing-8)` |
| 인벤토리 | 3열 | `var(--spacing-8)` |
| 믹스 슬롯 | 5열 2행 (10슬롯 고정) | `var(--spacing-8)` |
| 아이템북(컬렉션) | 2열 | `var(--spacing-12)` |
| 프로필 배지 쇼케이스 | 3열 | `var(--spacing-8)` |
| 미션 목록 | 1열 리스트 | `var(--spacing-12)` |

### Spacing

- **섹션 간:** `var(--layout-section-gap)` (48px)
- **카드 내 요소 간:** `var(--layout-element-gap)` (16px)
- **인라인 요소 간:** `var(--spacing-8)` 또는 `var(--spacing-12)`

### Responsive

JAM!은 **모바일 전용 앱**이다.

- 기준 뷰포트: 390px (iPhone 14 기준)
- 최소 지원: 375px (iPhone SE)
- 데스크탑 뷰에서는 중앙 컨테이너(max-width: 430px) 내에서만 렌더
- 가로 스크롤 절대 금지. 넘치는 콘텐츠는 `overflow-x: hidden` 또는 수직 재배치.

---

## 6. UX Rules

### Navigation

**탭바 구성 (현재 서비스 유지):**

| 탭 | 경로 | 아이콘 + 텍스트 레이블 |
|---|---|---|
| 투데이(홈) | `/` | 집 아이콘 + "투데이" |
| 배지 | `/badges` | 원 아이콘 + "배지" |
| JAM(드랍) | `/drops` | 핀 아이콘 + "JAM" |
| 미션 | `/missions` | 번개 아이콘 + "미션" |
| 인벤토리 | `/inventory` | 상자 아이콘 + "인벤토리" |
| 프로필 | `/profile` | 사람 아이콘 + "프로필" |

**규칙:**
- 탭바 텍스트 레이블 유지 (아이콘 온리 전환 금지)
- 믹스(`/combine`) 탭바 직접 추가 금지 — 인벤토리에서 진입 경로 유지
- 탭 전환: `SlidingTabs` 또는 탭바 전환 모션 `var(--tabs-dur)` 300ms

### Interaction

**버튼 피드백:** `active:scale-95` (100ms). 드롭섀도 효과 사용 금지.  
**카드 탭:** 피드백 있음 (opacity 또는 scale). 라우팅은 `Next.js Link` 사용.  
**스와이프:** 현재 서비스에서 구현된 제스처 유지. 신규 스와이프 제스처 추가 금지 (리뉴얼 범위 아님).

### Feedback

| 케이스 | 컴포넌트 | 토큰 |
|---|---|---|
| 성공 알림 | Toast | `--toast-open` 350ms |
| 오류 알림 | Toast | `--shake-*` 또는 Toast |
| 믹스 성공 | 결과 화면 (리뉴얼 후) | `--duration-very-slow` 500ms |
| 버튼 로딩 | `Button loading={true}` | 스피너 자동 |

### Loading

- **현재:** 기존 스켈레톤 임시 유지
- **리뉴얼 후:** 각 화면 레이아웃 기준 스켈레톤 재설계 (To-Do 티켓 014)
- **스켈레톤 색상:** `--color-surface` 기반, shimmer 애니메이션은 `var(--pulse-dur)` 1000ms
- `prefers-reduced-motion` 대응: shimmer 비활성화, 정적 placeholder만 표시

### Empty State

현재 서비스의 Empty State 구현 유지. 리뉴얼 후 화면별 Empty State 재검토.  
공통 원칙: 아이콘 또는 일러스트 + 설명 1줄 + CTA 버튼(해당 시)

### Error

**에러 메시지 3단계 구조** (UX Writing 가이드라인):
```
[현상]: 무엇이 안 됐는지
[원인]: 왜 안 됐는지
[해결책]: 어떻게 하면 되는지
```

- GPS 거부: "위치 권한이 없어요. 설정에서 위치 접근을 허용해 주세요."
- API 실패: "잠시 문제가 생겼어요. 다시 시도해 주세요."
- 네트워크 없음: "인터넷 연결을 확인해 주세요."

---

## 7. Accessibility Rules

- **최소 터치 타겟:** 44×44pt (`var(--touch-target-min)`)
- **색상 대비:** `--color-text-secondary` (#b2b2b2 on #000) = 4.6:1 — WCAG AA 준수
- **이미지 alt 텍스트:** 모든 비장식 이미지에 의미 있는 alt 필수. `alt=""` 빈값은 순수 장식 이미지에만 허용.
- **배지 이미지:** `alt="{배지명} 배지"` 형식
- **시맨틱 HTML:** 버튼은 `<button>`, 링크는 `<a>`, 탭은 `role="tablist"/"tab"`
- **포커스 표시:** 키보드 포커스 링 제거 금지. `outline` 또는 `ring` 유지.
- **동적 콘텐츠:** 상태 변경 시 `aria-live="polite"` 또는 `aria-live="assertive"` 적용
- **감소 모션:** `prefers-reduced-motion: reduce` 시 모든 애니메이션 0.01ms로 단축

---

## 8. What Must NOT Change

아래 사항은 리뉴얼에서 변경하지 않는다.

### 기능·데이터
- 믹스 슬롯 수: **10개 (2×5 그리드)** 고정. Figma의 4슬롯 제안 채택 안 함.
- 잼포인트: 프로필에 **유지**. 표시 위치는 리뉴얼 시 결정.
- 믹스 진입 경로: **인벤토리 → 믹스** 경로 유지. 탭바에 직접 추가 금지.
- 활동 피드: 프로필의 활동 피드 **유지**. 배지 쇼케이스 탭 추가는 별도 검토.
- Strava 연동 카드: 미연동 사용자 프로필에 **유지**.
- 홈 기능: 진행 알림 카드, Strava 동기화 카드, 검색 기능 **모두 유지**.

### 용어
- 조합 기능: **"믹스"** 고정. "조합"/"조합하기" 사용 금지.
- 아이템북: 내부 라우트 slug(`/itembooks`)는 유지. UI 레이블은 **"컬렉션"** (리뉴얼 후 적용).

### UX 패턴
- 탭바 텍스트 레이블 유지
- 프로필: 소셜 지표(팔로워 수/팔로잉/게시물 수) **적용 금지**. Follow/Message/Email 버튼 **적용 금지**.
- 탭 구조 (배지도감 3탭, 미션 3탭) 유지

### 기술
- Pretendard Variable 폰트 유지
- 모듈러 토큰 체계 (`globals.css`) 유지
- transitions.dev 모션 토큰 체계 유지
- Next.js App Router 라우팅 구조 유지

---

## 9. What MUST Change

이번 리뉴얼에서 반드시 변경해야 하는 것.

### 즉시 (리뉴얼 전에도 수정 가능)
| 항목 | 위치 | 변경 내용 |
|---|---|---|
| 미션 타입 코드 노출 | `MissionsListClient.tsx:212` | `MISSION_TYPE_LABELS` 딕셔너리 연결 |
| 미션 activity_type 미번역 | `MissionDetailClient.tsx:136-138` | `ACTIVITY_TYPE_LABELS` 딕셔너리 추가 |
| 미션 보상 배지 alt | `MissionDetailClient.tsx:191` | `alt="{배지명} 배지"` 추가 |

### 리뉴얼 포함 필수 변경
| 항목 | To-Do 티켓 | 변경 내용 |
|---|---|---|
| 미션 필터 OS 피커 | 001 | 인앱 드롭다운 컴포넌트로 교체 |
| 미션 카드 상태 뱃지 | 010 | NEW/참가중/상시 chip 추가 |
| 미션 카드 썸네일 | 003 | DB 마이그레이션 + 이미지 렌더링 |
| 아이템북 "완성" chip | 011 | discoveredBadgeCount 기반 chip 추가 |
| 인벤토리 슬롯 카운트 | 012 | "N/M 슬롯 사용중 · K개 남음" 형식 |
| 인벤토리 우상단 버튼 | 013 | 레이블 "믹스하기" 확정 |
| 아이템북→컬렉션 용어 | 005 | UI 레이블 전체 "컬렉션" 통일 |
| 믹스 결과 화면 | 015 | 성공/실패 전용 화면 재설계 |
| `<img>` → `<Image>` | 006 | Next.js Image 최적화 전환 |
| 아이템북 발견 수 표시 | 009 | discoveredBadgeCount UI 노출 |
| 로딩 스켈레톤 재설계 | 014 | 화면 레이아웃 기준 재설계 |

---

## 10. Intentional Differences

현재 서비스와 달라도 의도적으로 유지하는 것.

| 차이                          | 이유                           |
| --------------------------- | ---------------------------- |
| Figma 4슬롯 ≠ 구현 10슬롯         | Figma 오류. 10슬롯이 서비스 의도.      |
| Figma "조합" ≠ 구현 "믹스"        | "믹스" 확정 용어. Figma 업데이트 필요.   |
| Figma 소셜 프로필 ≠ 구현 배지 쇼케이스   | JAM!은 SNS가 아님. 소셜 지표 채택 안 함. |
| Figma 잼포인트 제거 ≠ 구현 잼포인트 유지  | 리텐션 KPI. Figma 오류로 판정.       |
| Figma 활동 피드 제거 ≠ 구현 유지      | Strava 연동 핵심 가치 전달 경로.       |
| Figma 탭바 아이콘 온리 ≠ 구현 레이블 유지 | 접근성 및 신규 사용자 디스커버빌리티.        |

---