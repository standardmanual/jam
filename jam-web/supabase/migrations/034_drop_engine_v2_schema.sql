-- ============================================================
-- Migration 034: 드랍엔진 v2 스키마 (Phase 11 Step A)
--
-- 1. faction_adjacency  — 세계관 인접 그래프 (원천: 아이템북 레시피.xlsx '세계관 인접' 시트)
-- 2. user_drop_state    — 유저별 드랍 상태 (모멘텀·pity·일일 카운터)
-- 3. drop_policy        — 드랍 파라미터 싱글톤 (어드민 편집, abusing_policy 패턴)
-- 4. inventory_items.serial_number 무작위화 (순차 SERIAL → 난수 트리거)
--
-- 로직 문서: PRD/badge/BADGE_ENGINE_UNIFIED.md §3
-- ============================================================

-- ----------------------------------------------------------------
-- 1. faction_adjacency
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faction_adjacency (
  faction_id UUID NOT NULL REFERENCES public.factions(id) ON DELETE CASCADE,
  adjacent_faction_id UUID NOT NULL REFERENCES public.factions(id) ON DELETE CASCADE,
  PRIMARY KEY (faction_id, adjacent_faction_id)
);

ALTER TABLE public.faction_adjacency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "faction_adjacency: 전체 읽기 허용"
  ON public.faction_adjacency FOR SELECT
  TO authenticated
  USING (TRUE);

-- 시드 (019_seed_worldview.sql 고정 UUID 기준)
--   낭만 미식가      defa02b9-c4b6-af0d-dc99-c43c278a78d8
--   아스팔트 레인저  7a91727e-e2e1-b7f7-45f0-899ce04716bd
--   숲속의 갱단      73f0f601-2382-900c-8ca2-5cc7c93ed95d
--   셔터 마피아      672acbec-74d3-f36c-28e9-42563dda8e13
--   장비병 환자들    1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d
--   비트 마에스트로  e33307bb-5191-5ad5-58e0-053b40cb09f0
--   포션 연금술사    68f3673f-7d73-996b-b4b9-49600d0f2615
--   아날로그 수집가  d6969aef-2039-c997-4b55-a7ee861b32c5
--   작심삼일 클럽    e9e608d7-812c-4139-88c4-81d129076e3f
--   미스터리 헌터    24d7af8e-a4ef-8798-a7f1-f1f2d6c9d582
--
-- 미스터리 헌터: 인접 행 없음 (전역 스파이스 — 엔진에서 legendary+ 전용 처리)
-- 작심삼일 클럽의 '전 세계관(약한 가중치)': 행 미등록 — 탐험 버킷이 커버
INSERT INTO public.faction_adjacency (faction_id, adjacent_faction_id) VALUES
  -- 낭만 미식가 → 숲속의 갱단, 포션 연금술사, 작심삼일 클럽
  ('defa02b9-c4b6-af0d-dc99-c43c278a78d8', '73f0f601-2382-900c-8ca2-5cc7c93ed95d'),
  ('defa02b9-c4b6-af0d-dc99-c43c278a78d8', '68f3673f-7d73-996b-b4b9-49600d0f2615'),
  ('defa02b9-c4b6-af0d-dc99-c43c278a78d8', 'e9e608d7-812c-4139-88c4-81d129076e3f'),
  -- 아스팔트 레인저 → 미스터리 헌터, 장비병 환자들, 셔터 마피아
  ('7a91727e-e2e1-b7f7-45f0-899ce04716bd', '24d7af8e-a4ef-8798-a7f1-f1f2d6c9d582'),
  ('7a91727e-e2e1-b7f7-45f0-899ce04716bd', '1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d'),
  ('7a91727e-e2e1-b7f7-45f0-899ce04716bd', '672acbec-74d3-f36c-28e9-42563dda8e13'),
  -- 숲속의 갱단 → 낭만 미식가, 아날로그 수집가, 미스터리 헌터
  ('73f0f601-2382-900c-8ca2-5cc7c93ed95d', 'defa02b9-c4b6-af0d-dc99-c43c278a78d8'),
  ('73f0f601-2382-900c-8ca2-5cc7c93ed95d', 'd6969aef-2039-c997-4b55-a7ee861b32c5'),
  ('73f0f601-2382-900c-8ca2-5cc7c93ed95d', '24d7af8e-a4ef-8798-a7f1-f1f2d6c9d582'),
  -- 셔터 마피아 → 아날로그 수집가, 비트 마에스트로, 아스팔트 레인저
  ('672acbec-74d3-f36c-28e9-42563dda8e13', 'd6969aef-2039-c997-4b55-a7ee861b32c5'),
  ('672acbec-74d3-f36c-28e9-42563dda8e13', 'e33307bb-5191-5ad5-58e0-053b40cb09f0'),
  ('672acbec-74d3-f36c-28e9-42563dda8e13', '7a91727e-e2e1-b7f7-45f0-899ce04716bd'),
  -- 장비병 환자들 → 작심삼일 클럽, 포션 연금술사, 아스팔트 레인저
  ('1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d', 'e9e608d7-812c-4139-88c4-81d129076e3f'),
  ('1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d', '68f3673f-7d73-996b-b4b9-49600d0f2615'),
  ('1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d', '7a91727e-e2e1-b7f7-45f0-899ce04716bd'),
  -- 비트 마에스트로 → 셔터 마피아, 미스터리 헌터, 포션 연금술사
  ('e33307bb-5191-5ad5-58e0-053b40cb09f0', '672acbec-74d3-f36c-28e9-42563dda8e13'),
  ('e33307bb-5191-5ad5-58e0-053b40cb09f0', '24d7af8e-a4ef-8798-a7f1-f1f2d6c9d582'),
  ('e33307bb-5191-5ad5-58e0-053b40cb09f0', '68f3673f-7d73-996b-b4b9-49600d0f2615'),
  -- 포션 연금술사 → 낭만 미식가, 장비병 환자들, 비트 마에스트로
  ('68f3673f-7d73-996b-b4b9-49600d0f2615', 'defa02b9-c4b6-af0d-dc99-c43c278a78d8'),
  ('68f3673f-7d73-996b-b4b9-49600d0f2615', '1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d'),
  ('68f3673f-7d73-996b-b4b9-49600d0f2615', 'e33307bb-5191-5ad5-58e0-053b40cb09f0'),
  -- 아날로그 수집가 → 미스터리 헌터, 숲속의 갱단, 셔터 마피아
  ('d6969aef-2039-c997-4b55-a7ee861b32c5', '24d7af8e-a4ef-8798-a7f1-f1f2d6c9d582'),
  ('d6969aef-2039-c997-4b55-a7ee861b32c5', '73f0f601-2382-900c-8ca2-5cc7c93ed95d'),
  ('d6969aef-2039-c997-4b55-a7ee861b32c5', '672acbec-74d3-f36c-28e9-42563dda8e13'),
  -- 작심삼일 클럽 → 낭만 미식가, 장비병 환자들
  ('e9e608d7-812c-4139-88c4-81d129076e3f', 'defa02b9-c4b6-af0d-dc99-c43c278a78d8'),
  ('e9e608d7-812c-4139-88c4-81d129076e3f', '1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------
-- 2. user_drop_state
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_drop_state (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  last_drop_faction_id UUID REFERENCES public.factions(id),   -- 모멘텀 기준
  last_drop_book_id UUID REFERENCES public.item_books(id),    -- 동일 북 연속 방지
  common_streak INTEGER NOT NULL DEFAULT 0,                   -- rare+ pity 카운터
  last_piece_pity JSONB NOT NULL DEFAULT '{}',                -- {book_id: 세계관 내 드랍 카운터}
  daily_drop_count INTEGER NOT NULL DEFAULT 0,                -- 당일 드랍 수 (rarity 하향 판단)
  daily_drop_date DATE,
  total_drops INTEGER NOT NULL DEFAULT 0,                     -- 누적 드랍 수 (신규 유저 온보딩 판단)
  last_activity_at TIMESTAMPTZ,                               -- 복귀·주간 첫 활동 판단
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_drop_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_drop_state: 본인만 읽기"
  ON public.user_drop_state FOR SELECT
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 3. drop_policy (싱글톤 — id=1 고정)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drop_policy (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Layer 1: 드랍 발생
  rarity_common NUMERIC(4,3) NOT NULL DEFAULT 0.60,
  rarity_rare NUMERIC(4,3) NOT NULL DEFAULT 0.28,
  rarity_legendary NUMERIC(4,3) NOT NULL DEFAULT 0.09,
  rarity_mythic NUMERIC(4,3) NOT NULL DEFAULT 0.03,
  bonus_drop_rate NUMERIC(4,3) NOT NULL DEFAULT 0.15,
  bonus_drop_rate_intense NUMERIC(4,3) NOT NULL DEFAULT 0.30,
  intense_duration_min INTEGER NOT NULL DEFAULT 60,
  intense_elevation_m INTEGER NOT NULL DEFAULT 300,
  rare_pity_threshold INTEGER NOT NULL DEFAULT 5,
  daily_downgrade_from INTEGER NOT NULL DEFAULT 4,
  daily_downgrade_common NUMERIC(4,3) NOT NULL DEFAULT 0.90,
  comeback_gap_days INTEGER NOT NULL DEFAULT 7,
  weekly_first_rare_mult NUMERIC(4,2) NOT NULL DEFAULT 2.0,
  -- Layer 2: 세계관 선택
  momentum_weight NUMERIC(4,3) NOT NULL DEFAULT 0.50,
  adjacent_weight NUMERIC(4,3) NOT NULL DEFAULT 0.25,
  explore_weight NUMERIC(4,3) NOT NULL DEFAULT 0.15,
  context_override_rate NUMERIC(4,3) NOT NULL DEFAULT 0.60,
  mystery_spice_rate NUMERIC(4,3) NOT NULL DEFAULT 0.15,      -- legendary+ 드랍 시 미스터리 헌터 등장률
  -- Layer 3: 완성 페이싱
  completion_decay NUMERIC(4,3) NOT NULL DEFAULT 0.70,
  completed_book_weight NUMERIC(4,3) NOT NULL DEFAULT 0.30,
  same_book_penalty NUMERIC(4,3) NOT NULL DEFAULT 0.50,
  last_piece_pity_threshold INTEGER NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.drop_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 4. 일련번호 무작위화
--    순차 SERIAL DEFAULT 제거 → BEFORE INSERT 트리거가 1~999,999 난수 부여.
--    모든 획득 경로(드랍·조합·픽업·어드민 지급)에 일괄 적용.
--    기존 발급분 번호는 유지 (재부여 금지).
-- ----------------------------------------------------------------
-- NOT NULL·UNIQUE 제약은 유지 — BEFORE INSERT 트리거가 NOT NULL 검사 전에 값을 채운다
ALTER TABLE public.inventory_items ALTER COLUMN serial_number DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.assign_random_serial()
RETURNS TRIGGER AS $$
DECLARE
  candidate INTEGER;
  tries INTEGER := 0;
BEGIN
  IF NEW.serial_number IS NOT NULL THEN
    RETURN NEW;
  END IF;
  LOOP
    candidate := 1 + floor(random() * 999999)::INTEGER;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.inventory_items WHERE serial_number = candidate
    );
    tries := tries + 1;
    IF tries > 50 THEN
      RAISE EXCEPTION 'assign_random_serial: 50회 시도 내 빈 일련번호를 찾지 못함 (범위 확장 필요)';
    END IF;
  END LOOP;
  NEW.serial_number := candidate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_random_serial ON public.inventory_items;
CREATE TRIGGER trg_random_serial
BEFORE INSERT ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.assign_random_serial();
