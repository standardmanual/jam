# JAM! 디자인 시스템

JAM!을 위한 시각적 디자인 시스템입니다.

## 출처 (Sources)

* GitHub: [standardmanual/jam](https://github.com/standardmanual/jam) — JAM! 앱 콘텐츠, 화면 구조, 카피/용어, UX 작성 규칙(`docs/service/writing/UX_WRITING_GUIDELINE.md`)을 확인하기 위해 참조했습니다.

더 심도 있는 재구성을 위해 이것들을 더 살펴보세요 — GitHub 리포지토리에는 전체 앱(미션, 드랍, 조합, 관리자)이 포함되어 있습니다.

## 콘텐츠 기본 원칙 (Content fundamentals)

JAM!의 톤앤매너 (`UX_WRITING_GUIDELINE.md`에서 가져옴): 시스템이 알림을 보낸다기보다는 사용자의 운동을 축하해 주는 친구의 톤입니다. 사용자 대면 카피는 격식 없는 해요체, 1인칭 관점 프레이밍("시현님이 모은 아이템", "고객님"은 절대 사용 안 함)을 사용하며, 드랍/아이템을 트라이브 내부의 이벤트로 다룹니다("근처에 아이템이 떨어졌어요"). 고정 용어: 획득 (earn), 드랍 (drop), 픽업 (pickup), 체크인 (check-in), 지점 (spot), 포인트, 인벤토리, 컬렉션. 되돌릴 수 없는 작업(거래, 만료, 어뷰징 감지)에서는 톤이 단호하고 직설적으로 변하며, 절대 장난스럽게 표현하지 않습니다. 본문 카피에는 이모지를 사용하지 않으며, 가이드라인 자체 예시에 따라 축하하는 순간에만 제한적으로 사용합니다.

## 비주얼 기반 (Visual foundations)

값은 이 문서에 적지 않는다. 원천은 `tokens/*.css`이고, 결정 이력과 화면 규칙은 `docs/plan/jam2/11 JAM 2.0 디자인 시스템.md`다. 요약은 `jam-web/DESIGN.md`에 있다.

* **팔레트(Palette)**: JAM 2.0 라이트 전용이다. 크림 바탕(`--background`) 위에 흰 카드(`--surface`)와 테두리(`--border`), 면 채우기 전용 초록 강조색(`--accent`), 강조 글자·선용 짙은 초록(`--link`). 원천은 `tokens/colors.css`다.
* **타이포그래피(Type)**: Noto Sans KR. 서비스가 쓰는 굵기는 `font-normal`·`font-medium`·`font-semibold`·`font-bold`이고 자간은 모든 단계에서 0이다. 크기 눈금은 `tokens/typography.css`다.
* **모서리 반경(Radius)**: Tailwind 기본 눈금이다(`tokens/radius.css`). 카드는 `rounded-2xl`, 버튼과 태그는 `rounded-full`, 입력창은 캡슐(`--field-radius`)이다.
* **엘리베이션(Elevation)**: 그림자가 없다. 카드는 흰 면과 테두리로 구분한다(입력창 그림자만 예외, 문서 11의 5.7절).
* **간격(Spacing)**: `tokens/spacing.css`의 눈금과 레이아웃 시맨틱 토큰이다.
* **배경(Backgrounds)**: 플랫 컬러, 그라데이션 없음.
* **호버/프레스(Hover/press)**: 버튼을 누르면 `--scale-press`만큼 줄어든다(`tokens/motion.css`). 색상이 어두워지는 호버 시스템은 추출되지 않았으며 최소한으로 유지됨.
* **테두리(Borders)**: 카드와 외곽선 버튼에 쓴다. 규칙은 문서 11의 5.1·5.4절이다.


## 의도적인 추가 사항 (Intentional additions)

* **도형 태그 클라우드 (`ShapeTag`)** — 뱃지 및 인벤토리 화면의 뱃지/썸네일 상자, 컨텐츠 태그용. 인덱스별로 모양과 색상을 순환시켜 수집품 그리드가 정형화된 아이콘 그리드가 아닌 생기 넘치는 태그 클라우드로 읽히도록 했습니다.

## 소스로부터 1:1 재현 (Recreated 1:1 from source)

* **TabBar** — 플로팅 필 형태의 하단 내비게이션(아이콘 전용, 활성 점 표시기, 채우기/선 아이콘 전환)은 `jam-web/src/components/ui/TabBar.tsx`의 마크업 및 SVG 아이콘 경로에서 직접 복사되었으며, 색상은 `tokens/`의 탭바 토큰(`--tabbar-*`)으로 바뀌었습니다.
* **모바일 뷰포트** — UI 키트 프레임은 430×932로, 코드베이스 자체의 `max-w-[430px] mx-auto` 모바일 컨테이너(`jam-web/src/app/(main)/layout.tsx`)와 일치합니다. 데스크톱에서는 동일한 방식으로 배경 중앙에 렌더링됩니다.
* **모션** — `tokens/motion.css`의 지속 시간/이징(durations/easings)은 JAM!의 프로덕션 `globals.css`에서 실행되는 동일한 마이크로 인터랙션 시스템인 [transitions.dev](https://transitions.dev/detail.html?doc=installation)에서 1:1로 복사되었습니다.

## 폰트 설정 (Font Setup)

DS는 Noto Sans KR을 기본 서체로 사용한다. 서비스(`jam-web`)는 `src/app/globals.css` 1행의 Google Fonts CDN `@import`(`wght@400..800`, `display=swap`)로 불러온다. 단독으로 쓰는 환경은 아래 중 맞는 방식으로 직접 로드해야 한다. `tokens/fonts.css`에는 로딩 선언이 없다.

### Next.js (권장)

```jsx
// app/layout.tsx
import { Noto_Sans_KR } from 'next/font/google'

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
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

`tokens/typography.css`의 `--font-family-base`(`"Noto Sans KR"`가 첫 값이고 시스템 글꼴 폴백이 이어진다)가 이 패밀리명을 그대로 쓴다.

### Vite / CRA

```html
<!-- index.html <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400..800&display=swap" rel="stylesheet">
```

### 자체 호스팅 (Self-hosting)

Noto Sans KR woff2 파일을 다운로드한 뒤 프로젝트 내 `@font-face`로 직접 정의한다:

```css
@font-face {
  font-family: 'Noto Sans KR';
  font-weight: 400 800;
  font-display: swap;
  src: url('/fonts/NotoSansKR-Variable.woff2') format('woff2');
}
```

> 모든 환경에서 weight 400~800이 포함되어야 Tailwind의 `font-normal`·`font-medium`·`font-semibold`·`font-bold`가 올바르게 렌더링된다(`--font-weight-*` 토큰은 2131에서 삭제했다).

## 컴포넌트 탐색 (Component Browser)

**1순위 — Storybook** (로컬: `http://localhost:6006`): 인터랙티브 controls, 접근성 검사, 핫 리로딩을 제공하며 가장 최신 컴포넌트 목록을 반영한다. 컴포넌트를 확인하거나 스토리를 작성할 때는 항상 Storybook을 기준으로 삼는다.

**파운데이션 — Storybook `MODULAR/Foundations`**: 색상·글꼴·모션·반경·간격·타이포 여섯 페이지가 토큰 값을 CSS 변수에서 읽어 보여 준다. 예전 `guidelines/*.html` 카드 12개는 이 페이지들과 `BadgeFrame`·`WanderingEyesLoader` 스토리로 대체하고 지웠다.

**레거시 — `dashboard.html`**: Storybook 도입 전 사용하던 뷰어. 지금은 개요 한 쪽만 남았고 Storybook과 토큰 파일을 가리킨다. 컴포넌트 탐색에는 사용하지 않는다.

## 색인 (Index)

* `styles.css` — 루트 스타일시트, `tokens/`의 모든 항목을 가져옴(import)
* `tokens/` — 색상, 타이포그래피, 간격, 반경, 모션, 재질(materials), 폰트
* `assets/logo/` — JAM! 워드마크, 블랙 + 화이트
* `components/buttons/` — Button, IconButton
* `components/cards/` — Card, RarityBadge, BadgeLevelChip(무한레벨형 Lv.N 칩), MissionCard, ShapeTag, BadgeFrame, LabelChip(카드 좌상단 라벨 필, tone default·inverse)
* `components/navigation/` — TopNav, TabBar (JAM! 자체 TabBar.tsx에서 1:1 재현), BottomSheet, SlidingTabs, Accordion, Carousel(센터 포커스·무한 루프 카드 캐러셀)
* `components/feedback/` — Toast, ModalToast, WanderingEyesLoader, Skeleton, EmptyState, ProgressBar
* `components/forms/` — Input, Textarea, Select, Checkbox
* `components/patterns/` — BadgeGridCard, ListRowCard, CollectionGridCard, BadgeRevealCarousel, ItemSerialCode, MixerSlot (서비스 공통 UI 패턴)
* `components/patterns/` 배지 트리 — **BadgeFamilyCardHeader(계열 카드 공유 헤더 — 새 계열 카드를 만들면 헤더는 반드시 이걸 쓴다)**, BadgeStageRail(등급형 4눈금 레일), BadgeProgressRingCard(등급형 눈금 1개 · 진행을 라운드 사각 테두리로), BadgeLevelGauge(무한레벨형 · 레벨 수와 무관하게 높이 고정), BadgeStampRow(반복형 · 누적을 ×N 칩 하나로), BadgeStatusSection(「다음 목표」·「받은 배지」 · `collapsible={false}`로 접지 않는 모드), BadgeTreeSummaryHeader, UnlockConditionSheetContent, DualAxisGauge(레일 카드 안의 구획), RecentSyncBanner
* `components/icons/` — IconCatalog (라인 아이콘 세트 + 전체 카탈로그 그리드. 서비스
  `src/components/ui/icons.tsx`를 이식한 Storybook 전용 사본 — 서비스는 계속 원본을 단일
  소스로 쓴다, 20260828_2043), **BadgeStatusGlyphs**(배지 화면의 자물쇠·체크·별·chevron 단일
  소스. TabBar와 같은 Material Symbols 채움 스타일 — `icons.tsx`의 stroke `LockIcon`과 다른
  물건이다. 배지 화면에서는 이모지를 쓰지 않는다, 20260906_2140)
* `foundations/` — Storybook 파운데이션 페이지 6개 (Colors·Fonts·Motion·Radius·Spacing·Typography)
* `dashboard.html` — **레거시** 개요 한 쪽. 컴포넌트 탐색은 Storybook 사용
* `ui_kits/jam-app/` — 인터랙티브 5개 화면 클릭스루: Today / Badges / Drops / Inventory / Profile
* `SKILL.md` — Claude Code / 기타 에이전트용 포터블 스킬 파일