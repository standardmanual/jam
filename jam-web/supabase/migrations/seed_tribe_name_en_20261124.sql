-- seed_tribe_name_en_20261124.sql
-- 트라이브 영문 이름 두 개를 사용자 결정대로 바꾼다 (티켓 20261124_1954, 상위 20261124_1741)
--   찰칵단: CLICK CREW → CHALKAKDAN (한글 발음을 로마자로 그대로 적는다)
--   소나무 잡화점: PINE TREE GENERAL STORE → PINE TREE STORE
-- ⚠️ 공용 DB 영향: 적용하는 순간 staging·프로덕션 어드민의 표지 생성기가 새 이름으로 그린다(이미 적용한 표지 이미지는 그대로).
-- 가드: 활성 트라이브 중 이름과 옛 값이 모두 맞는 행이 정확히 2개일 때만 갱신한다. 아니면 예외로 전체가 되돌아간다.
--
-- 되돌림 SQL:
--   UPDATE public.tribes SET name_en = 'CLICK CREW' WHERE name = '찰칵단' AND is_active;
--   UPDATE public.tribes SET name_en = 'PINE TREE GENERAL STORE' WHERE name = '소나무 잡화점' AND is_active;
--
-- 사후 확인:
--   SELECT name, name_en FROM public.tribes WHERE name_en IS NOT NULL ORDER BY name;   -- 5행, 위 두 값만 바뀜

DO $name_en$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.tribes t
     SET name_en = v.name_en
    FROM (VALUES
      ('찰칵단', 'CLICK CREW', 'CHALKAKDAN'),
      ('소나무 잡화점', 'PINE TREE GENERAL STORE', 'PINE TREE STORE')
    ) AS v(name, old_en, name_en)
   WHERE t.name = v.name AND t.is_active AND t.name_en = v.old_en;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 2 THEN
    RAISE EXCEPTION '트라이브 영문 이름 갱신 대상이 2행이어야 하는데 %행이다', v_updated;
  END IF;
END $name_en$;
