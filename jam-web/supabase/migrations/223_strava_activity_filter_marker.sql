-- 223_strava_activity_filter_marker.sql
-- 인정되지 않은 Strava 활동의 «걸러짐» 표시와 판정 원본 값 (티켓 20261017_1421, 운영 로직 3.3·3.4절)
--
-- strava_activities에 칸 2개를 더한다. 둘 다 NULL을 허용하고 기본값이 없어 기존 행(옛 프로덕션 코드가 쓰는 행 포함)에
-- 영향이 없다. 기존 칸의 뜻은 바꾸지 않고 옛 제약·인덱스·정책도 건드리지 않는다.
--
-- 규칙
--   - filter_reason: NULL이면 «인정된 활동», 값이 있으면 인정 기준을 못 갖춰 걸러진 활동이다. 걸러진 활동도 행은 남겨
--     같은 활동을 다음 동기화에서 다시 가져와 다시 거르는 낭비를 막는다(UNIQUE(user_id, strava_id)가 이미 있다).
--     새 코드는 이력 조회에서 filter_reason IS NULL인 행만 읽는다. 옛 프로덕션 코드는 이 칸을 읽지 않으므로 옛 동작 그대로다.
--     값의 목록은 코드(jam-web/src/lib/strava)가 정한다. 예: unsupported_sport, virtual, manual_entry, file_upload,
--     no_gps, too_short, vehicle_speed. 목록을 늘리려고 칸을 바꾸지 않도록 CHECK 제약을 두지 않는다.
--   - source_meta: 걸러진 판정에 쓴 Strava 원본 값의 요약(manual 표시, 업로드 번호 유무, 외부 ID의 모양, 경로 요약 유무,
--     시작 좌표 유무 등). 수동 입력·파일 업로드를 가르는 기준은 추정 기준으로 시작하므로, 나중에 실제 데이터로
--     기준을 검증하고 고칠 수 있게 판정 근거를 남긴다. 경로 요약 본문과 위치 좌표는 저장하지 않는다(유무만).
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'strava_activities'
--      AND column_name IN ('filter_reason', 'source_meta');                      -- 2행, 둘 다 nullable
--   SELECT count(*) FILTER (WHERE filter_reason IS NOT NULL) AS filtered,
--          count(*) FILTER (WHERE source_meta IS NOT NULL)  AS with_meta
--     FROM public.strava_activities;                                              -- 0, 0 (기존 행은 그대로)

ALTER TABLE public.strava_activities
  ADD COLUMN IF NOT EXISTS filter_reason TEXT,
  ADD COLUMN IF NOT EXISTS source_meta JSONB;

COMMENT ON COLUMN public.strava_activities.filter_reason IS
  'NULL이면 인정된 활동. 값이 있으면 인정 기준(운영 로직 3.3절)을 못 갖춰 걸러진 활동이며 이력 조회에서 뺀다. 값의 목록은 코드가 정한다(unsupported_sport, virtual, manual_entry, file_upload, no_gps, too_short, vehicle_speed 등).';
COMMENT ON COLUMN public.strava_activities.source_meta IS
  '걸러짐 판정에 쓴 Strava 원본 값의 요약(manual, 업로드 번호 유무, 외부 ID 모양, 경로 요약 유무, 시작 좌표 유무). 기준 검증용이며 경로 요약 본문과 좌표는 저장하지 않는다.';

-- 되돌림 SQL
-- 새로 만든 칸만 지운다. 걸러짐 표시와 판정 원본 값이 함께 사라지며, 이 칸을 읽는 새 코드(이력 조회의 filter_reason 조건)는
-- 같은 시점에 되돌려야 한다.
-- ALTER TABLE public.strava_activities DROP COLUMN IF EXISTS source_meta;
-- ALTER TABLE public.strava_activities DROP COLUMN IF EXISTS filter_reason;
