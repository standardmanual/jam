---
id: "20261015_2132"
category: UI
priority: P2
status: OPEN
created: 2026-10-15
parent: "20261015_2130"
workType: ds
specs:
  - "docs/plan/jam2/11 JAM 2.0 디자인 시스템.md"
---

# [UI] JAM 2.0 서체를 Noto Sans KR로 교체하고 글자 넘침을 점검한다

> 개발 세션의 카리나는 이 티켓을 시작하기 전에 아래 「시작 전에 사용자에게 물을 결정」을 질문창(AskUserQuestion)으로 묻고, 답을 「주요 의사결정」에 적은 뒤 아현을 부른다(상위 티켓 결정 4).

## 핵심 요약

- 요구사항: 서비스 서체를 Pretendard Variable에서 Noto Sans KR로 바꾸고, 글자 크기 단계 변경(28→30, 44→48, 11→12)과 자간 0으로 생기는 글자 넘침을 고친다.
- 구현 계획: 서체 로딩 교체 → 주요 화면 실렌더 → 넘침 목록 → 수정.
- 관련 파일: `jam-web/src/app/globals.css` 1행(Pretendard CDN import), `jam-web/src/app/layout.tsx`(서체 적용 위치), `jam-web/design-system/tokens/fonts.css`, 하위 티켓 1에서 바뀐 글자 토큰

## 배경 / 문제 정의

새 시스템 서체는 Noto Sans KR이다. 지금 서비스는 jsDelivr CDN에서 Pretendard를 불러온다. 두 서체의 글자 폭과 행 높이 차이는 아직 실측하지 않았다(디자인 시스템 문서 7절).
작은 카드 안 버튼(micro 11px → 12px, 16회 사용)이 가장 먼저 확인할 곳이다.

## 시작 전에 사용자에게 물을 결정

1. **서체 불러오는 방식**: (추천) `next/font/google`로 자체 호스팅한다(외부 CDN 의존과 글자 깜박임이 없다) / Google Fonts CDN
2. **불러올 굵기**: (추천) 서비스가 쓰는 400·500·600·700만 / 새 시스템의 800(Extra Bold)까지
3. **글자 넘침 처리 원칙**: (추천) 폭 고정 요소는 폭을 늘리지 않고 글자 크기 단계를 유지한 채 말줄임 또는 줄바꿈으로 처리하고, 화면별로 사용자에게 스크린샷을 보여 확인받는다 / 폭을 늘린다

## 완료 조건

- 서비스 HTML이 Pretendard를 더 이상 불러오지 않는다(네트워크 요청 확인).
- 홈, 배지, 인벤토리, 미션, 프로필 화면의 본문 글자의 계산된 `font-family` 첫 값이 Noto Sans KR이다.
- 위 화면들과 배지 카드·인벤토리 슬롯의 393px 폭 스크린샷에서 글자가 잘리거나 겹치는 곳이 없다. 스크린샷을 완료 기록에 남긴다.

## 구현 계획 (파일 단위)

> 2026-10-16 시작 전 결정 3건을 반영한 계획이다. 워크트리에서는 `next dev`가 안 돼 렌더 확인이 불가능하므로, 아현은 서체 교체까지 하고 넘침 점검·수정은 카리나가 머지 뒤 메인 트리에서 한다.

1. **서체 교체(아현)**
   - `jam-web/src/app/globals.css` 1행: Pretendard CDN `@import`를 Google Fonts CDN의 Noto Sans KR(400·500·600·700·800, `display=swap`)로 바꾼다. `@import`는 파일 맨 앞이어야 한다.
   - `jam-web/design-system/tokens/typography.css`의 `--font-family-base`: `"Noto Sans KR"`을 첫 값으로 두고 시스템 폴백을 잇는다. `jam-web/design-system/tokens/fonts.css`는 내용을 확인해 같은 값으로 맞춘다.
   - 그 밖에 Pretendard를 이름으로 적은 곳(`jam-web/src`, `jam-web/design-system`의 `styles.css`·스토리북 설정·가이드라인 HTML·manifest·문서)을 `grep`으로 찾아 같은 서체로 맞춘다. `design-system/uploads`·`_vendor`는 제외한다.
   - 자간: 새 시스템은 자간이 모두 0이다(2131에서 `tracking-*` 정의를 지움). 남은 `letterSpacing`·`tracking-` 참조가 있으면 확인해 같이 걷는다.
2. **넘침 점검과 수정(카리나, 머지 뒤)**: 메인 트리 `next dev`에서 393px 폭으로 홈·배지·인벤토리·미션·프로필을 열어 폭이 고정된 칩·버튼·카드를 확인하고, 2131 인계의 `text-xs` 단독 행간 변화 지점도 본다. 넘치는 곳은 요소 폭을 늘려 맞춘다(결정 3). 수정이 파일 2개·10줄을 넘으면 아현을 다시 부른다.

## 2131에서 넘어온 인계 (민지·채원② 범위 밖 발견물, 2026-10-15)

- 타이포 변환으로 `text-[length:var(--text-caption)]` 단독 클래스가 `text-xs`가 되면서 행간이 상속값에서 16px 고정으로 바뀌었다. `leading`이 짝으로 없던 곳이 조용히 달라진다(micro 11→12px 16곳 포함). `jam-web/scripts/jam2-token-migrate.report.json`에는 `text-N` 단독 변환 목록이 없으므로 글자 넘침 렌더 점검 때 작은 카드 안 버튼과 함께 확인한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `docs/service/writing/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

**시작 전 사용자 결정 (2026-10-16, 질문창, 3건 모두 추천안이 아닌 대안 선택)**

1. **서체 불러오기**: Google Fonts CDN. `next/font/google` 자체 호스팅(추천)은 택하지 않았다. 외부 CDN 의존과 글자 깜박임이 남는다.
2. **굵기**: 400·500·600·700·800. 서비스가 쓰지 않는 800까지 불러와 전송량이 늘지만 새 시스템의 정의를 모두 갖춘다.
3. **넘침 처리**: 요소 폭을 늘린다. 글자 단계를 유지한 채 말줄임·줄바꿈으로 처리하는 안(추천)은 택하지 않았다. 카드·그리드 배치가 함께 흔들릴 수 있으니 화면별로 확인한다.


**채원① 사전 판정 (2026-10-16, 사용자 승인 반영본)** — 아현·민지·채원②는 아래 절을 판정 전문으로 쓴다.

사용자 승인(2026-10-16, 질문창, 추천안 채택): 액티비티 배지 이미지 생성기(`src/lib/admin/composeActivityBadgeImage.ts`)는 생성기 안에서만 Pretendard를 필요할 때 불러와 산출 이미지를 지금과 같게 둔다(`ensureBadgeImageFonts()` 안에서 CDN `<link>`를 한 번만 삽입한 뒤 load를 기다린다). 어드민 화면 글꼴(`src/app/admin/layout.tsx`의 `ADMIN_FONT_FAMILY`)은 `var(--font-family-base)`로 서비스와 맞춘다. 굵기 표기는 `wght@400..800` 범위형이며 결정 2를 바꾼 것이 아니라 표기만 다르다(CSS 1/5, 내려받는 글꼴 파일 동일).

#### 결정

재사용. 신규 컴포넌트와 신규 토큰은 없다. 기존 토큰 `--font-family-base`의 값을 DS 원본 서체(Noto Sans KR)로 바꾸는 작업이고, 서비스 전용 예외 구현도 없다. MODULAR 승격 후보도 없다.

#### 근거와 범위 밖 발견물

【판정 근거】
1) `src/app/globals.css`가 `design-system/tokens/typography.css`를 직접 @import하고, 본문은 `body { font-family: var(--font-family-base) }`(globals.css:421)로 서체를 받는다. 값 한 줄과 로딩 한 줄이면 서비스 전체가 바뀐다. DS 쪽 기준(`design-system/_adherence.oxlintrc.json`의 fontFamilies, readme)은 이미 Noto Sans KR이라 서비스가 DS에서 벗어나 있던 것을 되돌리는 방향이다.
2) 시작 전 결정 3건(Google Fonts CDN / 400~800 / 요소 폭을 늘려 처리)은 그대로 따른다. 결정 3은 카리나가 하는 2번 단계의 원칙이라 이번 구현에는 영향이 없다.

【실측으로 확인한 사항 (아현이 구현에 반영)】
- 굵기 표기: 결정 2의 `wght@400;500;600;700;800` 나열형은 Google CSS가 475,730B(@font-face 620개)로 내려온다. `wght@400..800` 범위형은 95,642B(124개)다. 두 응답이 가리키는 woff2 파일 124개는 URL이 전부 같으므로 내려받는 글꼴 파일은 동일하다. 범위형은 결정 2(400~800 전부 사용 가능)를 그대로 만족하면서 CSS가 1/5이다. 범위형으로 쓰고, 결정을 바꾼 것이 아니라 표기 방식만 다르다고 완료 기록에 한 줄 적는다.
- 서체 차이 실측(headless Chromium, Pretendard static v1.3.9 대 Google Noto Sans KR, 자간 0, 12~48px, 400~700): 한글만 +5.2~6.5%, 한글+숫자·영문 혼합 +9~9.6%, 대문자 영문 -1.6~-2.7%, 숫자만 -4%, 숫자 '1'이 연속되면 +26%. 숫자 폭은 0~9 전부 같아서 `tabular-nums`는 효과가 없어진다(해롭지는 않다). `line-height: normal`일 때 행 높이는 +21~26%(12px에서 14→17px, 16px에서 19→24px)지만 비어드민 코드에서 `normal`을 쓰는 곳은 grep 0건이다. 이 수치가 디자인 시스템 문서 7절의 '미실측' 항목에 해당한다.
- CSP·`headers()` 설정이 없어 fonts.googleapis.com / fonts.gstatic.com을 막는 장치는 없다(`next.config.ts`, `vercel.json` 확인).

【범위 밖 발견물 (이번 구현에서 고치지 않고 카리나에게 넘긴다)】
- `src/app/layout.tsx`가 Geist Sans·Geist Mono를 next/font로 불러온다. `font-sans` 사용처는 src 전체에서 0건이라 Geist Sans는 로딩만 되고 쓰이지 않는다. 제거 후보다.
- `src/app/(main)/inventory/[itemId]/InventoryItemHistorySheet.tsx:115`의 `font-mono`(서비스 1곳)는 Geist Mono이고, 한글은 폴백 없이 브라우저 기본 서체로 그려진다. 새 서체 단일화 관점에서 `font-mono`를 걷는 것이 맞지만 숫자 글리프 모양이 보이게 바뀌므로 사용자 확인 뒤 별도 처리한다.
- `jam-web/DESIGN.md`는 서체 외에도 옛 다크 테마(검정 캔버스·레드오렌지) 기술 전체가 낡았다. 서체 5줄만 고치는 것은 의미가 없어 이번에는 건드리지 않고, 파일 전체의 폐기 또는 갱신을 별도로 판단한다.
- `docs/service/prd/2026-08-15 DESIGN_RENEWAL_SPEC.md`의 73행·499행에 'Pretendard Variable (CDN 유지, 변경 금지)'가 남아 있어 JAM 2.0 결정과 충돌한다. 두 줄에 'JAM 2.0에서 Noto Sans KR로 교체, 티켓 20261015_2132' 참조 문구를 단다(CLAUDE.md 규칙 2, 아현 또는 카리나).
- `jam-web/design-system/readme.md`의 폰트 설정 절은 굵기 300/400/500/600/900과 `tokens/fonts.css`에 `--font-family-base`가 있다는 서술이 낡았다(이 변수는 typography.css에 있다). 18행의 '헤딩 라이트 웨이트 300–400, 음수 자간'도 새 시스템(자간 0, 400~700)과 어긋난다. 같은 변경에 포함해 맞춘다.
- `jam-web/docs/storybook/01-modular-audit.md`는 시점 기록이라 고치지 않는다.
- `scripts/badge-image-gen/**`는 독립 실행 스크립트(Pretendard 한글폭 0.8643em 상수를 쓰는 측정 로직)로 globals.css의 CDN과 무관하다. 건드리지 않는다.

#### 컴포넌트

새로 만들거나 고르는 컴포넌트는 없다. 서체 교체이고 건드리는 컴포넌트는 자간(letter-spacing) 걷기 대상뿐이다. 새 시스템은 자간이 모두 0이고(2131에서 `--tracking-*` 삭제), 티켓 구현 계획 1번의 '남은 letterSpacing·tracking- 참조를 같이 걷는다'에 해당한다.

[연결된 컴포넌트 6종 — 서비스에 즉시 반영]
- design-system/components/cards/BadgeLevelChip.jsx:38 (0.3px)
- design-system/components/cards/RarityBadge.jsx:89 (0.3px, uppercase 라벨)와 10행 주석
- design-system/components/patterns/BadgeFamilyCardHeader.jsx:139 (-0.01em), :168 (0.3px)
- design-system/components/patterns/BadgeTreeSummaryHeader.jsx:112 (-0.28px)
- design-system/components/patterns/DualAxisGauge.jsx:118 (0.3px)
- design-system/components/patterns/UnlockConditionSheetContent.jsx:215 (0.04em)

[병존 구현 1종 — DS만]
- design-system/components/patterns/CollectionGridCard.jsx:14 (0.3px). 서비스 대응 `src/components/ui/CollectionGridCard.tsx`에는 letterSpacing·tracking이 없음을 grep으로 확인했다. 서비스 쪽은 고칠 것이 없다.

[서비스 전용 2곳]
- src/app/(main)/collections/[id]/page.tsx:391 (`letterSpacing: '0.02em'`, 10px 체크인 상태 칩)
- src/app/(main)/missions/[id]/MissionDetailClient.tsx:224 (`tracking-[-0.5px]`, 36px 제목). 이 줄은 자간을 걷으면 폭이 +0.5px×글자 수만큼 늘어난다. 제목 줄바꿈은 `text-balance`가 처리하므로 위험은 낮다.

[걷지 않는 것]
- design-system/components/patterns/ItemSerialCode.jsx:263 — 서체 자간이 아니라 SVG 숫자 릴의 배치 기하(`trackingRatioFor`)다. 걷으면 스탬프 레이아웃이 깨진다.
- TopNav.jsx:104 (`'normal'`, 이미 0), LabelChip.jsx 주석, BadgeHeroSection.tsx:67 주석.

[스토리와 문서 문구]
- design-system/foundations/Fonts.stories.tsx — 45~47행(서비스 override·Pretendard CDN 서술)을 'Noto Sans KR, globals.css 1행의 Google Fonts CDN (400~800)'으로 고친다. WeightRow 300(Light)·900(Black) 두 줄은 삭제하고 800 한 줄을 추가한다(정의만 하고 서비스는 쓰지 않는다고 라벨에 적는다). 하단 사용 가이드의 굵기 문구도 맞춘다.
- design-system/foundations/Typography.stories.tsx:80 — 'Pretendard로 재정의' 문구 삭제.
- design-system/components/navigation/TopNav.stories.tsx:77 — fontWeight 900·letterSpacing -0.02em이 남아 있다(선택, 스토리 샘플).

#### 토큰

【바뀌는 값 1개, 신규 토큰 0개】
- `--font-family-base` (design-system/tokens/typography.css:12): `"Noto Sans KR", -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif`. 첫 값만 바꾸고 폴백 꼬리는 기존 그대로 둔다. 같은 파일 9행의 '하위 티켓에서 바꾼다' 주석은 '2132에서 Noto Sans KR로 교체함'으로 고친다.
- 연동되는 산출물: `design-system/_ds_manifest.json`의 tokens[--font-family-base] 값(279행)과 brandFonts(1032행)는 손으로 고치지 않고 `cd jam-web && node scripts/ds-manifest-sync.mjs --write`로 다시 만든다(그 스크립트가 brandFonts를 --font-family-base 첫 패밀리에서 파생한다). `npm run ds:check`가 MANIFEST_TOKEN_DRIFT 없이 통과해야 한다.

【로딩 선언 (토큰이 아니다)】
- src/app/globals.css 1행: `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400..800&display=swap');`
  - 반드시 파일 맨 앞이고 `@import "tailwindcss"`보다 위여야 한다(지금 Pretendard 줄과 같은 위치).
  - `display=swap` 유지. `optional`은 첫 방문에 글자가 아예 안 바뀔 수 있고 `block`은 빈 글자 구간이 생긴다.
- design-system/tokens/fonts.css는 주석만 있는 파일이다. 'Google Fonts CDN 제거, next/font 사용' 서술과 굵기 예시(300·500·900)가 지금 결정과 반대라 낡았다. 주석을 '서비스는 globals.css 1행에서 Google Fonts CDN(400~800)으로 불러온다. 단독 소비자는 직접 불러와야 하며 폴백 스택은 typography.css의 --font-family-base에 있다'로 다시 쓴다. 여기에 @import를 넣지 않는다. globals.css와 이중 선언이 되고, 워크트리에서는 next dev로 중첩 @import를 검증할 수 없다.

【건드리지 않는 기존 토큰】
- `--text-xs`~`--text-5xl`(+`--line-height` 쌍), `--leading-loose`, `--leading-reading`, 색·간격·반경. 2131에서 삭제한 자간·굵기 토큰(`--tracking-*`, `--font-weight-*`)은 되살리지 않는다. 굵기는 Tailwind `font-normal`·`font-medium`·`font-semibold`·`font-bold`를 쓴다.

【다른 곳의 Pretendard 표기 (같은 서체로 맞춘다)】
- `.storybook/preview.tsx:7` 주석 (Pretendard CDN → Noto Sans KR Google Fonts CDN)
- `src/app/admin/layout.tsx:11,15` ADMIN_FONT_FAMILY → `var(--font-family-base)`와 주석 (어드민 화면은 채원 판정 범위 밖이므로 기계적 정합만)
- `src/lib/admin/googleFonts.ts:68` 주석의 'layout.tsx가 Pretendard Variable에 쓰는 정적 하이재킹' 문구
- `src/lib/admin/composeActivityBadgeImage.ts` 51·65·119~124행은 위 승인 항목 결과에 따른다 (A면 로딩 방식만 바꾸고 글꼴명은 유지, B면 글꼴명·load 인자 변경)
- 그대로 두는 곳: `scripts/asset-generator/__tests__/presetSource.test.ts:17`(테스트 입력값으로 쓰는 글꼴명 문자열), `design-system/uploads`, `design-system/_vendor`

#### 배치

화면 레이아웃이 아니라 서체가 적용되는 경로를 글로 그린다.

html (className=Geist 변수 2개, 본문에는 안 쓰임)
 └ body  font-family: var(--font-family-base)   ← globals.css:421
      = "Noto Sans KR", -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
      └ 모든 버튼·입력·칩·카드 텍스트가 상속 (Tailwind preflight의 font: inherit)

로딩 사슬 (직렬)
 HTML → globals.css(렌더 차단) → @import fonts.googleapis.com CSS(약 95KB, @font-face 124개, 렌더 차단)
      → fonts.gstatic.com woff2 조각(unicode-range로 화면에 쓰인 글자 조각만 내려받음)
      → swap: 폴백 글자로 먼저 그린 뒤 도착하면 교체

규칙
- 새 마크업·새 클래스·새 컴포넌트 없음.
- 글자 크기·행간·굵기·색은 건드리지 않는다. 바뀌는 것은 서체명과 자간 0뿐이다.
- 이번 단계 산출물은 코드와 문서 정합이다. 화면별 글자 폭 점검은 2번(카리나, 메인 트리)이고, 작은 카드 안 버튼(micro 11→12px, 16곳)이 첫 점검 대상이다.

#### 상태

- 로딩: 글꼴 파일이 오기 전에는 폴백 스택(시스템 글꼴)으로 먼저 그려지고 도착하면 Noto Sans KR로 바뀐다(`font-display: swap`). 이 교체 순간 한글 폭이 약 +6%, 한글+숫자 혼합이 약 +10% 변한다. 즉 줄바꿈이 바뀌고 고정 폭 칩의 레이아웃이 한 번 움직인다. 결정 1(CDN)로 받아들인 비용이고, 이번 구현에서 막지 않는다.
- 빈: 없음. 서체 교체이고 데이터 화면이 아니다.
- 오류: Google Fonts CDN이 막히거나 느릴 때(사내망·광고 차단·해외 구간)는 폴백 스택 그대로 화면이 계속 동작해야 한다. 이때 글자가 안 깨지는 것은 폴백 스택이 `system-ui`를 포함하기 때문이다. 제거하지 않는다. @import는 렌더를 막으므로 CDN이 응답하지 않으면 첫 그림이 늦어진다는 점을 완료 기록에 한 줄 남긴다.
- 기본: Noto Sans KR 400 / 500 / 600 / 700이 서비스가 쓰는 굵기다. 800은 정의만 있고 non-admin 코드의 `font-extrabold`·`font-black`·`fontWeight: 800|900` 사용은 0건이다.
- 굵기 폴백: 900을 요청하는 곳(TopNav.stories.tsx:77 한 곳, 스토리)은 브라우저가 800으로 대체한다.
- 비활성·선택·포커스: 서체 교체와 무관해 별도 구현 없음.

#### 알려진 임시 결함

- 범위를 지킨다: 서체 교체와 자간 걷기만 한다. 넘침이 보일 것 같다고 이번 단계에서 폭·패딩·글자 크기를 미리 고치지 않는다(2번은 카리나가 화면을 보며, 폭을 늘리는 결정 3 방식으로 한다. 파일 2개·10줄을 넘으면 아현을 다시 부른다).
- 자간을 걷으며 크기·굵기·색·행간을 같이 만지지 않는다. 한 줄 diff가 서체 변경에서 나온 것인지 구분되어야 한다.
- 폭을 늘려 푸는 결정 3 때문에 카드 그리드·가로 배열이 같이 흔들릴 수 있다. 2번 단계에서는 칩 하나를 넓힌 뒤 같은 줄 이웃 요소가 밀리는지 화면별로 확인한다.
- 장식 추가 금지: 서체가 바뀐 화면이 허전해 보여도 그라디언트·유리질·그림자·가운데 정렬 같은 보정을 얹지 않는다.
- 선택 권장(필수 아님, 시각 변화 없음): layout.tsx에 `preconnect('https://fonts.googleapis.com')`와 `preconnect('https://fonts.gstatic.com', { crossOrigin: 'anonymous' })`(react-dom의 preconnect, React 19.2·Next 16)를 넣으면 CDN 선택으로 남은 글자 깜박임 구간이 줄어든다. 워크트리에서 렌더 확인이 안 되므로 넣는다면 카리나가 메인 트리에서 확인한 뒤로 미루는 것이 안전하다.
- 사전 확인 필요한 함정: Google Fonts의 Noto Sans KR은 한글을 124개 조각으로 나눠 주므로 DOM 글자는 브라우저가 알아서 필요한 조각만 받지만, 캔버스(`document.fonts.load(font)`)는 글자 인자를 안 주면 라틴 조각만 받는다. 승인 항목 B를 택하면 이 점이 구현 필수 사항이다.

#### 완료 판정

【이번 구현(아현)의 완료 조건 — 코드와 문서 정합】
1. `jam-web/src/app/globals.css` 1행이 `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400..800&display=swap');`이고 `@import "tailwindcss"`보다 위에 있다. jsDelivr Pretendard 줄은 없다.
2. `design-system/tokens/typography.css`의 `--font-family-base` 첫 값이 `"Noto Sans KR"`이고, `node scripts/ds-manifest-sync.mjs --write` 뒤 `npm run ds:check`가 통과한다(`_ds_manifest.json`의 값과 brandFonts 일치).
3. `grep -rIn "Pretendard" jam-web/src jam-web/design-system`(uploads·_vendor 제외) 결과가 의도적으로 남긴 곳(승인 항목에 따른 composeActivityBadgeImage.ts, 테스트 픽스처 presetSource.test.ts)뿐이다. 남긴 곳과 이유를 완료 기록에 적는다.
4. 비어드민 src와 DS 컴포넌트에서 `letterSpacing`·`tracking-`이 0건이다. 예외는 ItemSerialCode.jsx(SVG 배치 기하), TopNav.jsx('normal'), 주석뿐이다.
5. Fonts.stories.tsx의 굵기 팔레트가 300·900 없이 400~800이고, Fonts·Typography 스토리의 서체 문구가 새 서체와 맞는다. DESIGN_RENEWAL_SPEC.md의 '변경 금지' 두 줄과 readme.md의 폰트 설정 절이 현행과 맞다.
6. 타입·테스트: `LabelChip.test.tsx` 등 기존 테스트가 통과한다(자간 단언은 '넣지 않았다' 방향이라 영향 없음).
7. 완료 기록에 '화면 렌더 미확인, 메인 트리 점검 대기'를 명시하고, `wght@400..800` 범위형 채택 이유(CSS 475,730B → 95,642B, 파일 URL 124개 동일)를 한 줄 남긴다.

【카리나(머지 뒤, 메인 트리)의 완료 조건 — 티켓 기존 항목 그대로】
- 홈·배지·인벤토리·미션·프로필의 네트워크 요청에 Pretendard가 없고 본문의 계산된 `font-family` 첫 값이 Noto Sans KR이다.
- 393px 폭 스크린샷에서 배지 카드·인벤토리 슬롯·작은 카드 안 버튼(micro 12px)에 글자 잘림·겹침이 없다.
- 위 점검에서 한글 +6.5%·혼합 +10%·'1' 연속 숫자 +26%를 후보 기준으로 쓴다.

### 아현 계획 반환 결과 (2026-10-16, 사용자 승인으로 면제 부여)

규모 사전 판정이 빗나갔다. 서체 로딩만 보고 파일 5개 이내로 봤으나 자간을 걷을 DS 컴포넌트 7종과 짝 스토리·문서가 더해져 22~30개 파일, 약 110줄이다. 변경 대부분은 한 줄 기계적 치환이다. 서체 로딩 변경과 배지 이미지 생성기 변경은 같은 머지 단위여야 한다(CDN을 걷으면 생성기가 조용히 폴백 글꼴로 이미지를 굽는다).

- 로딩·토큰: `jam-web/src/app/globals.css`(1행), `design-system/tokens/typography.css`(12행, 9행 주석), `tokens/fonts.css`(주석 재작성), `_ds_manifest.json`(`node scripts/ds-manifest-sync.mjs --write`로 생성)
- 주석·어드민: `.storybook/preview.tsx:7`, `src/app/admin/layout.tsx:11,15`, `src/lib/admin/googleFonts.ts:68`, `src/lib/admin/composeActivityBadgeImage.ts`(`ensureBadgeImageFonts()`로 로딩 방식 변경 + 신규 테스트 1개: link 삽입 1회·load 대기)
- 자간 걷기 DS 7종(각각 짝 `.stories.tsx` 동반): `BadgeLevelChip.jsx:38`, `RarityBadge.jsx:89`, `BadgeFamilyCardHeader.jsx:139,168`, `BadgeTreeSummaryHeader.jsx:112`, `DualAxisGauge.jsx:118`, `UnlockConditionSheetContent.jsx:215`, `CollectionGridCard.jsx:14`
- 서비스 2곳: `src/app/(main)/collections/[id]/page.tsx:391`, `src/app/(main)/missions/[id]/MissionDetailClient.tsx:224`
- 스토리·문서: `Fonts.stories.tsx`, `Typography.stories.tsx`, `TopNav.stories.tsx:77`, `docs/service/prd/2026-08-15 DESIGN_RENEWAL_SPEC.md` 73·499행, `design-system/readme.md`
- 확인: 완료 조건 3의 `grep`은 대소문자를 구분하면 `globals.css` 1행(URL의 소문자 `pretendard`)을 못 잡으므로 `-i`로 검사한다.

### 잔여 이슈
-
