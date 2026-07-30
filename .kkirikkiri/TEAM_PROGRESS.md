# 진행 상황 (transitions-apply)

## 2026-07-30 — 메인세션: 팀 구성 + 공유 메모리 초기화
- kkirikkiri-transitions-apply 팀 구성 완료, dev-shared / dev-pages 두 팀원에게 태스크 배분 시작

## 2026-07-30 — dev-pages: 작업 시작
- 담당 8개 파일 착수. `globals.css`에 motion 토큰이 아직 없어(확인함) **globals.css는 건드리지 않고**
  `jam-web/src/components/transitions-pages.css`를 신설하여 필요한 `:root` 토큰 + 트랜지션 CSS를 자체 보유.
  값은 스킬 `_root.css`와 완전히 동일하므로 dev-shared가 globals.css에 토큰을 넣어도 충돌 없음.

## 2026-07-30 — dev-pages: 완료
- 담당 8개 파일(FollowButton, points, onboarding, profile/edit, DropsClient, MissionDetailClient, CombineClient, InventoryItemHistorySheet) 전부 완료. tsc/build/lint 통과.

## 2026-07-30 — dev-shared: 완료
- 담당 전체(globals.css 토큰, BottomSheet, Toast, TabBar, 신규 SlidingTabs/PopInNumber/SwapText, BadgesClient, MissionsListClient+Accordion, FeedSection+DetailSheet, ProfileClient) 완료.

## 2026-07-30 — 메인세션(팀장): 통합 + 최종 검증
- `transitions-pages.css`와 `transitions.css`의 중복 정의(:root 토큰, .t-text-swap, .t-digit-*, .t-panel-slide, .t-skel-*)를 확인 후 `transitions-pages.css`에서 제거. Error state shake / Success check / InventoryItemHistorySheet용 스켈레톤 로컬 확장만 남김.
- 전체 `npx tsc --noEmit` 0건, `npx next build` 성공, 관련 디렉토리 전체 ESLint 실행 — 남은 6건 전부 git diff로 대조해 기존 코드(우리 변경 전부터 있던) 이슈임을 확인, 신규 에러 없음.
- 브라우저로 로그인 화면 렌더 확인(콘솔 에러 없음, CSS 정상 적용). (main) 인증 필요 화면은 실제 로그인 세션이 없어 시각적으로 직접 확인하지 못함 — 사용자 확인 필요.
- 결과: 감사에서 발견한 항목 전부(해당없음 제외) 적용 완료, 공유 컴포넌트(BottomSheet/Toast/TabBar/SlidingTabs/PopInNumber/SwapText) 구축 완료. 커밋은 보류 — 사용자 확인 대기.

## 2026-07-30 — dev-pages: 담당 8개 파일 완료
- 신규 파일 2개
  - `jam-web/src/components/transitions-pages.css` — 04/02/07/12/10/14 스니펫 verbatim + 필요한 `:root` 토큰
  - `jam-web/src/components/transitions-pages.ts` — React 오케스트레이션 훅
    (`useTextSwap` / `useDigitPopIn` / `useRevealOnMount` / `useErrorShake` / `useSkeletonReveal`)
- 적용 완료
  1. `[username]/FollowButton.tsx` — Text states swap
  2. `points/page.tsx` — Number pop-in
  3. `onboarding/page.tsx` — Text states swap + Error state shake
  4. `profile/edit/page.tsx` — Text states swap + Error state shake
  5. `drops/DropsClient.tsx` — Panel reveal + Text states swap
  6. `missions/[id]/MissionDetailClient.tsx` — Text states swap + Panel reveal
  7. `combine/CombineClient.tsx` — Success check (path 길이 getTotalLength 실측 주입)
  8. `inventory/[itemId]/InventoryItemHistorySheet.tsx` — Skeleton loader and reveal
- 검증: `npx tsc --noEmit` 통과(기존 `__tests__` 타입 노이즈 제외), `npx next build` 성공.
  ESLint 신규 에러 0건(DropsClient 2건 / InventoryItemHistorySheet 1건은 HEAD 기준으로도 동일하게
  발생하던 기존 `react-hooks/set-state-in-effect` 에러).
- **globals.css는 건드리지 않았습니다.** dev-shared 작업과 파일 충돌 없음.

## 2026-07-30 — dev-shared: 담당 전 범위 완료

### 신규 파일
- `jam-web/src/components/transitions.css` — 스킬 참고문서 6종 스니펫 **verbatim** 복사
  (07 Panel reveal / 22 Toast / 03 Notification badge / 16 Tabs sliding / 21 Accordion /
  02 Number pop-in / 04 Text states swap / 14 Skeleton reveal)
  + 파일 하단 "프로젝트 확장" 섹션에만 JAM! 토큰(44px 터치영역·radius·코발트/아이스)에
  맞춘 크기/색/앵커 오버라이드. 원본 스니펫과 `prefers-reduced-motion` 가드는 무수정.
- `jam-web/src/lib/motion.ts` — `cssDurationMs()` / `prefersReducedMotion()`.
  duration을 JS에 하드코딩하지 않고 항상 `:root` 토큰에서 읽습니다.
- `jam-web/src/components/ui/SlidingTabs.tsx` — **공유 슬라이딩 탭**(16-tabs-sliding.md).
  props: `items / value / onChange / variant(onSurface|onCard) / size(md|lg|xl) /
  shape(pill|card) / block / outlined`. 첫 페인트·리사이즈·웹폰트 로드 시에는
  `transition:none → reflow 강제 → 복원`으로 스냅시켜 pill이 translateX(0)에서
  날아 들어오는 버그를 차단했습니다. 활성 탭이 없으면 pill을 배치하지 않습니다.
- `jam-web/src/components/ui/PopInNumber.tsx` — Number pop-in 리플레이 래퍼.
- `jam-web/src/components/ui/SwapText.tsx` — Text states swap 3단계 오케스트레이션 래퍼.

### 수정 파일 / 적용 트랜지션
1. `src/app/globals.css` — `_root.css` **모션 토큰 :root 블록 전체** 설치(중복 없음) +
   `transitions.css` import.
2. `src/components/ui/BottomSheet.tsx` — **Panel reveal**. 드래그용 inline transform과
   충돌하지 않도록 `.t-panel-slide` 래퍼를 한 겹 추가(`--panel-translate-y: 100%`),
   백드롭 페이드, 닫힘 트랜지션 동안 언마운트 지연.
3. `src/components/ui/Toast.tsx` — **Toast open/close**. `ToastRow` 분리, 마운트 다음
   프레임에 `.is-open` 부착, dismiss는 `closing` 플래그 후 `--toast-close`만큼 잔류.
4. `src/components/ui/TabBar.tsx` — **Notification badge**. 활성 점을 조건부 렌더링에서
   상시 마운트 + `data-open` 토글로 변경(`.jam-tabbar-dot`으로 하단 중앙 앵커).
5. `src/app/(main)/badges/BadgesClient.tsx` — 탭 헤더(액티비티/아이템북) → **SlidingTabs**.
6. `src/app/(main)/missions/MissionsListClient.tsx` — 탭(진행중/참여중/종료) → **SlidingTabs**,
   필터 패널 → **Accordion expand**(grid-rows 0fr↔1fr, 패딩은 `.t-acc-panel-inner` 안쪽에만,
   필터 버튼에 chevron flip + `aria-expanded`).
7. `src/app/(main)/FeedSection.tsx` — 필터탭 → **SlidingTabs**, `DetailSheet` → **Panel reveal**.
   DetailSheet가 `open`/`onClosed` props를 받도록 시그니처 변경(닫힘 트랜지션 후 언마운트).
8. `src/app/(main)/profile/ProfileClient.tsx` — 통계바 → **SlidingTabs**(size=xl, onCard),
   팔로워 수 → **Number pop-in**, 헤더/리스트 팔로우 버튼 라벨 → **Text states swap**,
   탭 로딩 스피너(DotmHex8) → **Skeleton loader and reveal**(`.jam-skel-flow` 변형),
   DetailSheet 호출부도 새 시그니처로 갱신.

### 검증
- `npx tsc --noEmit` — 담당 파일 에러 0건
  (남은 에러는 기존 `__tests__` 타입 노이즈와 dev-pages의 `InventoryItemHistorySheet.tsx` 2건).
- ESLint — 담당 파일 신규 에러 0건. `BottomSheet.tsx:41,107` / `ProfileClient.tsx:533` 및
  186행 미사용 disable은 모두 HEAD 기준으로도 동일하게 나던 기존 항목.
- `npx next build`는 다른 세션의 빌드가 점유 중이라 스킵. 커밋은 하지 않았습니다.
