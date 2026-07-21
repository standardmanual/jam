# JAM! Phase 11 데이터 모델 — 드랍엔진 v2

> 작성일: 2026-07-21  
> 원칙: 기존 테이블 최대 재사용. `factions`가 곧 세계관 — 신규 worlds 테이블 없음.

---

## 1. 기존 테이블 (변경 없음, 재사용)

| 테이블 | 역할 | 비고 |
|--------|------|------|
| `factions` | 세계관 마스터 (10개 시드 완료, 019) | drop_weight·is_active·sort_order 이미 보유 |
| `item_books` | 아이템북 100권 (faction_id 연결) | is_active 활성화됨 (028) |
| `badges` (type='item') | 아이템배지 ~900종 (item_book_id 연결) | drop_weight·rarity 보유 |
| `inventory` / `inventory_items` | 인벤토리 | serial_number만 변경 (§3) |
| `user_item_book_slots` / `user_item_book_completions` | 슬롯 장착·완성 기록 | completion 계산에 사용 |
| `abusing_policy` / `user_shadow_bans` | 섀도우밴 | rarity 상한으로 작동 (변경 없음) |

## 2. 신규 테이블 2개

### 2-1. `faction_adjacency` — 세계관 인접 그래프

```sql
CREATE TABLE public.faction_adjacency (
  faction_id UUID NOT NULL REFERENCES public.factions(id) ON DELETE CASCADE,
  adjacent_faction_id UUID NOT NULL REFERENCES public.factions(id) ON DELETE CASCADE,
  PRIMARY KEY (faction_id, adjacent_faction_id)
);
-- 시드 원천: 아이템북 레시피.xlsx '세계관 인접' 시트 (10행)
-- 특수 케이스:
--   미스터리 헌터: 인접 행 없음 (전역 스파이스 — 엔진 로직에서 처리)
--   작심삼일 클럽의 '전 세계관(약한 가중치)': 인접 행 미등록 → 탐험 버킷이 자연 커버
-- RLS: 읽기 전체 허용, 쓰기 service_role
```

### 2-2. `user_drop_state` — 유저별 드랍 상태

```sql
CREATE TABLE public.user_drop_state (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  last_drop_faction_id UUID REFERENCES public.factions(id),  -- 모멘텀 기준
  last_drop_book_id UUID REFERENCES public.item_books(id),   -- 동일 북 연속 방지
  common_streak INTEGER NOT NULL DEFAULT 0,                  -- rare+ pity 카운터
  last_piece_pity JSONB NOT NULL DEFAULT '{}',               -- {book_id: 세계관내 드랍 카운터}
  daily_drop_count INTEGER NOT NULL DEFAULT 0,               -- 당일 드랍 수 (rarity 하향 판단)
  daily_drop_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 기존 유저 마이그레이션 없음 (전원 테스트 유저) — 첫 v2 드랍 시 lazy 생성
-- RLS: 본인 읽기, 쓰기 service_role
```

### 2-3. `drop_policy` — 드랍 파라미터 (어드민 편집, 싱글톤)

```sql
CREATE TABLE public.drop_policy (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Layer 1
  rarity_common NUMERIC(4,3) NOT NULL DEFAULT 0.60,
  rarity_rare NUMERIC(4,3) NOT NULL DEFAULT 0.28,
  rarity_legendary NUMERIC(4,3) NOT NULL DEFAULT 0.09,
  rarity_mythic NUMERIC(4,3) NOT NULL DEFAULT 0.03,
  bonus_drop_rate NUMERIC(4,3) NOT NULL DEFAULT 0.15,        -- 2개째 확률
  bonus_drop_rate_intense NUMERIC(4,3) NOT NULL DEFAULT 0.30, -- 60분+/고고도
  intense_duration_min INTEGER NOT NULL DEFAULT 60,
  rare_pity_threshold INTEGER NOT NULL DEFAULT 5,             -- 연속 common 임계
  daily_downgrade_from INTEGER NOT NULL DEFAULT 4,            -- N번째 활동부터 하향
  daily_downgrade_common NUMERIC(4,3) NOT NULL DEFAULT 0.90,
  comeback_gap_days INTEGER NOT NULL DEFAULT 7,               -- 복귀 판정 공백
  weekly_first_rare_mult NUMERIC(4,2) NOT NULL DEFAULT 2.0,
  -- Layer 2
  momentum_weight NUMERIC(4,3) NOT NULL DEFAULT 0.50,
  adjacent_weight NUMERIC(4,3) NOT NULL DEFAULT 0.25,
  explore_weight NUMERIC(4,3) NOT NULL DEFAULT 0.15,
  context_override_rate NUMERIC(4,3) NOT NULL DEFAULT 0.60,   -- 조건 충족 시 발동률
  -- Layer 3
  completion_decay NUMERIC(4,3) NOT NULL DEFAULT 0.70,
  completed_book_weight NUMERIC(4,3) NOT NULL DEFAULT 0.30,
  same_book_penalty NUMERIC(4,3) NOT NULL DEFAULT 0.50,
  last_piece_pity_threshold INTEGER NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.drop_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
-- 패턴: abusing_policy와 동일 (싱글톤 + 어드민 편집 + getDropPolicy() 헬퍼)
```

## 3. 변경: `inventory_items.serial_number` 무작위화

```sql
-- 현행: serial_number SERIAL UNIQUE (전역 순차)
-- 변경: 시퀀스 기본값 제거, 애플리케이션에서 난수 부여
ALTER TABLE public.inventory_items ALTER COLUMN serial_number DROP DEFAULT;
-- UNIQUE 제약은 유지 (충돌 시 재시도의 근거)
-- 기존 발급분 번호는 그대로 유지 (재부여 금지)
```

- 부여 로직: `1 ~ 999,999` 난수 → INSERT 충돌(23505) 시 재생성 최대 5회 → 실패 시 범위 확장 재시도
- `serial_prefix` 트리거(008)는 유지

## 4. completion(수집률) 정의

Layer 3의 completion은 **북 소속 배지 중 유저가 보유한 distinct 배지 비율**로 계산:

```
completion = (유저 인벤토리에 존재하는 해당 북 소속 distinct badge_id 수)
           ÷ (해당 북 소속 전체 badge_id 수)
```

- 슬롯 장착 여부와 무관 (보유 기준) — 드랍 페이싱은 "얻었는가"의 문제
- `user_item_book_completions`(슬롯 완성 기록)는 완성 축하·중복 드랍 판단과 별개 유지
- 쿼리 비용: 드랍 1회당 해당 세계관의 북별 집계 1회 — 유저당 인벤토리 규모가 작아 초기엔 단순 쿼리로 충분

## 5. 시드 마이그레이션

| 시드 | 원천 | 내용 |
|------|------|------|
| `faction_adjacency` | xlsx '세계관 인접' 시트 | 9개 세계관 × 인접 2~3개 (미스터리 헌터 제외) |
| `drop_policy` | BADGE_ENGINE_UNIFIED §3.9 초기값 | 싱글톤 1행 |

> 전제조건: 액티비티배지 시드 `033_reseed_activity_badges_v3.sql`이 아직 DB 미적용 상태 — Phase 11 착수 전 적용 필요.
