-- 326_close_unclaimed_drops_of_inactive_collections.sql
-- 비활성 컬렉션 배지의 미픽업 월드 드랍을 함께 내린다 (티켓 20261106_1052)
--
-- 왜
--   어드민에서 끈 컬렉션(item_books.is_active = false)의 아이템 배지는 읽기 정책이 화면에서 숨기는데,
--   월드에 놓인 드랍(poi_drops)은 그대로 남아 줍기 함수(306번 pickup_drop)가 계속 줍게 한다. 줍기 함수는 장소가 켜져 있는지만 보고
--   컬렉션이 켜져 있는지는 보지 않는다. 컬렉션을 끌 때 소속 배지의 드랍을 내리는 연쇄는 티켓 20260914_1729에서 폐지돼 지금은 없다.
--   2026-11-06 측정: 미픽업 드랍 631건(시스템 611·사용자 20)이 모두 비활성 컬렉션 소속이다.
--   사용자 결정(2026-11-06): 컬렉션을 끄면 미픽업 드랍도 내린다. 다시 켜도 드랍은 복구하지 않는다. 기간이 끝난 컬렉션도 «비활성» 취급이다.
--
-- 하는 일
--   1. close_unclaimed_drops_of_inactive_collections(p_item_book_id) 신설: 정리 대상 드랍을 expire_stale_poi_drops()(108번)와 같은 방식으로 내린다.
--      poi_drops.is_available = FALSE, 개체 destroyed_at = NOW()·inventory_id = NULL, custody_events 'Expire'.
--      개체를 살려 두면 어드민 «소유자 없음» 목록(Orphaned)에 남기 때문에 기존 만료와 같이 파괴한다. 처리 건수를 돌려준다.
--      p_item_book_id를 주면 그 컬렉션만, NULL이면 전체를 본다.
--   2. 트리거 trg_item_books_close_drops: item_books.is_active가 true→false가 되는 순간 그 컬렉션 대상으로 1번을 부른다.
--      토글 경로가 여럿(어드민 PATCH·전체 저장 PUT·오픈 SQL 292·운영 묶음 실행기)이라 앱 코드가 아니라 DB 트리거로 잡는다.
--   3. expire_stale_poi_drops()(매일 0시 크론)가 기존 두 루프를 그대로 돌린 뒤 1번을 전체 대상(NULL)으로 한 번 더 부르고,
--      반환 JSON에 'closed_by_inactive_collection'을 더한다. 기간이 끝난 컬렉션(valid_until 경과)은 사건이 없어 트리거가 못 잡으므로
--      이 크론만 거른다(최대 하루 늦다). 적용 시 search_path는 181번 상태(public)를 유지한다.
--
-- 정리 대상 한 건의 정의
--   poi_drops.is_available = TRUE AND picked_up_at IS NULL 이고, 그 드랍 배지의 컬렉션이
--   is_active = FALSE 이거나 (valid_until IS NOT NULL AND valid_until < NOW()) 인 것.
--   badges.item_book_id가 NULL인 배지(체크인·활동 배지 등)는 대상이 아니다. 아직 열리지 않은 컬렉션(valid_from 미래)은 넣지 않는다.
--
-- 하지 않는 것
--   - 유저가 소유한 개체(inventory_id 있음)·장착 슬롯·컬렉션 완성 기록·포인트 원장은 건드리지 않는다. picked_up_at이 비어 있는 드랍 행과
--     그 드랍이 가리키는 개체만 본다.
--   - 컬렉션이 이미 꺼진 뒤 새로 생기는 드랍은 다음 0시 크론이 정리할 때까지 남는다. 줍기 차단은 이 파일의 범위가 아니다.
--   - 컬렉션을 다시 켜도(false→true) 내린 드랍을 복구하지 않는다. 트리거는 true→false에서만 돈다.
--   - 적용 시점의 기존 631건 정리는 이 파일에 넣지 않는다. 적용 뒤 정리 함수를 따로 한 번 호출한다.
--
-- 되돌림: 326_close_unclaimed_drops_of_inactive_collections_down.sql (파괴한 개체·내린 드랍은 되살리지 않는다)

-- ----------------------------------------------------------------
-- 1. 정리 함수
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_unclaimed_drops_of_inactive_collections(p_item_book_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row    RECORD;
  v_closed INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT pd.id, pd.poi_id, pd.inventory_item_id
    FROM public.poi_drops pd
    JOIN public.badges b ON b.id = pd.badge_id
    JOIN public.item_books ib ON ib.id = b.item_book_id
    WHERE pd.is_available = TRUE
      AND pd.picked_up_at IS NULL
      AND (ib.is_active = FALSE OR (ib.valid_until IS NOT NULL AND ib.valid_until < NOW()))
      AND (p_item_book_id IS NULL OR ib.id = p_item_book_id)
    FOR UPDATE OF pd
  LOOP
    UPDATE public.poi_drops SET is_available = FALSE WHERE id = v_row.id;
    IF v_row.inventory_item_id IS NOT NULL THEN
      UPDATE public.inventory_items SET destroyed_at = NOW(), inventory_id = NULL
      WHERE id = v_row.inventory_item_id AND destroyed_at IS NULL;
      INSERT INTO public.custody_events (inventory_item_id, event_type, poi_id)
      VALUES (v_row.inventory_item_id, 'Expire', v_row.poi_id);
    END IF;
    v_closed := v_closed + 1;
  END LOOP;

  RETURN v_closed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_unclaimed_drops_of_inactive_collections(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_unclaimed_drops_of_inactive_collections(uuid) TO service_role;

-- ----------------------------------------------------------------
-- 2. 트리거 함수와 트리거 (is_active true→false 전환에서만)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_item_books_close_drops()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.close_unclaimed_drops_of_inactive_collections(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_item_books_close_drops() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_item_books_close_drops ON public.item_books;
CREATE TRIGGER trg_item_books_close_drops
  AFTER UPDATE OF is_active ON public.item_books
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active AND NEW.is_active = FALSE)
  EXECUTE FUNCTION public.trg_item_books_close_drops();

-- ----------------------------------------------------------------
-- 3. expire_stale_poi_drops() — 기존 두 루프는 108번 본문 그대로, 끝에 컬렉션 비활성 정리를 더한다
--    시그니처는 그대로(오버로드 금지). CREATE OR REPLACE는 속성을 통째로 바꾸므로 181번의 search_path를 다시 적는다.
--    권한(109번: PUBLIC 회수, service_role만 실행)은 CREATE OR REPLACE로 유지된다.
-- ----------------------------------------------------------------
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
  v_closed          INTEGER := 0;
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

  -- 20261106_1052: 비활성(또는 기간이 끝난) 컬렉션 배지의 미픽업 드랍. 안전망이자 기간 종료의 유일한 경로
  v_closed := public.close_unclaimed_drops_of_inactive_collections(NULL);

  RETURN jsonb_build_object(
    'expired', v_expired_count,
    'orphaned_by_deleted_badge', v_orphaned_count,
    'closed_by_inactive_collection', v_closed
  );
END;
$$;
