-- 305_shrink_old_fill_open_and_score_ledger.sql
-- DB 축소: 옛 채우기·열기 함수와 챕터 점수 장부를 지운다 (티켓 20261028_1742 3회, 상위 20261028_1730, 결정 D8)
--
-- 확장(300~304) → 전환(U8~U10과 U11 1·2회가 코드에서 옛 것을 걷음) → 축소(이 파일). 코드는 이미 staging에 배포돼 옛 함수·표를 읽거나 부르지 않는다.
-- 프로덕션 main은 이 객체들을 코드에서 쓰지 않는다(2026-10-31 `origin/main`의 jam-web/src 검색 0건).
--
-- 지우는 것
--   함수: capsule_fill(uuid, integer), capsule_open(uuid, jsonb), locked_item_fill(uuid, uuid, integer), locked_item_open(uuid, uuid),
--         jam_fill_decide(integer, bigint, integer)(locked_item_fill만 불렀다), chapter_add_score(uuid, text, uuid, integer, date),
--         capsule_next_required(uuid)(옛 v1, 아래 «동작이 바뀌는 곳»)
--   표:   chapter_score_events(0건), chapter_score_rules(12건)
-- 지우지 않는 것: capsule_open_counted, capsule_next_required_v2, capsule_get_or_create, capsule_auto_fill, capsule_claim_pending, capsule_hold_reward,
--   locked_item_open_points, chapter_start, 표 capsule_opens·user_capsules·user_chapters·chapter_ups·chapter_definitions·capsule_chapter_costs,
--   열 capsule_chapter_costs.fill_amount(옛 수동 채우기 값. 어드민 화면이 아직 편집하고, 지우는 결정은 이 티켓 밖이다),
--   inventory_items.unlock_required·unlock_filled, inventory_item_events.filled_after, jam_policy.locked_min_*(잠긴 개체 드랍 경로 결정 20261030_0947이 정한다).
--
-- 동작이 바뀌는 곳(사용자 확인 대상)
--   capsule_get_or_create가 캡슐 행이 없을 때 필요량을 정하려고 옛 capsule_next_required(v1, 옛 수동 채우기 값 90~220)를 불렀다.
--   새 흐름의 필요량은 capsule_next_required_v2(자동 채움 값 145~365)다. 이 파일은 capsule_get_or_create를 v2로 바꾼 뒤 v1을 지운다.
--   영향: 챕터가 있는데 캡슐 행이 아직 없는 유저의 «첫 캡슐 필요량»이 옛 값에서 새 값으로 바뀐다(퀘스트 전 유저는 두 함수 모두 pre_quest_fill_amount라 같다).
--   v2는 필요량을 정할 수 없으면 예외를 던진다(v1은 NULL을 넣으려다 NOT NULL로 실패했다).
--
-- 안전장치: chapter_score_events에 행이 있으면 예외로 멈춘다(지금 0건). 지우는 함수에 기대는 다른 객체가 있으면 DROP이 실패한다(CASCADE를 쓰지 않는다).
-- 되돌림: 305_shrink_old_fill_open_and_score_ledger_down.sql(짝 파일). 표와 12행, 함수 본문, 권한을 지우기 직전 상태 그대로 다시 만든다.

DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.chapter_score_events) > 0 THEN
    RAISE EXCEPTION '305: chapter_score_events에 행이 있어 지우지 않는다';
  END IF;
END
$guard$;

-- 1) capsule_get_or_create를 v2로 바꾼다(v1을 지우기 전에)
CREATE OR REPLACE FUNCTION public.capsule_get_or_create(p_user_id uuid)
 RETURNS user_capsules
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.user_capsules;
  v_next RECORD;
BEGIN
  SELECT * INTO v_row FROM public.user_capsules WHERE user_id = p_user_id;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT * INTO v_next FROM public.capsule_next_required_v2(p_user_id);

  INSERT INTO public.user_capsules (user_id, required, filled, chapter_no)
    VALUES (p_user_id, v_next.required, 0, v_next.chapter_no)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.user_capsules WHERE user_id = p_user_id;
  RETURN v_row;
END;
$function$;

-- 2) 옛 함수를 지운다(서로 부르는 순서: 부르는 쪽을 먼저)
DROP FUNCTION IF EXISTS public.capsule_fill(uuid, integer);
DROP FUNCTION IF EXISTS public.capsule_open(uuid, jsonb);
DROP FUNCTION IF EXISTS public.locked_item_fill(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.locked_item_open(uuid, uuid);
DROP FUNCTION IF EXISTS public.jam_fill_decide(integer, bigint, integer);
DROP FUNCTION IF EXISTS public.chapter_add_score(uuid, text, uuid, integer, date);
DROP FUNCTION IF EXISTS public.capsule_next_required(uuid);

-- 3) 점수 장부 표를 지운다(참조하는 쪽 events를 먼저)
DROP TABLE IF EXISTS public.chapter_score_events;
DROP TABLE IF EXISTS public.chapter_score_rules;

-- 되돌림 SQL
-- 짝 파일 305_shrink_old_fill_open_and_score_ledger_down.sql을 실행한다.
