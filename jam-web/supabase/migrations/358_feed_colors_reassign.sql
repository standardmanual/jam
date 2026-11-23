-- 358: 저장된 홈피드 카드 121장의 색(바탕·칩·박스)을 통합 팔레트 규칙으로 다시 배정한다 (일회성 전환, 티켓 20261122_2224 회차 10)
--
-- 생성 근거: jam-web/scripts/gen-feed-color-reassign.ts (npx tsx scripts/gen-feed-color-reassign.ts up). 재료는 jam-web/scripts/data/feed-color-reassign-input-20261123.json
-- (today_cards 121장의 유형·시드·등록 시각·노출 기간·첫 배지 대표 색, 읽기 전용 SELECT 결과). 규칙은 jam-web/src/lib/today/feedColorReassign.ts(assignFeedColors를
-- 등록 시각 → 노출 시작 → id 순으로 카드마다 돌린다). 운영자가 손으로 고른 옛 색도 모두 바뀐다(결정 2026-11-23).
-- 새 키는 모두 357로 넓힌 19키 CHECK를 통과한다. 확장(357) → 전환(이 파일) → 축소(359) 중 «전환»이다.
--
-- 실행 순서: 357(실행 완료) → 이 파일 → (화면 확인 뒤) 359. 되돌림: 358_feed_colors_reassign_down.sql (359를 이미 실행했다면 359 되돌림을 먼저).
-- 안전장치:
--   1) 백업 표 today_cards_feed_color_backup_20261123에 이 121장의 현재 값을 그대로 담는다(표가 비어 있을 때만 채운다).
--   2) 갱신은 «아직 백업 시점 값과 같은 행»만 한다. 그사이 운영자가 바꾼 카드는 건너뛰고, 갱신 행 수가 121이 아니면 예외로 전체를 되돌린다.
--   3) 바뀌는 칸은 bg_color_key·chip_color_key·box_color_key 셋뿐이다(updated_at 등 다른 칸은 건드리지 않는다).
-- 다시 실행하면 갱신 행 수가 121이 아니어서 예외로 멈춘다(이미 갱신된 행은 백업 값과 다르다). 같은 값으로 우연히 정해진 카드도 갱신 대상에 센다.
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션 DB에 반영된다(프로덕션 앱 main은 새 색 키를 아직 그릴 줄 모르므로 main 배포 전 화면에 영향이 없는지 실행 전 확인).

BEGIN;

CREATE TABLE IF NOT EXISTS public.today_cards_feed_color_backup_20261123 (
  id uuid PRIMARY KEY,
  bg_color_key text,
  chip_color_key text,
  box_color_key text
);
ALTER TABLE public.today_cards_feed_color_backup_20261123 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.today_cards_feed_color_backup_20261123 FROM anon, authenticated;
COMMENT ON TABLE public.today_cards_feed_color_backup_20261123 IS '358 홈피드 색 재배정 전 값(티켓 20261122_2224). 복구를 확인한 뒤 삭제해도 된다. 접근 정책 없음(service_role만)';

DO $$
DECLARE
  backed_up integer;
  updated integer;
BEGIN
  -- (가) 백업: 표가 비어 있을 때만, 재배정 대상 121장의 현재 값을 그대로 담는다
  IF NOT EXISTS (SELECT 1 FROM public.today_cards_feed_color_backup_20261123) THEN
    INSERT INTO public.today_cards_feed_color_backup_20261123 (id, bg_color_key, chip_color_key, box_color_key)
    SELECT t.id, t.bg_color_key, t.chip_color_key, t.box_color_key
    FROM public.today_cards t
    WHERE t.id IN (
      '078590a4-d082-4fa9-a03e-9065cd859e1b'::uuid,
      '8cb05339-68db-4d52-9b09-db0b7135e632'::uuid,
      '95ad3ba1-03de-4a8a-90c4-fb87b638944c'::uuid,
      'c641cc61-a32e-4ff6-929b-5993544d561e'::uuid,
      'd165c023-fca5-4683-a62b-c4457ad1172d'::uuid,
      '09647f9a-3621-402b-afb0-700bcaa1c968'::uuid,
      '127a9530-d450-416a-86c0-d4e3e85f80d5'::uuid,
      '464d9191-35e7-4cf8-9c63-b67e65e54dcc'::uuid,
      '72dfffed-95d7-45a1-9765-b03fdeb0d4b3'::uuid,
      'b62305e7-b277-439d-97cd-3df1213358cd'::uuid,
      'cf533e90-9aae-4287-8c7f-7291a790e21e'::uuid,
      'd48cf785-4335-4fbf-ac7a-98ecab902028'::uuid,
      'dd03d2b1-8c60-4bc8-8b79-9f307572f621'::uuid,
      'df85ff57-19cf-4c13-a1bb-773224fbfdeb'::uuid,
      'e3ff7931-d7af-419a-b0e1-d18e090a8255'::uuid,
      'e60abeed-92cb-4b21-8054-10aab40d129b'::uuid,
      'f3f1acc9-2669-4139-bcac-51481677d76c'::uuid,
      '56074bf0-946d-480d-98ad-21d761689a4d'::uuid,
      '044370a3-2748-4bc8-8711-693130480e8e'::uuid,
      '1d9f1fdb-06af-4dfe-b564-d9ebb41b29b7'::uuid,
      '1eab3a96-b7e1-4aa5-bc0a-e931f1076e77'::uuid,
      '8651eb10-f6d8-4f30-832d-263c0484a172'::uuid,
      '9152cdeb-5404-4dc1-8e08-d10aff0a498e'::uuid,
      'c8b94296-c96a-4f32-8dd7-4c3931550dc7'::uuid,
      'ec923116-152e-4408-a223-bd7c97f35e9f'::uuid,
      '0bf2965c-0aa9-40ce-9afc-ec43efbce81b'::uuid,
      '186048e6-0216-4083-bbc8-61a8bac0270b'::uuid,
      '29937ae8-2053-443f-94ea-fa02c9e99e17'::uuid,
      '2e7a5847-b6f5-4fe6-9aae-b880b27ba8fc'::uuid,
      '3a879ab5-7df4-4f5b-b4df-048f39d89c5c'::uuid,
      '3e4b8f2a-b202-4f4a-80fd-213170304ed7'::uuid,
      '77491196-e980-43cd-8695-513be0a839aa'::uuid,
      '77c2299d-6627-4c9c-b296-d64f1fa31514'::uuid,
      '80455dc3-0835-4c91-a1d0-41abda6dce04'::uuid,
      '91cff23a-e048-48f4-b8bc-96f40fc89d30'::uuid,
      'a4464a1a-b018-4f54-811b-6cb35e400fea'::uuid,
      'a8ed15ca-129f-4df9-819d-d6b89357d77f'::uuid,
      'd3453a2b-cefe-40be-9b2f-0cc29bb58995'::uuid,
      'e0c1644d-0067-491c-9412-218e9ff4566e'::uuid,
      'f9695151-4bea-4648-b3f5-7fb921c9b1bd'::uuid,
      '5d1053cd-79a9-4e3d-b918-9dbe5dacebd2'::uuid,
      '33c30177-a8bc-4666-b34d-fe014380dd3b'::uuid,
      'fd5ca5ad-6dae-40b7-a85a-ec2fe8a23364'::uuid,
      '1a3df805-bab2-4e32-bc18-5015601e9444'::uuid,
      '84adca04-5d60-4467-803b-a4d38dfd77ab'::uuid,
      'b16677b7-9ae8-48dd-b28d-ea14116430c2'::uuid,
      'e92ba6e8-3aa3-41c0-be32-c2d6271b6b9a'::uuid,
      'b419ed70-8ca4-4875-9526-9b050b114b9d'::uuid,
      'f409a12e-0f71-4a14-a2b0-abc7a1f5dac5'::uuid,
      '06d6b6a2-3b04-4fad-a689-ed3531a260e1'::uuid,
      '45340202-1c70-4d97-81a3-2537817aee25'::uuid,
      'f7d50af3-8958-48fd-8ed5-9bcfdd1b900a'::uuid,
      '78e01a91-21c9-4e1e-b093-9fe1587f546f'::uuid,
      'cebac3ad-278b-432d-a1b5-56af66a740a8'::uuid,
      'dec90a48-d3a4-450f-af52-ea7611cf1a0a'::uuid,
      '9b8a16c7-64be-437a-95b8-26c16df3b264'::uuid,
      'f1dec605-cc03-4637-8809-692528f6c362'::uuid,
      '02bb220c-a48c-47d6-bf7a-744e86be6156'::uuid,
      '7aa48627-42e5-475d-969c-0f4ce07b5e4a'::uuid,
      'b3ff9bf0-f81c-4184-ac8b-5ca314ccd7fd'::uuid,
      '67daff84-795e-4669-b14b-de31c9fc5e6d'::uuid,
      'c8885e3d-e572-4f55-9d4b-45e65d866808'::uuid,
      '29f8a42a-c651-42fc-ac6d-bf9079bd6335'::uuid,
      '562a4af0-d80d-45c8-ad68-a1c36fe064e9'::uuid,
      '11ffdd57-8a3f-4fe9-bbc4-534e33fc5a2d'::uuid,
      '45b8d32a-0516-47db-a58a-1c25367300aa'::uuid,
      '74e665c6-b55d-427b-9490-9b8781ec9f65'::uuid,
      '17a10aaf-a453-4f22-93da-5ad372e142b9'::uuid,
      '51578929-9ad6-4fe2-9b93-9075e8bfc74f'::uuid,
      '949767d7-2b51-4349-a726-ab9e1dc3e75e'::uuid,
      '480c3c80-4e28-4e92-a934-9a59526a3a6f'::uuid,
      'e0000000-0000-4000-8000-000000000001'::uuid,
      'e0000000-0000-4000-8000-000000000002'::uuid,
      'e0000000-0000-4000-8000-000000000003'::uuid,
      '741d421c-6b16-4709-b2ed-7deaa4a28064'::uuid,
      '18a6efa0-cd8b-4534-823f-d86ac81d6d0b'::uuid,
      '260aa769-070d-483f-86da-60fa7fd3f7c3'::uuid,
      '4e3d6299-f314-453e-b975-7580e3f2837b'::uuid,
      '626c1e62-1726-4b4c-a0e6-235f952e9b85'::uuid,
      '391b8638-5bee-4797-af59-3b243f05c5d5'::uuid,
      '4c7902e5-f082-4ab4-8eb6-1f7ee28bb05d'::uuid,
      'ec950464-2a8a-4ee5-98f7-a35978791b4e'::uuid,
      '464a990c-11bb-4d4f-b7fa-8a183f5e62ed'::uuid,
      'a69966fb-b4ae-49ea-926e-9444cebeb141'::uuid,
      '59a0864f-9d15-4f18-88dd-0445614c4b90'::uuid,
      '67735398-3097-428e-bf72-777c9289539e'::uuid,
      'df6ae827-40ca-4c9b-a71b-0624fe2aab4d'::uuid,
      '0bc05266-8632-45d8-9937-d14092c60808'::uuid,
      'ffdda97f-d655-4da2-ab21-6ff1b49d1683'::uuid,
      '0240fa74-9a6d-49a5-961b-d1dc1f7fa00e'::uuid,
      '6fb9152d-46f8-4e54-ac75-b361f2dba373'::uuid,
      'ab48df93-b5a1-4745-bb04-427888914a3e'::uuid,
      'b7bda830-8c9e-43c5-a5c3-e3f9cb990303'::uuid,
      '11af4a68-2319-448a-b340-362a20aa4b21'::uuid,
      '79916e12-8ab3-4b84-ab53-20b4c91374c0'::uuid,
      '8ebb295e-767b-4eec-8d3f-821a8cbc863b'::uuid,
      '3a8a9e4f-fc5d-4808-8706-9aae774d38bb'::uuid,
      '121a4d77-8a54-4903-a4f3-857607b083f8'::uuid,
      '1ac2259d-92ca-46c5-9df2-85c2589953ac'::uuid,
      '35e32bed-577f-44fa-9300-bb84d90c9898'::uuid,
      '3e3ad4b5-226d-4cde-9501-0359fa0db2c6'::uuid,
      '4a93c821-c166-4eb3-aa0c-2125d0e624e2'::uuid,
      '4d446b51-ecf7-4997-b6aa-abf2ce4d9ee0'::uuid,
      '9078602a-3189-47d4-a683-a82704a0bf36'::uuid,
      '9d928a53-960b-4c86-af3a-594a1529b7ee'::uuid,
      'cc339be7-8662-4ed4-adeb-2317bb73d373'::uuid,
      '8c41e775-0cf9-4d79-9701-682470d44c5d'::uuid,
      '4103db14-7741-4575-832c-ae43e74b3495'::uuid,
      '4dd251d3-e7aa-4a7c-a91a-dbd52031e79d'::uuid,
      'd6f8dcc2-45e9-4957-8f6f-2985fd80827c'::uuid,
      '0c8a9f80-2872-40b9-adca-4b951cb6369f'::uuid,
      '4c18a9fd-0b45-4bf8-b474-a0728545f52a'::uuid,
      '821b6d08-9318-4688-8ce4-c78126332dd2'::uuid,
      '4c496912-773c-414d-9a02-095eb437214e'::uuid,
      '4ec62e7d-365e-4bb3-aa21-dcb1968c6a65'::uuid,
      '3718c6a3-84a0-43d2-b851-15e904b5d10f'::uuid,
      'b5aaa516-88f0-4e10-b8f2-933a032ec554'::uuid,
      '33f97f0d-ab4f-4171-aa90-c76988f1a023'::uuid,
      '380a4fd0-6159-4c96-8bac-8701b4910a83'::uuid,
      '06887e41-db88-45bd-8f20-d4bc5e924f08'::uuid,
      'dc2e4cf4-e3cc-4ed9-82b0-af9e1c863f60'::uuid
    );
  END IF;

  SELECT count(*) INTO backed_up FROM public.today_cards_feed_color_backup_20261123;
  IF backed_up <> 121 THEN
    RAISE EXCEPTION '358: 백업 표 행 수가 121이 아닙니다(%). 카드가 삭제됐거나 표에 이전 내용이 남아 있습니다. 전체를 되돌립니다.', backed_up;
  END IF;

  -- (나) 갱신: 백업 시점 값과 아직 같은 행만 새 값으로 바꾼다(그사이 운영자가 바꾼 카드는 건너뛴다)
  UPDATE public.today_cards t
  SET bg_color_key = v.nbg,
      chip_color_key = v.nchip,
      box_color_key = v.nbox
  FROM (
    VALUES
      ('078590a4-d082-4fa9-a03e-9065cd859e1b'::uuid, 'pink', 'sky', 'green'),
      ('8cb05339-68db-4d52-9b09-db0b7135e632'::uuid, 'green', 'sky', 'yellow'),
      ('95ad3ba1-03de-4a8a-90c4-fb87b638944c'::uuid, 'pink', 'sky', 'yellow'),
      ('c641cc61-a32e-4ff6-929b-5993544d561e'::uuid, 'yellow', 'sky', 'green'),
      ('d165c023-fca5-4683-a62b-c4457ad1172d'::uuid, 'sky', 'pink', 'yellow'),
      ('09647f9a-3621-402b-afb0-700bcaa1c968'::uuid, 'green-deep', 'white', 'pink'),
      ('127a9530-d450-416a-86c0-d4e3e85f80d5'::uuid, 'yellow', 'purple', 'green'),
      ('464d9191-35e7-4cf8-9c63-b67e65e54dcc'::uuid, 'pink', 'white', 'green'),
      ('72dfffed-95d7-45a1-9765-b03fdeb0d4b3'::uuid, 'sky', 'white', 'pink'),
      ('b62305e7-b277-439d-97cd-3df1213358cd'::uuid, 'yellow', 'sky', 'green'),
      ('cf533e90-9aae-4287-8c7f-7291a790e21e'::uuid, 'green-deep', 'green', 'pink'),
      ('d48cf785-4335-4fbf-ac7a-98ecab902028'::uuid, 'pink', 'sky', 'green'),
      ('dd03d2b1-8c60-4bc8-8b79-9f307572f621'::uuid, 'green', 'pink', 'yellow'),
      ('df85ff57-19cf-4c13-a1bb-773224fbfdeb'::uuid, 'pink', 'white', 'green'),
      ('e3ff7931-d7af-419a-b0e1-d18e090a8255'::uuid, 'yellow', 'green', 'sky'),
      ('e60abeed-92cb-4b21-8054-10aab40d129b'::uuid, 'green', 'pink', 'yellow'),
      ('f3f1acc9-2669-4139-bcac-51481677d76c'::uuid, 'green-deep', 'pink', 'yellow'),
      ('56074bf0-946d-480d-98ad-21d761689a4d'::uuid, 'yellow', 'purple', 'green'),
      ('044370a3-2748-4bc8-8711-693130480e8e'::uuid, 'sky', 'pink', 'yellow'),
      ('1d9f1fdb-06af-4dfe-b564-d9ebb41b29b7'::uuid, 'green', 'purple', 'yellow'),
      ('1eab3a96-b7e1-4aa5-bc0a-e931f1076e77'::uuid, 'pink', 'sky', 'yellow'),
      ('8651eb10-f6d8-4f30-832d-263c0484a172'::uuid, 'green-deep', 'green', 'yellow'),
      ('9152cdeb-5404-4dc1-8e08-d10aff0a498e'::uuid, 'sky', 'purple', 'yellow'),
      ('c8b94296-c96a-4f32-8dd7-4c3931550dc7'::uuid, 'pink', 'red', 'yellow'),
      ('ec923116-152e-4408-a223-bd7c97f35e9f'::uuid, 'yellow', 'purple', 'green-deep'),
      ('0bf2965c-0aa9-40ce-9afc-ec43efbce81b'::uuid, 'green', 'purple', 'yellow'),
      ('186048e6-0216-4083-bbc8-61a8bac0270b'::uuid, 'green-deep', 'green', 'yellow'),
      ('29937ae8-2053-443f-94ea-fa02c9e99e17'::uuid, 'yellow', 'purple', 'green'),
      ('2e7a5847-b6f5-4fe6-9aae-b880b27ba8fc'::uuid, 'green', 'sky', 'yellow'),
      ('3a879ab5-7df4-4f5b-b4df-048f39d89c5c'::uuid, 'yellow', 'green', 'sky'),
      ('3e4b8f2a-b202-4f4a-80fd-213170304ed7'::uuid, 'sky', 'yellow', 'pink'),
      ('77491196-e980-43cd-8695-513be0a839aa'::uuid, 'pink', 'sky', 'yellow'),
      ('77c2299d-6627-4c9c-b296-d64f1fa31514'::uuid, 'green-deep', 'green', 'pink'),
      ('80455dc3-0835-4c91-a1d0-41abda6dce04'::uuid, 'pink', 'yellow', 'green'),
      ('91cff23a-e048-48f4-b8bc-96f40fc89d30'::uuid, 'green', 'purple', 'yellow'),
      ('a4464a1a-b018-4f54-811b-6cb35e400fea'::uuid, 'sky', 'purple', 'yellow'),
      ('a8ed15ca-129f-4df9-819d-d6b89357d77f'::uuid, 'pink', 'white', 'green'),
      ('d3453a2b-cefe-40be-9b2f-0cc29bb58995'::uuid, 'green-deep', 'purple', 'yellow'),
      ('e0c1644d-0067-491c-9412-218e9ff4566e'::uuid, 'green', 'pink', 'yellow'),
      ('f9695151-4bea-4648-b3f5-7fb921c9b1bd'::uuid, 'yellow', 'purple', 'green'),
      ('5d1053cd-79a9-4e3d-b918-9dbe5dacebd2'::uuid, 'pink', 'sky', 'green'),
      ('33c30177-a8bc-4666-b34d-fe014380dd3b'::uuid, 'yellow', 'purple', 'sky'),
      ('fd5ca5ad-6dae-40b7-a85a-ec2fe8a23364'::uuid, 'green', 'purple', 'yellow'),
      ('1a3df805-bab2-4e32-bc18-5015601e9444'::uuid, 'yellow', 'purple', 'green'),
      ('84adca04-5d60-4467-803b-a4d38dfd77ab'::uuid, 'green', 'purple', 'yellow'),
      ('b16677b7-9ae8-48dd-b28d-ea14116430c2'::uuid, 'pink', 'yellow', 'green'),
      ('e92ba6e8-3aa3-41c0-be32-c2d6271b6b9a'::uuid, 'yellow', 'sky', 'green'),
      ('b419ed70-8ca4-4875-9526-9b050b114b9d'::uuid, 'green', 'sky', 'yellow'),
      ('f409a12e-0f71-4a14-a2b0-abc7a1f5dac5'::uuid, 'sky', 'red', 'yellow'),
      ('06d6b6a2-3b04-4fad-a689-ed3531a260e1'::uuid, 'pink', 'red', 'yellow'),
      ('45340202-1c70-4d97-81a3-2537817aee25'::uuid, 'sky', 'red', 'yellow'),
      ('f7d50af3-8958-48fd-8ed5-9bcfdd1b900a'::uuid, 'yellow', 'purple', 'green'),
      ('78e01a91-21c9-4e1e-b093-9fe1587f546f'::uuid, 'yellow', 'sky', 'green'),
      ('cebac3ad-278b-432d-a1b5-56af66a740a8'::uuid, 'green', 'pink', 'yellow'),
      ('dec90a48-d3a4-450f-af52-ea7611cf1a0a'::uuid, 'green-deep', 'yellow', 'pink'),
      ('9b8a16c7-64be-437a-95b8-26c16df3b264'::uuid, 'sky', 'white', 'pink'),
      ('f1dec605-cc03-4637-8809-692528f6c362'::uuid, 'green', 'sky', 'pink'),
      ('02bb220c-a48c-47d6-bf7a-744e86be6156'::uuid, 'yellow', 'pink', 'green'),
      ('7aa48627-42e5-475d-969c-0f4ce07b5e4a'::uuid, 'sky', 'purple', 'yellow'),
      ('b3ff9bf0-f81c-4184-ac8b-5ca314ccd7fd'::uuid, 'pink', 'white', 'green'),
      ('67daff84-795e-4669-b14b-de31c9fc5e6d'::uuid, 'pink', 'sky', 'yellow'),
      ('c8885e3d-e572-4f55-9d4b-45e65d866808'::uuid, 'yellow', 'green', 'sky'),
      ('29f8a42a-c651-42fc-ac6d-bf9079bd6335'::uuid, 'yellow', 'sky', 'green'),
      ('562a4af0-d80d-45c8-ad68-a1c36fe064e9'::uuid, 'green', 'pink', 'yellow'),
      ('11ffdd57-8a3f-4fe9-bbc4-534e33fc5a2d'::uuid, 'sky', 'red', 'yellow'),
      ('45b8d32a-0516-47db-a58a-1c25367300aa'::uuid, 'green', 'pink', 'yellow'),
      ('74e665c6-b55d-427b-9490-9b8781ec9f65'::uuid, 'yellow', 'pink', 'sky'),
      ('17a10aaf-a453-4f22-93da-5ad372e142b9'::uuid, 'yellow', 'sky', 'green'),
      ('51578929-9ad6-4fe2-9b93-9075e8bfc74f'::uuid, 'yellow', 'green', 'green-deep'),
      ('949767d7-2b51-4349-a726-ab9e1dc3e75e'::uuid, 'sky', 'pink', 'yellow'),
      ('480c3c80-4e28-4e92-a934-9a59526a3a6f'::uuid, 'yellow', 'sky', 'green'),
      ('e0000000-0000-4000-8000-000000000001'::uuid, 'green', 'pink', 'yellow'),
      ('e0000000-0000-4000-8000-000000000002'::uuid, 'yellow', 'pink', 'green-deep'),
      ('e0000000-0000-4000-8000-000000000003'::uuid, 'sky', 'red', 'yellow'),
      ('741d421c-6b16-4709-b2ed-7deaa4a28064'::uuid, 'yellow', 'purple', 'green-deep'),
      ('18a6efa0-cd8b-4534-823f-d86ac81d6d0b'::uuid, 'pink', 'sky', 'yellow'),
      ('260aa769-070d-483f-86da-60fa7fd3f7c3'::uuid, 'sky', 'yellow', 'pink'),
      ('4e3d6299-f314-453e-b975-7580e3f2837b'::uuid, 'yellow', 'purple', 'green-deep'),
      ('626c1e62-1726-4b4c-a0e6-235f952e9b85'::uuid, 'sky', 'red', 'pink'),
      ('391b8638-5bee-4797-af59-3b243f05c5d5'::uuid, 'green', 'purple', 'yellow'),
      ('4c7902e5-f082-4ab4-8eb6-1f7ee28bb05d'::uuid, 'green-deep', 'sky', 'yellow'),
      ('ec950464-2a8a-4ee5-98f7-a35978791b4e'::uuid, 'sky', 'yellow', 'pink'),
      ('464a990c-11bb-4d4f-b7fa-8a183f5e62ed'::uuid, 'yellow', 'pink', 'green'),
      ('a69966fb-b4ae-49ea-926e-9444cebeb141'::uuid, 'sky', 'pink', 'yellow'),
      ('59a0864f-9d15-4f18-88dd-0445614c4b90'::uuid, 'green-deep', 'white', 'pink'),
      ('67735398-3097-428e-bf72-777c9289539e'::uuid, 'green', 'white', 'pink'),
      ('df6ae827-40ca-4c9b-a71b-0624fe2aab4d'::uuid, 'pink', 'sky', 'yellow'),
      ('0bc05266-8632-45d8-9937-d14092c60808'::uuid, 'green', 'purple', 'yellow'),
      ('ffdda97f-d655-4da2-ab21-6ff1b49d1683'::uuid, 'sky', 'green', 'yellow'),
      ('0240fa74-9a6d-49a5-961b-d1dc1f7fa00e'::uuid, 'yellow', 'pink', 'green'),
      ('6fb9152d-46f8-4e54-ac75-b361f2dba373'::uuid, 'pink', 'yellow', 'green'),
      ('ab48df93-b5a1-4745-bb04-427888914a3e'::uuid, 'yellow', 'sky', 'green'),
      ('b7bda830-8c9e-43c5-a5c3-e3f9cb990303'::uuid, 'green', 'sky', 'yellow'),
      ('11af4a68-2319-448a-b340-362a20aa4b21'::uuid, 'yellow', 'red', 'sky'),
      ('79916e12-8ab3-4b84-ab53-20b4c91374c0'::uuid, 'green-deep', 'white', 'pink'),
      ('8ebb295e-767b-4eec-8d3f-821a8cbc863b'::uuid, 'pink', 'sky', 'green'),
      ('3a8a9e4f-fc5d-4808-8706-9aae774d38bb'::uuid, 'yellow', 'pink', 'green'),
      ('121a4d77-8a54-4903-a4f3-857607b083f8'::uuid, 'green-deep', 'pink', 'yellow'),
      ('1ac2259d-92ca-46c5-9df2-85c2589953ac'::uuid, 'green', 'pink', 'yellow'),
      ('35e32bed-577f-44fa-9300-bb84d90c9898'::uuid, 'pink', 'sky', 'green'),
      ('3e3ad4b5-226d-4cde-9501-0359fa0db2c6'::uuid, 'yellow', 'pink', 'green'),
      ('4a93c821-c166-4eb3-aa0c-2125d0e624e2'::uuid, 'sky', 'red', 'yellow'),
      ('4d446b51-ecf7-4997-b6aa-abf2ce4d9ee0'::uuid, 'green', 'white', 'pink'),
      ('9078602a-3189-47d4-a683-a82704a0bf36'::uuid, 'green-deep', 'white', 'pink'),
      ('9d928a53-960b-4c86-af3a-594a1529b7ee'::uuid, 'green', 'pink', 'yellow'),
      ('cc339be7-8662-4ed4-adeb-2317bb73d373'::uuid, 'pink', 'sky', 'green'),
      ('8c41e775-0cf9-4d79-9701-682470d44c5d'::uuid, 'green', 'white', 'pink'),
      ('4103db14-7741-4575-832c-ae43e74b3495'::uuid, 'yellow', 'red', 'sky'),
      ('4dd251d3-e7aa-4a7c-a91a-dbd52031e79d'::uuid, 'pink', 'white', 'green'),
      ('d6f8dcc2-45e9-4957-8f6f-2985fd80827c'::uuid, 'green-deep', 'pink', 'yellow'),
      ('0c8a9f80-2872-40b9-adca-4b951cb6369f'::uuid, 'yellow', 'sky', 'green'),
      ('4c18a9fd-0b45-4bf8-b474-a0728545f52a'::uuid, 'sky', 'pink', 'yellow'),
      ('821b6d08-9318-4688-8ce4-c78126332dd2'::uuid, 'yellow', 'red', 'sky'),
      ('4c496912-773c-414d-9a02-095eb437214e'::uuid, 'green-deep', 'yellow', 'pink'),
      ('4ec62e7d-365e-4bb3-aa21-dcb1968c6a65'::uuid, 'yellow', 'pink', 'green'),
      ('3718c6a3-84a0-43d2-b851-15e904b5d10f'::uuid, 'green', 'pink', 'yellow'),
      ('b5aaa516-88f0-4e10-b8f2-933a032ec554'::uuid, 'yellow', 'purple', 'green'),
      ('33f97f0d-ab4f-4171-aa90-c76988f1a023'::uuid, 'green', 'purple', 'yellow'),
      ('380a4fd0-6159-4c96-8bac-8701b4910a83'::uuid, 'yellow', 'purple', 'sky'),
      ('06887e41-db88-45bd-8f20-d4bc5e924f08'::uuid, 'green-deep', 'yellow', 'pink'),
      ('dc2e4cf4-e3cc-4ed9-82b0-af9e1c863f60'::uuid, 'sky', 'pink', 'yellow')
  ) AS v(id, nbg, nchip, nbox)
  JOIN public.today_cards_feed_color_backup_20261123 b ON b.id = v.id
  WHERE t.id = v.id
    AND t.bg_color_key IS NOT DISTINCT FROM b.bg_color_key
    AND t.chip_color_key IS NOT DISTINCT FROM b.chip_color_key
    AND t.box_color_key IS NOT DISTINCT FROM b.box_color_key;

  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated <> 121 THEN
    RAISE EXCEPTION '358: 갱신된 행 수가 121이 아닙니다(%). 그사이 값이 바뀐 카드가 있습니다. 전체를 되돌립니다.', updated;
  END IF;
END
$$;

COMMIT;
