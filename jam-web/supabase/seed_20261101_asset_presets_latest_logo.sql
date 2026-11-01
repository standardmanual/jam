-- 프리셋 4개의 로고 레이어를 최신 JAM 로고(2610×865, 2026-10-28 3차 교체)로 바꾼다 (티켓 20261101_2136)
-- 원인: 3차 교체 때 코드의 글자 경로와 PNG만 바꿨고, DB 프리셋의 이미지 레이어는 옛 로고(578×205) 파일을 그대로 가리켰다.
-- 파일: docs/assets/brand/jam_logo.svg를 저장소에 새 이름(*-logo-20261028.svg)으로 올렸다. 옛 파일은 지우지 않았다.

UPDATE public.asset_presets
SET layers = jsonb_set(layers, '{0,assetUrl}', to_jsonb(replace(layers->0->>'assetUrl', '.svg', '-logo-20261028.svg'))),
    updated_at = now()
WHERE id IN (
    '51aa4673-f723-4929-ac20-a302202b7aa7',
    '98562783-36c9-44aa-8fba-3c4793608f28',
    'c5491ad2-12d4-4ab0-a59d-6897067a8a9a',
    'a4d7f928-2531-4cc4-a611-3399db244bfe'
  )
  AND layers->0->>'type' = 'image'
  AND layers->0->>'assetUrl' NOT LIKE '%-logo-20261028.svg';

-- 되돌림 SQL
-- UPDATE public.asset_presets
-- SET layers = jsonb_set(layers, '{0,assetUrl}', to_jsonb(replace(layers->0->>'assetUrl', '-logo-20261028.svg', '.svg'))), updated_at = now()
-- WHERE layers->0->>'assetUrl' LIKE '%-logo-20261028.svg';
