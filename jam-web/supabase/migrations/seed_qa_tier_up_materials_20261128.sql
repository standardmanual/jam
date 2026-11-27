-- 등급 UP 시험용 재료 발급 (티켓 20261128_0743)
-- 대상: 운영자 시험 계정 1개(인벤토리 51a0680e-cd8f-45d7-a8ed-8c0329370389)
-- 내용: Common·Rare·Epic·Mystic 아이템 배지를 등급마다 6개씩, 모두 24개 발급한다.
--   후보는 등급 UP 후보 판정(listServiceIssueCandidates)과 같은 조건이다: 활성·공개 기간 안·드랍 제외 아님인 컬렉션의
--   삭제되지 않고 드랍 제외가 아니며 공개 기간 안인 아이템 배지. 등급마다 서로 다른 배지 6개를 무작위로 고른다.
-- 발급은 grant_inventory_item(칸 수 검사와 used_slots 증가를 함께 한다)으로 하고, 되돌림을 위해
-- obtained_by를 'qa_tier_up_20261128'로 표시한다. 되돌림은 seed_qa_tier_up_materials_20261128_down.sql.
DO $$
DECLARE
  v_inv uuid := '51a0680e-cd8f-45d7-a8ed-8c0329370389';
  v_badge record;
  v_res jsonb;
BEGIN
  FOR v_badge IN
    SELECT id, rarity FROM (
      SELECT b.id, b.rarity,
             row_number() OVER (PARTITION BY b.rarity ORDER BY random()) AS rn
      FROM public.badges b
      JOIN public.item_books ib ON ib.id = b.item_book_id
      WHERE b.type = 'item'
        AND b.deleted_at IS NULL
        AND NOT b.drop_excluded
        AND NOT coalesce(b.always_locked, false)
        AND (b.valid_from IS NULL OR b.valid_from <= now())
        AND (b.valid_until IS NULL OR b.valid_until > now())
        AND ib.is_active
        AND NOT ib.drop_excluded
        AND (ib.valid_from IS NULL OR ib.valid_from <= now())
        AND (ib.valid_until IS NULL OR ib.valid_until > now())
        AND b.rarity IN ('common', 'rare', 'epic', 'mystic')
    ) c
    WHERE rn <= 6
    ORDER BY rarity
  LOOP
    v_res := public.grant_inventory_item(v_inv, v_badge.id, 'qa_tier_up_20261128', NULL);
    IF NOT (v_res->>'ok')::boolean THEN
      RAISE EXCEPTION '발급 실패: badge % (%): %', v_badge.id, v_badge.rarity, v_res;
    END IF;
  END LOOP;
END $$;
