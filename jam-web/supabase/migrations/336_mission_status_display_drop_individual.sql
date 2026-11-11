-- 336: 미션 틀(missions.status_display_type)에서 'individual'(개인형)을 없애고 ranking·achievement 두 값으로 좁힌다
-- 티켓 20261111_0900 (축소 단계). 개인형은 달성형으로 통합했고, 코드는 이미 'individual'을 쓰지도 읽지도 않는다.
--
-- 적용 순서: 코드(티켓 20261111_0900)가 프로덕션에 배포된 뒤에 적용한다.
--   옛 코드(어드민 게이트 미션 폼의 기본값이 'individual')가 도는 동안 이 제약을 좁히면 그 폼의 저장이 실패한다.
-- 사전 점검: 'individual' 행이 있으면 멈춘다(2026-11-11 실측: 0건. 값은 ranking 2건·achievement 6건).
--   제약 없는 백업 표 bak20260907_missions_pre_v5_cleanup 은 건드리지 않는다.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.missions WHERE status_display_type = 'individual') THEN
    RAISE EXCEPTION 'missions.status_display_type = individual 행이 남아 있다. 먼저 achievement로 옮겨라.';
  END IF;
END $$;

ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_status_display_type_check;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_status_display_type_check
  CHECK (status_display_type IN ('ranking', 'achievement'));

-- 되돌림 SQL
-- ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_status_display_type_check;
-- ALTER TABLE public.missions ADD CONSTRAINT missions_status_display_type_check
--   CHECK (status_display_type IN ('ranking', 'achievement', 'individual'));
