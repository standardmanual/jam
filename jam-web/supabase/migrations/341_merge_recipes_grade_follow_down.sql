-- 341 되돌림: 합친 레시피 20개를 백업 표로 4등급 레시피 80개로 되돌린다 (티켓 20261114_1705 1회차)
--
-- 근거는 341이 만든 백업 표 recipe_merge_backup_20261114_{recipes,slots,success_logs,pending,cards}다. 백업 표가 비어 있으면 멈춘다.
-- 순서: 이 파일 → (필요하면) 340_combination_recipe_grade_mode_down.sql. 코드(등급 대응형 판정)는 이 파일 뒤에 되돌려도 된다
--   (grade_mode가 전부 'fixed'가 되면 새 코드도 옛 방식으로 동작한다).
--
-- 되돌려지는 것: 지워진 레시피 60개와 모든 슬롯(옛 슬롯 id 그대로), 대표 레시피의 보상 배지·유형, 합칠 때 있던 믹스 성공 기록·받지 않은 결과·
--   투데이 카드의 recipe_id와 «첫 성공» 표시.
-- 되돌려지지 않는 것: 합친 뒤에 생긴 믹스 성공 기록은 대표 레시피에 그대로 남는다(어느 등급 레시피였는지는 재료 등급으로 따로 가려야 한다).
--   대표 레시피에 합친 뒤 생긴 «첫 성공» 표시가 있으면 백업의 표시와 겹치지 않게 그 표시를 끄고 백업의 표시를 복원한다.
--
-- 롤백 실측: 이 파일 뒤에 일부러 오류를 내는 문장을 붙여 한 호출로 실행한다(DO $$ BEGIN RAISE EXCEPTION 'rollback-probe'; END $$;).

DO $unmerge$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.recipe_merge_backup_20261114_recipes;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'recipe_unmerge: 백업 표가 비어 있다 — 되돌릴 근거가 없다. 중단';
  END IF;

  -- 1. 지워진 레시피를 되살린다(열 구성이 달라도 되도록 jsonb로 옮긴다)
  INSERT INTO public.combination_recipes
  SELECT (jsonb_populate_record(NULL::public.combination_recipes, to_jsonb(b))).*
    FROM public.recipe_merge_backup_20261114_recipes b
   WHERE NOT EXISTS (SELECT 1 FROM public.combination_recipes r WHERE r.id = b.id);

  -- 2. 대표 레시피를 백업 상태로 되돌린다
  UPDATE public.combination_recipes r
     SET grade_mode = b.grade_mode,
         first_success_badge_id = b.first_success_badge_id,
         reward_badge_ids = b.reward_badge_ids
    FROM public.recipe_merge_backup_20261114_recipes b
   WHERE r.id = b.id;

  -- 3. 슬롯을 백업 상태로 되돌린다
  DELETE FROM public.combination_recipe_slots WHERE recipe_id IN (SELECT id FROM public.recipe_merge_backup_20261114_recipes);
  INSERT INTO public.combination_recipe_slots
  SELECT (jsonb_populate_record(NULL::public.combination_recipe_slots, to_jsonb(s))).*
    FROM public.recipe_merge_backup_20261114_slots s;

  -- 4. 참조를 되돌린다 — 첫 성공 표시는 모두 끄고 백업의 표시만 복원한다(부분 유일 인덱스와 겹치지 않게 순서를 지킨다)
  UPDATE public.user_combine_success_logs SET is_recipe_first = false
   WHERE is_recipe_first AND recipe_id IN (SELECT id FROM public.recipe_merge_backup_20261114_recipes);
  UPDATE public.user_combine_success_logs l SET recipe_id = b.recipe_id
    FROM public.recipe_merge_backup_20261114_success_logs b WHERE l.id = b.id;
  UPDATE public.user_combine_success_logs l SET is_recipe_first = true
    FROM public.recipe_merge_backup_20261114_success_logs b WHERE l.id = b.id AND b.is_recipe_first;
  UPDATE public.combine_pending_results p SET recipe_id = b.recipe_id
    FROM public.recipe_merge_backup_20261114_pending b WHERE p.id = b.id;
  UPDATE public.today_cards t SET recipe_id = b.recipe_id
    FROM public.recipe_merge_backup_20261114_cards b WHERE t.id = b.id;

  -- 5. 사후 검사
  SELECT count(*) INTO v_n FROM public.combination_recipes r
   WHERE r.id IN (SELECT id FROM public.recipe_merge_backup_20261114_recipes);
  IF v_n <> (SELECT count(*) FROM public.recipe_merge_backup_20261114_recipes) THEN
    RAISE EXCEPTION 'recipe_unmerge: 되살린 레시피 수가 백업과 다르다';
  END IF;
  IF EXISTS (SELECT 1 FROM public.combination_recipes WHERE id IN (SELECT id FROM public.recipe_merge_backup_20261114_recipes) AND grade_mode <> 'fixed') THEN
    RAISE EXCEPTION 'recipe_unmerge: 등급 대응형으로 남은 레시피가 있다';
  END IF;
  IF (SELECT count(*) FROM public.combination_recipe_slots WHERE recipe_id IN (SELECT id FROM public.recipe_merge_backup_20261114_recipes))
     <> (SELECT count(*) FROM public.recipe_merge_backup_20261114_slots) THEN
    RAISE EXCEPTION 'recipe_unmerge: 되살린 슬롯 수가 백업과 다르다';
  END IF;
END
$unmerge$;

-- 백업 표(recipe_merge_backup_20261114_*)는 복구 확인 뒤 사람이 지운다. 이 파일이 지우지 않는다.
