-- 305_shrink_old_fill_open_and_score_ledger.sql
-- DB 축소: 옛 채우기·열기 함수와 챕터 점수 장부를 지운다 (티켓 20261028_1742 3회, 상위 20261028_1730, 결정 D8)
--
-- 확장(300~304) → 전환(U8~U10과 U11 1·2회가 코드에서 옛 것을 걷음) → 축소(이 파일). 코드는 이미 staging에 배포돼 아래 함수·표를 읽거나 부르지 않는다.
-- 프로덕션 main도 이 객체들을 코드에서 쓰지 않는다(2026-10-31 `origin/main`의 jam-web/src 검색 0건).
-- 지우기 전에 살아 있는 모든 함수 본문(pg_proc.prosrc)과 뷰에서 이 객체를 부르는 곳을 전수 검색했다(2026-10-31). 호출하는 곳이 없는 것만 지운다.
--
-- 지우는 것
--   함수: capsule_fill(uuid, integer), locked_item_fill(uuid, uuid, integer), locked_item_open(uuid, uuid),
--         jam_fill_decide(integer, bigint, integer)(locked_item_fill만 불렀다), chapter_add_score(uuid, text, uuid, integer, date)
--   표:   chapter_score_events(0건), chapter_score_rules(12건)(둘 다 chapter_add_score만 읽고 썼다)
--   capsule_auto_fill·jam_apply 본문에 «capsule_fill»이 나오지만 잼 원장 사유 문자열이다(함수 호출이 아니다). 사유 값은 지난 원장 줄과 호환되도록 그대로 둔다.
--
-- 지우지 않는 것(2026-10-31 전수 검색으로 확인한 이유)
--   capsule_open(uuid, jsonb): 새 흐름 함수 capsule_open_counted가 본문에서 호출한다(301·302). 그 함수를 자기완결형으로 다시 쓰기 전에는 지울 수 없다(후속).
--   capsule_next_required(uuid)(옛 v1): capsule_open과 capsule_get_or_create가 호출한다. 이 파일은 capsule_get_or_create를 바꾸지 않는다.
--   capsule_open_counted, capsule_next_required_v2, capsule_get_or_create, capsule_auto_fill, capsule_claim_pending, capsule_hold_reward,
--   locked_item_open_points, chapter_start, 표 capsule_opens·user_capsules·user_chapters·chapter_ups·chapter_definitions·capsule_chapter_costs,
--   열 capsule_chapter_costs.fill_amount(옛 수동 채우기 값. 어드민 화면이 아직 편집한다),
--   inventory_items.unlock_required·unlock_filled, inventory_item_events.filled_after, jam_policy.locked_min_*(잠긴 개체 드랍 경로 결정 20261030_0947이 정한다).
--
-- 동작이 바뀌는 곳: 없다. 지우는 것은 호출하는 곳이 없는 함수와 표뿐이다.
--
-- 안전장치: chapter_score_events에 행이 있으면 예외로 멈춘다(지금 0건). CASCADE를 쓰지 않으므로 지우는 객체에 기대는 다른 객체가 있으면 DROP이 실패한다.
-- 되돌림: 305_shrink_old_fill_open_and_score_ledger_down.sql(짝 파일). 표와 12행, 함수 본문, 권한을 지우기 직전 상태 그대로 다시 만든다.

DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.chapter_score_events) > 0 THEN
    RAISE EXCEPTION '305: chapter_score_events에 행이 있어 지우지 않는다';
  END IF;
END
$guard$;

-- 1) 옛 함수를 지운다(서로 부르는 순서: 부르는 쪽을 먼저)
DROP FUNCTION IF EXISTS public.capsule_fill(uuid, integer);
DROP FUNCTION IF EXISTS public.locked_item_fill(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.locked_item_open(uuid, uuid);
DROP FUNCTION IF EXISTS public.jam_fill_decide(integer, bigint, integer);
DROP FUNCTION IF EXISTS public.chapter_add_score(uuid, text, uuid, integer, date);

-- 2) 점수 장부 표를 지운다(참조하는 쪽 events를 먼저)
DROP TABLE IF EXISTS public.chapter_score_events;
DROP TABLE IF EXISTS public.chapter_score_rules;

-- 되돌림 SQL
-- 짝 파일 305_shrink_old_fill_open_and_score_ledger_down.sql을 실행한다.
