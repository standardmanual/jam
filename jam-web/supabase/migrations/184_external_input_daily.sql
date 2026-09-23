-- 184: 외부 입력(날씨·특일) 일일값 저장 테이블(external_input_daily) 신규
-- 티켓 20260924_0602 — 확장 단계(파일 작성만, 실행은 사용자 승인 후 오케스트레이터)
--
-- 배경:
--   날씨·특일 값이 서버리스 인스턴스의 모듈 변수에만 캐시돼 인스턴스가 새로 뜰 때마다 카드 조회가
--   외부 API를 직접 기다린다(티켓 20260923_2333). 사전 갱신(cron)과 카드 조회가 서로 다른
--   인스턴스에서 돌아서 인스턴스 밖 공유 저장소가 필요하다. 이 파일은 스키마만 연다 —
--   읽기·쓰기 코드는 후속 티켓 20260923_2333이 맡는다(새 테이블을 읽는 코드가 아직 없어 영향 없음).
--
-- 설계:
--   - 행은 (kind, date_kst)당 하나. kind는 'weather' · 'special_days' 둘 중 하나(CHECK).
--   - date_kst: 한국 표준시 기준 날짜(DATE).
--   - value: JSONB. 날씨면 {"kind":"clear"|"mild"|"rain"|"extreme"}, 특일이면 정규화된 특일 배열.
--     특일 배열의 형태는 2333에서 정하므로 여기서는 값 형태에 CHECK를 걸지 않는다.
--   - fetched_at: 외부 API에서 값을 받아온 시각.
--   - 유저 식별자 컬럼 없음.
--   - RLS: 켜되 정책은 만들지 않는다(183의 today_card_events와 같은 패턴). service_role은 RLS를
--     우회하므로 anon/authenticated만 기본 거부된다 — 쓰기·읽기는 서비스 롤 전용.
--   - 오래된 행 정리는 범위 밖(하루 2건, 1년 730건).
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터(또는 사용자가 SQL 편집기에서 직접)가 처리한다.
--
-- 재실행 가능(idempotent): CREATE TABLE IF NOT EXISTS · DROP CONSTRAINT IF EXISTS로 작성했다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.external_input_daily (
  kind        TEXT        NOT NULL,
  date_kst    DATE        NOT NULL,
  value       JSONB       NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, date_kst)
);

ALTER TABLE public.external_input_daily DROP CONSTRAINT IF EXISTS external_input_daily_kind_check;
ALTER TABLE public.external_input_daily ADD CONSTRAINT external_input_daily_kind_check
  CHECK (kind IN ('weather', 'special_days'));

-- RLS: 정책을 만들지 않는다 = anon/authenticated 전부 거부, service_role만 접근.
ALTER TABLE public.external_input_daily ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.external_input_daily IS
  '외부 입력(날씨 구분·특일 목록) 하루 단위 저장값(티켓 20260924_0602). 사전 갱신 cron이 쓰고 카드 조회가 읽는다(서비스 롤 전용, 후속 티켓 20260923_2333). 유저 식별자 없음.';
COMMENT ON COLUMN public.external_input_daily.date_kst IS
  '한국 표준시 기준 날짜.';
COMMENT ON COLUMN public.external_input_daily.value IS
  'kind=weather면 {"kind":"clear"|"mild"|"rain"|"extreme"}, kind=special_days면 정규화된 특일 배열(형태는 티켓 20260923_2333에서 확정).';
COMMENT ON COLUMN public.external_input_daily.fetched_at IS
  '외부 API에서 값을 받아온 시각.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 테이블·기본키·CHECK가 만들어졌는지
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.external_input_daily'::regclass;
--
-- -- ② RLS가 켜졌고 정책이 없는지(= anon/authenticated 접근 불가)
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'external_input_daily';
-- SELECT policyname FROM pg_policies WHERE tablename = 'external_input_daily'; -- 0행이어야 정상

-- 되돌림 SQL
-- DROP TABLE IF EXISTS public.external_input_daily;
