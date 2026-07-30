# JAM! Phase 8 데이터 모델

> 작성일: 2026-07-14  
> 기반: Phase8_01_PRD.md

---

## 1. 신규 테이블

### 1-1. `factions` (세계관)

```sql
CREATE TABLE public.factions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  tagline      TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  image_url    TEXT,
  drop_weight  NUMERIC(4,2) NOT NULL DEFAULT 1.0
               CONSTRAINT drop_weight_positive CHECK (drop_weight > 0),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  -- 드랍 활동 조건 (상속 최상위)
  -- { "activity_types": ["running"], "min_distance_km": 5,
  --   "min_elevation_m": 0, "min_duration_min": 0 }
  drop_condition_json JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1-2. `user_item_book_slots` (유저 아이템북 슬로팅)

아이템북에 유저가 배지를 장착한 상태를 추적한다. 배지는 인벤토리에서 이 테이블로 이동한다.

```sql
CREATE TABLE public.user_item_book_slots (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_book_id     UUID NOT NULL REFERENCES public.item_books(id) ON DELETE CASCADE,
  badge_id         UUID NOT NULL REFERENCES public.badges(id),
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  slotted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 동일 유저가 동일 아이템북의 동일 배지 슬롯에 중복 장착 방지
  UNIQUE(user_id, item_book_id, badge_id)
);
```

### 1-3. `user_item_book_completions` (아이템북 완성 기록)

최초 완성 시 1회만 기록. 이후 슬롯을 비워도 이 기록은 유지된다.

```sql
CREATE TABLE public.user_item_book_completions (
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_book_id UUID NOT NULL REFERENCES public.item_books(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_book_id)
);
```

---

## 2. 기존 테이블 변경

### 2-1. `badges` 테이블 컬럼 추가

```sql
-- 소속 세계관 (NULL = Public 세계관)
ALTER TABLE public.badges
  ADD COLUMN faction_id UUID REFERENCES public.factions(id) ON DELETE SET NULL;

-- 소속 아이템북 (NULL = 미배정)
ALTER TABLE public.badges
  ADD COLUMN item_book_id UUID REFERENCES public.item_books(id) ON DELETE SET NULL;

-- 드랍 가중치 (같은 rarity 내 상대적 선택 확률)
ALTER TABLE public.badges
  ADD COLUMN drop_weight NUMERIC(4,2) NOT NULL DEFAULT 1.0
  CONSTRAINT badge_drop_weight_positive CHECK (drop_weight > 0);

-- 개별 드랍 조건 (아이템북 조건 상속 후 좁힘)
ALTER TABLE public.badges
  ADD COLUMN drop_condition_json JSONB;
```

### 2-2. `item_books` 테이블 컬럼 추가

```sql
-- 소속 세계관 (required)
ALTER TABLE public.item_books
  ADD COLUMN faction_id UUID REFERENCES public.factions(id) ON DELETE SET NULL;

-- 확장 서사
ALTER TABLE public.item_books
  ADD COLUMN story_text TEXT;

-- 활성화 여부
ALTER TABLE public.item_books
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 드랍 조건 (세계관 조건 상속 후 좁힘)
ALTER TABLE public.item_books
  ADD COLUMN drop_condition_json JSONB;
```

> `required_item_badge_ids` (JSONB 배열) 컬럼은 **삭제**. 대신 `badges.item_book_id`로 역방향 조회. 슬롯 수 = 해당 아이템북에 `item_book_id`가 연결된 배지 수.

> `required_activity_badge_id`는 nullable로 유지 (선택적 완성 조건).

### 2-3. `inventory_items` 테이블 컬럼 추가

```sql
-- 아이템북 슬롯에 장착된 경우 해당 slot ID 참조
ALTER TABLE public.inventory_items
  ADD COLUMN slotted_in UUID REFERENCES public.user_item_book_slots(id) ON DELETE SET NULL;
```

---

## 3. 엔티티 관계도

```
factions (1)
    ├── item_books (N) ──── badges (N) [item_book_id]
    │       │                   │
    │       │               inventory_items (N) [badge_id]
    │       │                   │
    │   user_item_book_slots ───┘ [inventory_item_id]
    │       │
    │   user_item_book_completions
    │
    └── badges (N) [faction_id]
```

---

## 4. 핵심 비즈니스 규칙 (DB 레벨)

| 규칙 | 구현 방식 |
|------|-----------|
| 배지는 최대 1개 아이템북에만 소속 | `badges.item_book_id` 단일 FK |
| 동일 배지를 같은 아이템북에 중복 장착 불가 | `user_item_book_slots` UNIQUE(user_id, item_book_id, badge_id) |
| 슬로팅 시 인벤토리에서 제거 | `inventory_items.slotted_in` SET → 인벤토리 조회에서 slotted_in IS NULL 조건 추가 |
| 슬롯 제거 시 인벤토리 복귀 | `slotted_in` = NULL, `user_item_book_slots` row 삭제 |
| 아이템북 완성 최초 1회만 기록 | `user_item_book_completions` PRIMARY KEY (user_id, item_book_id) |

---

## 5. 드랍 조건 JSON 스키마

세계관/아이템북/배지 모두 동일 구조:

```typescript
interface DropCondition {
  activity_types?: ActivityType[]  // 빈 배열 또는 미설정 = 전체 허용
  min_distance_km?: number         // 0 또는 미설정 = 조건 없음
  min_elevation_m?: number         // 0 또는 미설정 = 조건 없음
  min_duration_min?: number        // 0 또는 미설정 = 조건 없음
}
```

상속 시 각 조건의 최댓값(더 좁은 조건)을 취한다:
- `activity_types`: 교집합 (하위가 더 제한적이어야 함)
- `min_*`: 최댓값 (하위가 더 크거나 같아야 함)

---

## 6. 마이그레이션 순서

```
014_factions.sql         — factions 테이블 생성
015_badges_faction.sql   — badges에 faction_id, item_book_id, drop_weight, drop_condition_json 추가
016_itembooks_faction.sql — item_books에 faction_id, story_text, is_active, drop_condition_json 추가
                            + required_item_badge_ids 컬럼 DROP
017_item_book_slots.sql  — user_item_book_slots, user_item_book_completions 생성
                           + inventory_items에 slotted_in 추가
018_seed_factions.sql    — Public + 10개 세계관 기본 데이터 INSERT
                           + 기존 100개 배지 → Public 세계관 배정
```
