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
  'badge_earned', 'rare_badge_earned', 'item_badge_earned', 'checkin_badge_earned',
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
  'following_mission_complete', 'following_nearby_drop',  -- ⚠️ 예약됐으나 사용하지 않음
  -- ⑦ 발견 (카테고리 폐지)
  'nearby_drops',                                          -- ⚠️ 예약됐으나 사용하지 않음
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

> **⚠️ `following_nearby_drop`·`nearby_drops`는 예약됐으나 사용하지 않는 값이다** (2026-08-25 /
> 티켓 20260825_002). 지역 기반 소식 2종을 스펙에서 제거했고 ⑦ 발견 카테고리는 #34가 유일해
> 카테고리째 사라졌다(제거 사유는 [PRD.md](./PRD.md) §7). **실제로 쓰는 종류는 26종**이다.
>
> **DDL로 지우지 않는다.** Postgres에는 `ALTER TYPE … DROP VALUE`가 없고, 타입을 새로 만들어
> 갈아끼우는 우회는 컬럼·인덱스·RLS를 전부 재생성해야 하는 위험한 작업이다. 해당 타입 소식은
> 프로덕션에 **0건**이고 어떤 코드도 생성하지 않으므로 남겨두어도 무해하다.
>
> TS 쪽(`src/types/database.ts`의 `NotificationType`)에서는 26종만 노출해 컴파일러가 재사용을
> 막는다. 만에 하나 이 타입의 행이 존재하면 렌더러의 `default` 분기가 받는다.

### 컬럼 설명

| 필드 | 설명 |
|---|---|
| `user_id` | **받는 사람.** 행위자가 아니다 |
| `type` | ENUM 28값 중 **실사용 26종**. 문구 템플릿과 착지점 계산의 분기 키 (나머지 2값은 위의 예약 표시 참고) |
| `actor_user_id` | 아바타 탭 대상. 팔로우·픽업됨·팔로잉 활동에만 존재, 나머지는 NULL |
| `actor_count` | 묶음 **고유 인원** — "**예린**님 외 **3명**"의 N. 기본 1. 병합 횟수가 아니라 `payload.actor_ids`의 고유 개수와 일치해야 한다 (§4-1) |
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

## 2-1. `poi_views` — #18 전용 계측 (신규)

#18("내 드랍 지점 활성")의 "다녀갔다"는 **누군가 그 POI를 열어서 확인한 것**으로 확정됐다
(2026-08-24). 픽업 여부와 무관하다.

현재 POI 열람을 기록하는 코드가 **전혀 없다.** `PoiCarouselModal`이 `DropsClient`에서 열리지만
어떤 카운터도 증가하지 않는다. 그래서 테이블과 계측을 신설한다.

```sql
CREATE TABLE public.poi_views (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poi_id     UUID NOT NULL REFERENCES public.poi(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_on  DATE NOT NULL,   -- KST 기준 날짜
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 같은 유저가 같은 POI를 하루에 여러 번 열어도 1행만 — 볼륨 억제 + 고유 인원 집계
CREATE UNIQUE INDEX poi_views_daily_uniq
  ON public.poi_views (poi_id, user_id, viewed_on);

-- 주간 집계 조회
CREATE INDEX poi_views_poi_date_idx
  ON public.poi_views (poi_id, viewed_on DESC);

-- RLS를 켜되 정책은 두지 않는다 = service_role 전용.
-- RLS를 켜지 않으면 anon 키로 전체 조회·수정이 가능하다(티켓 074 실제 인시던트).
-- engine_decision_log와 같은 방식.
ALTER TABLE public.poi_views ENABLE ROW LEVEL SECURITY;
```

| 필드 | 설명 |
|---|---|
| `viewed_on` | **KST 기준 날짜.** UTC로 두면 KST 09:00에 날짜가 바뀌어 하루 중복 억제가 어긋난다 |
| `viewed_at` | 실제 열람 시각 (분석용) |

### 볼륨 억제

`(poi_id, user_id, viewed_on)` UNIQUE로 **하루 1회만 기록**한다. 기록은 `ON CONFLICT DO NOTHING`
UPSERT라 중복 열람은 조용히 무시된다.

### 집계

주간 배치가 **내 드랍이 활성 상태인 POI**를 대상으로 지난 7일간 고유 열람 인원을 센다.
본인의 열람은 제외한다 — 내가 내 드랍을 확인한 걸 "다녀갔다"고 세면 안 된다.

```sql
SELECT poi_id, count(DISTINCT user_id) AS visitors
  FROM poi_views
 WHERE poi_id = ANY($1)              -- 내 활성 드랍이 있는 POI
   AND viewed_on >= $2               -- KST 기준 7일 전
   AND user_id <> $3                 -- 본인 제외
 GROUP BY poi_id;
```

### 범위 분할

| 티켓 | 범위 |
|---|---|
| 019 | 테이블 + 기록 함수 |
| 021 | `PoiCarouselModal` 열림 지점에서 기록 호출 (`POST /api/poi-views`) |
| 025 | 주간 집계 → #18 소식 생성 (배치 티켓 번호 재배정: 022 → 025) |

---

## 2-2. `mission_rank_snapshots` — #23 전용 기준선 (신규, 마이그레이션 099)

소식 #23("순위 상승")은 **"상승 시만"**이 조건이다. 그런데 미션 순위는 어디에도 저장되지 않고
`/api/missions/[id]/status`가 요청마다 계산한다(참가자 진행도 정렬). **직전 순위를 모르면
판정 자체가 불가능하다.**

기존 `notifications` 행에서 직전 순위를 읽는 방법은 성립하지 않는다 — 소식이 있어야 기준선이
생기고 기준선이 있어야 소식이 생기므로 영원히 발화하지 않는다. 그래서 배치가 매 실행마다
현재 순위를 남기고, 다음 실행이 그것과 비교한다.

```sql
CREATE TABLE public.mission_rank_snapshots (
  mission_id  UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rank        INT NOT NULL,     -- 1부터
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mission_id, user_id)
);

CREATE INDEX mission_rank_snapshots_user_idx ON public.mission_rank_snapshots (user_id);

-- RLS를 켜되 정책은 두지 않는다 = service_role 전용 (poi_views·engine_decision_log와 동일)
ALTER TABLE public.mission_rank_snapshots ENABLE ROW LEVEL SECURITY;
```

**첫 배치는 기준선만 남기고 소식을 만들지 않는다.** 오르지도 않은 유저에게 "5위로 올라섰어요"가
나가면 거짓말이다.

순위 정렬 규칙은 `src/lib/missions/ranking.ts`가 단일 진실이다 — 화면과 배치가 같은 비교 함수를
쓰지 않으면 "5위로 올라섰어요"를 누르고 들어간 화면이 6위를 보여준다.

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

### 병합 규칙 — `create_notification()` RPC

새 이벤트가 기존 묶음에 붙으면 **새 행을 만들지 않고 기존 행을 갱신**한다. 인스타그램이
"좋아요가 계속 붙어도 알림 개수는 안 늘고 카운트만 올라가는" 방식과 동일하다.

**PostgREST(`supabase-js`)의 `.upsert()`로는 구현할 수 없다.** `.upsert()`는 "행 전체 교체"만
표현할 수 있어 `actor_count = actor_count + 1` 같은 증분 갱신이나 배열 누적을 만들지 못한다.
그래서 DB 함수를 쓴다.

```sql
create_notification(
  p_user_id       UUID,
  p_type          public.notification_type,
  p_payload       JSONB   DEFAULT '{}',
  p_bumps_badge   BOOLEAN DEFAULT TRUE,
  p_actor_user_id UUID    DEFAULT NULL,
  p_group_key     TEXT    DEFAULT NULL,
  p_mode          TEXT    DEFAULT 'merge',   -- 'merge' | 'once'
  p_sum_keys      TEXT[]  DEFAULT NULL,      -- payload에서 숫자 합산할 키
  p_append_keys   TEXT[]  DEFAULT NULL       -- payload에서 배열 누적(중복 제거)할 키
) RETURNS public.notifications
```

`service_role`만 EXECUTE할 수 있고, `SET search_path = public`을 붙인다(080 `award_points` 선례).

### 3가지 모드

| 모드 | 동작 | 쓰는 곳 |
|---|---|---|
| `merge` (기본) | 충돌 시 `actor_count` 갱신 + payload 병합 + `updated_at = NOW()` | 묶음 소식 전반 |
| `once` | **이미 있으면 아무것도 하지 않는다** (`updated_at`도 안 건드림) | #11·#20·#40 + **T2 배치 11종 전부**(§4-3) |
| — (`group_key` NULL) | 항상 새 행 | 묶지 않는 소식 |

> **`once`가 왜 필요한가.** "구간당 1회"를 `group_key`만으로 막을 수 있다고 착각하기 쉬운데,
> `merge`는 충돌 시 **막는 게 아니라 `updated_at`을 갱신**한다. 그러면 동기화할 때마다 dot이
> 다시 켜져 반복 발송과 같아진다 — PRD §2-4가 금지한 다크패턴이다. `once`는 존재 여부만
> 확인하고 빠진다.

### payload 병합 3방식

| 방식 | 동작 | 예 |
|---|---|---|
| 기본 (얕은 덮어쓰기) | `payload \|\| EXCLUDED.payload` | 최신 값만 남으면 되는 필드 |
| `p_sum_keys` | 숫자 필드를 더한다 | `points_earned.amount` 250 + 300 = 550 |
| `p_append_keys` | 배열을 이어붙이고 **중복 제거** | `followed.actor_ids`, `drop_picked_up.badge_ids` |

---

## 4-1. `actor_count`는 고유 인원이다

PRD §3의 L2 규칙("2명까지 이름 나열 → 3명+ 축약")을 구현하려면 **묶음에 속한 행위자를 2명
이상 알아야 한다.** `actor_user_id` 1개(최신)와 카운터만으로는 만들 수 없다.

그래서 행위자가 있는 묶음 소식은 `p_append_keys`로 **`payload.actor_ids` 배열을 누적**하고,
`actor_count`를 그 배열의 **고유 개수**로 갱신한다.

```
actor_count = jsonb_array_length(payload->'actor_ids')   -- 중복 제거 후
```

**병합 횟수를 세면 안 된다.** 한 사람이 6시간 안에 내 드랍 3건을 픽업하면 병합 횟수는 3이지만
실제 인원은 1명이다. 그대로 세면 "예린님 외 2명"이라는 거짓말이 된다.

| 소식 | `append_keys` | 렌더 |
|---|---|---|
| 13 픽업됨 | `actor_ids`, `badge_ids` | 인원 2명까지 나열, 배지 개수는 `badge_ids` 길이 |
| 26 팔로우 | `actor_ids` | 2명까지 나열 → 3명+ "외 N명" |
| 31 팔로잉 미션 완료 | `actor_ids` | 동일 |

행위자가 없는 묶음 소식(1·3·4·5·34 등)은 `actor_ids`가 없고 `actor_count`도 쓰지 않는다 —
개수는 `payload`의 해당 배열 길이나 `sum_keys` 합산값으로 렌더한다.

---

## 4-2. `group_key` 설계

모든 키는 **`{type}:{scope}`** 형태다. UNIQUE 인덱스가 `(user_id, group_key)`뿐이라
**type이 키에 들어있지 않기 때문**이다. type을 빼면 소식 1·3·4처럼 같은 동기화를 scope로 쓰는
종류들이 한 행으로 병합돼 payload가 서로를 덮어쓰고 착지점이 통째로 어긋난다.

| 소식 | `group_key` | 시간창 |
|---|---|---|
| 1·3·4 배지·아이템·POI 획득 | `{type}:sync:{strava_activity_id}` | 동기화 1회 (인스타의 "게시물 A"에 해당) |
| 5 포인트 적립 | `points_earned:{YYYY-MM-DD}` | 하루 |
| 13 픽업됨 | `drop_picked_up:{YYYY-MM-DD-H{0..3}}` | 6시간 |
| 26 팔로우 | `followed:{YYYY-MM-DD}` | 24시간 |
| 11 컬렉션 완성 가능 | `collection_completable:{item_book_id}` + `once` | 장착 전까지 1회 |
| 20 미션 마일스톤 | `mission_milestone:{mission_id}:{50\|80}` + `once` | 구간당 1회 |
| 40 Strava 끊김 | `strava_disconnected:{YYYY-MM-DD}` + `once` | 하루 1회 (폭주 방지) |
| **T2 배치 11종** | **전부 `group_key` + `once`** — §4-3 | — |
| **묶지 않는 소식** | **NULL** | — |

> **시간창은 전부 KST 기준으로 계산한다**(2026-08-24 확정). UTC로 두면 일 단위 키가 KST 09:00에
> 날짜가 바뀌어, 아침에 받은 포인트와 저녁에 받은 포인트가 다른 묶음이 된다. 티켓 20260824_006에서
> `event_at`을 로컬 벽시계로 오해석한 전례가 있다.
>
> **배치(025)는 시작 시각을 한 번 캡처해 모든 키 빌더에 넘긴다.** 빌더가 `at`을 생략하면
> 각각 `new Date()`를 평가하므로, KST 자정을 걸쳐 도는 배치가 두 날짜 키로 갈릴 수 있다.
> `createBatchContext()`가 `startedAt`을 한 번 만들어 7개 단계 전부에 넘기는 구조로 못박았다.

`group_key`가 NULL인 소식(2·7·22·27·44·45)은 UNIQUE 인덱스의 부분 조건
(`WHERE group_key IS NOT NULL`)에서 제외되므로 항상 새 행으로 쌓인다. **T1 인라인 생성 소식만
NULL을 쓴다** — 아래 §4-3 참고.

### 4-3. T2 배치 소식은 전부 `group_key` + `once`다 (2026-08-25 확정 / 티켓 20260825_002)

**cron은 재시도된다.** `group_key`가 NULL이면 중복 방지 수단이 DB에 전혀 없어, 배치가 매번
SELECT로 존재를 확인해야 하고 그 확인과 INSERT 사이에 재시도가 끼면 중복이 그대로 샌다.
그래서 T2 11종은 예외 없이 키를 갖고 `merge`가 아니라 `once`로 만든다 —
**중복 방지를 코드가 아니라 UNIQUE 인덱스가 한다.**

`merge`를 쓰지 않는 이유도 같다. 배치는 매일 도는데 `merge`는 충돌 시 막는 게 아니라
`updated_at`을 갱신한다. 상태가 유지되는 동안 **매일 dot이 다시 켜져** 반복 발송과 같아진다
(PRD §2-4가 금지한 다크패턴).

| 소식 | `group_key` | 재발화 시점 |
|---|---|---|
| 9 컬렉션 장착 가능 | `collection_slottable:{item_book_id}:{최신 미장착 아이템의 획득 KST일자}` | 그 컬렉션에 넣을 **새 아이템**이 들어왔을 때 |
| 10 완성 임박 | `collection_near_complete:{item_book_id}` | 없음 (컬렉션당 평생 1회) |
| 18 내 드랍 지점 활성 | `drop_spot_active:{poi_id}:{KST주}` | 다음 주 |
| 21 마감 임박 | `mission_deadline:{mission_id}:{YYYY-MM-DD}` | D-2는 하루뿐이라 사실상 미션당 1회 |
| 23 순위 상승 | `mission_rank_up:{mission_id}:{YYYY-MM-DD}` | 다음 날 다시 올랐을 때 |
| 24 종료 결과 | `mission_ended:{mission_id}` | 없음 (미션당 1회) |
| 29 팔로잉 희귀 배지 | `following_rare_badge:{badge_id}:{actor_id}` | 없음 |
| 30 팔로잉 컬렉션 완성 | `following_collection_complete:{item_book_id}:{actor_id}` | 없음 |
| 31 팔로잉 미션 완료 | `following_mission_complete:{mission_id}:{YYYY-MM-DD}` | 다음 날 |
| 41 동기화 지연 | `sync_stalled:{정체 시작 KST일자}` | **다시 동기화한 뒤 또 정체됐을 때** |
| 42 인벤토리 포화 | `inventory_full:{YYYY-MM-DD}` | 7일 뒤 (배치가 최근 발송 이력을 확인) |

> **#9·#41의 키에 날짜가 아니라 "상태의 시작 시점"이 들어간 이유.** 일자 키를 쓰면 상태가
> 유지되는 동안 매일 새 소식이 나간다. 상태가 바뀔 때만 키가 바뀌도록 만들면 `once` 하나로
> "해소될 때까지 침묵"이 구현된다.
>
> **#42만 예외적으로 발송 이력 SELECT를 한다.** 인벤토리에는 "언제부터 꽉 찼는가"를 알 수 있는
> 데이터가 없어 상태 시작 시점을 키에 넣을 수 없다. 대신 일자 키로 재시도 멱등성을 확보하고,
> 최근 7일 내 발송 이력이 있으면 건너뛴다.

### 3계층 압축 정책

| 계층 | 대상 | 규칙 |
|---|---|---|
| **L1 압축 금지** | ⑧ 계정·시스템, 11 컬렉션 완성 가능, 22 미션 완료, 44 포인트 차감 | 항상 개별 (인스타의 멘션·DM·보안에 해당) |
| **L2 조건부 묶음** | 26 팔로우, 13 픽업됨, ④ 미션류, 9·10 컬렉션 | 2건까지 이름 나열 → 3건+ "○○님 외 N명" |
| **L3 적극 압축** | ① 획득류, 5 포인트, ⑥ 팔로잉 활동 | 항상 묶음 (인스타의 '좋아요'에 해당) |

---

## 5. `bumps_badge` — dot 제외 플래그

Strava 동기화는 webhook이 없어 100% 수동이다. 유저가 버튼을 눌러 `BadgeRevealOverlay`로 배지를
확인한 직후 dot이 켜지면, 눌러봐야 방금 본 그 배지들이다. 매번 반복되면 dot이 "새 소식"이
아니라 "동기화했음"의 동의어가 되어 신호가 죽는다.

| 카테고리 | `bumps_badge` | 근거 |
|---|---|---|
| ① 보상 획득 (1·2·3·4·5·7) | **FALSE** | 유저가 동기화 화면에서 이미 봤다 |
| ②~⑧ 나머지 20종 | TRUE | 내가 모르는 사이에 일어난 일 |

**리스트에는 최신순으로 그대로 남는다.** 히스토리로서의 가치("그때 뭐 받았더라", 오버레이
상한 10건 초과분 재확인)는 100% 유지되고, dot만 켜지 않는다.

---

## 6. `payload` 스키마

문구 슬롯과 착지점 계산에 필요한 값을 담는다. **착지점(`target_href`)은 저장하지 않는다** —
라우트가 바뀌면 과거 소식이 전부 깨지므로 `type` + `payload`로 렌더 시점에 계산한다.

| type | payload 예시 |
|---|---|
| `badge_earned` | `{ badge_ids: [...], count, activity_id }` — `badge_ids`는 append |
| `rare_badge_earned` | `{ badge_id, badge_name, rarity }` |
| `item_badge_earned` | `{ inventory_item_ids: [...], count }` — 착지점이 인벤토리 인스턴스라 배지 id가 아니다 |
| `checkin_badge_earned` | `{ badge_ids: [...], poi_names: [...], count }` — `poi_names`는 체크인한 **지점** 이름이라 키명 유지 |
| `points_earned` | `{ amount, reason }` — `amount`는 `sum_keys`로 합산 |
| `collection_completable` | `{ item_book_id, book_name }` |
| `drop_picked_up` | `{ actor_ids: [...], badge_ids: [...], poi_id }` — 둘 다 append. 단건일 때만 `badge_name` |
| `mission_milestone` | `{ mission_id, mission_title, current, target, unit, milestone: 50\|80 }` |
| `mission_completed` | `{ mission_id, mission_title, reward_badge_count, reward_points }` |
| `mission_rank_up` | `{ mission_id, mission_title, rank }` |
| `followed` | `{ actor_ids: [...] }` — append. 2명까지 이름 나열에 필요 (§4-1) |
| `sync_stalled` | `{ days: 3 }` |
| `admin_points_changed` | `{ amount, direction: 'grant'\|'deduct', reason }` — `reason`은 **코드**다. 렌더 시 `adminReasonLabel()`을 반드시 경유할 것 |
| `announcement` | `{ today_card_id, title }` |

닉네임은 `payload`에 **박제하지 않는다.** `actor_user_id`와 `user_id`로 조인해 렌더 시점에
읽는다 — 유저가 닉네임을 바꾸면 과거 소식도 따라와야 한다.

**배열 필드는 `p_append_keys`로 누적한다.** 얕은 덮어쓰기(`||`)로 두면 병합 시 직전 값이
사라진다 — 예를 들어 6시간 창의 픽업 3건이 마지막 배지 하나만 남긴다. 숫자 필드는
`p_sum_keys`로 합산한다.

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

## 8. 확정된 결정과 남은 질문

### 2026-08-24 확정

| 항목 | 확정 |
|---|---|
| `group_key` 시간창 기준 | **KST** (§4 참고) |
| `poi_views.viewed_on` 기준 | **KST** — 하루 중복 억제가 UTC 기준이면 KST 09:00에 어긋난다 |
| #18 "다녀갔다" | **POI 열람 고유 인원**, 본인 제외 (§2-1) |
| ~~#32 "활동 지역" 매칭~~ | ~~`users.region` 문자열 일치~~ — **2026-08-25 철회.** 아래 2026-08-25 확정 표 참고 |

### 2026-08-25 확정 (티켓 20260825_002 — T2 배치)

| 항목 | 확정 |
|---|---|
| T2 11종의 `group_key` | **전부 키를 갖고 `once`.** NULL이면 cron 재시도 시 중복이 새고, `merge`면 상태가 유지되는 동안 매일 dot이 다시 켜진다 (§4-3) |
| #23 순위 기준선 | **`mission_rank_snapshots` 테이블 신설** (§2-2). 첫 배치는 기준선만 남긴다 |
| #42 문구 vs 임계값 | **생성 조건을 잔여 0칸으로 좁힌다.** 문구가 「꽉 찼어요」라 잔여 3칸에 보내면 사실과 다르다. `INVENTORY_LOW_SLOTS_THRESHOLD`는 후보 스캔과 T3 경고 재평가에 계속 쓴다 |
| ⑥ 하루 상한 2건의 선별 | **희귀도 단독**(PRD §9). 희귀도 축이 없는 #30·#31은 "얻기 어려운 순"(컬렉션 완성 > 미션 완료) 고정 우선순위, 동순위는 최근 이벤트 우선 |
| 지역 기반 소식 2종 (#32·#34) | **스펙에서 제거.** `users.region`(시/도)과 역지오코딩 결과(구/동)의 단위가 달라 매칭이 성립하지 않는다. ⑦ 발견 카테고리는 #34가 유일해 카테고리째 사라졌다 — 소식 28종 → **26종**, T2 13종 → **11종**. 사유·재도입 조건은 [PRD.md](./PRD.md) §7 |
| `notification_type` ENUM | **DDL로 값을 지우지 않는다.** 위 2값은 "예약됐으나 사용하지 않음"으로 DB에 남긴다 (§2) |

### 남은 질문

- [ ] **소식 보관 정책** — 현재 무제한. 유저당 수만 건 시점에 커서 페이지네이션만으로 충분한지
      실측 후 재검토. 파티셔닝이나 보관 기간 도입 여부.
- [ ] **`actor_user_id` 대표값 선정** — 묶음에서 "가장 최근 행위자"를 쓰기로 했으나, 인스타는
      친밀도 상위를 앞세운다. 친밀도 지표가 생기면 재검토.
- [ ] **`poi_views` 볼륨** — 하루 1회 UNIQUE로 눌렀으나 POI 수와 DAU가 늘면 재검토가 필요할 수
      있다. 오래된 행의 보관 정책도 함께 판단.
