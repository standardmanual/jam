-- 355: 기존 홈 카드 121장 전부에 새 카드 유형(feed_type)·시드·색을 채운다 (자료 변환, 티켓 20261120_2026 후속 «전체 변경»)
--
-- 규칙(유형): 배지가 걸린 카드 → badge_intro, 커버 이미지가 있는 카드 → hero_box, 나머지 → text_box.
-- 컬렉션 소개·드랍·픽업·배지만·목록형은 카드마다 재료(아이템 배지·목록 항목)가 필요해 자동으로 정하지 않는다.
-- 시드: 카드 id로 만든 고정값(재실행해도 같다). 색 3개: 앱의 자동 배정 함수(decideFeedCardValues)를 같은 시기에 노출되는 카드의
-- 배경색 사용 빈도를 반영해 돌린 결과다. 칩·박스 모양·설명 노출은 비워 두어 홈이 시드로 자동 결정한다.
-- 안전장치: feed_type이 비어 있는 카드만 바꾼다(이미 새 유형인 카드는 건드리지 않는다). 원래 값은 백업 표에 담는다.
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션 DB에 반영된다. 프로덕션 앱(main)은 이 칸을 읽지 않아 지금 화면은 그대로이고,
--    이후 main에 홈피드 개편을 배포하는 순간 이 카드들이 새 모양으로 바뀐다. 되돌림: 355_today_cards_feed_convert_all_down.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.today_cards_feed_backup_20261122 AS
SELECT id, feed_type, feed_seed, bg_color_key, chip_color_key, box_color_key
FROM public.today_cards
WHERE feed_type IS NULL;

ALTER TABLE public.today_cards_feed_backup_20261122 ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.today_cards_feed_backup_20261122 IS '355 전체 변환 전 값(티켓 20261120_2026 후속). 화면 확인 뒤 삭제해도 된다. 접근 정책 없음(service_role만)';

WITH v(id, feed_type, feed_seed, bg_color_key, chip_color_key, box_color_key) AS (
VALUES
  ('078590a4-d082-4fa9-a03e-9065cd859e1b'::uuid, 'hero_box', 1606425596, 'ref-pink', 'ref-lime', 'red'),
  ('8cb05339-68db-4d52-9b09-db0b7135e632'::uuid, 'hero_box', 4279000265, 'blue', 'ref-blue', 'ref-yellow'),
  ('95ad3ba1-03de-4a8a-90c4-fb87b638944c'::uuid, 'hero_box', 1123168584, 'ref-red', 'ref-lime', 'ref-pink'),
  ('c641cc61-a32e-4ff6-929b-5993544d561e'::uuid, 'hero_box', 182589682, 'red', 'ref-blue', 'ref-yellow'),
  ('d165c023-fca5-4683-a62b-c4457ad1172d'::uuid, 'hero_box', 3349965139, 'ref-yellow', 'purple-soft', 'red'),
  ('09647f9a-3621-402b-afb0-700bcaa1c968'::uuid, 'text_box', 1097793252, 'ref-blue', 'ref-yellow', 'ref-pink'),
  ('127a9530-d450-416a-86c0-d4e3e85f80d5'::uuid, 'text_box', 1156305933, 'green', 'ref-pink', 'ref-yellow'),
  ('464d9191-35e7-4cf8-9c63-b67e65e54dcc'::uuid, 'text_box', 1071658875, 'blue-soft', 'ref-red', 'ref-yellow'),
  ('72dfffed-95d7-45a1-9765-b03fdeb0d4b3'::uuid, 'text_box', 1704729335, 'ref-lime', 'ref-pink', 'yellow-soft'),
  ('b62305e7-b277-439d-97cd-3df1213358cd'::uuid, 'text_box', 3772305248, 'purple', 'ref-yellow', 'red'),
  ('cf533e90-9aae-4287-8c7f-7291a790e21e'::uuid, 'hero_box', 2148254871, 'red-soft', 'ref-yellow', 'red'),
  ('d48cf785-4335-4fbf-ac7a-98ecab902028'::uuid, 'hero_box', 3722361109, 'purple-soft', 'ref-yellow', 'red'),
  ('dd03d2b1-8c60-4bc8-8b79-9f307572f621'::uuid, 'text_box', 3440039629, 'yellow-soft', 'red', 'ref-lime'),
  ('df85ff57-19cf-4c13-a1bb-773224fbfdeb'::uuid, 'text_box', 453606503, 'green-soft', 'ref-pink', 'green'),
  ('e3ff7931-d7af-419a-b0e1-d18e090a8255'::uuid, 'text_box', 3034497569, 'yellow', 'purple', 'ref-yellow'),
  ('e60abeed-92cb-4b21-8054-10aab40d129b'::uuid, 'text_box', 3996682403, 'ref-pink', 'yellow-soft', 'red'),
  ('f3f1acc9-2669-4139-bcac-51481677d76c'::uuid, 'text_box', 3917875847, 'green', 'ref-pink', 'yellow-soft'),
  ('1eab3a96-b7e1-4aa5-bc0a-e931f1076e77'::uuid, 'hero_box', 2424277549, 'ref-red', 'ref-lime', 'purple'),
  ('8651eb10-f6d8-4f30-832d-263c0484a172'::uuid, 'hero_box', 2151589031, 'yellow', 'purple', 'ref-yellow'),
  ('9152cdeb-5404-4dc1-8e08-d10aff0a498e'::uuid, 'hero_box', 2303367057, 'purple-soft', 'ref-yellow', 'ref-red'),
  ('c8b94296-c96a-4f32-8dd7-4c3931550dc7'::uuid, 'hero_box', 2846975798, 'ref-lime', 'ref-pink', 'green-soft'),
  ('ec923116-152e-4408-a223-bd7c97f35e9f'::uuid, 'hero_box', 691897975, 'green-soft', 'ref-pink', 'ref-lime'),
  ('0bf2965c-0aa9-40ce-9afc-ec43efbce81b'::uuid, 'text_box', 2881552169, 'blue', 'ref-yellow', 'ref-blue'),
  ('186048e6-0216-4083-bbc8-61a8bac0270b'::uuid, 'text_box', 313656031, 'red', 'ref-lime', 'purple'),
  ('29937ae8-2053-443f-94ea-fa02c9e99e17'::uuid, 'text_box', 3094882322, 'purple', 'ref-yellow', 'ref-red'),
  ('2e7a5847-b6f5-4fe6-9aae-b880b27ba8fc'::uuid, 'text_box', 4208349723, 'red-soft', 'ref-red', 'ref-lime'),
  ('3a879ab5-7df4-4f5b-b4df-048f39d89c5c'::uuid, 'text_box', 117842959, 'blue-soft', 'red', 'ref-yellow'),
  ('3e4b8f2a-b202-4f4a-80fd-213170304ed7'::uuid, 'text_box', 3774291251, 'ref-yellow', 'red', 'purple-soft'),
  ('77491196-e980-43cd-8695-513be0a839aa'::uuid, 'text_box', 2858457066, 'ref-blue', 'ref-yellow', 'ref-red'),
  ('77c2299d-6627-4c9c-b296-d64f1fa31514'::uuid, 'text_box', 4050194324, 'yellow-soft', 'ref-red', 'ref-lime'),
  ('80455dc3-0835-4c91-a1d0-41abda6dce04'::uuid, 'text_box', 311356129, 'ref-pink', 'green-soft', 'red'),
  ('91cff23a-e048-48f4-b8bc-96f40fc89d30'::uuid, 'text_box', 1478297763, 'purple', 'ref-yellow', 'ref-red'),
  ('a4464a1a-b018-4f54-811b-6cb35e400fea'::uuid, 'text_box', 4294230611, 'yellow-soft', 'ref-pink', 'green'),
  ('a8ed15ca-129f-4df9-819d-d6b89357d77f'::uuid, 'text_box', 1803404640, 'ref-yellow', 'ref-pink', 'yellow'),
  ('d3453a2b-cefe-40be-9b2f-0cc29bb58995'::uuid, 'text_box', 1038865783, 'yellow', 'purple', 'ref-yellow'),
  ('e0c1644d-0067-491c-9412-218e9ff4566e'::uuid, 'text_box', 543674719, 'blue', 'purple-soft', 'ref-yellow'),
  ('f9695151-4bea-4648-b3f5-7fb921c9b1bd'::uuid, 'text_box', 2893349813, 'green', 'ref-pink', 'ref-yellow'),
  ('56074bf0-946d-480d-98ad-21d761689a4d'::uuid, 'text_box', 89349045, 'red', 'ref-yellow', 'ref-blue'),
  ('044370a3-2748-4bc8-8711-693130480e8e'::uuid, 'text_box', 1963138631, 'blue-soft', 'red', 'ref-yellow'),
  ('1d9f1fdb-06af-4dfe-b564-d9ebb41b29b7'::uuid, 'hero_box', 1765673476, 'purple-soft', 'ref-yellow', 'blue'),
  ('562a4af0-d80d-45c8-ad68-a1c36fe064e9'::uuid, 'hero_box', 753463506, 'blue', 'green-soft', 'ref-pink'),
  ('5d1053cd-79a9-4e3d-b918-9dbe5dacebd2'::uuid, 'text_box', 2651625926, 'ref-lime', 'blue', 'green-soft'),
  ('f409a12e-0f71-4a14-a2b0-abc7a1f5dac5'::uuid, 'text_box', 3227318655, 'blue-soft', 'blue', 'ref-yellow'),
  ('06d6b6a2-3b04-4fad-a689-ed3531a260e1'::uuid, 'text_box', 4282654364, 'ref-red', 'ref-yellow', 'red-soft'),
  ('33c30177-a8bc-4666-b34d-fe014380dd3b'::uuid, 'text_box', 1499462531, 'purple-soft', 'ref-yellow', 'ref-pink'),
  ('78e01a91-21c9-4e1e-b093-9fe1587f546f'::uuid, 'text_box', 2533410630, 'purple', 'ref-yellow', 'blue'),
  ('cebac3ad-278b-432d-a1b5-56af66a740a8'::uuid, 'text_box', 537341421, 'green', 'purple', 'ref-yellow'),
  ('dec90a48-d3a4-450f-af52-ea7611cf1a0a'::uuid, 'text_box', 3576479228, 'yellow', 'ref-pink', 'green-soft'),
  ('9b8a16c7-64be-437a-95b8-26c16df3b264'::uuid, 'text_box', 2129262762, 'ref-yellow', 'ref-blue', 'ref-red'),
  ('f1dec605-cc03-4637-8809-692528f6c362'::uuid, 'text_box', 1669479692, 'purple-soft', 'ref-yellow', 'purple'),
  ('fd5ca5ad-6dae-40b7-a85a-ec2fe8a23364'::uuid, 'text_box', 2411618278, 'purple', 'ref-yellow', 'ref-red'),
  ('02bb220c-a48c-47d6-bf7a-744e86be6156'::uuid, 'text_box', 3538810963, 'yellow', 'purple', 'ref-yellow'),
  ('1a3df805-bab2-4e32-bc18-5015601e9444'::uuid, 'text_box', 2872583430, 'green', 'ref-pink', 'ref-yellow'),
  ('7aa48627-42e5-475d-969c-0f4ce07b5e4a'::uuid, 'text_box', 4042614020, 'ref-pink', 'ref-lime', 'red'),
  ('84adca04-5d60-4467-803b-a4d38dfd77ab'::uuid, 'text_box', 3636292009, 'red-soft', 'ref-yellow', 'blue'),
  ('b16677b7-9ae8-48dd-b28d-ea14116430c2'::uuid, 'text_box', 3300651075, 'ref-blue', 'red', 'ref-lime'),
  ('45340202-1c70-4d97-81a3-2537817aee25'::uuid, 'text_box', 3199365778, 'purple-soft', 'ref-yellow', 'purple'),
  ('b3ff9bf0-f81c-4184-ac8b-5ca314ccd7fd'::uuid, 'hero_box', 1325242356, 'ref-lime', 'ref-pink', 'green-soft'),
  ('f7d50af3-8958-48fd-8ed5-9bcfdd1b900a'::uuid, 'text_box', 2127934789, 'yellow', 'ref-pink', 'green-soft'),
  ('67daff84-795e-4669-b14b-de31c9fc5e6d'::uuid, 'text_box', 1434770315, 'blue-soft', 'blue', 'ref-yellow'),
  ('c8885e3d-e572-4f55-9d4b-45e65d866808'::uuid, 'text_box', 2697569570, 'ref-lime', 'red', 'green-soft'),
  ('e92ba6e8-3aa3-41c0-be32-c2d6271b6b9a'::uuid, 'text_box', 1504116027, 'yellow', 'ref-pink', 'yellow-soft'),
  ('29f8a42a-c651-42fc-ac6d-bf9079bd6335'::uuid, 'text_box', 471527908, 'purple', 'ref-yellow', 'red'),
  ('b419ed70-8ca4-4875-9526-9b050b114b9d'::uuid, 'text_box', 3692402719, 'green', 'ref-pink', 'green-soft'),
  ('11ffdd57-8a3f-4fe9-bbc4-534e33fc5a2d'::uuid, 'hero_box', 839721089, 'blue-soft', 'ref-red', 'ref-yellow'),
  ('45b8d32a-0516-47db-a58a-1c25367300aa'::uuid, 'badge_intro', 3289296737, 'red-soft', 'blue', 'ref-lime'),
  ('480c3c80-4e28-4e92-a934-9a59526a3a6f'::uuid, 'hero_box', 4199029279, 'red', 'ref-lime', 'ref-pink'),
  ('74e665c6-b55d-427b-9490-9b8781ec9f65'::uuid, 'hero_box', 1566350409, 'ref-blue', 'ref-red', 'ref-lime'),
  ('17a10aaf-a453-4f22-93da-5ad372e142b9'::uuid, 'hero_box', 4030110485, 'green', 'ref-pink', 'yellow-soft'),
  ('51578929-9ad6-4fe2-9b93-9075e8bfc74f'::uuid, 'hero_box', 2736061254, 'yellow-soft', 'red', 'ref-lime'),
  ('949767d7-2b51-4349-a726-ab9e1dc3e75e'::uuid, 'hero_box', 3316473524, 'blue-soft', 'blue', 'ref-yellow'),
  ('e0000000-0000-4000-8000-000000000001'::uuid, 'hero_box', 3246936818, 'purple', 'ref-lime', 'red'),
  ('e0000000-0000-4000-8000-000000000002'::uuid, 'hero_box', 1124223151, 'red-soft', 'ref-red', 'ref-lime'),
  ('e0000000-0000-4000-8000-000000000003'::uuid, 'hero_box', 2568048446, 'blue-soft', 'blue', 'ref-yellow'),
  ('18a6efa0-cd8b-4534-823f-d86ac81d6d0b'::uuid, 'hero_box', 3062078518, 'blue-soft', 'blue', 'ref-yellow'),
  ('260aa769-070d-483f-86da-60fa7fd3f7c3'::uuid, 'text_box', 2272374816, 'ref-pink', 'yellow-soft', 'ref-red'),
  ('4c7902e5-f082-4ab4-8eb6-1f7ee28bb05d'::uuid, 'text_box', 3636549827, 'blue', 'ref-lime', 'ref-pink'),
  ('4e3d6299-f314-453e-b975-7580e3f2837b'::uuid, 'hero_box', 3981176205, 'green-soft', 'ref-pink', 'green'),
  ('741d421c-6b16-4709-b2ed-7deaa4a28064'::uuid, 'hero_box', 2760970828, 'red-soft', 'ref-yellow', 'ref-red'),
  ('ec950464-2a8a-4ee5-98f7-a35978791b4e'::uuid, 'text_box', 308182509, 'ref-yellow', 'red', 'blue-soft'),
  ('464a990c-11bb-4d4f-b7fa-8a183f5e62ed'::uuid, 'text_box', 1448950760, 'yellow', 'purple', 'ref-yellow'),
  ('626c1e62-1726-4b4c-a0e6-235f952e9b85'::uuid, 'hero_box', 601453563, 'ref-pink', 'ref-lime', 'ref-red'),
  ('391b8638-5bee-4797-af59-3b243f05c5d5'::uuid, 'hero_box', 3044631752, 'purple', 'ref-yellow', 'blue'),
  ('a69966fb-b4ae-49ea-926e-9444cebeb141'::uuid, 'text_box', 2285460339, 'purple-soft', 'ref-red', 'ref-yellow'),
  ('59a0864f-9d15-4f18-88dd-0445614c4b90'::uuid, 'text_box', 2979346870, 'ref-yellow', 'ref-red', 'ref-blue'),
  ('67735398-3097-428e-bf72-777c9289539e'::uuid, 'text_box', 1549908156, 'red-soft', 'ref-yellow', 'ref-pink'),
  ('df6ae827-40ca-4c9b-a71b-0624fe2aab4d'::uuid, 'hero_box', 1425910078, 'ref-red', 'ref-yellow', 'purple'),
  ('0bc05266-8632-45d8-9937-d14092c60808'::uuid, 'text_box', 2400137125, 'blue', 'ref-yellow', 'purple-soft'),
  ('ffdda97f-d655-4da2-ab21-6ff1b49d1683'::uuid, 'text_box', 2926826299, 'yellow-soft', 'blue', 'ref-lime'),
  ('0240fa74-9a6d-49a5-961b-d1dc1f7fa00e'::uuid, 'badge_intro', 2201458021, 'yellow', 'ref-pink', 'yellow-soft'),
  ('11af4a68-2319-448a-b340-362a20aa4b21'::uuid, 'badge_intro', 2195853485, 'ref-yellow', 'purple-soft', 'red'),
  ('6fb9152d-46f8-4e54-ac75-b361f2dba373'::uuid, 'hero_box', 4160380814, 'ref-blue', 'red', 'ref-yellow'),
  ('79916e12-8ab3-4b84-ab53-20b4c91374c0'::uuid, 'text_box', 2916922564, 'blue-soft', 'ref-red', 'ref-yellow'),
  ('ab48df93-b5a1-4745-bb04-427888914a3e'::uuid, 'text_box', 1066699369, 'red', 'ref-blue', 'ref-yellow'),
  ('b7bda830-8c9e-43c5-a5c3-e3f9cb990303'::uuid, 'badge_intro', 2595754023, 'purple', 'ref-yellow', 'red'),
  ('8ebb295e-767b-4eec-8d3f-821a8cbc863b'::uuid, 'text_box', 2800995271, 'ref-lime', 'blue', 'ref-blue'),
  ('3a8a9e4f-fc5d-4808-8706-9aae774d38bb'::uuid, 'badge_intro', 3041676135, 'blue', 'yellow-soft', 'ref-pink'),
  ('121a4d77-8a54-4903-a4f3-857607b083f8'::uuid, 'badge_intro', 72395627, 'green', 'ref-pink', 'yellow-soft'),
  ('1ac2259d-92ca-46c5-9df2-85c2589953ac'::uuid, 'badge_intro', 1436637548, 'yellow-soft', 'blue', 'ref-lime'),
  ('35e32bed-577f-44fa-9300-bb84d90c9898'::uuid, 'hero_box', 581341570, 'ref-pink', 'ref-lime', 'blue'),
  ('3e3ad4b5-226d-4cde-9501-0359fa0db2c6'::uuid, 'text_box', 2337256409, 'yellow', 'purple', 'ref-yellow'),
  ('4103db14-7741-4575-832c-ae43e74b3495'::uuid, 'badge_intro', 1476385701, 'purple-soft', 'ref-yellow', 'blue'),
  ('4a93c821-c166-4eb3-aa0c-2125d0e624e2'::uuid, 'text_box', 1004208471, 'blue-soft', 'ref-red', 'ref-yellow'),
  ('4d446b51-ecf7-4997-b6aa-abf2ce4d9ee0'::uuid, 'text_box', 544678573, 'green-soft', 'ref-pink', 'yellow'),
  ('9078602a-3189-47d4-a683-a82704a0bf36'::uuid, 'text_box', 27482488, 'ref-yellow', 'ref-blue', 'blue'),
  ('9d928a53-960b-4c86-af3a-594a1529b7ee'::uuid, 'badge_intro', 2259151907, 'red-soft', 'red', 'ref-yellow'),
  ('cc339be7-8662-4ed4-adeb-2317bb73d373'::uuid, 'badge_intro', 1754775174, 'ref-red', 'ref-lime', 'ref-pink'),
  ('0c8a9f80-2872-40b9-adca-4b951cb6369f'::uuid, 'badge_intro', 300299466, 'red', 'ref-lime', 'purple'),
  ('33f97f0d-ab4f-4171-aa90-c76988f1a023'::uuid, 'badge_intro', 3449855211, 'purple', 'ref-yellow', 'purple-soft'),
  ('380a4fd0-6159-4c96-8bac-8701b4910a83'::uuid, 'badge_intro', 767920743, 'blue', 'ref-lime', 'purple'),
  ('4c18a9fd-0b45-4bf8-b474-a0728545f52a'::uuid, 'badge_intro', 2971556547, 'ref-blue', 'blue', 'ref-lime'),
  ('4c496912-773c-414d-9a02-095eb437214e'::uuid, 'badge_intro', 1139467490, 'ref-lime', 'red', 'red-soft'),
  ('4ec62e7d-365e-4bb3-aa21-dcb1968c6a65'::uuid, 'text_box', 1916427726, 'green', 'ref-pink', 'yellow-soft'),
  ('821b6d08-9318-4688-8ce4-c78126332dd2'::uuid, 'text_box', 1601193475, 'ref-red', 'ref-lime', 'ref-pink'),
  ('8c41e775-0cf9-4d79-9701-682470d44c5d'::uuid, 'badge_intro', 3150408757, 'red-soft', 'ref-yellow', 'blue'),
  ('06887e41-db88-45bd-8f20-d4bc5e924f08'::uuid, 'text_box', 1310045220, 'ref-lime', 'red', 'green-soft'),
  ('dc2e4cf4-e3cc-4ed9-82b0-af9e1c863f60'::uuid, 'text_box', 413035018, 'green-soft', 'ref-red', 'ref-lime'),
  ('4dd251d3-e7aa-4a7c-a91a-dbd52031e79d'::uuid, 'badge_intro', 3257484670, 'yellow-soft', 'ref-pink', 'ref-lime'),
  ('3718c6a3-84a0-43d2-b851-15e904b5d10f'::uuid, 'badge_intro', 1979148552, 'yellow', 'purple', 'ref-yellow'),
  ('b5aaa516-88f0-4e10-b8f2-933a032ec554'::uuid, 'badge_intro', 526660891, 'purple', 'ref-yellow', 'ref-red'),
  ('d6f8dcc2-45e9-4957-8f6f-2985fd80827c'::uuid, 'hero_box', 1380574423, 'green', 'ref-pink', 'yellow-soft')
)
UPDATE public.today_cards t
SET feed_type = v.feed_type,
    feed_seed = v.feed_seed,
    bg_color_key = v.bg_color_key,
    chip_color_key = v.chip_color_key,
    box_color_key = v.box_color_key
FROM v
WHERE t.id = v.id
  AND t.feed_type IS NULL;

COMMIT;
