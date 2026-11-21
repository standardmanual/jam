-- 350: 카드 이미지 프리셋 4개(홈피드 3개, 미션 1개)에서 로고·글자 층을 뺀다 (데이터 변경)
-- 티켓 20261121_1723 (상위 20261120_2026 7회차-2, 규격 정본 docs/service/prd/home-feed/PRD.md §6 이미지 규칙)
--
-- 사용자 결정(2026-11-21): 배지 이미지를 뺀 카드 이미지(썸네일·카드 커버·미션 대표 이미지)에는 텍스트도 로고도 넣지 않는다.
-- 리본(색 그라데이션과 «J» 모양 스탬프)은 엔진이 그리므로 그대로 남는다. 배지·컬렉션 프리셋은 바꾸지 않는다.
--
-- 안전장치
--  ① 바꾸기 전에 대상 행의 layers를 백업 표 asset_presets_layers_backup_20261121에 담는다(이미 있으면 덮지 않는다).
--  ② 대상은 id 4개로 좁히고, 각 행의 layers가 이 마이그레이션이 읽은 구성과 같을 때만 바꾼다
--     (홈피드: 이미지 층 1개 + 글자 층 2개, 미션: 이미지 층 1개 + 글자 층 3개).
--     다르면 누군가 어드민에서 프리셋을 고쳤다는 뜻이라 건너뛴다(건너뛴 수를 NOTICE로 알린다).
--  ③ 코드(7-1·7-5)가 층 없는 프리셋을 받아들이도록 먼저 병합된 뒤에 실행한다(없는 층 번호 값은 무시된다).
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다. 되돌림: 350_asset_presets_text_logo_free_down.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.asset_presets_layers_backup_20261121 (
  id           uuid        PRIMARY KEY,
  name         text        NOT NULL,
  target_type  text        NOT NULL,
  stage_ratio  text        NOT NULL,
  layers       jsonb       NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

-- asset_presets와 같은 정책: RLS를 켜고 정책을 만들지 않는다 = service_role만 접근.
ALTER TABLE public.asset_presets_layers_backup_20261121 ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.asset_presets_layers_backup_20261121 IS
  '350 적용 전 asset_presets.layers 백업(티켓 20261121_1723). 되돌림 SQL이 이 값으로 되돌린다. 사용자 확인이 끝나면 별도로 지운다.';

DO $$
DECLARE
  backed  integer;
  changed integer;
  skipped integer;
BEGIN
  WITH expected(id, target_type, n_image, n_text) AS (
    VALUES
      ('51aa4673-f723-4929-ac20-a302202b7aa7'::uuid, 'home_feed', 1, 2),
      ('c5491ad2-12d4-4ab0-a59d-6897067a8a9a'::uuid, 'home_feed', 1, 2),
      ('a4d7f928-2531-4cc4-a611-3399db244bfe'::uuid, 'home_feed', 1, 2),
      ('98562783-36c9-44aa-8fba-3c4793608f28'::uuid, 'mission',   1, 3)
  ),
  matched AS (
    SELECT p.*
      FROM public.asset_presets p
      JOIN expected e ON e.id = p.id AND e.target_type = p.target_type
     WHERE jsonb_typeof(p.layers) = 'array'
       AND jsonb_array_length(p.layers) = e.n_image + e.n_text
       AND (SELECT count(*) FROM jsonb_array_elements(p.layers) l WHERE l->>'type' = 'image') = e.n_image
       AND (SELECT count(*) FROM jsonb_array_elements(p.layers) l WHERE l->>'type' = 'text')  = e.n_text
  ),
  ins AS (
    INSERT INTO public.asset_presets_layers_backup_20261121 (id, name, target_type, stage_ratio, layers)
    SELECT id, name, target_type, stage_ratio, layers FROM matched
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO backed FROM ins;

  UPDATE public.asset_presets p
     SET layers = '[]'::jsonb, updated_at = now()
   WHERE p.id IN (SELECT id FROM public.asset_presets_layers_backup_20261121)
     AND p.layers = (SELECT b.layers FROM public.asset_presets_layers_backup_20261121 b WHERE b.id = p.id);
  GET DIAGNOSTICS changed = ROW_COUNT;

  skipped := 4 - changed;
  RAISE NOTICE '350: 백업 % 행, 변경 % 행, 건너뜀 % 행', backed, changed, skipped;
END
$$;

COMMIT;
