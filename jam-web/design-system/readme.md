# JAM! 디자인 시스템

JAM!을 위한 시각적 디자인 시스템입니다.

## 출처 (Sources)

* GitHub: [standardmanual/jam](https://github.com/standardmanual/jam) — JAM! 앱 콘텐츠, 화면 구조, 카피/용어, UX 작성 규칙(`Service Plan/Specs/UX_WRITING_GUIDELINE.md`)을 확인하기 위해 참조했습니다.

더 심도 있는 재구성을 위해 이것들을 더 살펴보세요 — GitHub 리포지토리에는 전체 앱(미션, 드랍, 조합, 관리자)이 포함되어 있습니다.

## 콘텐츠 기본 원칙 (Content fundamentals)

JAM!의 톤앤매너 (`UX_WRITING_GUIDELINE.md`에서 가져옴): 시스템이 알림을 보낸다기보다는 사용자의 운동을 축하해 주는 친구의 톤입니다. 사용자 대면 카피는 격식 없는 해요체, 1인칭 관점 프레이밍("시현님이 모은 아이템", "고객님"은 절대 사용 안 함)을 사용하며, 드랍/아이템을 세계관 내부의 이벤트로 다룹니다("근처에 아이템이 떨어졌어요"). 고정 용어: 획득 (earn), 드랍 (drop), 픽업 (pickup), 방문 인증 (visit verification), 포인트, 인벤토리, 아이템북. 되돌릴 수 없는 작업(거래, 만료, 어뷰징 감지)에서는 톤이 단호하고 직설적으로 변하며, 절대 장난스럽게 표현하지 않습니다. 본문 카피에는 이모지를 사용하지 않으며, 가이드라인 자체 예시에 따라 축하하는 순간에만 제한적으로 사용합니다.

## 비주얼 기반 (Visual foundations)

* **팔레트(Palette)**: 블랙 캔버스, 화이트 텍스트, 깊이감을 위한 그레이 카드 표면(`#1a1a1a`), 하나의 주도적인 레드-오렌지 액센트(`#e8461f`), 보조 컬러인 브라운(`#8a5a2e`). 
* **타이포그래피(Type)**: Noto Sans KR. 헤딩은 라이트 웨이트(300–400), 히어로 모먼트를 위한 큰 디스플레이 크기, H1/H2의 좁은 음수 자간(negative letter-spacing).
* **모서리 반경(Radius)**: 일관되게 라운드 처리됨 — 4px 미세함, 8–10px 인풋/버튼, 16px 카드, 히어로 스케일 카드는 최대 48px, 버튼 및 태그용 완전한 알약형/필(9999px).
* **엘리베이션(Elevation)**: 은은한 틴트 그림자(3개 레벨)
* **간격(Spacing)**: 10px 기본 단위 및 배수(8/10/12/16/24/40/80/128).
* **배경(Backgrounds)**: 플랫 컬러, 그라데이션 없음.
* **호버/프레스(Hover/press)**: 버튼을 누를 때 0.96 크기로 축소됨; 색상이 어두워지는 호버 시스템은 추출되지 않았으며 최소한으로 유지됨.
* **테두리(Borders)**: 명시적 요구가 있는 경우를 제외하고 절대 사용하지 않음. 그림자 시스템과 조합됨.


## 의도적인 추가 사항 (Intentional additions)

* **도형 태그 클라우드 (`ShapeTag`)** — 뱃지 및 인벤토리 화면의 뱃지/썸네일 상자, 컨텐츠 태그용. 인덱스별로 모양과 색상을 순환시켜 수집품 그리드가 정형화된 아이콘 그리드가 아닌 생기 넘치는 태그 클라우드로 읽히도록 했습니다.

## 소스로부터 1:1 재현 (Recreated 1:1 from source)

* **TabBar** — 플로팅 필 형태의 하단 내비게이션(아이콘 전용, 활성 점 표시기, 채우기/선 아이콘 전환)은 `jam-web/src/components/ui/TabBar.tsx`의 마크업 및 SVG 아이콘 경로에서 직접 복사되었으며, 색상만 수정되었습니다 (기존 코발트/아이스 대신 퍼플 활성 상태).
* **모바일 뷰포트** — UI 키트 프레임은 430×932로, 코드베이스 자체의 `max-w-[430px] mx-auto` 모바일 컨테이너(`jam-web/src/app/(main)/layout.tsx`)와 일치합니다. 데스크톱에서는 동일한 방식으로 배경 중앙에 렌더링됩니다.
* **모션** — `tokens/motion.css`의 지속 시간/이징(durations/easings)은 JAM!의 프로덕션 `globals.css`에서 실행되는 동일한 마이크로 인터랙션 시스템인 [transitions.dev](https://transitions.dev/detail.html?doc=installation)에서 1:1로 복사되었습니다.

## 폰트 설정 (Font Setup)

DS v2는 Noto Sans KR을 기본 서체로 사용한다. CDN `@import` 대신 환경에 맞는 방식으로 로드해야 한다.

### Next.js (권장)

```jsx
// app/layout.tsx
import { Noto_Sans_KR } from 'next/font/google'

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '900'],
  variable: '--font-noto-sans-kr',
})

export default function RootLayout({ children }) {
  return (
    <html className={notoSansKR.variable}>
      <body>{children}</body>
    </html>
  )
}
```

`tokens/fonts.css`의 `--font-family-base: 'Noto Sans KR', sans-serif`가 자동으로 연결된다.

### Vite / CRA

```html
<!-- index.html <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;900&display=swap" rel="stylesheet">
```

### 자체 호스팅 (Self-hosting)

Noto Sans KR woff2 파일을 다운로드한 뒤 프로젝트 내 `@font-face`로 직접 정의한다:

```css
@font-face {
  font-family: 'Noto Sans KR';
  font-weight: 300 900;
  font-display: swap;
  src: url('/fonts/NotoSansKR-Variable.woff2') format('woff2');
}
```

> 모든 환경에서 weight 300/400/500/600/900이 포함되어야 `--font-weight-*` 토큰이 올바르게 렌더링된다.

## 컴포넌트 탐색 (Component Browser)

**1순위 — Storybook** (로컬: `http://localhost:6006`): 인터랙티브 controls, 접근성 검사, 핫 리로딩을 제공하며 가장 최신 컴포넌트 목록을 반영한다. 컴포넌트를 확인하거나 스토리를 작성할 때는 항상 Storybook을 기준으로 삼는다.

**레거시 — `dashboard.html`**: Storybook 도입 전 사용하던 뷰어. 현재는 `guidelines/` 가이드라인 섹션(색상·타이포·스페이싱·로고·Do's & Don'ts 등 브랜드 참조 문서)을 확인하는 용도로만 유효하다. 컴포넌트 목록은 최신 상태가 아니므로 컴포넌트 탐색에는 사용하지 않는다.

## 색인 (Index)

* `styles.css` — 루트 스타일시트, `tokens/`의 모든 항목을 가져옴(import)
* `tokens/` — 색상, 타이포그래피, 간격, 반경, 엘리베이션, 폰트
* `assets/logo/` — JAM! 워드마크, 블랙 + 화이트
* `components/buttons/` — Button, IconButton
* `components/cards/` — Card, RarityBadge, ShapeTag, BadgeFrame
* `components/navigation/` — TopNav, TabBar (JAM! 자체 TabBar.tsx에서 1:1 재현), BottomSheet, SlidingTabs, Accordion
* `components/feedback/` — Toast, ModalToast, WanderingEyesLoader, Skeleton, EmptyState
* `components/forms/` — Input, Textarea, Select, Checkbox
* `components/patterns/` — BadgeGridCard, ListRowCard, CollectionGridCard (서비스 공통 UI 패턴)
* `guidelines/` — 파운데이션 스펙 카드 (색상, 타이포그래피, 간격, 반경, 엘리베이션, 로고, 아이콘) — 브랜드 참조용으로 유지
* `dashboard.html` — **레거시** 뷰어. 가이드라인 섹션 전용. 컴포넌트 탐색은 Storybook 사용
* `ui_kits/jam-app/` — 인터랙티브 5개 화면 클릭스루: Today / Badges / Drops / Inventory / Profile
* `SKILL.md` — Claude Code / 기타 에이전트용 포터블 스킬 파일