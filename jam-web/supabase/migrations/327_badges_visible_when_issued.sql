-- 327_badges_visible_when_issued.sql
-- 이미 발급되어 서비스에 보이는 아이템 배지는 컬렉션이 비활성이어도 읽히게 한다 (티켓 20261106_1124, 1단계: 배지)
--
-- 왜
--   어드민에서 컬렉션을 비활성하는 뜻은 «신규로 아이템 배지를 생성해 발급하는 것을 막는 것»이다(사용자 2026-11-06 결정).
--   그런데 `badges: 전체 읽기 허용` 정책(216)은 비활성 컬렉션 소속 배지를 모두에게 숨겨서, 그 배지의 개체를 이미 가진 사람도
--   인벤토리 화면에서 못 본다. 칸은 10/10인데 8개만 보이고 «가득 찼어요»가 나오는 증상의 원인이다(티켓 20261106_1044).
--
-- 하는 일 (한 트랜잭션 — 정책을 지우고 만드는 사이에 읽기가 비지 않는다)
--   1. `public.badge_has_live_item(uuid)` 함수를 만든다. 그 배지의 파괴되지 않은 개체(inventory_items.destroyed_at IS NULL)가 있거나,
--      줍기 가능한 월드 드랍(poi_drops.is_available)이 있으면 true. 보유·장착·월드 드랍·소유자 없음을 모두 «발급된 것»으로 본다.
--      inventory_items는 본인 것만 읽히는 정책이라 정책 안에서 직접 조회하면 타인 개체(프로필의 장착 개체 등)가 빠진다.
--      그래서 SECURITY DEFINER로 소유자 권한으로 조회한다. 반환은 boolean 하나라 다른 행을 새게 하지 않는다.
--   2. 부분 인덱스 둘을 만든다(함수 안의 EXISTS가 배지마다 불린다). 표가 1천 행대라 CONCURRENTLY 없이 같은 트랜잭션에서 만든다.
--        idx_inventory_items_badge_live ON inventory_items (badge_id) WHERE destroyed_at IS NULL
--        idx_poi_drops_badge_available  ON poi_drops (badge_id) WHERE is_available
--   3. `badges: 전체 읽기 허용` 정책을 지우고 다시 만든다. 첫 번째 조건(활동 배지 공개 시각)은 216 글자 그대로 두고,
--      두 번째 조건에 `OR public.badge_has_live_item(id)`를 더한다. 값싼 조건(item_book_id IS NULL, 컬렉션 노출)을 앞에 둔다.
--
-- 하지 않는 것
--   - 개체가 하나도 없는 비활성·예약 컬렉션 배지는 지금처럼 숨는다(오픈 때 is_active 하나로 켜는 계획, 292).
--   - 신규 발급을 막는 쪽(드랍 엔진·컬렉션 완성 판정)은 이미 컬렉션 노출 판정을 쓰므로 바꾸지 않는다.
--   - 컬렉션(item_books) 읽기 정책은 건드리지 않는다(2단계 20261106_1125).
--   - 정책의 `is_active` 조건 자체를 지우지 않는다(예약 컬렉션 배지 수천 개가 한꺼번에 노출된다).
--   - 정책 이름은 216처럼 그대로 둔다.
--
-- 되돌림: 327_badges_visible_when_issued_down.sql (정책을 216 조건으로 복원한 뒤 함수와 인덱스 둘을 지운다)
--
-- 이 파일은 실행하지 않는다. 적용은 카리나가 드라이런(적용→점검→되돌림→원상 대조→예외 취소) 뒤에 한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.badge_has_live_item(p_badge_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.inventory_items i
           WHERE i.badge_id = p_badge_id AND i.destroyed_at IS NULL
         )
      OR EXISTS (
           SELECT 1 FROM public.poi_drops d
           WHERE d.badge_id = p_badge_id AND d.is_available = TRUE
         );
$$;

REVOKE ALL ON FUNCTION public.badge_has_live_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.badge_has_live_item(uuid) TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_inventory_items_badge_live
  ON public.inventory_items (badge_id) WHERE destroyed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_poi_drops_badge_available
  ON public.poi_drops (badge_id) WHERE is_available;

DROP POLICY "badges: 전체 읽기 허용" ON public.badges;

CREATE POLICY "badges: 전체 읽기 허용" ON public.badges
  FOR SELECT TO authenticated
  USING (
    (type <> 'activity' OR valid_from IS NULL OR valid_from <= now())
    AND (
      item_book_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.item_books b
        WHERE b.id = badges.item_book_id
          AND b.is_active = TRUE
          AND (b.valid_from IS NULL OR b.valid_from <= now())
      )
      OR public.badge_has_live_item(id)
    )
  );

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
-- 1) 정책 본문에 새 함수가 들어갔는지:
--   SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'badges' AND policyname = 'badges: 전체 읽기 허용';
-- 2) 함수 권한(PUBLIC 없음, anon·authenticated·service_role 있음):
--   SELECT proacl FROM pg_proc WHERE proname = 'badge_has_live_item';
-- 3) 인덱스 둘:
--   SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_inventory_items_badge_live', 'idx_poi_drops_badge_available');
-- 4) authenticated로 읽을 때: 살아 있는 개체가 있는 비활성 컬렉션 배지는 읽히고, 개체가 없는 비활성 컬렉션 배지는 읽히지 않는다.
