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

-- 실행 기록: 2026-09-29 KST, 티켓 20260929_1326에서 사용자 승인 후 카리나가 Supabase MCP로 실행.
-- 실행 전 확인: 두 컬럼에 의존하는 뷰·함수·RLS 정책 없음, 저장소 참조 코드 없음(users 기준).
-- 실행 직전 스냅샷(전체 8명 중 기본값이 아닌 4명, 나머지 4명은 region='' · activity_types='{}'):
--   00000000-0000-0000-0000-000000000002 | 서울       | {cycling,running}
--   00000000-0000-0000-0000-000000000003 | 부산       | {hiking,running,walking}
--   00000000-0000-0000-0000-000000000004 | 제주       | {cycling,hiking}
--   3649ed39-2be2-402e-82ae-41e0cd328105 | 서울특별시 | {running,cycling,walking,hiking}
--
-- 되돌림 SQL(001 정의 복원 + 스냅샷 값 복원):
--   ALTER TABLE public.users
--     ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT '',
--     ADD COLUMN IF NOT EXISTS activity_types TEXT[] NOT NULL DEFAULT '{}';
--   UPDATE public.users SET region = v.region, activity_types = v.activity_types
--   FROM (VALUES
--     ('00000000-0000-0000-0000-000000000002'::uuid, '서울', ARRAY['cycling','running']),
--     ('00000000-0000-0000-0000-000000000003'::uuid, '부산', ARRAY['hiking','running','walking']),
--     ('00000000-0000-0000-0000-000000000004'::uuid, '제주', ARRAY['cycling','hiking']),
--     ('3649ed39-2be2-402e-82ae-41e0cd328105'::uuid, '서울특별시', ARRAY['running','cycling','walking','hiking'])
--   ) AS v(id, region, activity_types)
--   WHERE public.users.id = v.id;
