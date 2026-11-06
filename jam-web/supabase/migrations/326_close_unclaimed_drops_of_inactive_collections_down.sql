-- 326_close_unclaimed_drops_of_inactive_collections_down.sql
-- 326을 되돌린다 (티켓 20261106_1052)
--
-- 하는 일
--   1. 트리거 trg_item_books_close_drops, 트리거 함수, 정리 함수를 지운다.
--   2. expire_stale_poi_drops()를 108번 본문(두 루프, 반환 JSON 키 2개)으로 복원한다. search_path는 181번 상태(public)를 유지한다.
--
-- 주의
--   - 326이 이미 파괴한 개체와 내린 드랍(poi_drops.is_available = FALSE)은 되살리지 않는다(복구 불필요가 사용자 결정이다).
--     기존 631건의 복구가 필요하면 카리나가 정리 직전에 만든 백업 표 backup_drop_cleanup_20261106의 복구 SQL을 따로 쓴다.
--   - 순서: 트리거 → 트리거 함수 → expire_stale_poi_drops 복원 → 정리 함수. expire_stale_poi_drops가 정리 함수를 부르고 있으므로
--     복원을 먼저 하고 정리 함수를 지운다.

DROP TRIGGER IF EXISTS trg_item_books_close_drops ON public.item_books;
DROP FUNCTION IF EXISTS public.trg_item_books_close_drops();

CREATE OR REPLACE FUNCTION public.expire_stale_poi_drops()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row             RECORD;
  v_expired_count   INTEGER := 0;
  v_orphaned_count  INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT pd.id, pd.poi_id, pd.inventory_item_id
    FROM public.poi_drops pd
    WHERE pd.is_available = TRUE AND pd.expires_at IS NOT NULL AND pd.expires_at < NOW()
    FOR UPDATE OF pd
  LOOP
    UPDATE public.poi_drops SET is_available = FALSE WHERE id = v_row.id;
    IF v_row.inventory_item_id IS NOT NULL THEN
      UPDATE public.inventory_items SET destroyed_at = NOW(), inventory_id = NULL
      WHERE id = v_row.inventory_item_id AND destroyed_at IS NULL;
      INSERT INTO public.custody_events (inventory_item_id, event_type, poi_id)
      VALUES (v_row.inventory_item_id, 'Expire', v_row.poi_id);
    END IF;
    v_expired_count := v_expired_count + 1;
  END LOOP;

  FOR v_row IN
    SELECT pd.id, pd.poi_id, pd.inventory_item_id
    FROM public.poi_drops pd
    JOIN public.badges b ON b.id = pd.badge_id
    WHERE pd.is_available = TRUE AND pd.picked_up_at IS NULL AND b.deleted_at IS NOT NULL
    FOR UPDATE OF pd
  LOOP
    UPDATE public.poi_drops SET is_available = FALSE WHERE id = v_row.id;
    IF v_row.inventory_item_id IS NOT NULL THEN
      UPDATE public.inventory_items SET destroyed_at = NOW(), inventory_id = NULL
      WHERE id = v_row.inventory_item_id AND destroyed_at IS NULL;
      INSERT INTO public.custody_events (inventory_item_id, event_type, poi_id)
      VALUES (v_row.inventory_item_id, 'Expire', v_row.poi_id);
    END IF;
    v_orphaned_count := v_orphaned_count + 1;
  END LOOP;

  RETURN jsonb_build_object('expired', v_expired_count, 'orphaned_by_deleted_badge', v_orphaned_count);
END;
$$;

DROP FUNCTION IF EXISTS public.close_unclaimed_drops_of_inactive_collections(uuid);
