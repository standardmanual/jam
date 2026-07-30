# 팀 작업 계획

- 팀명: kkirikkiri-transitions-apply
- 목표: transitions-dev 스킬로 이미 조사한 감사 결과(관리자 제외)를 기반으로 JAM! 웹앱에 CSS 트랜지션을 실제 적용. 향후 재사용될 컴포넌트(BottomSheet, Toast, TabBar, 탭류)는 공유 컴포넌트로 만들어 통일.
- 생성 시각: 2026-07-30
- 기존 코드: 기존 코드 수정/리팩토링 (신규 아님)
- 테스트: 개발 서버로 브라우저 직접 확인 (자동 테스트 코드는 작성하지 않음 — CSS 트랜지션이라 유닛 테스트 대상 아님)

## 참고: transitions-dev 스킬 위치
`/Users/sihyunhwang/.claude/skills/transitions-dev/` — `_root.css`, `01-card-resize.md` ~ `27-toggle.md`

## 팀 구성
| 이름 | 역할 | 담당 업무 |
|------|------|----------|
| 메인세션(팀장) | 계획/배분/검증/통합 | 감사 진행, 인터뷰, 태스크 배분, 최종 브라우저 검증 |
| dev-shared | 공유 컴포넌트 담당 | motion 토큰 설치, BottomSheet/Toast/TabBar 트랜지션, 신규 공유 Tabs(슬라이딩) 컴포넌트 제작 + BadgesClient/MissionsListClient/FeedSection/ProfileClient에 배선 |
| dev-pages | 개별 페이지 담당 | FollowButton, points, onboarding, profile/edit, DropsClient, MissionDetailClient, CombineClient, InventoryItemHistorySheet |

## 태스크 목록 (파일 소유권 — 겹치지 않도록 분리)

### dev-shared 담당
- [ ] `jam-web/src/app/globals.css` — transitions-dev `_root.css`의 motion 토큰 전체(:root 블록) 설치 (중복 설치 방지 위해 먼저 확인)
- [ ] `jam-web/src/components/ui/BottomSheet.tsx` — Panel reveal (`07-panel-reveal.md`) 적용. 열릴 때 애니메이션 없음 → 슬라이드+블러 인/아웃 추가
- [ ] `jam-web/src/components/ui/Toast.tsx` — Toast open/close (`22-toast.md`) 적용
- [ ] `jam-web/src/components/ui/TabBar.tsx` — 활성탭 점 표시자에 Notification badge (`03-notification-badge.md`) 적용
- [ ] 신규 `jam-web/src/components/ui/SlidingTabs.tsx` — Tabs sliding (`16-tabs-sliding.md`) 공유 컴포넌트 제작 (향후 계속 재사용 목적)
- [ ] `jam-web/src/app/(main)/badges/BadgesClient.tsx` — 탭 헤더(액티비티/아이템북)를 SlidingTabs로 교체
- [ ] `jam-web/src/app/(main)/missions/MissionsListClient.tsx` — 탭(진행중/참여중/종료)을 SlidingTabs로 교체 + 필터 패널 Accordion expand(`21-accordion.md`) 적용
- [ ] `jam-web/src/app/(main)/FeedSection.tsx` — 필터탭을 SlidingTabs로 교체 + DetailSheet에 Panel reveal(`07-panel-reveal.md`) 적용
- [ ] `jam-web/src/app/(main)/profile/ProfileClient.tsx` — 통계바 탭(배지/아이템북/팔로워/팔로잉)을 SlidingTabs로 교체 + 팔로워 수 Number pop-in(`02-number-pop-in.md`) + 팔로우 버튼 Text states swap(`04-text-states-swap.md`) + 탭 로딩 Skeleton(`14-skeleton-reveal.md`)

### dev-pages 담당
- [ ] `jam-web/src/app/(main)/[username]/FollowButton.tsx` — Text states swap(`04-text-states-swap.md`)
- [ ] `jam-web/src/app/(main)/points/page.tsx` — 포인트 잔액 Number pop-in(`02-number-pop-in.md`)
- [ ] `jam-web/src/app/(main)/onboarding/page.tsx` — 닉네임 중복확인 메시지 Text states swap + 유효성 오류 Error state shake(`12-error-state-shake.md`)
- [ ] `jam-web/src/app/(main)/profile/edit/page.tsx` — 위와 동일 패턴 적용
- [ ] `jam-web/src/app/(main)/drops/DropsClient.tsx` — 지도 바텀시트 Panel reveal + 헤더 타이틀 Text states swap
- [ ] `jam-web/src/app/(main)/missions/[id]/MissionDetailClient.tsx` — 달성뱃지 Text states swap + 참가확인 카드 Panel reveal
- [ ] `jam-web/src/app/(main)/combine/CombineClient.tsx` — 조합 성공 결과 배너 Success check(`10-success-check.md`)
- [ ] `jam-web/src/app/(main)/inventory/[itemId]/InventoryItemHistorySheet.tsx` — 로딩 스피너 → Skeleton loader and reveal(`14-skeleton-reveal.md`)

## 주의사항 (공통)
- 스니펫은 참고문서에서 verbatim으로 복사, `will-change` 제거 금지, `transition: all`로 뭉개지 말 것
- `prefers-reduced-motion` 가드 반드시 유지
- 기존 `active:scale` 프레스 피드백은 그대로 두고 건드리지 말 것
- 각 파일 수정 후 해당 화면이 깨지지 않는지(타입 에러 없는지) 확인
