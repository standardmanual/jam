# JAM! Phase 7 — 데이터 모델

> 생성일: 2026-07-10

---

## 1. 신규 테이블: `poi_drops`

유저가 POI에 드랍한 아이템 레코드. 픽업 완료 전까지 POI에 "놓여있는" 아이템을 나타낸다.

```sql
CREATE TABLE IF NOT EXISTS public.poi_drops (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 드랍한 유저
  dropper_user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- 드랍 위치 (기존 poi 테이블)
  poi_id            UUID NOT NULL REFERENCES public.poi(id) ON DELETE CASCADE,

  -- 드랍된 아이템 배지 (원본 inventory_items는 dropped_at 기록 후 논리 삭제)
  badge_id          UUID NOT NULL REFERENCES public.badges(id),

  -- 드랍 시각
  dropped_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 픽업 정보 (null = 아직 픽업 안 됨)
  picked_up_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  picked_up_at      TIMESTAMPTZ,

  -- 만료 (null = 영구)  [NEEDS CLARIFICATION]
  expires_at        TIMESTAMPTZ,

  -- 상태 파생 가능하지만 쿼리 편의상 컬럼 유지
  is_available      BOOLEAN NOT NULL DEFAULT TRUE
);

-- 픽업 가능한 드랍만 조회할 때 사용
CREATE INDEX idx_poi_drops_available ON public.poi_drops(poi_id, is_available)
  WHERE is_available = TRUE;

-- 동일 유저가 동일 드랍 중복 픽업 방지
-- (poi_drops.id는 PK로 이미 유니크하나, picked_up_by + id 조합으로 방지)
```

### RLS 정책

```sql
ALTER TABLE public.poi_drops ENABLE ROW LEVEL SECURITY;

-- 전체 읽기 (픽업 가능 목록 조회용)
CREATE POLICY "poi_drops: 인증 유저 읽기"
  ON public.poi_drops FOR SELECT TO authenticated USING (TRUE);

-- 드랍 생성: 본인만
CREATE POLICY "poi_drops: 드랍 생성"
  ON public.poi_drops FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = dropper_user_id);

-- 픽업 업데이트: 픽업자 본인 + is_available=true인 경우만
-- (실제 검증은 서버 API에서 처리, RLS는 보조)
CREATE POLICY "poi_drops: 픽업 업데이트"
  ON public.poi_drops FOR UPDATE TO authenticated
  USING (is_available = TRUE AND auth.uid() != dropper_user_id);
```

---

## 2. 기존 테이블 변경: `inventory_items`

드랍 시 아이템을 "논리 삭제" 처리하기 위한 컬럼 추가.

```sql
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS dropped_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS drop_id      UUID REFERENCES public.poi_drops(id);
```

- `dropped_at IS NOT NULL` → 드랍된 아이템 (인벤토리에서 보이지 않음)
- `drop_id` → 어느 poi_drop 레코드와 연결됐는지 추적

---

## 3. 기존 테이블 변경: `ItemObtainedBy` 타입

```typescript
// types/database.ts 에 추가
export type ItemObtainedBy = 'drop' | 'drop_event' | 'system_event' | 'pickup'
//                                                                       ^^^^^^ 신규
```

---

## 4. 엔티티 관계도

```
users
  │
  ├─── (dropper) ───── poi_drops ──── poi
  │                         │
  │                         │ badge_id
  │                         ▼
  │                       badges
  │
  ├─── (picker)  ───── poi_drops (picked_up_by)
  │
  └─── inventory
         └─── inventory_items ──── poi_drops (drop_id)
```

---

## 5. 주요 쿼리 패턴

### 5-1. 반경 50m 내 드랍 가능한 POI 조회

PostGIS 없이 Haversine (앱 사이드):

```sql
-- 모든 poi 로드 후 클라이언트/서버에서 거리 필터링
SELECT * FROM poi;
-- → 기존 matcher.ts의 isRouteNearPoi 패턴 재활용
```

또는 API Route에서 처리:

```typescript
// /api/drops/nearby?lat=37.5&lng=127.0
// poi 전체 로드 → Haversine 필터 → poi_drops JOIN
```

### 5-2. POI의 픽업 가능 아이템 목록

```sql
SELECT
  pd.*,
  b.name AS badge_name,
  b.rarity,
  b.image_url,
  u.display_name AS dropper_name
FROM poi_drops pd
JOIN badges b ON pd.badge_id = b.id
JOIN users u ON pd.dropper_user_id = u.id
WHERE pd.poi_id = $1
  AND pd.is_available = TRUE
  AND pd.dropper_user_id != $2  -- 본인 드랍 제외
ORDER BY pd.dropped_at ASC;    -- FIFO가 기본이지만 목록 보고 선택
```

### 5-3. 픽업 트랜잭션 (원자성 필요)

```sql
-- 트랜잭션으로 처리
BEGIN;
  -- 1. poi_drops 업데이트
  UPDATE poi_drops
  SET picked_up_by = $picker_id, picked_up_at = NOW(), is_available = FALSE
  WHERE id = $drop_id AND is_available = TRUE;
  -- affected rows = 0 이면 ROLLBACK (이미 픽업됨)

  -- 2. inventory_items INSERT
  INSERT INTO inventory_items (inventory_id, badge_id, obtained_by)
  VALUES ($inventory_id, $badge_id, 'pickup');

  -- 3. inventory.used_slots +1
  UPDATE inventory SET used_slots = used_slots + 1 WHERE id = $inventory_id;
COMMIT;
```

Supabase에서는 RPC (PostgreSQL function)으로 원자성 보장.
