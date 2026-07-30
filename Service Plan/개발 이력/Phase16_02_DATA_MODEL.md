# JAM! Phase 16 데이터 모델 — POI 배지 타입 추가

> 작성일: 2026-07-27

---

## 1. `badge_type` ENUM 확장

```sql
ALTER TYPE public.badge_type ADD VALUE IF NOT EXISTS 'poi';
```

- `poi_category`(Phase 15 이전에 이미 ENUM→테이블로 전환됨)와 달리, `badge_type`은 어드민이 자유 생성/삭제할 대상이 아니라 **코드 전반에서 분기 조건으로 쓰이는 고정 3종 분류**(activity/item/poi)라 ENUM 유지가 적절 — 테이블화 불필요.
- ENUM에 값 추가는 트랜잭션 내 다른 DDL과 함께 실행 불가하다는 Postgres 제약이 있음(이전 `039_poi_category_expansion.sql`에서도 단독 파일로 처리한 전례) — 이번에도 별도 마이그레이션 파일로 분리.

## 2. 신규 테이블: `user_poi_badge_earns`

```sql
CREATE TABLE public.user_poi_badge_earns (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_id                    UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  poi_id                      UUID NOT NULL REFERENCES public.poi(id) ON DELETE CASCADE,
  earned_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- user_activity_badges와 동일한 트리거 스냅샷 필드(포맷 일관성)
  triggered_by_strava_id      BIGINT,
  triggered_by_activity_name  TEXT,
  triggered_by_distance_km    NUMERIC,
  triggered_by_activity_date  TIMESTAMPTZ,

  -- 같은 Strava 활동이 재동기화(웹훅 재전송, 수동 재싱크)돼도 같은 활동에서 같은 POI를
  -- 두 번 발급하지 않기 위한 최소 방어선. "같은 POI를 다른 날 재방문"은 당연히 별도 행 허용.
  UNIQUE (user_id, badge_id, poi_id, triggered_by_strava_id)
);

CREATE INDEX idx_user_poi_badge_earns_user_badge ON public.user_poi_badge_earns (user_id, badge_id);
CREATE INDEX idx_user_poi_badge_earns_earned_at ON public.user_poi_badge_earns (badge_id, user_id, earned_at DESC);

ALTER TABLE public.user_poi_badge_earns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_poi_badge_earns: 본인만 읽기"
  ON public.user_poi_badge_earns FOR SELECT
  USING (auth.uid() = user_id);

-- 삽입은 서버 사이드(service_role, Strava 동기화)에서만 — user_activity_badges와 동일 정책
```

- **`user_activity_badges`를 건드리지 않는 이유**: 그 테이블의 `UNIQUE(user_id, badge_id)`는 "활동/아이템 배지는 평생 1번만 보유"라는 확정된 기존 시맨틱을 보호하는 제약이라, POI 배지의 "반복 가능"과 근본적으로 충돌함. 별도 테이블로 분리하면 기존 배지 발급 로직·쿼리를 전혀 건드리지 않고 회귀 위험이 0에 가까움.
- **`triggered_by_strava_id`를 BIGINT로 잡는 이유**: `user_activity_badges.triggered_by_strava_id`가 이미 이 타입 — 일관성 유지.
- **UNIQUE 제약의 의미**: "동일 활동(strava_id) + 동일 배지 + 동일 POI" 조합은 1회만. 어뷰징 방지가 아니라 순수 재처리 안전장치(idempotency)임 — GPS 경로가 같은 POI 반경을 여러 프레임에서 통과해도(`matchPoisForActivity`는 어차피 POI 1개당 1번만 반환하므로 실질적으로는 항상 만족됨) 안전.

## 3. `poi.linked_badge_id` — 다대일 관계 재확인 (스키마 변경 없음)

```sql
-- 참고용 — 이미 존재하는 컬럼, 변경 없음
-- poi.linked_badge_id UUID REFERENCES public.badges(id)
```

- 배지 1개 : POI N개 = **여러 `poi` 행이 같은 `linked_badge_id` 값을 가짐**으로 이미 표현 가능. 마이그레이션 불필요.
- 어드민 "배지에 POI 연결" UI는 이 컬럼을 POI 쪽에서 업데이트하는 방식으로 구현(배지 저장 시, 선택된 POI 목록에 대해 `UPDATE poi SET linked_badge_id = :badgeId WHERE id IN (...)`, 목록에서 제거된 POI는 `linked_badge_id = NULL`로 되돌림).
- `poi.radius_meters`를 그대로 "이 POI가 이 배지를 발급하는 판정 반경"으로 재사용(신규 컬럼 불필요, 기본값 50).

## 4. Strava 동기화 — POI 매칭 분기 확장

`src/lib/strava/sync.ts`의 기존 POI 매칭 루프(§Phase16_01 3-3)를 배지 타입에 따라 분기:

```typescript
for (const poi of matchedPois) {
  if (!poi.linked_badge_id) continue
  const badge = badgeById.get(poi.linked_badge_id) // 사전 조회한 badges 맵
  if (!badge) continue

  if (badge.type === 'poi') {
    // 반복 가능 — 매번 새 행. UNIQUE 제약 위반(23505)만 무시(동일 활동 재처리 방지선에 걸린 것)
    const { error } = await supabase.from('user_poi_badge_earns').insert({
      user_id: userId,
      badge_id: badge.id,
      poi_id: poi.id,
      triggered_by_strava_id: rawActivity.id,
      triggered_by_activity_name: rawActivity.name,
      triggered_by_distance_km: /* activities에서 매칭된 값 */,
      triggered_by_activity_date: rawActivity.start_date,
    })
    if (error && error.code !== '23505') { /* 로그만, 계속 진행 */ }
  } else {
    // 레거시 호환 — 기존 그대로 (activity 타입인데 linked_badge_id가 붙어있는 과거 데이터 대비)
    // ...기존 user_activity_badges insert 로직 그대로...
  }
}
```

- `badgeById`는 루프 시작 전 `matchedPois`에 등장하는 `linked_badge_id` 전체를 한 번에 조회해서 만듦(N+1 방지).

## 5. 아이템북 완성 판정 확장 (`src/lib/itembook/checker.ts`)

```typescript
// 기존: type='item'만 카운트
const { data: badgesRaw } = await supabase
  .from('badges')
  .select('id, item_book_id, type')
  .in('item_book_id', bookIds)
  .in('type', ['item', 'poi'])   // ← poi 추가

// item 배지: 기존과 동일하게 user_item_book_slots 카운트
// poi 배지: user_poi_badge_earns에서 (user_id, badge_id) distinct 존재 여부로 "보유" 판정
//   → 북별로 "이 북 소속 poi 배지 중 유저가 1회 이상 획득한 배지 수"를 별도 집계해서
//     slotCountByBook에 합산
```

- `total`(북 소속 배지 총 개수)과 `slotted`(유저가 채운 개수)를 타입 무관하게 합산 비교하는 기존 로직 골격은 그대로 유지 — "채움" 판정 방식만 타입별로 분기.
- `poi` 배지는 반복 획득되지만 완성 판정에는 "1회 이상 획득했는가"만 영향(2번째 획득이 카운트를 늘리지 않음 — 이미 100% 채워진 항목).

## 6. `condition_json.poi_id` 제거 (정리)

- `src/types/database.ts`의 `BadgeCondition` 인터페이스에서 `poi_id` 필드 제거.
- `src/lib/badge-engine/index.ts`의 `evaluateConditionDetailed` 내 `condition.poi_id !== undefined` 분기(항상 false 반환) 제거.
- `src/app/admin/badges/BadgeForm.tsx`의 `condPoiId` state + 관련 입력 필드 제거.
- 기존에 이 필드를 실제로 쓴 배지 데이터는 없음(엔진이 항상 false라 발급 자체가 불가능했으므로) — 데이터 마이그레이션 불필요.

## 7. 타입 추가 (`src/types/database.ts`)

```typescript
export type BadgeType = 'activity' | 'item' | 'poi'

export interface UserPoiBadgeEarnRow {
  id: string
  user_id: string
  badge_id: string
  poi_id: string
  earned_at: string
  triggered_by_strava_id: number | null
  triggered_by_activity_name: string | null
  triggered_by_distance_km: number | null
  triggered_by_activity_date: string | null
}
```

## 8. 마이그레이션 파일 계획

- `jam-web/supabase/migrations/0XX_badge_type_poi.sql`: §1 (ENUM 값 추가, 단독 파일).
- `jam-web/supabase/migrations/0XX_user_poi_badge_earns.sql`: §2 (신규 테이블).
- 번호는 구현 시점 `ls supabase/migrations/`로 최신 번호 확인 후 순서대로 부여(직접 실행 전 실물 확인 — 과거 중복 번호 전례 있음).
- 두 파일 다 **DDL이라 서비스 롤 키로 직접 실행 불가** — 어드민(유저)이 Supabase SQL Editor에서 직접 실행 필요.
