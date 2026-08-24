# JAM! 알림(소식) — 데이터 모델

> 최초 작성: 2026-08-24 / 티켓 [20260824_018](../../../History/Migration/Ticket/20260824_018_Feature_알림소식-PRD수립.md)
> 기능 정의는 [PRD.md](./PRD.md) 참고. 전체 데이터 모델은 [../02_DATA_MODEL.md](../02_DATA_MODEL.md).

---

## 1. 전체 구조

```
[알림]  users ─1:N─ notifications
                      ├── actor_user_id ──> users   (아바타 탭 대상)
                      └── payload JSONB            (문구 슬롯 + 착지점 계산 재료)

        users.notifications_seen_at  ← 읽음 지점 (유저당 타임스탬프 1개)
```

`user_activity_feed`와는 **별도 테이블**이다. 겹치는 이벤트가 있지만 성격이 다르다.

| | `user_activity_feed` | `notifications` |
|---|---|---|
| 의미 | 내가 **한 일**의 기록 | 나에게 **온 소식** |
| 노출 위치 | 프로필 (본인·타인 모두) | 알림함 (본인만) |
| 남의 행동 포함 | ❌ | ✅ (팔로우, 픽업됨, 팔로잉 활동) |
| 시스템 판정 포함 | ❌ | ✅ (마감 임박, 동기화 지연) |

---

## 2. `notifications`

```sql
CREATE TYPE notification_type AS ENUM (
  -- ① 보상 획득
  'badge_earned', 'rare_badge_earned', 'item_badge_earned', 'poi_badge_earned',
  'points_earned', 'first_badge',
  -- ② 컬렉션
  'collection_slottable', 'collection_near_complete', 'collection_completable',
  -- ③ 내 드랍
  'drop_picked_up', 'drop_spot_active',
  -- ④ 미션
  'mission_milestone', 'mission_deadline', 'mission_completed',
  'mission_rank_up', 'mission_ended',
  -- ⑤ 소셜(나에게)
  'followed', 'mutual_follow',
  -- ⑥ 소셜(팔로잉 활동)
  'following_rare_badge', 'following_collection_complete',
  'following_mission_complete', 'following_nearby_drop',
  -- ⑦ 발견
  'nearby_drops',
  -- ⑧ 계정·시스템
  'strava_disconnected', 'sync_stalled', 'inventory_full',
  'admin_points_changed', 'announcement'
);

CREATE TABLE public.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type          notification_type NOT NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_count   INT  NOT NULL DEFAULT 1,
  group_key     TEXT,
  payload       JSONB NOT NULL DEFAULT '{}',
  bumps_badge   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 컬럼 설명

| 필드 | 설명 |
|---|---|
| `user_id` | **받는 사람.** 행위자가 아니다 |
| `type` | 28종 ENUM. 문구 템플릿과 착지점 계산의 분기 키 |
| `actor_user_id` | 아바타 탭 대상. 팔로우·픽업됨·팔로잉 활동에만 존재, 나머지는 NULL |
| `actor_count` | 묶음 인원 — "**예린**님 외 **3명**"의 N. 기본 1 |
| `group_key` | 묶음 병합 키. NULL이면 묶지 않는 소식 (§4 참고) |
| `payload` | 문구 슬롯(배지명·미션명·수량 등) + 착지점 계산에 필요한 ID |
| `bumps_badge` | dot을 켜는가. **①보상 획득만 FALSE** (§5 참고) |
| `updated_at` | **정렬·dot 판정의 기준.** `created_at`이 아니다 (§4 참고) |

### 인덱스

```sql
-- 묶음 병합: 같은 유저·같은 group_key는 한 행만 존재
CREATE UNIQUE INDEX notifications_group_uniq
  ON public.notifications (user_id, group_key)
  WHERE group_key IS NOT NULL;

-- 알림함 조회: 유저별 최신순
CREATE INDEX notifications_user_updated_idx
  ON public.notifications (user_id, updated_at DESC);
```

### RLS

본인 소식만 읽을 수 있다. 쓰기는 `service_role`(T1 인라인·T2 배치·어드민)만 수행하므로
INSERT/UPDATE 정책을 열지 않는다.

```sql
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
```

---

## 3. 읽음 모델 — 타임스탬프 1개

```sql
ALTER TABLE public.users
  ADD COLUMN notifications_seen_at TIMESTAMPTZ;
```

**개별 알림의 `read` 플래그를 두지 않는다.** 알림함 진입 시 전체 읽음 처리하기로 확정했으므로
유저당 "어디까지 봤나" 한 점만 알면 충분하다.

| 동작 | 쿼리 |
|---|---|
| 읽음 처리 | `UPDATE users SET notifications_seen_at = NOW() WHERE id = ?` |
| dot 판정 | 아래 참고 |

```sql
SELECT EXISTS (
  SELECT 1 FROM notifications n
  WHERE n.user_id = $1
    AND n.bumps_badge
    AND n.updated_at > COALESCE(
      (SELECT notifications_seen_at FROM users WHERE id = $1),
      '-infinity'::timestamptz
    )
);
```

소식이 수만 건 쌓여도 읽음 처리 UPDATE는 **항상 1행**이다. 개별 읽음을 관리했다면 알림마다
UPDATE가 필요하고 "어디까지 읽었나" 동기화 문제도 따라온다.

`notifications_seen_at`이 NULL인 신규 유저는 모든 소식이 안 읽음으로 계산된다 —
`COALESCE`의 `-infinity`가 그 처리다.

### "새 소식" 구분선

진입 시 전체 읽음 처리하면 유저는 뭐가 새 거였는지 알 수 없다. 그래서 **진입 직전의
`seen_at` 값을 서버에서 스냅샷해 응답에 함께 실어 보내고**, 클라이언트가 그 값으로 구분선을
그린다. 읽음 처리는 이미 끝났으므로 새로고침하면 구분선이 사라진다.

---

## 4. 묶음(Aggregation) 모델

### 병합 규칙

새 이벤트가 기존 묶음에 붙으면 **새 행을 만들지 않고 기존 행을 갱신**한다. 인스타그램이
"좋아요가 계속 붙어도 알림 개수는 안 늘고 카운트만 올라가는" 방식과 동일하다.

```sql
INSERT INTO notifications (user_id, type, actor_user_id, group_key, payload, bumps_badge)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (user_id, group_key) WHERE group_key IS NOT NULL
DO UPDATE SET
  actor_count = notifications.actor_count + 1,
  actor_user_id = EXCLUDED.actor_user_id,   -- 가장 최근 행위자를 대표로
  payload = notifications.payload || EXCLUDED.payload,
  updated_at = NOW();
```

**정렬과 dot 판정을 `updated_at` 기준으로 하는 이유가 여기 있다.** 묶음이 갱신되면 리스트
위로 올라와야 하고, 이미 읽은 묶음에 새 이벤트가 붙으면 다시 안 읽음이 되어야 한다.
`created_at` 기준이면 둘 다 안 된다.

### `group_key` 설계

| 소식 | `group_key` | 시간창 |
|---|---|---|
| 1·3·4 배지·아이템 획득 | `sync:{strava_activity_id}` | 동기화 1회 (인스타의 "게시물 A"에 해당) |
| 5 포인트 적립 | `points:{YYYY-MM-DD}` | 하루 |
| 13 픽업됨 | `pickup:{YYYY-MM-DD-HH6}` | 6시간 |
| 26 팔로우 | `follow:{YYYY-MM-DD}` | 24시간 |
| 31 팔로잉 미션 완료 | `following_mission:{mission_id}:{YYYY-MM-DD}` | 24시간 |
| 9 컬렉션 장착 가능 | `slottable:{item_book_id}` | 상시 (컬렉션 단위) |
| 32·34 지역 드랍 | `drops:{YYYY-MM-DD}` | 하루 |
| **묶지 않는 소식** | **NULL** | — |

`group_key`가 NULL인 소식(2·7·10·11·18·20~24·27·29·30·40~45)은 UNIQUE 인덱스의 부분 조건
(`WHERE group_key IS NOT NULL`)에서 제외되므로 항상 새 행으로 쌓인다.

### 3계층 압축 정책

| 계층 | 대상 | 규칙 |
|---|---|---|
| **L1 압축 금지** | ⑧ 계정·시스템, 11 컬렉션 완성 가능, 22 미션 완료, 44 포인트 차감 | 항상 개별 (인스타의 멘션·DM·보안에 해당) |
| **L2 조건부 묶음** | 26 팔로우, 13 픽업됨, ④ 미션류, 9·10 컬렉션 | 2건까지 이름 나열 → 3건+ "○○님 외 N명" |
| **L3 적극 압축** | ① 획득류, 5 포인트, ⑥ 팔로잉 활동, 34 주변 드랍 | 항상 묶음 (인스타의 '좋아요'에 해당) |

---

## 5. `bumps_badge` — dot 제외 플래그

Strava 동기화는 webhook이 없어 100% 수동이다. 유저가 버튼을 눌러 `BadgeRevealOverlay`로 배지를
확인한 직후 dot이 켜지면, 눌러봐야 방금 본 그 배지들이다. 매번 반복되면 dot이 "새 소식"이
아니라 "동기화했음"의 동의어가 되어 신호가 죽는다.

| 카테고리 | `bumps_badge` | 근거 |
|---|---|---|
| ① 보상 획득 (1·2·3·4·5·7) | **FALSE** | 유저가 동기화 화면에서 이미 봤다 |
| ②~⑧ 나머지 22종 | TRUE | 내가 모르는 사이에 일어난 일 |

**리스트에는 최신순으로 그대로 남는다.** 히스토리로서의 가치("그때 뭐 받았더라", 오버레이
상한 10건 초과분 재확인)는 100% 유지되고, dot만 켜지 않는다.

---

## 6. `payload` 스키마

문구 슬롯과 착지점 계산에 필요한 값을 담는다. **착지점(`target_href`)은 저장하지 않는다** —
라우트가 바뀌면 과거 소식이 전부 깨지므로 `type` + `payload`로 렌더 시점에 계산한다.

| type | payload 예시 |
|---|---|
| `badge_earned` | `{ badge_ids: [...], count: 3, activity_id }` |
| `rare_badge_earned` | `{ badge_id, badge_name, rarity }` |
| `item_badge_earned` | `{ inventory_item_ids: [...], count: 2 }` |
| `poi_badge_earned` | `{ badge_id, poi_name }` |
| `points_earned` | `{ amount: 250, reason }` |
| `collection_completable` | `{ item_book_id, book_name }` |
| `drop_picked_up` | `{ badge_id, badge_name, poi_id }` |
| `mission_milestone` | `{ mission_id, mission_title, current, target, unit }` |
| `mission_completed` | `{ mission_id, mission_title, reward_badge_count, reward_points }` |
| `mission_rank_up` | `{ mission_id, mission_title, rank }` |
| `followed` | `{}` (actor_user_id·actor_count로 충분) |
| `nearby_drops` | `{ count: 5, region }` |
| `sync_stalled` | `{ days: 3 }` |
| `admin_points_changed` | `{ amount, direction: 'grant'\|'deduct', reason }` |
| `announcement` | `{ today_card_id, title }` |

닉네임은 `payload`에 **박제하지 않는다.** `actor_user_id`와 `user_id`로 조인해 렌더 시점에
읽는다 — 유저가 닉네임을 바꾸면 과거 소식도 따라와야 한다.

---

## 7. 왜 이 구조인가

**읽음을 타임스탬프 1개로**
알림함 진입 시 전체 읽음이라는 UX 결정이 데이터 모델을 통째로 줄였다. 개별 `read` 플래그,
읽음 처리 배치, 동기화 문제가 전부 사라진다. 인스타그램·트위터도 이 방식이다.

**`updated_at` 기준 정렬**
묶음 갱신이 리스트 순서와 dot 판정에 즉시 반영되어야 한다. 인스타의 "카운트만 갱신" 규칙이
이 인덱스 하나로 구현된다.

**착지점을 저장하지 않음**
`target_href`를 컬럼으로 두면 라우트 리팩터링이 과거 데이터를 깨뜨린다. `type`은 안정적이고
라우트는 변한다 — 변하는 쪽을 코드에 둔다.

**`user_activity_feed`와 분리**
"내가 한 일"과 "나에게 온 소식"은 노출 위치·공개 범위·포함 이벤트가 모두 다르다. ①이 거의
중복이지만 저장 비용이 미미하고, 통합 히스토리라는 UX가 그 값을 한다.

**닉네임 비박제**
`payload`에 닉네임을 넣으면 유저가 닉네임을 바꿔도 과거 소식은 옛 이름으로 남는다.

---

## 8. [NEEDS CLARIFICATION]

- [ ] **소식 보관 정책** — 현재 무제한. 유저당 수만 건 시점에 커서 페이지네이션만으로 충분한지
      실측 후 재검토. 파티셔닝이나 보관 기간 도입 여부.
- [ ] **`actor_user_id` 대표값 선정** — 묶음에서 "가장 최근 행위자"를 쓰기로 했으나, 인스타는
      친밀도 상위를 앞세운다. 친밀도 지표가 생기면 재검토.
- [ ] **`group_key`의 시간창을 UTC로 계산할지 KST로 할지** — `points:{YYYY-MM-DD}` 같은 일
      단위 키가 UTC 기준이면 KST 09:00에 날짜가 바뀐다. 티켓 20260824_006에서 `event_at`을
      로컬 벽시계로 오해석한 전례가 있으므로 **KST 기준으로 계산**하는 것을 권장.
