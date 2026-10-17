-- 226_jam_policy.sql
-- JAM 2.0 잼 정산의 조정 값 (티켓 20261017_1423, 운영 로직 4.2·4.4·16.3절)
--
-- 새 테이블 1개(jam_policy, 한 행 싱글톤)만 추가한다. drop_policy·abusing_policy·inventory_policy와 같은 패턴이다
-- (id=1 고정, RLS만 켜고 정책은 두지 않아 service_role만 접근한다). 기존 객체는 건드리지 않는다.
-- 어드민 화면은 묶음 7이 만든다. 그 전에 값을 고치려면 SQL로 바꾼다. 다음 하위 티켓(2-4 아이템 배지 발급)이 같은
-- 테이블에 칸을 더한다.
--
-- 규칙
--   - intensity_light/normal/hard: 잼 = 강도 배율 × 움직인 시간(분, 내림). 가벼움(걷기·전기자전거) 1, 보통(등산·자전거) 2,
--     격함(러닝·트레일러닝) 3(운영 로직 4.2절 표). src/lib/jam/ 정산 코드의 기본값과 같은 값을 유지한다.
--   - mass_earn_alert_*: 한 번의 동기화로 받은 잼이 그 유저의 지난 N주 주간 평균의 multiplier배를 넘으면 운영툴의 중단 신호로
--     띄운다(운영 로직 16.3절: 기본 4주, 3배). 지난 기록이 없는 유저는 no_history_amount(기본 1,200 = 보통 강도로 10시간)를
--     넘으면 띄운다. 자동 제재는 하지 않는다. 기준값은 정식 오픈 뒤 데이터로 맞춘다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT * FROM public.jam_policy;     -- 1행: 1, 2, 3, 3, 4, 1200
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.jam_policy'::regclass;   -- true

CREATE TABLE IF NOT EXISTS public.jam_policy (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  intensity_light INTEGER NOT NULL DEFAULT 1 CHECK (intensity_light >= 0),
  intensity_normal INTEGER NOT NULL DEFAULT 2 CHECK (intensity_normal >= 0),
  intensity_hard INTEGER NOT NULL DEFAULT 3 CHECK (intensity_hard >= 0),
  mass_earn_alert_multiplier NUMERIC(5, 2) NOT NULL DEFAULT 3 CHECK (mass_earn_alert_multiplier > 0),
  mass_earn_alert_weeks INTEGER NOT NULL DEFAULT 4 CHECK (mass_earn_alert_weeks >= 1),
  mass_earn_alert_no_history_amount INTEGER NOT NULL DEFAULT 1200 CHECK (mass_earn_alert_no_history_amount >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 다른 어드민 전용 싱글톤 정책 테이블과 동일하게 RLS를 켜고 정책은 두지 않는다 = service_role만 접근 가능
ALTER TABLE public.jam_policy ENABLE ROW LEVEL SECURITY;

INSERT INTO public.jam_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.jam_policy IS
  '잼 정산의 조정 값(한 행 싱글톤). 강도 배율(가벼움·보통·격함)과 대량 수령 경보 기준. service_role 전용. 어드민 화면은 묶음 7.';
COMMENT ON COLUMN public.jam_policy.intensity_light IS '가벼움(걷기, 전기자전거) 강도 배율. 기본 1.';
COMMENT ON COLUMN public.jam_policy.intensity_normal IS '보통(등산, 자전거) 강도 배율. 기본 2.';
COMMENT ON COLUMN public.jam_policy.intensity_hard IS '격함(러닝, 트레일러닝) 강도 배율. 기본 3.';
COMMENT ON COLUMN public.jam_policy.mass_earn_alert_multiplier IS '한 번의 동기화로 받은 잼이 지난 N주 주간 평균의 이 배수를 넘으면 경보. 기본 3.';
COMMENT ON COLUMN public.jam_policy.mass_earn_alert_weeks IS '경보 비교에 쓰는 지난 기간(주). 기본 4.';
COMMENT ON COLUMN public.jam_policy.mass_earn_alert_no_history_amount IS '지난 기록이 없는 유저의 경보 기준 잼. 기본 1,200(보통 강도 10시간).';

-- 되돌림 SQL
-- 새로 만든 테이블만 지운다. 이 테이블을 읽는 새 코드(src/lib/jam/ 정산, 대량 수령 경보)는 같은 시점에 되돌려야 한다.
-- DROP TABLE IF EXISTS public.jam_policy;
