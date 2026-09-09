-- 티켓 20260909_2119: 온보딩 재설계 — 지역·운동종목 제거 (2단계: 컬럼 삭제)
--
-- ⚠️ 이 마이그레이션은 149번(faction_id·onboarding_completed_at 추가)과 별도 배포
-- 사이클로 실행해야 한다. 순서:
--   1) 149번 마이그레이션 + 이번 티켓의 신규 온보딩 코드를 배포
--   2) region·activity_types 참조 코드가 저장소에서 전부 제거된 상태로 배포·안정화 확인
--   3) 안정화 확인 후에만 이 마이그레이션을 실행한다.
--
-- ⚠️ 컬럼 삭제는 비가역이다 — 실행 직전 아래 스냅샷 쿼리 결과를 반드시 보관한다.
--
--   SELECT id, region, activity_types FROM public.users;
--
-- region·activity_types는 마이그레이션 001부터 존재했으나 입력 UI가 한 번도 만들어진
-- 적 없는 죽은 컬럼이었다(PRD에만 스펙으로 남아 실제 구현과 어긋나 있었음). 이번 티켓에서
-- PRD 삭제 + DB 컬럼 삭제 + 참조 코드 정리로 완전히 제거한다.

ALTER TABLE public.users
  DROP COLUMN IF EXISTS region,
  DROP COLUMN IF EXISTS activity_types;
