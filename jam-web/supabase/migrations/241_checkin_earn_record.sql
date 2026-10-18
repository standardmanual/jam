-- 241_checkin_earn_record.sql
-- JAM 2.0 체크인 배지의 방문 기록과 «처음 받는지» 판정을 한 번에 한다 (티켓 20261018_1814, 운영 로직 11장)
--
-- 지금 앱(sync.ts processFetchedActivities)은 같은 배지의 이전 방문 수를 먼저 세고(visitCount), 그다음 user_checkin_badge_earns에 한 줄을 넣는다.
-- 두 단계가 따로라서, 같은 유저의 서로 다른 활동이 동시에 동기화되면 두 활동이 모두 이전 방문 0건을 보고 둘 다 «처음»으로 판정될 수 있다.
-- 처음 받을 때 포인트를 주려면 «처음»이 정확히 한 번만 나와야 하므로, 새 함수 하나가 유저·배지 단위 잠금 안에서 세고 넣고 결과를 돌려준다.
--
-- 새 함수 하나만 더한다. 옛 테이블·옛 칸·옛 제약은 바꾸지 않는다(옛 프로덕션 코드는 이 함수를 쓰지 않고 예전처럼 직접 넣는다).
-- 포인트 지급은 이 함수 안에서 하지 않는다. 앱이 is_first=true일 때 awardPoints를 불러 포인트 알림·실패 기록을 그대로 쓴다.
--
-- 규칙
--   - 같은 유저·배지에 대한 호출은 pg_advisory_xact_lock으로 순서대로 처리된다(다른 유저·다른 배지는 서로 기다리지 않는다).
--   - 같은 활동·장소·배지를 다시 넣으면(UNIQUE (user_id, badge_id, poi_id, triggered_by_strava_id)) 새 줄을 만들지 않고 {ok:true, duplicate:true}를 돌려준다.
--   - 새 줄이 만들어지면 visit_count는 그 유저가 이 배지로 가진 줄 수(방금 넣은 줄 포함), is_first는 visit_count = 1이다.
--   - 공개 기간 판정은 하지 않는다(앱이 활동 시작 시각으로 판정한 뒤 이 함수를 부른다). 이용 정지 판정도 앱이 한다.
--   - 서버(service_role)만 실행한다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'record_checkin_earn';                                                      -- 1행, true
--   SELECT has_function_privilege('authenticated', 'public.record_checkin_earn(uuid, uuid, uuid, bigint, text, numeric, timestamptz)', 'EXECUTE');  -- false

CREATE OR REPLACE FUNCTION public.record_checkin_earn(
  p_user_id UUID,
  p_badge_id UUID,
  p_poi_id UUID,
  p_strava_id BIGINT,
  p_activity_name TEXT,
  p_distance_km NUMERIC,
  p_activity_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prior INTEGER;
  v_inserted UUID;
BEGIN
  -- 같은 유저·배지의 호출을 한 줄로 세운다(트랜잭션이 끝나면 풀린다).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_badge_id::text, 0));

  SELECT count(*) INTO v_prior
    FROM public.user_checkin_badge_earns
   WHERE user_id = p_user_id AND badge_id = p_badge_id;

  INSERT INTO public.user_checkin_badge_earns (
    user_id, badge_id, poi_id,
    triggered_by_strava_id, triggered_by_activity_name, triggered_by_distance_km, triggered_by_activity_date
  )
  VALUES (
    p_user_id, p_badge_id, p_poi_id,
    p_strava_id, p_activity_name, p_distance_km, p_activity_date
  )
  ON CONFLICT (user_id, badge_id, poi_id, triggered_by_strava_id) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'duplicate', TRUE);
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'duplicate', FALSE,
    'earn_id', v_inserted,
    'visit_count', v_prior + 1,
    'is_first', (v_prior = 0)
  );
END;
$function$;

COMMENT ON FUNCTION public.record_checkin_earn(UUID, UUID, UUID, BIGINT, TEXT, NUMERIC, TIMESTAMPTZ) IS
  '체크인 배지 방문 기록을 한 줄 넣고 처음 받는지(is_first)와 방문 수를 돌려준다. 유저·배지 단위 잠금 안에서 세고 넣어 «처음»이 한 번만 나온다. 포인트 지급은 앱이 한다. service_role 전용.';

REVOKE ALL ON FUNCTION public.record_checkin_earn(UUID, UUID, UUID, BIGINT, TEXT, NUMERIC, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_checkin_earn(UUID, UUID, UUID, BIGINT, TEXT, NUMERIC, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_checkin_earn(UUID, UUID, UUID, BIGINT, TEXT, NUMERIC, TIMESTAMPTZ) TO service_role;

-- 되돌림 SQL
-- 새 함수만 지운다. 이 함수로 만든 방문 기록 줄은 옛 방식으로 넣은 줄과 같은 테이블·같은 모양이라 그대로 남는다.
-- 이 함수를 쓰는 새 코드(체크인 방문 기록·처음 받을 때 포인트)는 같은 시점에 되돌려야 한다.
-- DROP FUNCTION IF EXISTS public.record_checkin_earn(UUID, UUID, UUID, BIGINT, TEXT, NUMERIC, TIMESTAMPTZ);
