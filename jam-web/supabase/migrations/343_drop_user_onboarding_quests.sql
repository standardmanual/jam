-- 343: 온보딩 퀘스트 진행 테이블(user_onboarding_quests) 삭제
-- 티켓 20261115_2059(상위 20261115_2055) — 작성만, 실행은 메인 세션(오케스트레이터)이 한다.
--
-- 배경:
--   온보딩 퀘스트 기능을 서비스에서 걷었다(사용자 지시 2026-11-15). 코드는 이 테이블을 더 읽지도 쓰지도 않는다.
--   챕터 1 시작과 «JAM!» 완료 배지는 가입 완료(트라이브 선택) 시점으로 옮겼다(티켓 20261115_2056).
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다.
--    프로덕션(main)이 아직 퀘스트 코드를 쓰는 동안 실행하면 옛 코드의 조회가 실패한다
--    (조회 실패는 null로 처리돼 화면을 막지는 않지만 퀘스트 행 생성·완료 처리가 조용히 실패한다).
--    main 승격 순서는 사용자와 정한 뒤에 실행한다.
--
-- 순서: 백업 표 → 삭제. 백업 표는 복구 확인 뒤 사용자가 정해 지운다.
--
-- 되돌림: 343_drop_user_onboarding_quests_down.sql (195번 정의로 다시 만들고 백업 표에서 행을 복원한다).

BEGIN;

CREATE TABLE public.user_onboarding_quests_backup_20261115 AS
  SELECT * FROM public.user_onboarding_quests;

COMMENT ON TABLE public.user_onboarding_quests_backup_20261115 IS
  '온보딩 퀘스트 제거 전 user_onboarding_quests 전체 사본(티켓 20261115_2059). 복구 확인 뒤 삭제한다.';

-- 백업이 원본과 같은 행 수인지 확인한다. 다르면 전체를 되돌린다.
DO $$
DECLARE
  v_src BIGINT;
  v_bak BIGINT;
BEGIN
  SELECT count(*) INTO v_src FROM public.user_onboarding_quests;
  SELECT count(*) INTO v_bak FROM public.user_onboarding_quests_backup_20261115;
  IF v_src <> v_bak THEN
    RAISE EXCEPTION '백업 행 수 불일치: 원본 %, 백업 %', v_src, v_bak;
  END IF;
END
$$;

-- RLS 정책·코멘트·FK는 표와 함께 사라진다.
DROP TABLE public.user_onboarding_quests;

COMMIT;

-- ── 검증 쿼리 (실행 후 읽기 전용으로 확인) ────────────────────────────────────
-- SELECT to_regclass('public.user_onboarding_quests');                 -- NULL이어야 정상
-- SELECT count(*) FROM public.user_onboarding_quests_backup_20261115;  -- 실행 전 행 수와 같아야 정상(2026-11-15 실측 2)
