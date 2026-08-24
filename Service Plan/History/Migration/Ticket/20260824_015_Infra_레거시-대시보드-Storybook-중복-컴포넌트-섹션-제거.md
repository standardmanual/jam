---
id: 20260824_015
category: Infra
status: CLOSED
created: 2026-08-24
closed: 2026-08-24
---

# [Infra] 레거시 대시보드/카탈로그의 Storybook 중복 컴포넌트 섹션 정리

## 배경 / 문제 정의

사용자가 "오늘 작업 중 배지 획득 캐러셀(BadgeRevealCarousel)을 패턴으로 등록하라고
했는데 Storybook에 안 보인다"고 지적. 조사 결과 실제 Storybook(로컬 `:6006`, staging
배포본 둘 다)에는 정상 등록되어 있었다(소스+`.d.ts`+`.stories.tsx`+`_ds_manifest.json`
모두 확인 완료).

대신 조사 과정에서 별개의 진짜 문제를 발견했다:

1. `design-system/_ds_bundle.js`(정적 프리뷰 카드용 컴파일 번들)가 오래된 스냅샷에
   멈춰 있어 `EmptyState`·`Skeleton`·`ProgressBar`·`Checkbox`·`Select`·`Textarea`·
   `Accordion`·`BottomSheet`·`Carousel`·`SlidingTabs`·`BadgeRevealCarousel` 등 11개
   컴포넌트가 빠져 있음.
2. 이 번들에 의존하는 `design-system/components/*/[category].card.html` 6개
   (buttons·cards·feedback·forms·navigation·patterns)와 `dashboard.html`(레거시 대시보드)이
   해당 오래된 스냅샷을 그대로 미리보기로 보여주고 있었음.
3. `dashboard.html` 자체에 이미 "⚠️ 레거시 뷰어 — 컴포넌트 탐색은 Storybook을
   사용하세요. 이 대시보드는 가이드라인 섹션 전용입니다"라는 배너가 있는데도,
   실제로는 여전히 Buttons/Cards/Forms/Navigation/Overlay/Feedback 등 컴포넌트
   섹션 전체가 남아 있어 배너와 실제 내용이 어긋나 있었음.
4. `docs/storybook/11-migration-plan.md`(기존 마이그레이션 계획 문서)에 이미
   이 6개 `.card.html`과 `_ds_bundle.js`를 "STORYBOOK REPLACEMENT / dashboard.html
   제거 시 함께 제거"로 명시해뒀던 것을 확인 — 즉 제거 자체는 이미 계획돼 있었고
   실행만 안 된 상태였음.

## 상세 요구사항

### 제거 대상 (Storybook로 완전 대체 확인됨 — 각 컴포넌트 `.stories.tsx` 존재 확인 완료)
- `design-system/components/buttons/buttons.card.html`
- `design-system/components/cards/cards.card.html`
- `design-system/components/feedback/feedback.card.html`
- `design-system/components/forms/forms.card.html`
- `design-system/components/navigation/navigation.card.html`
- `design-system/components/patterns/patterns.card.html`
- `dashboard.html`의 사이드바 "Components" 그룹(Buttons/Cards/Forms/Navigation/
  Overlay/Feedback & Loader) 및 대응 6개 section 전체

### 유지 대상 (기존 마이그레이션 계획 문서의 KEEP 판단 그대로 존속)
- `design-system/_ds_bundle.js` — `guidelines/shapes.html`이 아직 참조 중이라 KEEP
- `design-system/guidelines/badge-frames.html` — 비컴포넌트 참조 문서, 계획 문서에
  "영구 유지" 명시
- `design-system/guidelines/shapes.html` — 계획 문서 조건("ShapeTag/RarityBadge 스토리
  커버리지 확인 후")은 오늘 충족됐지만(두 스토리 모두 존재 확인), 이번 티켓 범위는
  아니라고 판단해 손대지 않음 — 후속 검토 대상으로 남김
- `dashboard.html`의 Shapes 그룹(Badge Frames, ShapeTag & RarityBadge) 및 가이드라인
  전체(Overview, Do's & Don'ts, Logo, Color, Typography, Spacing & Radius)
- `guidelines/loader.html` — `NavigationLoader`(서비스 전용, Storybook 미커버) 시간
  정책 문서라 Storybook으로 대체 불가. `dashboard.html`의 "Getting Started" 그룹 아래
  독립 섹션 "Loader Timing Policy"로 재배치

### 코드베이스 관점
- `_ds_manifest.json`의 `cards` 배열에서 삭제된 6개 `.card.html` 엔트리 제거
  (20개 → 14개, 나머지 가이드라인·`loader.html`·`badge-frames.html`·`shapes.html`·
  `ui_kits/jam-app/index.html`은 그대로 유지)

## 구현 계획
1. Storybook에 각 컴포넌트 story가 실제로 존재하는지 전수 확인(IconButton·Toast·
   ModalToast·Skeleton·EmptyState·WanderingEyesLoader·Textarea·Select·Checkbox·
   SlidingTabs·Accordion·BottomSheet)
2. `dashboard.html` 사이드바 "Components" 그룹 및 6개 section 제거, "Getting Started"
   그룹에 "Loader Timing Policy" 신설 섹션 추가(guidelines/loader.html 유지 이관)
3. 6개 `.card.html` 파일 삭제
4. `_ds_manifest.json`의 `cards` 배열 정리(6개 엔트리 제거)
5. `dashboard.html`의 nav-link ↔ section id 1:1 매칭 검증(끊긴 참조 없음 확인)

---
## 완료 기록

### 구현 내용 요약
위 계획대로 진행. 사이드바 링크 14개 ↔ section id 14개가 정확히 1:1 매칭되는 것을
grep으로 검증했다(끊긴 참조 없음). `_ds_manifest.json`은 JSON 파싱 검증까지 통과.

### 변경된 파일
```
jam-web/design-system/dashboard.html
jam-web/design-system/_ds_manifest.json
jam-web/design-system/components/buttons/buttons.card.html (삭제)
jam-web/design-system/components/cards/cards.card.html (삭제)
jam-web/design-system/components/feedback/feedback.card.html (삭제)
jam-web/design-system/components/forms/forms.card.html (삭제)
jam-web/design-system/components/navigation/navigation.card.html (삭제)
jam-web/design-system/components/patterns/patterns.card.html (삭제)
```

### 테스트 결과
- [x] `_ds_manifest.json` JSON 파싱 검증 통과
- [x] `dashboard.html` nav-link(14) ↔ section id(14) 1:1 매칭 확인(grep)
- [x] 정적 프리뷰로 사이드바 구조(Getting Started/Brand/Color/Typography/
  Spacing & Radius/Shapes) 육안 확인 — "Components" 그룹 정상 제거됨
- [ ] 로컬 file:// 프리뷰가 JS 인터랙션(해시 라우팅)을 실행하지 않는 정적 스냅샷이라
  클릭 네비게이션 자체는 브라우저에서 직접 열어 확인 필요(기존 vanilla JS 로직은
  무변경이라 위험 낮음)

### UX Writing 검증
- 해당 없음(내부 개발 도구, 사용자 노출 문구 아님)

### 배포 정보
- 배포일: 2026-08-24
- 환경: staging
- 커밋: (다음 커밋에서 기록)

### 주요 의사결정 / 핵심 메모
- `docs/storybook/11-migration-plan.md`에 이미 이 정리 작업이 계획돼 있었음(STORYBOOK
  REPLACEMENT 표기) — 이번 티켓은 그 계획을 실행한 것이지 새로운 정책 결정이 아니다.
- `_ds_bundle.js`·`badge-frames.html`·`shapes.html`은 계획 문서의 KEEP 판단을 그대로
  존중해 손대지 않았다 — `shapes.html`은 계획의 KEEP 조건이 충족된 상태(ShapeTag/
  RarityBadge 스토리 존재 확인)라 후속 티켓에서 제거를 검토할 수 있다.
- `guidelines/loader.html`(NavigationLoader 시간 정책)은 서비스 전용 컴포넌트라
  Storybook이 커버하지 못해 별도 섹션으로 남겨뒀다 — 유일하게 "Feedback & Loader"
  섹션에서 살아남은 콘텐츠.
- 가이드라인 섹션(색상·타이포·로고·브랜드)의 MDX 전환은 이번 범위에 포함하지 않았다
  — 계획 문서 5단계("card.html 및 _ds_bundle.js 제거는 가이드라인 MDX 이관 완료 후")
  중 이관 자체는 별도의 더 큰 작업이라 이번 티켓 범위 밖으로 판단.

### 잔여 이슈
- `guidelines/shapes.html` 제거 여부는 후속 검토 대상(조건은 충족됨).
- 가이드라인 섹션의 Storybook MDX 이관(계획 문서 상 남은 단계)은 착수하지 않음.
