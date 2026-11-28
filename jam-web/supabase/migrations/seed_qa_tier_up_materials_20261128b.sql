-- 티켓 20261128_0743 (2차 발급, 2026-11-28 12:5x KST): 등급 UP 시험 계정의 인벤토리 빈 칸 23개를 아이템 배지로 채운다.
-- 발급 뒤 등급별 보유: Common 8, Rare 8, Epic 7, Mystic 7 (30/30칸).
-- 1차 발급과 같은 표시값(obtained_by='qa_tier_up_20261128')을 써서 되돌림 SQL(seed_qa_tier_up_materials_20261128_down.sql) 하나로 함께 지운다.
-- 후보 조건은 1차 발급과 같다(등급 UP 결과 후보와 같은 조건). 이미 인벤토리에 있는 배지는 겹치지 않게 뺀다.
DO $$
DECLARE
  v_inv uuid := '51a0680e-cd8f-45d7-a8ed-8c0329370389';
  v_badge record;
  v_res jsonb;
BEGIN
  FOR v_badge IN
    SELECT c.id, c.rarity FROM (
      SELECT b.id, b.rarity, row_number() OVER (PARTITION BY b.rarity ORDER BY random()) AS rn
      FROM public.badges b JOIN public.item_books ib ON ib.id = b.item_book_id
      WHERE b.type = 'item' AND b.deleted_at IS NULL AND NOT b.drop_excluded AND NOT coalesce(b.always_locked, false)
        AND (b.valid_from IS NULL OR b.valid_from <= now()) AND (b.valid_until IS NULL OR b.valid_until > now())
        AND ib.is_active AND NOT ib.drop_excluded
        AND (ib.valid_from IS NULL OR ib.valid_from <= now()) AND (ib.valid_until IS NULL OR ib.valid_until > now())
        AND b.rarity IN ('common', 'rare', 'epic', 'mystic')
        AND NOT EXISTS (
          SELECT 1 FROM public.inventory_items ii
          WHERE ii.inventory_id = v_inv AND ii.badge_id = b.id
            AND ii.dropped_at IS NULL AND ii.destroyed_at IS NULL AND ii.slotted_in IS NULL
        )
    ) c
    WHERE c.rn <= CASE c.rarity WHEN 'common' THEN 7 WHEN 'rare' THEN 6 WHEN 'epic' THEN 4 WHEN 'mystic' THEN 6 END
    ORDER BY c.rarity
  LOOP
    v_res := public.grant_inventory_item(v_inv, v_badge.id, 'qa_tier_up_20261128', NULL);
    IF NOT (v_res->>'ok')::boolean THEN
      RAISE EXCEPTION '발급 실패: badge % (%): %', v_badge.id, v_badge.rarity, v_res;
    END IF;
  END LOOP;
END $$;
