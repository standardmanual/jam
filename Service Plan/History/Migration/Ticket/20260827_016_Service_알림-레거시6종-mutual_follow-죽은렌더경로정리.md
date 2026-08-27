---
id: 20260827_016
category: Service
status: OPEN
created: 2026-08-27
closed:
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
| 2 | 014 코드 프로덕션 승격 (`/jam-ship`) | ❌ **미완** — `origin/main`은 d00db1ce, 014 미포함 |
| 3 | `seed_20260827_notifications_reset.sql` 실행 (알림 전량 삭제) | ❌ **미완** |
| 4 | `/api/cron/notifications` 1회 수동 실행 (소식 재생성) | ❌ **미완** |

**2026-08-27 실측 — 대상 타입 행이 아직 남아 있다:**

```
item_badge_earned      9
checkin_badge_earned   5
mutual_follow          1
activity_recap         0   ← 아직 새 형식 소식이 하나도 없다
```

착수 직전 아래로 **전부 0인지 반드시 재확인**한다:

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

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
