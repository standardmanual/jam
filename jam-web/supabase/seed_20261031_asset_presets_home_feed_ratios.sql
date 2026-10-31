-- seed_20261031_asset_presets_home_feed_ratios.sql
-- 홈피드 이미지 프리셋 두 개를 더한다: «홈피드 16:9»(hero·ticket용)와 «홈피드 4:5»(poster·dome용) (티켓 20261031_2049, 사용자 지시 2026-10-31).
--
-- ⚠️ Supabase는 staging·프로덕션 공용 단일 DB다. asset_presets에 2행을 더할 뿐 기존 행은 바꾸지 않는다.
--
-- 기준: 기존 «홈피드»(1:1, id 51aa4673-f723-4929-ac20-a302202b7aa7)의 레이어 3개(로고 이미지, 제목, 설명)를 복사한다.
--   글자 크기와 로고 너비는 스테이지 짧은 변 기준(%)이라 비율마다 다시 잡았다. 긴 변은 항상 1280px이다.
--   16:9(1280×720): 짧은 변이 720이라 크기를 1280/720배로 키워 1:1과 같은 픽셀 크기로 맞췄다. 제목 y 38, 설명 y 56, 로고 y 88.
--   4:5(1024×1280): 짧은 변이 너비(1024)라 크기 %는 그대로다. 포스터는 아래 45%에 글자를 두지 않으므로 로고를 위(y 10)로 옮기고 제목 y 33, 설명 y 43.
--   로고 SVG 주소는 기존 «홈피드» 프리셋의 저장 경로를 그대로 가리킨다(기존 프리셋의 레이어 파일을 지우면 두 프리셋의 로고도 사라진다).
-- 렌더 확인: 샘플 문구(제목 11자, 설명 15자)로 두 프리셋을 실제로 그려 PNG를 열어 봤다(2026-10-31).
-- 실제로 실행한 값: id c5491ad2-12d4-4ab0-a59d-6897067a8a9a(16:9), a4d7f928-2531-4cc4-a611-3399db244bfe(4:5). 아래 문장은 같은 결과를 만드는 한 번의 호출이다.

WITH base AS (
  SELECT * FROM public.asset_presets
   WHERE id = '51aa4673-f723-4929-ac20-a302202b7aa7'
     AND jsonb_array_length(layers) = 3
     AND layers->0->>'type' = 'image' AND layers->1->>'type' = 'text' AND layers->2->>'type' = 'text'
)
INSERT INTO public.asset_presets (name, target_type, stage_ratio, layers, created_by)
SELECT '홈피드 16:9', 'home_feed', '16:9',
       jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(layers,
         '{0,widthPct}', '23.1'::jsonb), '{0,yPct}', '88'::jsonb),
         '{1,sizePct}', '17.8'::jsonb), '{1,yPct}', '38'::jsonb),
         '{2,sizePct}', '8.9'::jsonb), '{2,yPct}', '56'::jsonb),
       created_by FROM base
UNION ALL
SELECT '홈피드 4:5', 'home_feed', '4:5',
       jsonb_set(jsonb_set(jsonb_set(layers,
         '{0,yPct}', '10'::jsonb), '{1,yPct}', '33'::jsonb), '{2,yPct}', '43'::jsonb),
       created_by FROM base;

-- ─────────────────────────────────────────────────────────────────────────────
-- 되돌림 SQL
--
-- DELETE FROM public.asset_presets WHERE id IN ('c5491ad2-12d4-4ab0-a59d-6897067a8a9a', 'a4d7f928-2531-4cc4-a611-3399db244bfe');
