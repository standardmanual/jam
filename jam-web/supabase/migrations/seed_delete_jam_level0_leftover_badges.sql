-- 티켓 20260921_2129 후속: 트라이브 "JAM! 레벨 0" 삭제 후 남은 배지 6건 완전 삭제
--
-- 배경: 트라이브를 삭제하자(seed_delete_jam_level0_tribe.sql) 배지 6건(희귀 4·에픽 2)이
-- tribe_id NULL, item_book_id NULL 상태로 남았다. 사용자가 이 배지도 삭제하도록 지시했다.
--
-- 삭제 범위:
--   · badges 6건
--   · inventory_items 6건 (inventory_items_badge_id_fkey가 ON DELETE 동작이 없어 먼저 지워야 한다)
--       6건 모두 2026-09-14 관리자 마이그레이션(admin_migration_20260914_1945)으로 파기된 기록이다
--   · custody_events 10건 (inventory_items 삭제에 연쇄된다)
--   · 거래(trades)·슬롯·POI·포인트·미션 등 다른 참조는 삭제 전 조회에서 0건이었다
--
-- 배지 id 6건
--   5c08d83d-6c81-4bd0-91d6-da9f66cbb46b  5일 연속 습관 런
--   2d087fdc-4e42-436c-ad62-b8d94a980524  5일 연속 출석 워킹
--   65b17cb6-92b3-4f30-8ca9-9d55e2cdde7f  더블 데일리 런
--   8a5ec2d0-d2e2-4130-95f2-f49f19075b4b  모닝 & 이브닝
--   2f120cff-8b7a-49e6-b532-4fdad3ce3d9d  주간 5일 꾸준 러너
--   8887d669-8f47-4e02-b46a-0148a3ba67ab  주간 꾸준함 마스터
--
-- 복원용 백업은 유저명이 든 custody_events 때문에 저장소에 넣지 않았다. 실행 세션의 임시 폴더에
-- 복원 SQL이 있었으나 세션이 끝나면 사라진다.
--
-- 2026-09-21 사용자 지시("남은 배지 6건도 삭제해") 후 오케스트레이터가 Supabase(jam-prod,
-- project_id ceehnkzdbecxwzxrhhns)에 직접 실행했다. staging·프로덕션 공용 단일 DB다.
-- 스토리지에 올라간 배지 이미지 파일(images/badges/shader-lab/<id>.png)은 이 SQL로 지워지지 않는다.

BEGIN;

WITH target(id) AS (
  VALUES
    ('5c08d83d-6c81-4bd0-91d6-da9f66cbb46b'::uuid),
    ('2d087fdc-4e42-436c-ad62-b8d94a980524'::uuid),
    ('65b17cb6-92b3-4f30-8ca9-9d55e2cdde7f'::uuid),
    ('8a5ec2d0-d2e2-4130-95f2-f49f19075b4b'::uuid),
    ('2f120cff-8b7a-49e6-b532-4fdad3ce3d9d'::uuid),
    ('8887d669-8f47-4e02-b46a-0148a3ba67ab'::uuid)
),
del_inventory AS (
  DELETE FROM public.inventory_items
  WHERE badge_id IN (SELECT id FROM target)
  RETURNING id
),
del_badges AS (
  DELETE FROM public.badges
  WHERE id IN (SELECT id FROM target)
    AND type = 'item'
    AND tribe_id IS NULL
    AND item_book_id IS NULL
  RETURNING id
)
SELECT (SELECT count(*) FROM del_inventory) AS inventory_deleted,
       (SELECT count(*) FROM del_badges)    AS badges_deleted;

COMMIT;

-- ── 검증 쿼리 ───────────────────────────────────────────────────────────────
-- SELECT count(*) FROM public.badges WHERE id IN (<위 6개 id>);            -- 0
-- SELECT count(*) FROM public.inventory_items WHERE badge_id IN (<위 6개 id>);  -- 0
