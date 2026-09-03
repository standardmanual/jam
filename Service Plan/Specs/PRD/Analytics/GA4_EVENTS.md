# GA4 커스텀 이벤트 계측 명세

> ① PRD 카테고리 — "현재 기준 최신 스펙" 문서. 이벤트를 추가·변경하면 이 표를 그대로
> 덮어써서 갱신한다(이력은 git이 보관). 구현 배경·의사결정은
> [Tickets/20260903_1034](../../../Tickets/20260903_1034_Feature_GA4연동-핵심여정-커스텀이벤트계측.md) 참고.

## 연동 구조

- `@next/third-parties/google`의 `GoogleAnalytics` 컴포넌트를 루트 레이아웃(`src/app/layout.tsx`)에
  연동. 측정 ID는 `NEXT_PUBLIC_GA_MEASUREMENT_ID`(`G-7K884Q399P`) — 미설정 환경(로컬 등)에서는
  스크립트 자체를 렌더하지 않는다.
- 커스텀 이벤트는 `src/lib/analytics/gtag.ts`의 `trackEvent(name, params)` 한 곳을 통해서만
  보낸다(`sendGAEvent()` 래퍼). `window.gtag`를 직접 참조하지 않는다.

### staging/production 트래픽 분리

GA4 측정 ID가 1개(`G-7K884Q399P`)뿐이라 스트림을 나누지 않는다. 대신 `jam`(production)과
`jam-stage`(staging) — 이미 분리된 두 Vercel 프로젝트 — 각각에 `NEXT_PUBLIC_GA_ENVIRONMENT`를
`production`/`staging`으로 다르게 설정해, **모든 이벤트에 `environment` 파라미터**를 자동으로
붙인다(`trackEvent` 내부 처리). GA4 콘솔에서 이 파라미터로 세그먼트를 나눠 본다.
로컬(`next dev`)은 `NEXT_PUBLIC_GA_MEASUREMENT_ID` 자체를 설정하지 않아 이벤트가 아예 전송되지
않는다.

## 이벤트 표

| 이벤트명 | 트리거 조건 | 파라미터 | 계측 위치 |
|---|---|---|---|
| `sign_up_complete` | 구글 로그인 최초 완료 (`users` row가 이번 로그인에서 처음 생성됨) | — | `auth/callback/route.ts`(플래그 부여) → `onboarding/page.tsx`(전송) |
| `onboarding_complete` | username 설정 완료 (현재 온보딩의 유일한 단계) | — | `onboarding/page.tsx` |
| `strava_connect_complete` | Strava OAuth 콜백 성공 (`?strava=connected` 도착) | — | `components/StravaConnectReveal.tsx` |
| `first_badge_earned` | 유저의 **전체 첫 배지** 획득 연출이 열리는 시점 | — | `components/StravaConnectReveal.tsx`, `components/SyncButton.tsx` |
| `home_view` | 홈("투데이") 화면 마운트 | — | `app/(main)/HomeViewTracker.tsx` |
| `item_drop` | 드랍 성공 | `poi_id`, `inventory_item_id`, `badge_id` | `components/PoiCarouselModal.tsx` |
| `item_pickup` | 픽업 성공 | `poi_id`, `drop_id`, `badge_id` | `components/PoiCarouselModal.tsx` |
| `combine_attempt` | 믹스 실행(성공/실패 이전) | `item_count` | `app/(main)/combine/CombineClient.tsx` |
| `combine_success` | 믹스 성공 | `item_count`, `result_badge_ids`(쉼표 구분) | `app/(main)/combine/CombineClient.tsx` |
| `mission_join` | 미션 참가 성공 | `mission_id` | `app/(main)/missions/[id]/MissionDetailClient.tsx` |
| `mission_complete` | 미션 완료(서버 INSERT 성공, 평생 1회) | `mission_id` | `components/SyncButton.tsx` |

모든 이벤트는 `trackEvent()`가 자동으로 붙이는 `environment`(`production`\|`staging`\|`development`)
파라미터를 공통으로 갖는다.

## first_badge_earned — "최초 1회" 판정 로직

배지 소유권은 배지 종류(활동/아이템/POI/미션·컬렉션 보상) 무관하게 `user_activity_badges`
테이블 하나에 기록된다(UNIQUE user_id+badge_id). 이 성질을 이용해 판정한다:

1. 배지 획득 연출(BadgeRevealCarousel)에 실릴 배지 목록을 만드는 두 API
   (`/api/strava/sync`, `/api/badges/recent-earned`)가 공용으로 쓰는
   `buildEarnedBadgePayload()`(`src/lib/strava/sync.ts`)가 `user_activity_badges`에서
   해당 유저의 **전체 행 수**를 센다.
2. 그 카운트가 "이번에 되읽은 배지 개수"와 정확히 같으면(= 유저가 지금까지 가진 배지가
   전부 이번 배치뿐) `isFirstBadgeEver: true`를 응답에 싣는다.
3. 클라이언트(`StravaConnectReveal`/`SyncButton`)는 이 서버 판정값을 그대로 신뢰해 이벤트를
   1회만 보낸다 — 클라이언트 상태(세션스토리지 등)로 자체 판정하지 않는다. 배지 INSERT
   자체가 유니크 제약이라 실제 DB 카운트는 재요청·새로고침에도 항상 정확하다.

## 알려진 계측 공백 (의도적 범위 제한)

- **`first_badge_earned`/`mission_complete` 커버리지 = Strava 동기화 경로만.** 두 이벤트 모두
  배지 발급/미션 완료 판정 자체가 `syncStravaActivities()`(Strava 콜백의 최초 연동 동기화,
  `SyncButton`의 수동 동기화) 안에서만 일어난다. 조합(`combine`)·미션 보상으로 받는 배지는
  자체 획득 연출(BadgeRevealCarousel)이 없어 이 이벤트 대상에서 빠진다. 최초 연동 시점의
  미션 완료는 `mission_complete`가 아예 전송되지 않는다(콜백이 서버 리다이렉트만 하고
  완료 목록을 클라이언트로 돌려줄 방법이 없음 — `first_badge_earned`가 이 문제를
  `/api/badges/recent-earned` 재조회로 우회한 것과 달리 미션 쪽엔 동일한 재조회 엔드포인트가
  없다).
- **`onboarding_complete`는 username 설정만 계측한다.** 이 티켓 작성 시점 PRD 시나리오에는
  "username·활동 종목·지역 설정 완료"라고 돼 있었으나, 실제 온보딩 화면(`onboarding/page.tsx`)은
  username 입력 1단계뿐이다(`01_PRD.md`: "온보딩 — username 설정(최초 1회)"). `users.region`·
  `users.activity_types` 컬럼은 스키마에 있지만 이를 채우는 사용자 입력 화면이 현재 없다
  (검색·배지 필터 등 읽기 전용 소비만 있음). 그 단계가 생기면 이 이벤트에 파라미터를
  추가한다.
