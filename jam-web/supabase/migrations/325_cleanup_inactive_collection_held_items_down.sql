-- 325_cleanup_inactive_collection_held_items_down.sql
-- 325로 파괴한 개체 21개를 원래 인벤토리로 되돌린다 (티켓 20261106_1044)
--
-- 하는 일 (한 트랜잭션)
--   1. 아래 21개가 모두 «325가 파괴한 상태»(destroyed_at 있음, inventory_id 없음, 표지가 붙은 AdminDestroy 이력 있음)인지 본다. 아니면 멈춘다.
--   2. destroyed_at을 비우고 inventory_id를 원래 인벤토리로 돌린다.
--   3. 인벤토리별 used_slots를 되돌린 개수만큼 올린다.
--   4. 325가 남긴 AdminDestroy 이력을 지운다(표지 '정리 20261106 비활성 컬렉션 개체').
--
-- 주의
--   - 정리 뒤에 해당 인벤토리가 다른 개체로 가득 찼다면 used_slots <= max_slots 제약이 걸려 전체가 취소된다. 그때는 칸을 비우고 다시 실행한다.
--   - 정리로 풀린 일련번호를 다른 개체가 받았다면 일련번호 부분 유니크 인덱스에 걸려 취소된다.

DO $$
DECLARE
  v_marker CONSTANT text := '정리 20261106 비활성 컬렉션 개체';
  v_total  integer;
  v_ready  integer;
BEGIN
  CREATE TEMP TABLE _d325 (item_id uuid, inventory_id uuid, user_id uuid) ON COMMIT DROP;
  INSERT INTO _d325 (item_id, inventory_id, user_id) VALUES
  ('3f963944-e937-4afd-bdfc-ba61f134483d'::uuid, '480cbf94-a66b-4c1c-bb21-b40ef53842e7'::uuid, '00000000-0000-0000-0000-000000000001'::uuid),
  ('c614d89f-0f2b-441e-890d-c24b3cd47a80'::uuid, '480cbf94-a66b-4c1c-bb21-b40ef53842e7'::uuid, '00000000-0000-0000-0000-000000000001'::uuid),
  ('5d9fd685-962f-47dc-95e2-95c353236e93'::uuid, '77fcaf71-0b61-4492-b034-001687c641df'::uuid, '25782789-2840-436c-827e-7ec90f898020'::uuid),
  ('61a76447-4a6c-41ea-bb80-3e4e7658aa7b'::uuid, '77fcaf71-0b61-4492-b034-001687c641df'::uuid, '25782789-2840-436c-827e-7ec90f898020'::uuid),
  ('a6b4fdaf-05c6-4474-90a8-3d76f1508def'::uuid, '77fcaf71-0b61-4492-b034-001687c641df'::uuid, '25782789-2840-436c-827e-7ec90f898020'::uuid),
  ('a71ea3e2-855c-402f-9fa5-7fbef8d8b18f'::uuid, '77fcaf71-0b61-4492-b034-001687c641df'::uuid, '25782789-2840-436c-827e-7ec90f898020'::uuid),
  ('cc8a9566-5879-49bd-b793-73aa11786875'::uuid, '77fcaf71-0b61-4492-b034-001687c641df'::uuid, '25782789-2840-436c-827e-7ec90f898020'::uuid),
  ('e510f4ed-b542-4362-b2a2-f4f11af8443b'::uuid, '77fcaf71-0b61-4492-b034-001687c641df'::uuid, '25782789-2840-436c-827e-7ec90f898020'::uuid),
  ('f8a206a2-0454-4a08-9941-4786edc6866c'::uuid, '77fcaf71-0b61-4492-b034-001687c641df'::uuid, '25782789-2840-436c-827e-7ec90f898020'::uuid),
  ('7096184b-baa8-44c1-92b1-a715f24b0036'::uuid, '51a0680e-cd8f-45d7-a8ed-8c0329370389'::uuid, '3649ed39-2be2-402e-82ae-41e0cd328105'::uuid),
  ('96b4b51b-1f64-4e9f-a23f-b5160553208e'::uuid, '51a0680e-cd8f-45d7-a8ed-8c0329370389'::uuid, '3649ed39-2be2-402e-82ae-41e0cd328105'::uuid),
  ('0339ac4b-1c39-47d1-aff0-72682d1d388b'::uuid, '00da0281-a12a-42c6-873b-79cd6743959f'::uuid, 'cbecda65-04a4-4b6c-a488-00e35dfdebc4'::uuid),
  ('269909ed-3dc7-449a-bb6e-76608eb8fea5'::uuid, '00da0281-a12a-42c6-873b-79cd6743959f'::uuid, 'cbecda65-04a4-4b6c-a488-00e35dfdebc4'::uuid),
  ('2df94622-5608-450b-bcfb-e00c620d3638'::uuid, '00da0281-a12a-42c6-873b-79cd6743959f'::uuid, 'cbecda65-04a4-4b6c-a488-00e35dfdebc4'::uuid),
  ('3c0c7f7b-a33c-4529-87c0-4e7464d11f58'::uuid, '00da0281-a12a-42c6-873b-79cd6743959f'::uuid, 'cbecda65-04a4-4b6c-a488-00e35dfdebc4'::uuid),
  ('40bf35e0-3774-4924-8779-db1229e1be40'::uuid, '00da0281-a12a-42c6-873b-79cd6743959f'::uuid, 'cbecda65-04a4-4b6c-a488-00e35dfdebc4'::uuid),
  ('8cbb378a-20ab-4650-82a7-412055ab64a9'::uuid, '00da0281-a12a-42c6-873b-79cd6743959f'::uuid, 'cbecda65-04a4-4b6c-a488-00e35dfdebc4'::uuid),
  ('a3f9aa5f-b41d-4a26-b657-c3d6e022093f'::uuid, '00da0281-a12a-42c6-873b-79cd6743959f'::uuid, 'cbecda65-04a4-4b6c-a488-00e35dfdebc4'::uuid),
  ('bd99dc8f-3473-4995-a427-307e0246dd3a'::uuid, '00da0281-a12a-42c6-873b-79cd6743959f'::uuid, 'cbecda65-04a4-4b6c-a488-00e35dfdebc4'::uuid),
  ('0ccee48e-7140-4491-867d-17fdfdb09839'::uuid, '4233b3bb-08f1-48e4-ad6b-bca6a2c65442'::uuid, 'dad44dda-5a52-45db-a060-669230118f34'::uuid),
  ('c08303b7-233e-42c1-a641-7004cbb84f1b'::uuid, '4233b3bb-08f1-48e4-ad6b-bca6a2c65442'::uuid, 'dad44dda-5a52-45db-a060-669230118f34'::uuid);

  SELECT count(*) INTO v_total FROM _d325;
  IF v_total <> 21 THEN
    RAISE EXCEPTION '325 되돌림: 목록이 %개다 (기대 21개)', v_total;
  END IF;

  SELECT count(*) INTO v_ready
  FROM _d325 d
  JOIN public.inventory_items ii ON ii.id = d.item_id
  WHERE ii.destroyed_at IS NOT NULL
    AND ii.inventory_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.custody_events ce
      WHERE ce.inventory_item_id = d.item_id AND ce.event_type = 'AdminDestroy' AND ce.actor_username = v_marker
    );
  IF v_ready <> 21 THEN
    RAISE EXCEPTION '325 되돌림: 325가 파괴한 상태인 개체가 %개뿐이다 (기대 21개)', v_ready;
  END IF;

  PERFORM 1 FROM public.inventory WHERE id IN (SELECT DISTINCT inventory_id FROM _d325) FOR UPDATE;

  UPDATE public.inventory_items ii
  SET destroyed_at = NULL, inventory_id = d.inventory_id
  FROM _d325 d
  WHERE ii.id = d.item_id;

  UPDATE public.inventory inv
  SET used_slots = inv.used_slots + c.n
  FROM (SELECT inventory_id, count(*)::integer AS n FROM _d325 GROUP BY inventory_id) c
  WHERE inv.id = c.inventory_id;

  DELETE FROM public.custody_events ce
  USING _d325 d
  WHERE ce.inventory_item_id = d.item_id AND ce.event_type = 'AdminDestroy' AND ce.actor_username = v_marker;
END $$;
