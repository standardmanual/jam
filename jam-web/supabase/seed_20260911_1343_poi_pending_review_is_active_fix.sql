-- 티켓 20260911_1343 [Service] POI 검토대기 상태가 지도에 즉시 노출되는 버그 수정
--
-- 배경: `jam-web/src/app/api/drops/route.ts`의 searchAndPersistCategories가 자동수집
-- POI를 저장할 때 is_active를 pending_review와 무관하게 category.display_on_map만으로
-- 결정하던 버그가 있었다. 이번 코드 수정으로 pending_review=true인 행은 무조건
-- is_active=false로 저장되도록 고쳤지만, 20260911_1310에서 requires_review를 켠 이후
-- 코드 수정 전까지 자동수집된 행 중 pending_review=true이면서 is_active=true로 잘못
-- 저장된 것이 있을 수 있다.
--
-- 이 파일은 그 상태(검토대기인데 이미 노출)를 정합성 규칙(어드민 수동등록 경로
-- `api/admin/poi/route.ts`에서도 이미 지키고 있는 "pending_review=true면 is_active=false"
-- 불변식)에 맞춰 보정한다.
--
-- ⚠️ 실행 금지 — 사용자 승인 후 오케스트레이터가 직접 실행한다 (jam-developer 서브에이전트는
-- SQL 파일 작성까지만 하고 DB 접근 권한이 없어 이 파일 작성 시점에 대상 행 존재 여부를
-- 직접 확인하지 못했다. 아래 SELECT로 먼저 건수를 확인한 뒤 UPDATE를 실행할 것).

-- 🔍 실행 전 확인 — 영향받는 행 수·목록
SELECT id, name, category, naver_id, pending_review, is_active, created_at
FROM public.poi
WHERE pending_review = true
  AND is_active = true
ORDER BY created_at DESC;

-- ✏️ 보정
UPDATE public.poi
SET is_active = false
WHERE pending_review = true
  AND is_active = true;

-- 🧪 적용 후 검증 — 0행이어야 한다
--   SELECT count(*) FROM public.poi WHERE pending_review = true AND is_active = true;
