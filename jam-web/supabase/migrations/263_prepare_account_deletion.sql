-- 263_prepare_account_deletion.sql
-- JAM 2.0 퇴장: 계정을 지우기 전에 한 트랜잭션으로 하는 준비 함수와, 만료된 보관 행을 지우는 함수 (티켓 20261021_1249 1회, 운영 로직 17.2·17.5절)
--
-- 새 함수 2개만 덧붙인다. 옛 테이블·옛 트리거(trg_log_orphan_custody_events, 마이그레이션 108)·옛 제약(custody_events_event_type_check)은 바꾸지 않는다.
-- 262_retained_records.sql(보관 표)을 먼저 적용해야 한다.
--
-- 유저 탈퇴·어드민 삭제·«그래도 연결하기»의 기존 계정 지우기는 모두 앱의 deleteAccount(lib/account/delete-account.ts)가 같은 순서로 한다:
--   (가) prepare_account_deletion  (나) 아바타 파일 삭제  (다) auth.admin.deleteUser(→ 외래키 CASCADE가 나머지를 지운다)
--
-- prepare_account_deletion(p_user_id) → jsonb — 다시 불러도 안전하다(두 번째 호출은 모든 건수가 0).
--   (a) users 행을 FOR UPDATE로 잠근다(같은 유저를 동시에 준비하는 호출을 직렬화한다). 행이 없으면 {found:false}를 돌려주고 아무것도 바꾸지 않는다.
--   (b) 보관 복사(retained_records, ON CONFLICT (kind, source_id) DO NOTHING) — 이미 기간이 지난 기록은 복사하지 않는다.
--         checkin_earn  user_checkin_badge_earns  earned_at이 최근 6개월  detail = poi_id·badge_id·strava_activity_id
--         poi_view      poi_views                 viewed_at이 최근 6개월    detail = poi_id
--         poi_drop      poi_drops(dropper_user_id)  dropped_at이 최근 6개월   detail = poi_id·badge_id
--         poi_pickup    poi_drops(picked_up_by)     picked_up_at이 최근 6개월 detail = poi_id·badge_id
--         abuse_log     abusing_logs              created_at이 최근 3개월   detail = event_type·detail(탐지 시점 좌표 포함)
--       retained_until = 기록 시각 + 기간(확인자료 6개월, abuse_log 3개월). 좌표·활동 이름·거리는 확인자료에 담지 않는다.
--   (c) custody_events의 from_username·to_username·actor_username을 해당 *_user_id가 이 유저인 행에서 NULL로 비운다(운영 로직 17.2: 지울 때 이름을 지운다).
--       이미 지워진 유저의 옛 스냅샷은 user id가 비어 있어 이 함수가 찾을 수 없다.
--   (d) 이 유저 인벤토리의 destroyed_at IS NULL 아이템마다 custody_events에 기존 'Orphan' 이벤트(from_user_id = 유저, 이름 NULL)를 넣고 destroyed_at = now()로 «없어짐» 처리한다(운영 로직 17.5).
--       새 이벤트 종류를 만들지 않는다(custody_events_event_type_check를 바꾸지 않는다). 일련번호는 destroyed_at이 채워지므로 다시 쓰이지 않는다(assign_random_serial의 조건이 destroyed_at IS NULL).
--       옛 트리거는 destroyed_at IS NULL인 소유 아이템에만 이름을 남기므로, 이 함수를 거친 유저에게는 이름을 새로 남기지 않는다.
--       이 함수를 거치지 않고 Supabase 화면에서 직접 지우는 경우는 옛 동작 그대로다(알려진 틈).
--   (e) 건수 요약을 돌려준다.
--       {found:true, retained:{checkin_earn, poi_view, poi_drop, poi_pickup, abuse_log}, custody_rows_cleared, vanished_items}
--       {found:false}
--   기간을 바꾸면(법무 확인, 티켓 20260929_1303) 이 함수의 INTERVAL과 앱의 lib/account/retention.ts를 함께 고친다. 앱 시험이 두 곳이 같은지 확인한다.
--
-- purge_expired_retained_records() → integer — retained_until <= now()인 행을 지우고 지운 수를 돌려준다. 호출하는 크론은 같은 묶음 2회에서 만든다.
--
-- 두 함수 모두 SECURITY DEFINER, search_path 고정, service_role만 실행한다(anon·authenticated·PUBLIC 권한 회수).
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT proname, prosecdef FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--    AND proname IN ('prepare_account_deletion', 'purge_expired_retained_records');                                  -- 2행, prosecdef = true
--   SELECT has_function_privilege('authenticated','public.prepare_account_deletion(uuid)','EXECUTE'),
--          has_function_privilege('anon','public.prepare_account_deletion(uuid)','EXECUTE'),
--          has_function_privilege('service_role','public.prepare_account_deletion(uuid)','EXECUTE');                 -- false, false, true
--   SELECT has_function_privilege('authenticated','public.purge_expired_retained_records()','EXECUTE'),
--          has_function_privilege('service_role','public.purge_expired_retained_records()','EXECUTE');               -- false, true

CREATE OR REPLACE FUNCTION public.prepare_account_deletion(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checkin  INTEGER := 0;
  v_view     INTEGER := 0;
  v_drop     INTEGER := 0;
  v_pickup   INTEGER := 0;
  v_abuse    INTEGER := 0;
  v_cleared  INTEGER := 0;
  v_vanished INTEGER := 0;
BEGIN
  -- (a) 유저 행 잠금. p_user_id가 NULL이거나 없는 유저면 아무것도 하지 않는다.
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- (b) 보관 복사 — 위치정보 확인자료 6개월
  INSERT INTO public.retained_records (kind, source_id, subject_user_id, occurred_at, detail, retained_until)
  SELECT 'checkin_earn', e.id, e.user_id, e.earned_at,
         jsonb_build_object('poi_id', e.poi_id, 'badge_id', e.badge_id, 'strava_activity_id', e.triggered_by_strava_id),
         e.earned_at + INTERVAL '6 months'
  FROM public.user_checkin_badge_earns e
  WHERE e.user_id = p_user_id
    AND e.earned_at >= now() - INTERVAL '6 months'
  ON CONFLICT (kind, source_id) DO NOTHING;
  GET DIAGNOSTICS v_checkin = ROW_COUNT;

  INSERT INTO public.retained_records (kind, source_id, subject_user_id, occurred_at, detail, retained_until)
  SELECT 'poi_view', v.id, v.user_id, v.viewed_at,
         jsonb_build_object('poi_id', v.poi_id),
         v.viewed_at + INTERVAL '6 months'
  FROM public.poi_views v
  WHERE v.user_id = p_user_id
    AND v.viewed_at >= now() - INTERVAL '6 months'
  ON CONFLICT (kind, source_id) DO NOTHING;
  GET DIAGNOSTICS v_view = ROW_COUNT;

  INSERT INTO public.retained_records (kind, source_id, subject_user_id, occurred_at, detail, retained_until)
  SELECT 'poi_drop', d.id, d.dropper_user_id, d.dropped_at,
         jsonb_build_object('poi_id', d.poi_id, 'badge_id', d.badge_id),
         d.dropped_at + INTERVAL '6 months'
  FROM public.poi_drops d
  WHERE d.dropper_user_id = p_user_id
    AND d.dropped_at >= now() - INTERVAL '6 months'
  ON CONFLICT (kind, source_id) DO NOTHING;
  GET DIAGNOSTICS v_drop = ROW_COUNT;

  INSERT INTO public.retained_records (kind, source_id, subject_user_id, occurred_at, detail, retained_until)
  SELECT 'poi_pickup', d.id, d.picked_up_by, d.picked_up_at,
         jsonb_build_object('poi_id', d.poi_id, 'badge_id', d.badge_id),
         d.picked_up_at + INTERVAL '6 months'
  FROM public.poi_drops d
  WHERE d.picked_up_by = p_user_id
    AND d.picked_up_at IS NOT NULL
    AND d.picked_up_at >= now() - INTERVAL '6 months'
  ON CONFLICT (kind, source_id) DO NOTHING;
  GET DIAGNOSTICS v_pickup = ROW_COUNT;

  -- (b) 보관 복사 — 부정 이용 탐지 기록 3개월
  INSERT INTO public.retained_records (kind, source_id, subject_user_id, occurred_at, detail, retained_until)
  SELECT 'abuse_log', l.id, l.user_id, l.created_at,
         jsonb_build_object('event_type', l.event_type, 'detail', l.detail),
         l.created_at + INTERVAL '3 months'
  FROM public.abusing_logs l
  WHERE l.user_id = p_user_id
    AND l.created_at >= now() - INTERVAL '3 months'
  ON CONFLICT (kind, source_id) DO NOTHING;
  GET DIAGNOSTICS v_abuse = ROW_COUNT;

  -- (c) 이력의 이름 칸 비우기 — 짝 *_user_id가 이 유저인 칸만, 이미 비어 있는 칸은 건드리지 않는다
  UPDATE public.custody_events
  SET from_username  = CASE WHEN from_user_id  = p_user_id THEN NULL ELSE from_username  END,
      to_username    = CASE WHEN to_user_id    = p_user_id THEN NULL ELSE to_username    END,
      actor_username = CASE WHEN actor_user_id = p_user_id THEN NULL ELSE actor_username END
  WHERE (from_user_id  = p_user_id AND from_username  IS NOT NULL)
     OR (to_user_id    = p_user_id AND to_username    IS NOT NULL)
     OR (actor_user_id = p_user_id AND actor_username  IS NOT NULL);
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  -- (d) «없어짐» 처리 — 소유한 살아 있는 아이템에 Orphan 이벤트를 남기고 destroyed_at을 채운다
  WITH vanishing AS (
    UPDATE public.inventory_items ii
    SET destroyed_at = now()
    FROM public.inventory inv
    WHERE inv.id = ii.inventory_id
      AND inv.user_id = p_user_id
      AND ii.destroyed_at IS NULL
    RETURNING ii.id
  )
  INSERT INTO public.custody_events (inventory_item_id, event_type, from_user_id)
  SELECT vanishing.id, 'Orphan', p_user_id FROM vanishing;
  GET DIAGNOSTICS v_vanished = ROW_COUNT;

  -- (e) 건수 요약
  RETURN jsonb_build_object(
    'found', true,
    'retained', jsonb_build_object(
      'checkin_earn', v_checkin,
      'poi_view', v_view,
      'poi_drop', v_drop,
      'poi_pickup', v_pickup,
      'abuse_log', v_abuse
    ),
    'custody_rows_cleared', v_cleared,
    'vanished_items', v_vanished
  );
END;
$$;

COMMENT ON FUNCTION public.prepare_account_deletion(UUID) IS
  '계정 삭제 준비(한 트랜잭션, 다시 불러도 안전): 법정 보관 기록을 retained_records로 복사하고, 이 유저의 이력 이름 칸을 비우고, 소유 아이템을 Orphan 이벤트와 함께 없어짐 처리한다. 계정 삭제 자체는 하지 않는다. service_role 전용. 티켓 20261021_1249.';

REVOKE ALL ON FUNCTION public.prepare_account_deletion(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_account_deletion(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_retained_records()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.retained_records WHERE retained_until <= now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.purge_expired_retained_records() IS
  '보관 기간(retained_until)이 지난 retained_records 행을 지우고 지운 수를 돌려준다. 하루 한 번 크론이 부른다. service_role 전용. 티켓 20261021_1249.';

REVOKE ALL ON FUNCTION public.purge_expired_retained_records() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_retained_records() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_retained_records() TO service_role;

-- 되돌림 SQL
-- 이 함수를 부르는 앱 코드(lib/account/delete-account.ts)를 먼저 되돌린다. 앱이 남아 있으면 준비 단계가 실패해 계정을 지울 수 없다.
-- 이미 준비 함수를 거친 유저의 결과(없어짐 처리된 아이템, 비워진 이력 이름, retained_records 행)는 함수를 지워도 되돌아오지 않는다. retained_records 행은 262를 되돌릴 때 확인한다.
-- DROP FUNCTION IF EXISTS public.purge_expired_retained_records();
-- DROP FUNCTION IF EXISTS public.prepare_account_deletion(UUID);
