-- 143: POI 네이버 원본 분류 검증 게이트 + 어드민 검토 큐 (티켓 20260907_1242)
--
-- 배경:
--   네이버 지역검색 오픈API는 좌표/반경 파라미터가 없어 "{지역명} {키워드}" 형태로 검색한다
--   (src/lib/poi/naver.ts). 해당 지역에 대상이 없으면 네이버는 빈 결과 대신 무관한 장소를
--   반환하는데, 지금까지는 네이버가 함께 내려주는 원본 분류 문자열(item.category)을 검증 없이
--   버리고 우리가 지정한 카테고리를 그대로 붙여 저장했다. 실측(2026-09-07, 프로덕션 DB):
--   nature 카테고리 자동수집 16건 중 실제 자연 장소는 2건뿐(오염률 87.5%).
--
-- 이 마이그레이션이 하는 일:
--   1) poi.naver_category   — 네이버 응답 원본 분류 문자열(가공 없이 저장). 수동 등록(T1)
--      POI는 NULL.
--   2) poi.naver_keyword    — 이 POI를 찾는 데 실제로 쓰인 네이버 검색 키워드. 같은 카테고리도
--      키워드별로 오염 패턴이 달라 판정 기준 보정에 필요(검토 큐 화면 "수집 키워드" 컬럼).
--      수동 등록(T1)은 NULL.
--   3) poi.pending_review   — 수집 시 3단계 판정(자동승인/자동거부/검토대기) 중 "검토대기"로
--      저장된 행 표시. 자동거부는 애초에 INSERT하지 않으므로 이 컬럼에 나타나지 않는다.
--      노출 여부(is_active)와는 분리된 개념이다 — 검토 대기 중에도 게이트 통과분과 동일하게
--      노출된다(승인 전 전면 비노출은 신규 지역 첫 유저에게 빈 지도를 보여주는 문제가 있어
--      기각, 티켓 완료기록 참고). 즉 pending_review는 "어드민 검토 큐에 남아있는가"만 표시한다.
--   4) poi_categories.requires_review — 카테고리별로 이 게이트 자체를 적용할지 어드민이 켜고
--      끌 수 있는 스위치. 기본 꺼짐 — 켜지 않은 카테고리는 기존처럼 무조건 자동 저장된다
--      (지도 노출 카테고리 위주로 켜는 것을 권장, 비노출 카테고리는 당장 급하지 않음).
--   5) poi_categories에 'unassigned'(미분류) 카테고리 시드 — 검토 큐에서 "거부"된 POI를
--      삭제하지 않고 이관해 보관하는 홀딩 카테고리(재현 데이터로 판정 기준 보정에 재사용).
--      pipeline_linked=false·requires_review=false라 자동수집·검토 큐 어느 쪽에도 다시
--      나타나지 않는다.
--
-- 범위:
--   이번 마이그레이션은 스키마 변경 + 카테고리 시드뿐이다. 판정 로직(카테고리별 허용 분류
--   패턴)은 src/lib/poi/category-gate.ts에 하드코딩 상수로 시작하며, 코드 배포와 함께
--   적용된다 — 이 마이그레이션 자체는 기존 수집 동작을 바꾸지 않는다(모든 카테고리
--   requires_review=false로 시작하므로).
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: 코드 배포보다 먼저 실행해야 한다 — 배포된 수집 코드가 naver_category/
--    naver_keyword/pending_review 컬럼에 INSERT를 시도하는 순간 컬럼이 없으면 저장이
--    거부된다.

ALTER TABLE public.poi
  ADD COLUMN IF NOT EXISTS naver_category TEXT,
  ADD COLUMN IF NOT EXISTS naver_keyword TEXT,
  ADD COLUMN IF NOT EXISTS pending_review BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.poi_categories
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT false;

-- 검토 큐 화면이 "검토 대기 중인 것만" 자주 조회하므로 부분 인덱스로 좁혀둔다
-- (poi 테이블은 2,000행을 넘고 계속 증가 중).
CREATE INDEX IF NOT EXISTS idx_poi_pending_review ON public.poi (created_at DESC) WHERE pending_review = true;

-- 거부된 POI 보관용 홀딩 카테고리 (slug 형식은 API 검증 규칙 ^[a-z][a-z0-9_]*$ 준수)
INSERT INTO public.poi_categories (slug, label, pipeline_linked, requires_review)
VALUES ('unassigned', '미분류(거부됨)', false, false)
ON CONFLICT (slug) DO NOTHING;

-- 🧪 적용 후 검증
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'poi'
--      AND column_name IN ('naver_category', 'naver_keyword', 'pending_review');
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'poi_categories' AND column_name = 'requires_review';
--   SELECT slug, label, pipeline_linked, requires_review FROM public.poi_categories WHERE slug = 'unassigned';

-- ↩️ 롤백 DDL (unassigned 카테고리를 참조하는 poi 행이 없을 때만 안전)
--    DELETE FROM public.poi_categories WHERE slug = 'unassigned';
--    DROP INDEX IF EXISTS idx_poi_pending_review;
--    ALTER TABLE public.poi_categories DROP COLUMN IF EXISTS requires_review;
--    ALTER TABLE public.poi DROP COLUMN IF EXISTS pending_review;
--    ALTER TABLE public.poi DROP COLUMN IF EXISTS naver_keyword;
--    ALTER TABLE public.poi DROP COLUMN IF EXISTS naver_category;
