---
id: 20260827_016
category: Service
status: CLOSED
created: 2026-08-27
closed: 2026-08-27
---

# [Service] 알림 레거시 6종 + mutual_follow 죽은 렌더 경로 정리

## 배경 / 문제 정의

티켓 20260827_014(알림 소식 전면 개편)에서 ① 보상 획득 6종(`badge_earned`·
`rare_badge_earned`·`item_badge_earned`·`checkin_badge_earned`·`points_earned`·
`first_badge`)이 활동 결산(`activity_recap`) 1종으로 재편됐고, #27 맞팔(`mutual_follow`)은
`followed`로 대체됐다.

**어떤 코드도 이 타입을 더 이상 생성하지 않는다.** 그럼에도 렌더 경로를 남겨 둔 이유는
코드 배포와 알림 전량 삭제(`seed_20260827_notifications_reset.sql`) 사이의 구간 때문이다.
그 구간에 렌더러를 먼저 지우면 과거 행이 `default` 분기로 떨어져
「새로운 소식이 도착했어요」라는 무의미한 문구로 보인다.

전량 삭제가 끝나면 이 경로들은 **도달 불가능한 죽은 코드**가 된다. 남겨 두면 26종 문구
계약을 읽는 사람이 32종으로 오인하고, 결산 스펙(RECAP_CASEBOOK)과 레거시 문구가
나란히 있어 어느 쪽이 현행인지 판단이 필요해진다.

### 착수 전제조건 (충족 전 구현 금지)

| # | 조건 | 2026-08-27 현재 |
|---|---|---|
| 1 | 마이그레이션 105(`activity_recap` ENUM) 적용 | ✅ 완료 (prod ENUM에 존재 확인) |
| 2 | 014 코드 프로덕션 승격 (`/jam-ship`) | ✅ 완료 — `origin/main` = c0b3498f |
| 3 | `seed_20260827_notifications_reset.sql` 실행 (알림 전량 삭제) | ✅ 완료 — `notifications` 0행 |
| 4 | `/api/cron/notifications` 1회 수동 실행 (소식 재생성) | ✅ 완료 |

**삭제 전 분포 (총 37행) — 기록용:**

```
item_badge_earned      9
checkin_badge_earned   5
mutual_follow          1
...                        (총 37행, 전량 삭제됨)
```

전제조건은 오케스트레이터가 2026-08-27에 직접 확인·실행했다. 재확인용 SQL:

```sql
SELECT type, count(*) FROM public.notifications GROUP BY type ORDER BY 2 DESC;
```

## 상세 요구사항

### 서비스/코드베이스 관점

**A. 절대 지우면 안 되는 것**

| 대상 | 이유 |
|---|---|
| `ko.ts` `msgRareBadgeEarned` | ⑥ #29 팔로잉 희귀 배지가 재사용한다 (`message.ts:673`에서 `msgFollowingActorPrefix`와 합성) |
| `ko.ts` `slotBadgeCount`·`slotItemBadgeCount`·`slotPlaceMore`·`slotFirstBadge` | 결산 빌더(`buildRecapMessage`)가 전부 쓴다 |
| DB `notification_type` ENUM 값 | Postgres는 ENUM 값 제거를 안전하게 지원하지 않는다. DATA_MODEL §2 「예약됐으나 사용하지 않는 값」 표기를 유지·보강한다 |
| `ActivityFeedEventType`의 `'badge_earned'` | **이름만 같고 축이 다르다.** 활동 피드(`user_activity_feed`) 이벤트 타입이며 현행이다. `FeedSection.tsx`·`ProfileClient.tsx`·`[username]/page.tsx`·`badge-engine/index.ts`·`strava/sync.ts`·`activity-feed/*`의 `badge_earned`는 **전부 유지** |

**B. 제거 대상**

| 파일 | 위치 | 내용 |
|---|---|---|
| `src/types/database.ts` | `NotificationType` 유니온 | 레거시 6종 멤버 제거. `mutual_follow`는 이미 제거돼 있음. 상단 주석의 「예약됐으나 사용하지 않는 값」 목록에 6종을 합류시킨다 |
| `src/lib/notifications/types.ts` | `NON_BUMPING_NOTIFICATION_TYPES` | 레거시 6종 제거 → `activity_recap` 단일 원소로 축소. 주석의 「레거시 6종도 남겨 둔다」 근거 문단 갱신 |
| `src/lib/notifications/types.ts` | `NotificationPayloadMap` | 레거시 6종 payload 인터페이스 6개 제거 |
| `src/lib/notifications/message.ts` | `buildNotificationMessage` | `case 'badge_earned'`~`'first_badge'` 6개 분기 제거. `rare_badge_earned` 분기의 **주석(슬롯=볼드 규칙)** 은 #29 쪽으로 옮길지 검토 |
| `src/lib/notifications/href.ts` | `notificationHref` | 동일 6개 분기 제거 |
| `src/app/(main)/notifications/NotificationsClient.tsx` | `TypeIcon` | 6종 `case` 라벨 제거. **`activity_recap`·`following_rare_badge`→`MedalIcon`, `inventory_full`→`PackageIcon`, `admin_points_changed`→`CoinIcon` 매핑이 살아남아야 한다** (fall-through 라벨을 지우다 함께 날리기 쉬운 지점) |
| `src/lib/i18n/ko.ts` | 「레거시 6종」 블록 | `msgBadgeEarned`·`msgItemBadgeEarned`·`msgCheckinBadgeEarned`·`msgCheckinBadgeRepeated`·`msgPointsEarned`·`msgFirstBadge` 제거. `msgRareBadgeEarned`는 남기고 ⑥ 블록으로 이동하거나 「#29 전용」 주석으로 재분류 |
| `src/lib/notifications/__tests__/` | `message-href.test.ts`·`create-notification.test.ts`·`feed-cursor.test.ts`·`kst-group-key.test.ts` | 레거시 타입을 픽스처로 쓰는 케이스를 현행 타입으로 교체 (삭제가 아니라 **교체** — 커버리지를 줄이지 않는다) |

**C. 검증**

- 타입 축소가 `default` 분기 도달을 늘리지 않는지: 살아 있는 타입 전수에 대해
  `buildNotificationMessage`·`notificationHref`·`TypeIcon`이 여전히 명시 분기를 갖는지 확인
- `npm run lint` · `npm run typecheck` · `npm test` 통과
- `grep -rE "'(badge_earned|rare_badge_earned|item_badge_earned|checkin_badge_earned|points_earned|first_badge|mutual_follow)'" src/`
  잔여가 **활동 피드 축의 `badge_earned`뿐**인지 확인

### UI/UX 관점

사용자 노출 변화 없음(도달 불가능 경로 제거). 신규 문구도 없다.

### 컨텐츠 관점

해당 없음. 단 `Specs/PRD/Notification/DATA_MODEL.md` §2의 「예약됐으나 사용하지 않는 값」
목록에 레거시 6종을 추가하고, PRD §3 문구 표에서 6종 행을 정리한다.

## 구현 계획

1. 착수 직전 DB 재확인(위 SQL) — 6종 + `mutual_follow` 행이 전부 0
2. `database.ts` → `types.ts` → `message.ts`/`href.ts` → `NotificationsClient.tsx` → `ko.ts` 순
   (타입부터 좁히면 컴파일러가 남은 사용처를 전부 짚어준다)
3. 테스트 픽스처 교체
4. 문서(PRD·DATA_MODEL) 정합

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

레거시 6종(`badge_earned`·`rare_badge_earned`·`item_badge_earned`·`checkin_badge_earned`·
`points_earned`·`first_badge`)의 **도달 불가능한 렌더 경로를 전면 제거**했다. `mutual_follow`는
014에서 이미 TS 타입에서 빠져 있어 추가 코드 변경이 없었다(문서 표기만 정리).

- `NotificationType` 유니온: 26종 → **20종**. 제거한 6종은 상단 주석의 「예약됐으나 사용하지 않는 값」
  목록에 합류시켰다 (DB ENUM 값은 그대로 둔다 — Postgres가 값 제거를 안전하게 지원하지 않는다).
- `NON_BUMPING_NOTIFICATION_TYPES`: 7원소 → `activity_recap` 1원소.
- `NotificationPayloadMap`: 레거시 payload 인터페이스 6개 제거.
- `buildNotificationMessage`·`notificationTarget`·`TypeIcon`: 각각 6개 분기 제거.
  `activity_recap`·`following_rare_badge`→`MedalIcon`, `inventory_full`→`PackageIcon`,
  `admin_points_changed`→`CoinIcon`, `drop_spot_active`→`PinIcon` 매핑은 전부 보존했다.
- `ko.ts`: 레거시 문구 6개 제거. **`msgRareBadgeEarned`는 남기고 ⑥ 블록으로 이동**해 「#29 전용」으로
  재분류했다 (`message.ts:673`에서 `msgFollowingActorPrefix`와 합성해 재사용한다).
- 테스트: 레거시 픽스처를 **삭제가 아니라 현행 타입(`activity_recap` 등)으로 교체**했다.
  「등급 라벨도 payload 슬롯이므로 볼드」(§5) 단언은 같은 템플릿을 쓰는 #29 쪽으로 옮겼다.
- 문서: DATA_MODEL §2의 「예약됐으나 사용하지 않는 값」을 **9값 표**로 재구성, PRD §3 종수 표기를
  21종 → **20종**으로 정정(카테고리 합계가 20인데 헤더만 21이었다 — 014의 계산 누락).

### 변경된 파일
```
jam-web/src/types/database.ts
jam-web/src/lib/notifications/types.ts
jam-web/src/lib/notifications/message.ts
jam-web/src/lib/notifications/href.ts
jam-web/src/app/(main)/notifications/NotificationsClient.tsx
jam-web/src/lib/i18n/ko.ts
jam-web/src/lib/notifications/__tests__/message-href.test.ts
jam-web/src/lib/notifications/__tests__/create-notification.test.ts
jam-web/src/lib/notifications/__tests__/kst-group-key.test.ts
jam-web/src/lib/notifications/__tests__/feed-cursor.test.ts
Service Plan/Specs/PRD/Notification/DATA_MODEL.md
Service Plan/Specs/PRD/Notification/PRD.md
Service Plan/Specs/PRD/Notification/REST_CASEBOOK.md      (머지 시 추가 — 시점 표기)
Service Plan/Specs/PRD/Notification/RECAP_CASEBOOK.md     (머지 시 추가 — 시점 표기)
```

### 테스트 결과
- [x] `tsc --noEmit` 통과 (0 에러)
- [x] `eslint` — 변경 파일 전부 무경고
- [x] `vitest` 유닛 393 케이스 전원 통과 (알림 모듈 7파일 164 케이스 포함)
- [x] `npm run test:node` 통과 (실데이터 대조 48/48)
- [x] **default 도달이 늘지 않음** — 살아 있는 20종 전수가 `buildNotificationMessage`·
      `notificationTarget`·`TypeIcon` 세 곳 모두에서 명시 `case` 분기를 가짐(스크립트로 대조, 누락 0)
- [x] 최종 grep 잔여가 **활동 피드 축의 `badge_earned`뿐**임을 확인
      (`FeedSection`·`ProfileClient`·`[username]/page`·`badge-engine`·`strava/sync`·`activity-feed/*`)

### 배포 정보
- 배포일: 2026-08-27 (staging 반영)
- 환경: **staging** — 프로덕션 승격은 `/jam-ship`으로 별도 진행
- 커밋: `494b4ac0` (구현) / `5cb7c947` (staging 병합)

**선행 조치 — 오케스트레이터가 직접 실행 (2026-08-27)**
1. 014 프로덕션 승격: `origin/main` `d00db1ce` → `c0b3498f`, 배포 `jam-noe6pdncx` Ready,
   alias `j-a-m.app` 연결 확인
2. `seed_20260827_notifications_reset.sql` 실행 — `notifications` **37행 → 0행**
   (삭제 전 분포: `collection_slottable` 10 / `item_badge_earned` 9 / `checkin_badge_earned` 5 /
   `mission_milestone` 4 / `mission_completed` 2 / `followed` 2 / `following_mission_complete` 2 /
   `drop_picked_up` 1 / `mutual_follow` 1 / `sync_stalled` 1).
   `users.notifications_seen_at` 설정 유저 수는 3 → 3으로 불변(설계대로)
3. 이 시점부터 레거시 타입 행이 0이고 프로덕션 코드가 해당 타입을 생성하지 않아
   렌더 경로가 도달 불가능해졌다 — 정리 착수 조건 충족

### 주요 의사결정 / 핵심 메모

- **`msgRareBadgeEarned`는 지우지 않았다.** ⑥ #29가 재사용하는 살아 있는 문구다. ① 레거시 블록에서
  ⑥ 블록으로 물리적으로 옮기고 「#29 전용」 주석을 달아, 다음 사람이 "레거시니까 지워도 되겠지"로
  오독할 여지를 없앴다.
- **`ActivityFeedEventType`의 `'badge_earned'`는 손대지 않았다.** 이름만 같고 축이 다른 활동 피드
  이벤트 타입이며 현행이다. `database.ts`의 `NotificationType` 주석에 **혼동 금지 문구를 명시**해
  일괄 grep 치환 사고를 예방했다.
- **DB ENUM 값은 그대로 둔다.** SQL 마이그레이션 파일 없음. DATA_MODEL §2의 「예약됐으나 사용하지
  않는 값」을 값·시점·사유 3열 표로 재구성해 9값을 한눈에 보이게 했다.
- **PRD 헤더의 「21종」은 오기였다.** 카테고리 합계(① 1 + ② 3 + ③ 2 + ④ 5 + ⑤ 1 + ⑥ 3 + ⑧ 5)가
  20인데 헤더만 21이었다 — 014에서 6종→1종(−5)은 반영하고 `mutual_follow` 제거(−1)를 빠뜨린 결과다.
  20종으로 정정하고 코드 주석의 「26종」 표기 6곳도 함께 맞췄다.

### 잔여 이슈
- `syncGroupKey()`(`src/lib/notifications/groupKey.ts`)는 014 이후 **프로덕션 호출부가 없다**
  (`dailyGroupKey`만 쓰인다). 이번 티켓 범위가 아니라 제거하지 않았고 테스트 픽스처만 현행 타입으로
  교체했다. 별도 티켓에서 존치/제거 판단 필요.
- **`/api/cron/notifications` 배치 1회 수동 실행이 미완이다.** 전량 삭제 직후 T2 상태 기반
  소식을 되살리는 절차인데, `CRON_SECRET`이 `.env.local`에 없고 Vercel 환경변수에만 있어
  이 세션에서 호출하지 못했다. Vercel 대시보드의 Cron Jobs에서 수동 실행하거나 정규 스케줄
  (09:00 UTC = 18:00 KST)을 기다리면 해소된다. **016 코드 정리의 전제조건은 아니다** —
  결산(`activity_recap`)은 배치가 아니라 Strava 동기화 경로에서 생성된다.
- **`default` 분기에 컴파일 타임 안전망이 없다.** 이번엔 "20종 전수가 세 렌더러에 명시 case를
  가진다"를 1회성 스크립트로 확인했지만, 다음에 종류가 추가될 때 이 대조가 반복된다는 보장이
  없다. `default`를 `never` 인자 헬퍼로 감싸면 런타임 fallback(「새로운 소식이 도착했어요」)을
  유지하면서 타입 누락만 컴파일 에러로 잡힌다. 개선 리뷰 제안 — 별도 티켓 후보.
- **`database.generated.ts`(Supabase 자동 생성)는 ENUM 29값을 그대로 나열한다.** 수기
  `database.ts`의 20종과 갈라진 상태다. ENUM 존치 결정상 정상이나, 다음 `npm run db:types`
  재생성 때 두 파일을 혼동할 여지가 있다.
- **전체 `npm run lint`가 이미 레드다** — 183건 전부 `design-system/`·`dotmatrix-hooks`의 기존
  `set-state-in-effect` 부채다. 이번 변경과 무관하지만 신규 위반이 묻히는 상태다.
- **`/jam-ship` 스킬 문서의 빌드 스크립트 서술이 사실과 다르다** — 「main/프로덕션 빌드는
  `next build`만 실행」이라 적혀 있으나 main·staging 모두 동일한 `build` 스크립트(Storybook 포함)를
  쓴다. 이번 승격 직전 staging 빌드가 Storybook 정적 복사 단계의 `EEXIST` 플레이크로 Error가
  났고(재배포로 통과), 같은 플레이크가 프로덕션 배포도 때릴 수 있다.
