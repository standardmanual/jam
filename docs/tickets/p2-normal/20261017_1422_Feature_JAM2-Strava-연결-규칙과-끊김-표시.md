---
id: "20261017_1422"
category: Feature
priority: P2
status: IN_PROGRESS
created: 2026-10-17
parent: "20261017_1420"
specs:
  - "docs/plan/jam2/10 JAM 2.0 서비스 운영 로직.md"
  - "docs/plan/jam2/service-redesign/현재 서비스 비교.md"
  - "docs/service/prd/02_DATA_MODEL.md"
---

# [Feature] JAM 2.0 Strava 연결 규칙을 만든다: 다른 계정 재연결, 끊김 표시, 연결 끊기, 중복 연결 안내

## 핵심 요약

- 요구사항: 운영 로직 3.2·3.4절의 연결 규칙을 만든다. (1) 다른 Strava 계정을 연결하면 첫 동기화 규칙을 쓴다. (2) 토큰 갱신이 실패하면 연결이 끊긴 것으로 보고 홈과 프로필에 끊김과 다시 연결 버튼을 보여 준다. (3) 프로필 설정에서 연결을 끊을 수 있다. (4) 이미 다른 JAM 계정에 연결된 Strava 계정을 연결하려 하면 안내 화면을 보여 주고 취소만 가능하게 한다(사용자 결정, 2026-10-17). 비교표 4.1절의 «다른 계정 재연결 시 첫 동기화 표시가 그대로»와 «토큰 실패 시 홈이 연결됨으로 보임» 두 건을 고친다.
- 구현 계획: 2회로 나눠 돌린다. 1회는 서버(콜백의 연결 교체와 중복 감지, 동기화의 끊김 표시와 첫 동기화 판정, 연결 끊기 API, 연결 상태 판정 한 곳), 2회는 화면(홈 끊김 카드와 다시 연결 버튼, 프로필 연결 끊기, 중복 연결 안내 화면, 연결 상태를 읽는 곳 정리)이다. 2회는 시작 전에 채원의 사전 판정을 받는다. DB는 새 칸 추가만 한다.
- 관련 파일(2026-10-17 조사, 시작 때 아현이 줄 위치를 다시 확인한다):
  - `jam-web/src/app/api/strava/callback/route.ts`: `strava_connections.upsert(..., { onConflict: 'strava_athlete_id' })`(102-115, `last_synced_at: null`, `backfill_completed: true`), 연동 직후 동기화 호출(127). 이미 다른 JAM 유저에 연결된 athlete를 감지하는 검사가 없다.
  - `jam-web/src/app/api/strava/auth/route.ts`: state 쿠키를 심고 OAuth로 보내기만 한다.
  - `jam-web/src/lib/strava/sync.ts`: 토큰 갱신(1200-1246, 실패 시 `strava_disconnected` 알림과 `strava_sync_failures` 기록 후 예외, 행은 그대로), `isFirstSync` 결정(1291-1296, `users.initial_sync_done`), 커서(1255-1270, `strava_activities` 최신 `start_date` 기준이라 계정이 바뀌면 새 계정의 오래된 활동이 조회에서 빠질 수 있음, 추측).
  - 표시: `jam-web/src/app/(main)/page.tsx`(33-43, 행이 있으면 끊김 카드를 안 보임), `app/(main)/layout.tsx`(35, 48, `stravaConnected = Boolean(row)`), `components/ui/TopNav.tsx`(145), `TodayStatusStrip.tsx`(32), `lib/notifications/warning.ts`(62-66), 미사용 `components/strava/StravaStatusCard.tsx`.
  - `jam-web/src/lib/badge-engine/index.ts:1586`(`initial_sync_done`를 true로 바꿈), `jam-web/src/lib/admin/user-actions.ts:148`(어드민 리셋이 false로 되돌림).
  - `jam-web/supabase/migrations/001_initial_schema.sql`(`strava_connections.strava_athlete_id UNIQUE`, `user_id`에는 유니크 없음), `032_badge_system_v3.sql`(`users.initial_sync_done`).
  - 스펙: 운영 로직 3.1·3.2·3.4절, 비교표 3.12절.

## 배경 / 문제 정의

- 다른 Strava 계정을 연결해도 `initial_sync_done`이 그대로여서 «최근 1건만 반영»하는 규칙이 적용되지 않을 수 있다.
- 토큰 갱신이 실패해도 `strava_connections` 행이 남고 홈·상단 메뉴의 판정이 «행이 있는가»뿐이라 «연결됨»으로 보인다. 끊김 상태를 저장하는 칸이 없다.
- 콜백에 «이 athlete가 이미 다른 JAM 유저에 연결됨» 검사가 없다. 충돌하면 upsert가 기존 행의 `user_id`를 덮어쓴다(코드 판독). 한 유저가 다른 athlete를 연결하면 같은 `user_id`의 행이 둘이 되어 `.single()`·`.maybeSingle()`이 오류를 낼 수 있다(추측, 실DB 제약은 미확인).
- 유저가 스스로 연결을 끊는 기능이 없다.

공용 DB 주의: 옛 프로덕션 코드가 `strava_connections`와 `users.initial_sync_done`를 읽고 쓴다. 이 칸들의 뜻을 바꾸지 않고, 새 칸을 더해 새 코드만 읽는다.

## 시작 전에 사용자에게 확인할 것 (주요 결정, 질문창)

1. **«첫 동기화를 마쳤는가»의 새 표시를 어디에 둘지**: `strava_connections`에 연결 단위로 두는 방식(추천, 연결이 바뀌면 자연히 초기화)과 `users`에 새 칸을 더하는 방식. 옛 `initial_sync_done`은 건드리지 않는다.
2. **끊김 상태의 저장**: `strava_connections`에 끊김 시각 칸을 더하는 방식(추천)과 별도 테이블. 같은 Strava 계정으로 다시 연결하면 마지막 동기화 뒤부터 이어서 가져오는 규칙과 맞물린다.
3. **연결 끊기의 처리**: 행을 지울지(토큰 폐기), 끊김 표시만 남길지. 지금까지의 기록, 배지, 잼, 포인트는 남아야 한다(3.2절).
4. **한 JAM 계정에 Strava 연결이 둘 생기는 경우 처리**: 새 연결이 기존 연결을 대체하게 할지(추천), 막을지.

## 사용자 결정 (2026-10-17, 질문창, 모두 추천안)

1. **«첫 동기화 대기»는 연결 단위로 둔다.** `strava_connections.first_sync_pending`(기본 false)을 더한다. 다른 Strava 계정을 연결해 새 연결 행이 생기면 콜백이 true로 두고, 이 값이 true이면 `users.initial_sync_done`과 상관없이 첫 동기화 규칙을 쓴다. 인정 활동을 정산한 동기화가 끝나면 false로 되돌린다. 기본 false라서 이미 동기화한 기존 연결은 그대로이고 소급 갱신이 필요 없다. 옛 `initial_sync_done`은 건드리지 않는다.
2. **끊김은 연결 행에 저장한다.** `disconnected_at`(NULL이면 연결 중)과 `disconnect_reason`을 더한다. 토큰 갱신 실패, Strava 쪽 철회(401), 유저가 끊은 경우가 모두 같은 «끊김»이다.
3. **연결 끊기는 Strava 쪽 앱 연결도 함께 해제한다.** Strava의 앱 해제(`deauthorize`)를 부르고 저장된 토큰을 지운다. 지금까지의 기록, 배지, 잼, 포인트는 남는다(위치정보 수집 동의를 거두는 수단, 운영 로직 3.2절).
4. **한 JAM 계정에 다른 Strava 계정을 연결하면 새 연결이 기존 연결 행을 대체한다**(한 번에 하나만 연결, 3.2절). 새 행은 `first_sync_pending=true`다. 같은 Strava 계정을 다시 연결하면 끊김을 지우고 마지막 동기화 뒤부터 이어서 가져온다.

**DB 실행 기록(2026-10-17)**: 사용자 승인 뒤 마이그레이션 225(`225_strava_connection_state.sql`)를 공용 DB에서 롤백 실측(연결 행 4건 그대로, 새 칸 3개, 롤백 뒤 0개)하고 적용했다. 적용 뒤 확인: `first_sync_pending`은 `boolean NOT NULL DEFAULT false`, `disconnected_at`·`disconnect_reason`은 NULL 허용이고 표시된 행이 0건이다. 생성 타입에 같은 모양으로 반영했고 `npm run typecheck`를 통과했다. 되돌림 SQL은 파일 끝 주석에 있다.

## 상세 요구사항

### 서비스/코드베이스 관점

- **다른 계정 재연결**: 연결이 바뀌면(다른 athlete) 첫 동기화 규칙을 쓴다. 같은 athlete를 다시 연결하면 마지막 동기화 이후부터 이어서 가져온다. 커서가 이전 계정의 활동 이력에 끌려가지 않게 한다.
- **토큰 갱신 실패 = 연결 끊김**: 갱신이 실패하면 끊김 상태를 저장한다. 홈과 프로필에 끊김을 보여 주고 다시 연결하는 버튼을 둔다. «연결이 끊겼다»는 소식은 지금처럼 하루 한 번 보낸다. 만료 전 401(철회 등)도 같은 끊김으로 본다.
- **연결 끊기**: 프로필 설정에서 연결을 끊는다. 끊으면 동기화가 멈추고 기록은 남는다.
- **중복 연결 안내**: Strava 인증을 마친 뒤 연결을 저장하기 전에, 그 Strava 계정이 이미 다른 JAM 계정에 연결돼 있으면 안내 화면을 보여 준다. 안내는 세 가지다(이미 다른 JAM 계정에 연결됨, 연결하면 기존 계정은 삭제되고 복구되지 않음, 그래도 새로 연결하면 처음부터 다시 시작). 이 티켓에서는 «취소»만 동작하고 «그래도 연결하기»는 만들지 않는다(묶음 6의 탈퇴 구현 뒤에 잇는다). 안내 화면의 문구는 «그래도 연결하기»가 아직 없다는 사실에 맞게 채원 판정으로 정한다.
- 이용 정지 중인 유저의 동기화 차단은 2-6이 다룬다.
- 새 칸과 설정은 덧붙이기만 한다. 생성 타입(`database.generated.ts`)을 같은 커밋에 맞춘다.

### UI/UX 관점 (해당 시)

- 홈 카드의 끊김 상태와 다시 연결 버튼, 프로필 설정의 연결 끊기, 중복 연결 안내 화면을 새 디자인으로 구현한다. 채원의 사전 판정을 먼저 받는다(`needs_design` 방지). 사용자 노출 문구는 UX 라이팅 가이드와 `fluent-korean` 지침을 따른다.

## 구현 계획 (회차)

#### 2-2 구현 계획 (2026-10-17, 카리나, 파일 단위)

DB는 225 적용과 생성 타입 반영을 카리나가 끝냈다. 아현은 코드·시험·문서만 한다. 줄 위치는 2026-10-17 `staging` 기준이며 시작 때 아현이 다시 확인한다. 각 회차는 파일이 5개를 넘어 `planOnlyWaiver`를 첫 호출부터 넘긴다.

##### 1회: 서버 (연결 교체와 중복 감지, 끊김 표시, 첫 동기화 판정, 연결 끊기 API)

| 파일 | 위치 | 바꿀 내용 |
|---|---|---|
| `jam-web/src/app/api/strava/callback/route.ts` | 60-140 (토큰 교환 뒤 `strava_connections.upsert` 102-115, 연동 직후 동기화 127) | 토큰 교환 뒤 `strava_athlete_id`로 기존 연결을 찾는다. 다른 JAM 계정의 연결이 있으면(끊김 상태 포함) 저장하지 않고 중복 연결 안내(`/profile?strava=duplicate`)로 보낸다. 같은 유저의 같은 athlete이면 토큰을 갱신하고 `disconnected_at`·`disconnect_reason`을 지운다(`first_sync_pending`은 그대로). 같은 유저가 다른 athlete로 연결하면 이 유저의 기존 연결 행을 지우고 새 행을 `first_sync_pending=true`로 만든다. 기존 `upsert`의 `onConflict: strava_athlete_id`가 다른 유저의 `user_id`를 덮어쓰지 않게 한다 |
| `jam-web/src/lib/strava/connection-state.ts` | 신규 | 연결 상태를 판정하는 한 곳: `none`(행 없음), `connected`(`disconnected_at` NULL), `disconnected`. 화면과 서버가 같은 판정을 쓴다. 끊김을 저장하는 함수(`markStravaDisconnected(userId, reason)`)와 다시 연결 때 지우는 함수를 함께 둔다 |
| `jam-web/src/lib/strava/sync.ts` | 1200-1246 (토큰 갱신, 실패 시 `strava_disconnected` 알림과 `strava_sync_failures` 기록 후 예외), 1255-1270 (커서), 1291-1296과 1406 (`isFirstSync`), 429 부근 응답 | 토큰 갱신이 실패하거나 Strava가 401로 철회를 알리면 기존 알림·기록은 그대로 두고 `markStravaDisconnected`로 끊김을 저장한다. `disconnected_at`이 있으면 동기화하지 않고 «끊김» 결과를 돌려준다(수동 경로 응답 409 계열). `isFirstSync`를 `!users.initial_sync_done`이거나 연결의 `first_sync_pending`이면 true로 한다. `first_sync_pending`이 true이면 커서를 이전 계정의 활동 이력에서 읽지 않고(새 계정의 오래된 활동이 조회에서 빠지지 않게), 인정 활동을 정산한 동기화가 끝나면 false로 되돌린다 |
| `jam-web/src/lib/strava/api.ts` | 139 (`refreshStravaToken`) 부근 | Strava 앱 해제를 부르는 함수(`POST https://www.strava.com/oauth/deauthorize`)를 더한다. 401(철회)을 구분해 던질 수 있게 한다 |
| `jam-web/src/app/api/strava/disconnect/route.ts` | 신규 | 로그인한 유저의 연결을 끊는다. Strava 앱 해제를 시도하고(이미 무효한 토큰이면 실패해도 계속) 저장된 토큰을 지운 뒤 `markStravaDisconnected(userId, 'user_disconnected')`를 저장한다. 기록, 배지, 잼, 포인트는 건드리지 않는다. 연결이 없으면 404 |
| `jam-web/src/app/api/strava/sync/route.ts` | POST | 끊김 결과를 응답으로 알린다(500이 아니라 구분되는 상태) |
| 시험 | `callback`, `connection-state`, `sync` 첫 동기화·끊김, `disconnect` 시험(신규 포함) | 다른 JAM 계정 연결 중복(덮어쓰지 않음), 같은 athlete 재연결(끊김 지움), 다른 athlete 교체(`first_sync_pending=true`, 이전 행 삭제), 토큰 실패 시 끊김 저장과 동기화 차단, `first_sync_pending`일 때 커서 무시와 정산 뒤 false, 끊기 API(앱 해제 실패해도 진행, 토큰 삭제, 기록 불변) |
| 문서 | `docs/service/prd/02_DATA_MODEL.md` | `strava_connections` 새 칸 3개와 연결 상태 규칙 |

##### 2회: 화면 (채원 사전 판정 필요, `workType: ui`)

| 파일 | 위치 | 바꿀 내용 |
|---|---|---|
| 홈 끊김 카드와 다시 연결 버튼 | `jam-web/src/app/(main)/page.tsx` 33-43, `TodayStatusStrip.tsx` 32, `lib/notifications/warning.ts` 62-66, 미사용 `components/strava/StravaStatusCard.tsx` | 판정을 «행이 있는가»에서 `connection-state.ts`로 바꾸고, 끊김이면 끊김 카드와 다시 연결 버튼(`/api/strava/auth`)을 보여 준다 |
| 상단 메뉴·레이아웃 | `app/(main)/layout.tsx` 35·48 (`stravaConnected = Boolean(row)`), `components/ui/TopNav.tsx` 145, `lib/topNavData.tsx` | 끊김이면 동기화 버튼 대신 다시 연결을 보여 준다 |
| 프로필 설정의 연결 끊기 | `app/(main)/profile/` 설정 화면(위치는 채원 판정으로 정한다) | 연결 끊기 버튼과 확인 단계(끊으면 동기화가 멈추고 기록은 남는다는 안내). 연결이 끊긴 상태에서는 다시 연결 버튼 |
| 중복 연결 안내 화면 | `/profile?strava=duplicate` 처리(`ProfileClient.tsx` 또는 신규) | 세 가지 안내(이미 다른 JAM 계정에 연결됨, 연결하면 기존 계정은 삭제되고 복구되지 않음, 그래도 새로 연결하면 처음부터 다시 시작)를 보여 주고 «취소»만 동작한다. «그래도 연결하기»는 만들지 않는다(묶음 6). 문구는 채원 판정으로 정한다 |
| 연결 상태를 읽는 나머지 곳 | `OnboardingQuestCard.tsx`, `lib/onboarding-quest/status.ts`·`preview.ts`, `badges/[id]/page.tsx`, `BadgeShareButton.tsx`, `api/badges/[id]/share-data/route.ts`, `notifications/NotificationsClient.tsx`, `lib/notifications/batch/account.ts`, `components/StravaConnectReveal.tsx`, `lib/admin/user-actions.ts`·`user-bulk-impact.ts`, `api/admin/strava-backfill/route.ts` | `strava_connections` 행의 존재를 «연결됨»으로 읽는 곳을 모두 찾아 한 판정으로 바꾸거나(화면), 끊김 행을 건너뛰게 한다(백필·배치). 검색 결과를 완료 기록에 싣는다 |
| 서버 보정 4건 (1회 게이트 판독) | `jam-web/src/lib/strava/sync.ts` 1390-1399, `jam-web/src/lib/strava/connection-state.ts`, `jam-web/src/app/api/strava/callback/route.ts` 160-170, `jam-web/src/app/api/strava/disconnect/route.ts` 50-70, `jam-web/src/lib/strava/backfill.ts` 145·149 | (a) 토큰 갱신 실패 가운데 인증 오류(400·401·403, 철회·만료)만 끊김으로 저장하고 5xx·네트워크 오류·시간 초과 같은 일시 실패는 끊김으로 저장하지 않는다(기존 실패 기록과 소식은 유지하고 다음 동기화에서 다시 시도). (b) 계정 교체 때 새 행을 넣은 뒤 이전 행 삭제가 실패하면 방금 넣은 새 행을 되돌려 같은 `user_id`의 행이 둘 남지 않게 한다. (c) 이미 끊긴 연결에 끊기를 다시 부르면 앱 해제를 부르지 않고 성공으로 돌려주며 `disconnected_at`·`disconnect_reason`을 덮어쓰지 않는다. (d) 어드민 백필이 끊김 행(토큰이 빈 문자열)을 복호화하지 않고 건너뛴다 |
| 문구와 시험 | `lib/i18n/ko.ts`(`d.*`), 각 컴포넌트 시험 | 끊김 카드, 끊기 확인, 중복 안내 문구(UX 라이팅 가이드, 해요체, 고정 용어). 상태별 렌더 시험 |
| 문서 | `docs/service/prd/` 해당 문서 | 연결 규칙(다른 계정, 끊김, 끊기, 중복 안내) |

**주의(코드 판독)**: Strava에서 같은 계정을 다시 인증하면 이미 연결된 다른 JAM 계정의 토큰이 무효화될지는 확인하지 못했다(추측). 그래서 중복 연결을 감지하면 방금 받은 토큰은 저장하지 않고 버린다. 이 영향은 잔여 이슈로 남겨 staging에서 시험 계정으로 확인한다.

**이 티켓에서 하지 않는 것**: «그래도 연결하기»(기존 계정 삭제, 묶음 6), 이용 정지 중 동기화 차단(2-6), 위치정보 수집 동의의 철회 연결(묶음 6).

각 회차 요약은 2,500자 이내다. 1회는 `workType`을 `api`, 2회는 `ui`로 돌린다.

## 완료 조건

### 구현 범위 (게이트 판정 대상)

- 다른 Strava 계정으로 다시 연결하면 첫 동기화 규칙(인정 활동 가운데 가장 최근 1건)이 적용된다. 같은 계정을 다시 연결하면 마지막 동기화 뒤부터 이어서 가져온다. 단위 시험으로 고정한다.
- 토큰 갱신이 실패하면 끊김 상태가 저장되고, 홈과 상단 메뉴가 «연결됨»이 아니라 끊김과 다시 연결 버튼을 보여 준다. 정상 연결 상태의 화면은 이전과 같다.
- 프로필 설정에서 연결을 끊으면 동기화가 멈추고 지금까지의 기록, 배지, 잼, 포인트가 그대로 남는다.
- 이미 다른 JAM 계정에 연결된 Strava 계정을 연결하려 하면 연결이 저장되지 않고 안내 화면이 뜨며, «취소»로 기존 계정이 그대로 남는다. 기존 행의 `user_id`가 덮어써지지 않는 시험이 있다.
- 옛 칸(`users.initial_sync_done`, `strava_connections`의 기존 칸)의 뜻이 바뀌지 않았다. 새 칸은 기본값이 있어 기존 행에 영향이 없다.
- (전체) 비교표 4.1절의 «다른 계정 재연결 시 첫 동기화 표시»와 «토큰 실패 시 연결됨 표시» 두 건이 완료 기록에 «고침» 또는 «재현 안 됨»으로 남아 있다.
- (전체) `docs/service/prd/`의 해당 문서에 연결 규칙이 반영되어 있다.

### 후속 범위 (담당: 카리나, 시점: 사용자 승인 뒤)

- 사용자 확인 1~4번의 결정을 이 티켓 「사용자 결정」 절에 기록한다. 새 칸이 있으면 SQL 실행 승인을 받고 롤백 실측 뒤 실행한다.
- 같은 Strava 계정의 «그래도 연결하기»와 위치정보 수집 동의의 철회 연결은 묶음 6에서 잇는다(상위 티켓 20261017_1420).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

**2회 화면**(아현, 브랜치 `claude/jamwork-20261017_1422-strava-screen`): 오류로 끊긴 유저의 홈에 흰 Card·LabelChip·세 줄·검정 알약 «Strava 다시 동기화하기» 카드를 그리고, 상단 메뉴 가운데를 «다시 동기화»로 바꿨다. 프로필 수정에 «Strava 동기화» 구획(연결 중 «동기화 끊기», 끊김 «Strava 다시 동기화하기», 연결 없음은 구획 없음)과 끊기 확인 시트를 두었다. `?strava=duplicate`로 도착하면 `(main)/layout.tsx`의 중복 안내 시트가 어느 페이지든 열리고 버튼은 «취소» 하나다. 유저가 직접 끊은 경우(`user_disconnected`)는 홈에서 알람 없이 미연동처럼 보인다. 서버 보정 4건(a 일시 실패는 끊김 저장 안 함, b 교체 실패 시 새 행 되돌림, c 이미 끊긴 연결의 끊기 멱등, d 백필의 끊김 행 건너뜀)을 단위 시험으로 고정했다.

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보

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

**비교표 4.1절 두 건(3.12절 연동 소스)**: 「다른 Strava 계정을 다시 연결해도 첫 동기화 표시가 그대로」 = **고침**(1회, `first_sync_pending`과 교체 연결). 「토큰 갱신이 실패해도 홈 카드가 연결됨으로 보임」 = **고침**(1회 끊김 저장 + 2회 홈·상단 메뉴·프로필의 판정 교체, 일시 실패는 끊김으로 저장하지 않도록 서버 보정 a).

**«행이 있는가»로 읽던 곳의 검색 결과와 처리**(`grep -rn "strava_connections" jam-web/src`, 줄 번호는 작업 후 기준)

| 위치 | 처리 | 내용 |
|---|---|---|
| `(main)/layout.tsx:39` | 교체 | 두 칸만 읽어 `resolveStravaUiState` → 상단 메뉴 상태. 조회 실패는 로그 + 동기화 시작 버튼(none)으로 둠 |
| `(main)/page.tsx:42` | 교체 | `select('*')` → 두 칸. 판정 결과로 끊김 카드·진행도 CTA·퀘스트 카드 입력을 가름. 조회 실패는 `unknown`(알람·CTA 없음) |
| `(main)/profile/edit/page.tsx:72` | 신규(판정 사용) | 클라이언트가 `disconnected_at, disconnect_reason, last_synced_at`만 읽음(`select('*')` 없음) |
| `(main)/badges/[id]/page.tsx:100` | 교체 | `connected`일 때만 공유 버튼 활성 |
| `api/badges/[id]/share-data/route.ts:154·182` | 교체 | 연결 없음·끊김은 `strava_disconnected` 404(끊김 행은 토큰이 비어 복호화도 못 함). 182는 토큰 갱신 저장이라 해당 없음 |
| `lib/notifications/feed.ts:191` | 교체 | 경고 판정의 `stravaConnected`가 `connected`를 뜻함(끊김 행은 경고 유지) |
| `lib/notifications/warning.ts` | 의미 갱신 | 입력 `stravaConnected`의 뜻(주석) |
| `lib/onboarding-quest/status.ts`·`preview.ts`·`OnboardingQuestCard.tsx` | 해당 없음(입력 의미 갱신) | 테이블을 읽지 않고 호출부가 넘기는 boolean만 쓴다. 홈이 `connected` 또는 `unknown`일 때 true를 넘김 |
| `lib/today/exposure.ts:251` | 교체 | `strava_stale_14d` 태그에서 `user_disconnected`만 제외(스스로 멈춘 유저에게 «오래 안 했어요» 반복 안 함), 오류 끊김은 그대로 셈 |
| `lib/notifications/batch/account.ts:135` | 건너뜀 | 동기화 정체 소식 배치가 끊김 행을 제외 |
| `lib/strava/backfill.ts:156` | 해당 없음 | 갱신 토큰 저장 update(끊김 행은 아래 307에서 이미 제외) |
| `lib/strava/backfill.ts:307` | 건너뜀 | 서버 `select('*')`(토큰 필요)를 쓰되 끊김 행을 걸러냄 + 유저 단위 함수도 끊김이면 복호화 전에 건너뜀 |
| `lib/strava/backfillStats.ts:257` | 건너뜀 | 백필 가능 판정에서 끊김 행 제외 |
| `api/admin/strava-backfill/route.ts:56` | 건너뜀 | 끊김 유저면 409 |
| `lib/admin/user-actions.ts:150` | 건너뜀 | 초기화의 연결 update가 끊김 행을 건드리지 않음(`is('disconnected_at', null)`) |
| `lib/admin/user-bulk-impact.ts:94` | 건너뜀 | «끊기는 연결 N건» 집계에서 이미 끊긴 연결 제외 |
| `app/api/strava/callback/route.ts`, `disconnect/route.ts`, `lib/strava/sync.ts`, `connection-state.ts` | 해당 없음 | 1회가 만든 연결·끊김 저장 경로(판정 이전 단계) |
| `components/StravaConnectReveal.tsx`, `BadgeShareButton.tsx`, `NotificationsClient.tsx` | 해당 없음 | 테이블을 읽지 않는다(쿼리 파라미터·props·소식 종류만) |

**판단과 해석**
- `connection-state.ts`가 최상단에서 `@/lib/supabase/server`를 불러오면 프로필 수정(클라이언트)이 이 판정을 가져다 쓸 때 `next/headers`가 브라우저 번들에 들어간다. 서버 클라이언트는 `markStravaDisconnected`가 필요할 때 동적으로 불러오게 바꿨다(시험은 주입 클라이언트를 그대로 씀).
- `TodayLeftStatus.strava_disconnected`(행 없음을 뜻했음)는 `strava_not_connected`로 이름을 바꿨다.
- 문구 두 곳을 판정안에서 손봤다: 끊기 확인 시트 셋째 문장의 «연결된 앱 목록»을 «앱 목록»으로(완료 조건 5, Strava에 «연결» 금지). 홈 카드·설정의 «동기화 권한이 해제됐을 수 있어요»는 채원 확정 문구이자 UX 라이팅 가이드 §4 Error 401 예시와 같아 그대로 두었다(시험이 이 구절만 허용).
- `StravaStatusCard.tsx`와 쓰이지 않게 된 문구 키(`stravaConnectPrompt`·`stravaConnectButton`·`stravaConnectedTitle`·`stravaNoSyncYet`), `commonLiteralColors.test.ts`의 허용 줄을 지웠다. `stravaNotConnectedTitle`은 `/api/strava/disconnect`의 404 본문이 쓰고 있어 남겼다. 티켓 20261016_1503(`StravaStatusCard` 삭제 여부)은 이 삭제로 같은 대상이 정리됐다.
- 시험 환경에 jsdom이 없어 클릭 동작은 훅 없는 겉모습 컴포넌트의 엘리먼트 트리와 순수 로직(`disconnect-client.ts`)로 고정했다. 브라우저 실렌더(홈 카드 360px, 상단 메뉴 라벨 겹침, 시트 4문장 스크롤)는 staging 병합 후 오케스트레이터 확인이 필요하다.

### 잔여 이슈
- 브라우저 실렌더 확인(staging 병합 뒤): 홈 끊김 카드 줄바꿈(360px), 상단 메뉴 «다시 동기화» 겹침, 중복 안내 시트 4문장이 compact 75vh 안에 들어가는지
- 끊기 확인 시트의 두 버튼 `px-3!`: 360px에서 «동기화 끊는 중» 라벨이 한 줄에 들어가도록 좁혔다. 실렌더로 확인 필요
-
