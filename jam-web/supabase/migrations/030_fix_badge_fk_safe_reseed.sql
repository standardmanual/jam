-- ============================================================
-- Migration 030: 액티비티 배지 재시드 FK 안전망 (C-2)
--
-- 배경:
--   029(_reseed_activity_badges_v2)는 `DELETE FROM badges WHERE type='activity'`
--   실행 시 poi.linked_badge_id 만 NOT IN 으로 보호하고, 아래 FK 테이블들은
--   보호하지 않는다. 해당 테이블이 삭제 대상 activity 배지를 참조하면 029는
--   FK 위반(RESTRICT)으로 실패한다.
--     - item_books.required_activity_badge_id (011→018에서 NULL 허용으로 완화됨)
--     - item_books.reward_badge_id            (NULL 허용)
--     - drop_events.badge_id                  (NOT NULL)
--     - poi_drops.badge_id                    (NOT NULL)
--
-- 참고: missions 테이블(011_phases_15_18.sql)은 reward_id UUID(범용)로 보상을
--   관리하며 badge FK 컬럼이 없다. 따라서 missions는 이 마이그레이션의 대상이 아님.
--
-- 목적:
--   이 마이그레이션은 029의 재시드를 "다시 실행"하지 않는다.
--   029가 성공한 환경에서는 아래 작업이 모두 매칭 0건이므로 완전한 no-op다.
--   대신 향후 activity 배지 삭제/재시드가 FK 위반으로 실패하지 않도록
--   NULL 허용 FK를 ON DELETE SET NULL 로 강화하고, 남아있을 수 있는 위험 참조를
--   방어적으로 정리한다.
--
-- 안전성:
--   - NOT NULL 컬럼(drop_events.badge_id, poi_drops.badge_id)은 SET NULL 불가.
--     이 컬럼들은 향후 재시드 시 029의 poi 패턴처럼 "참조되는 배지를 삭제 대상에서
--     제외"하는 방식으로 다루어야 한다(하단 주석 참조).
-- ============================================================

BEGIN;

-- ── 1) NULL 허용 badge FK → ON DELETE SET NULL 로 강화 ──────────────────────
-- 컬럼이 실제 DB에 존재하는 경우에만 실행 (스키마 버전 차이 방어).

-- item_books.reward_badge_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'item_books'
      AND column_name = 'reward_badge_id'
  ) THEN
    ALTER TABLE public.item_books
      DROP CONSTRAINT IF EXISTS item_books_reward_badge_id_fkey;
    ALTER TABLE public.item_books
      ADD CONSTRAINT item_books_reward_badge_id_fkey
      FOREIGN KEY (reward_badge_id) REFERENCES public.badges(id) ON DELETE SET NULL;

    -- 방어적 참조 정리 (029 성공 시 매칭 0건 = no-op)
    UPDATE public.item_books ib
      SET reward_badge_id = NULL
      FROM public.badges b
      WHERE ib.reward_badge_id = b.id
        AND b.type = 'activity';
  END IF;
END $$;

-- item_books.required_activity_badge_id (018에서 NULL 허용으로 완화됨)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'item_books'
      AND column_name = 'required_activity_badge_id'
  ) THEN
    ALTER TABLE public.item_books
      DROP CONSTRAINT IF EXISTS item_books_required_activity_badge_id_fkey;
    ALTER TABLE public.item_books
      ADD CONSTRAINT item_books_required_activity_badge_id_fkey
      FOREIGN KEY (required_activity_badge_id) REFERENCES public.badges(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 2) NOT NULL badge FK 안내 (자동 처리 불가) ──────────────────────────────
-- drop_events.badge_id / poi_drops.badge_id 는 NOT NULL 이라 ON DELETE SET NULL
-- 로 강화할 수 없다. 향후 activity 배지 재시드 시 아래처럼 "참조 배지 삭제 제외"
-- 패턴을 사용해야 FK 위반 없이 안전하게 재시드된다:
--
--   DELETE FROM public.badges
--     WHERE type = 'activity'
--       AND id NOT IN (SELECT linked_badge_id FROM public.poi WHERE linked_badge_id IS NOT NULL)
--       AND id NOT IN (SELECT required_activity_badge_id FROM public.item_books WHERE required_activity_badge_id IS NOT NULL)
--       AND id NOT IN (SELECT badge_id FROM public.drop_events)
--       AND id NOT IN (SELECT badge_id FROM public.poi_drops);

COMMIT;
