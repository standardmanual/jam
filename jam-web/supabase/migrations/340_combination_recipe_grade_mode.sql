-- 340_combination_recipe_grade_mode.sql
-- 믹스 레시피 유형(등급 대응형/등급 고정형)과 첫 성공자 보상 배지 칸 + 첫 성공자 보상 지급 함수 (티켓 20261114_1705 1회차)
--
-- 이 파일은 «확장(Expand)»이다. 칸 둘과 새 함수 하나만 덧붙이고 옛 모양은 건드리지 않는다.
--   - 새 칸의 기본값은 grade_mode = 'fixed'(지금 방식 그대로), first_success_badge_id = NULL(첫 성공자 보상 없음)이다.
--     옛 코드는 이 칸을 읽지 않으므로 이 파일을 먼저 적용해도 아무것도 깨지지 않는다.
--   - 레시피를 합치는 데이터 변경은 341_merge_recipes_grade_follow.sql이 따로 한다. 그 파일은 새 코드(등급 대응형 판정)가
--     배포된 뒤에 적용한다(옛 코드가 합친 레시피를 만나면 재료 등급을 가리지 않고 4등급 보상을 전부 준다).
--
-- 새 칸
--   combination_recipes.grade_mode text NOT NULL DEFAULT 'fixed' CHECK (IN ('follow_materials','fixed'))
--     follow_materials: 재료를 모두 같은 등급으로 넣으면 결과도 그 등급이다(확률 없음, 100%). 슬롯·보상 배지에는 4등급 배지를 모두 담는다.
--     fixed: 지금 방식 — 슬롯이 가리킨 배지만 받고 보상 배지를 그대로 준다.
--   combination_recipes.first_success_badge_id uuid NULL REFERENCES badges(id) ON DELETE SET NULL
--     이 레시피를 전체 유저 중 처음 성공한 사람에게 일반 결과와 함께 주는 아이템 배지. 판정은 record_combine_success_with_id(254)가 돌려주는
--     is_recipe_first(레시피당 1건만 들어가는 부분 유일 인덱스, 원자적)다. 아이템 배지만 고를 수 있고 드랍 제외(drop_excluded) 설정으로
--     다른 경로(드랍·캡슐 등)에서 나오지 않게 막는 것은 어드민 양식(2회차)이 검증한다.
--
-- 새 함수 combine_grant_first_success(p_user_id, p_recipe_id, p_badge_id, p_locked, p_force_pending) → jsonb
--   첫 성공자 보상 배지 1개를 지급한다. combine_grant_results(236)와 같은 규칙이다 — 인벤토리 빈칸이 1칸 이상이면 기한 없이 지급하고,
--   모자라면 «받지 않은 결과»(combine_pending_results)에 남긴다. p_force_pending = true이면 빈칸이 있어도 받지 않은 결과로 남긴다
--   (같은 믹스의 일반 결과가 받지 않은 결과로 남았을 때 첫 성공자 보상만 먼저 들어가지 않게 하려고 앱이 쓴다).
--   배지가 삭제됐거나 아이템 배지가 아니면 아무것도 주지 않고 status = 'none'을 돌려준다.
--   service_role만 실행한다(옛 함수들과 같은 방어).
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'combination_recipes' AND column_name IN ('grade_mode', 'first_success_badge_id');   -- 2행
--   SELECT grade_mode, count(*) FROM public.combination_recipes GROUP BY grade_mode;   -- fixed 전부
--   SELECT has_function_privilege('authenticated','public.combine_grant_first_success(uuid,uuid,uuid,boolean,boolean)','EXECUTE'),
--          has_function_privilege('service_role','public.combine_grant_first_success(uuid,uuid,uuid,boolean,boolean)','EXECUTE');   -- false, true

ALTER TABLE public.combination_recipes
  ADD COLUMN IF NOT EXISTS grade_mode text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS first_success_badge_id uuid REFERENCES public.badges(id) ON DELETE SET NULL;

ALTER TABLE public.combination_recipes DROP CONSTRAINT IF EXISTS combination_recipes_grade_mode_check;
ALTER TABLE public.combination_recipes ADD CONSTRAINT combination_recipes_grade_mode_check
  CHECK (grade_mode IN ('follow_materials', 'fixed'));

COMMENT ON COLUMN public.combination_recipes.grade_mode IS
  '레시피 유형. follow_materials(등급 대응형): 재료를 모두 같은 등급으로 넣으면 같은 등급의 결과가 100% 나온다. fixed(등급 고정형, 기본): 슬롯이 가리킨 배지만 받고 보상 배지를 그대로 준다.';
COMMENT ON COLUMN public.combination_recipes.first_success_badge_id IS
  '첫 성공자 보상으로 일반 결과와 함께 주는 아이템 배지(선택). 전체 유저 중 처음 성공한 1명만 받는다(user_combine_success_logs.is_recipe_first). NULL이면 없음.';

CREATE OR REPLACE FUNCTION public.combine_grant_first_success(
  p_user_id       uuid,
  p_recipe_id     uuid,
  p_badge_id      uuid,
  p_locked        boolean DEFAULT false,
  p_force_pending boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv      RECORD;
  v_policy   RECORD;
  v_badge    RECORD;
  v_free     integer;
  v_locked   boolean;
  v_reason   text;
  v_required integer;
  v_grant    jsonb;
  v_item_id  uuid;
  v_serial   integer;
BEGIN
  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  SELECT id, rarity, always_locked, unlock_required AS badge_required
    INTO v_badge
    FROM public.badges
   WHERE id = p_badge_id AND deleted_at IS NULL AND type = 'item';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', TRUE, 'status', 'none', 'itemId', NULL);
  END IF;

  SELECT * INTO v_policy FROM public.jam_policy LIMIT 1;

  v_locked := COALESCE(p_locked, FALSE) OR COALESCE(v_badge.always_locked, FALSE);
  v_reason := NULL;
  v_required := NULL;
  IF v_locked THEN
    v_reason := CASE WHEN COALESCE(v_badge.always_locked, FALSE) THEN 'badge_locked' ELSE 'designated' END;
    v_required := COALESCE(
      v_badge.badge_required,
      CASE v_badge.rarity::text
        WHEN 'rare' THEN v_policy.locked_min_rare
        WHEN 'epic' THEN v_policy.locked_min_epic
        WHEN 'mystic' THEN v_policy.locked_min_mystic
        ELSE v_policy.locked_min_common
      END
    );
  END IF;

  v_free := GREATEST(0, v_inv.max_slots - v_inv.used_slots);

  IF NOT COALESCE(p_force_pending, FALSE) AND v_free >= 1 THEN
    v_grant := public.grant_inventory_item_locked(
      v_inv.id, v_badge.id, 'system_event', NULL, v_locked, v_reason, v_required
    );
    IF NOT COALESCE((v_grant->>'ok')::boolean, FALSE) THEN
      RAISE EXCEPTION 'combine_first_success_grant_failed: %', COALESCE(v_grant->>'reason', 'unknown');
    END IF;
    v_item_id := (v_grant->>'itemId')::uuid;
    SELECT serial_number INTO v_serial FROM public.inventory_items WHERE id = v_item_id;
    INSERT INTO public.inventory_item_events (inventory_item_id, badge_id, serial_number, user_id, event_type)
      VALUES (v_item_id, v_badge.id, v_serial, p_user_id, 'received');
    RETURN jsonb_build_object('ok', TRUE, 'status', 'granted', 'itemId', v_item_id);
  END IF;

  INSERT INTO public.combine_pending_results (user_id, recipe_id, badge_id, locked, lock_reason, unlock_required)
    VALUES (p_user_id, p_recipe_id, v_badge.id, v_locked, v_reason, v_required);
  RETURN jsonb_build_object('ok', TRUE, 'status', 'pending', 'itemId', NULL, 'free', v_free);
END;
$$;

COMMENT ON FUNCTION public.combine_grant_first_success(uuid, uuid, uuid, boolean, boolean) IS
  '믹스 첫 성공자 보상 배지 1개 지급. 빈칸이 있으면 기한 없이 지급하고 모자라거나 p_force_pending이면 받지 않은 결과로 남긴다. 삭제됐거나 아이템 배지가 아니면 아무것도 주지 않는다. service_role 전용. 티켓 20261114_1705.';

REVOKE ALL ON FUNCTION public.combine_grant_first_success(uuid, uuid, uuid, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.combine_grant_first_success(uuid, uuid, uuid, boolean, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.combine_grant_first_success(uuid, uuid, uuid, boolean, boolean) TO service_role;

-- 되돌림 SQL: 340_combination_recipe_grade_mode_down.sql (짝 파일). 341로 합친 데이터를 먼저 되돌린 뒤, 코드를 되돌린 다음에 적용한다.
