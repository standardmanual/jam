-- 304_locked_item_open_points.sql
-- 잠긴 아이템 배지를 잼 채우기 대신 포인트로 여는 DB 함수 (티켓 20261028_1737 1회, 상위 20261028_1730, 결정 D4·D6)
--
-- 새 함수 2개(locked_item_open_points, 고정 트리거 함수)와 inventory_items 트리거 1개를 더하고, award_points에 9번째 인자를 더한다.
-- 옛 locked_item_open·locked_item_fill은 건드리지 않는다(U11에서 축소). 옛 코드는 이 파일 적용 뒤에도 그대로 동작한다.
--
-- 기존 객체에 닿는 부분(사용자 확인 뒤 적용, 적용 전에 롤백 드라이런으로 아래 «확인할 시나리오»를 돌린다)
--   - award_points: 8개 인자 시그니처를 지우고 9개 인자(p_source_inventory_item_id UUID DEFAULT NULL)로 다시 만든다.
--     CREATE OR REPLACE는 인자 수가 다르면 오버로드를 하나 더 만들고, 7·8개 인자로 이름 지정 호출하는 기존 호출이 «is not unique»로
--     깨진다(157과 DEV_PROCESS_GUARDRAILS 패턴 14). 그래서 157과 같은 방식으로 옛 시그니처를 먼저 지운다. 같은 파일 한 트랜잭션이라
--     지우고 다시 만드는 사이에 함수가 없는 틈은 밖에서 보이지 않는다. 본문은 157과 같고 원장 열 하나(source_inventory_item_id)만 더 쓴다.
--     admin_deduct_points(252)·slot_item_into_book(157)은 8개 인자를 위치로 부르는데, 9번째가 DEFAULT NULL이라 그대로 맞는다.
--   - inventory_items 트리거 trg_inventory_items_fix_unlock_points: 잠긴 채로 되는 순간(INSERT, 또는 UPDATE ... SET locked = TRUE)
--     unlock_points_required가 비어 있으면 값을 채운다. 값만 채우고 예외를 던지지 않는다.
--
-- 규칙(동작 설계, 티켓 20261028_1737)
--   - 필요 포인트 = inventory_items.unlock_points_required. 비어 있으면(고정 전 개체) 배지 등급별 jam_policy.locked_points_*를 쓴다.
--     등급이 비어 있으면 common으로 본다. 0이면 차감 줄을 만들지 않는다.
--   - 고정 트리거: 그 유저에게 챕터가 아직 없고(user_chapters 행이 없거나 chapter_no가 NULL — 캡슐의 preQuest와 같은 조건) 이 개체 말고는
--     lock_reason이 있는 개체가 그 유저에게 없으면 0으로 고정한다(퀘스트의 첫 잠긴 배지는 포인트 없이 연다). 아니면 등급별 정책값으로 고정한다.
--     «첫 하나»가 두 경로에서 동시에 생기지 않도록 유저 단위 트랜잭션 어드바이저리 잠금을 건다.
--     개체가 아직 유저에게 배정되지 않았으면(inventory_id NULL) 무료 판정은 건너뛰고 정책값을 넣는다.
--   - locked_item_open_points(p_user_id, p_item_id) → JSONB. 한 트랜잭션, 순서:
--       이용 정지 확인 → 개체 행 잠금(내 것, 버려지거나 드랍되지 않음) → 잠겨 있는지 → 지갑 행 잠금과 잔액 확인(모자라면 아무것도 바꾸지 않고 거절)
--       → 차감 줄 award_points(-N, 'locked_unlock_cost', 개체 연결) → 열림(locked=false, unlocked_at) →
--       획득 줄(배지 포인트가 있고 point_awarded_at이 비었을 때만 award_points(+M, 'badge_point_reward'), point_awarded_at 기록) → 이력(unlocked)
--     이미 칸을 차지하고 있으므로 인벤토리가 가득 차 있어도 열 수 있다. 동시에 두 번 열어도 개체 행 잠금 때문에 두 번째는 not_locked다.
--     지갑 행 잠금이 같은 지갑의 동시 차감·지급을 직렬화한다. 포인트 지급이 실패하면 열기 전체가 되돌려진다.
--   - 잔액이 0 아래로 내려가지 않게 하는 DB 제약(266)은 출시 뒤에 걸린다. 그 전에는 이 함수의 잠금과 잔액 확인이 방어다(admin_deduct_points와 같은 방식).
--   - service_role만 실행한다. anon·authenticated·PUBLIC 권한은 회수한다.
--
-- 오류 코드(함수가 돌려주는 error)
--   user_suspended / item_not_found / not_locked / insufficient_points(+ required, balance)
-- 성공 응답
--   {ok:true, itemId, badgeId, serialNumber, pointsAwarded(획득 줄, 없으면 0), pointsSpent(차감, 없으면 0), pointBalance(연 뒤 잔액)}
--
-- 적용 전 확인(읽기 전용 SELECT)
--   SELECT oid::regprocedure FROM pg_proc WHERE proname = 'award_points';
--        -- 1행: award_points(uuid,integer,text,uuid,uuid,text,text,uuid) — 7개 인자짜리가 남아 있으면 안 된다
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.inventory_items'::regclass AND NOT tgisinternal;   -- 기존 트리거 목록(새 이름이 없어야 함)
--   SELECT count(*) FROM public.inventory_items WHERE locked;                                                -- 0(300 적용 때 실측)
--   SELECT locked_points_common, locked_points_rare, locked_points_epic, locked_points_mystic FROM public.jam_policy;  -- 50, 100, 200, 400
--   SELECT (SELECT COALESCE(sum(balance),0) FROM public.point_wallets) AS wallets,
--          (SELECT total_minted - total_reclaimed FROM public.point_treasury WHERE id = 1) AS treasury,
--          (SELECT COALESCE(sum(amount),0) FROM public.point_transactions) AS ledger;                        -- 세 값이 같다(합계 불변식)
--
-- 적용 후 확인(읽기 전용 SELECT)
--   SELECT oid::regprocedure FROM pg_proc WHERE proname = 'award_points';                                    -- 1행: 9개 인자
--   SELECT oid::regprocedure FROM pg_proc WHERE proname IN ('locked_item_open_points','locked_item_open','locked_item_fill');   -- 3행(옛 둘은 그대로)
--   SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'public.inventory_items'::regclass AND tgname = 'trg_inventory_items_fix_unlock_points';  -- 1행, 'O'
--   SELECT has_function_privilege('authenticated','public.locked_item_open_points(uuid,uuid)','EXECUTE'),
--          has_function_privilege('anon','public.locked_item_open_points(uuid,uuid)','EXECUTE'),
--          has_function_privilege('service_role','public.locked_item_open_points(uuid,uuid)','EXECUTE');    -- false, false, true
--   SELECT has_function_privilege('authenticated','public.award_points(uuid,integer,text,uuid,uuid,text,text,uuid,uuid)','EXECUTE'),
--          has_function_privilege('service_role','public.award_points(uuid,integer,text,uuid,uuid,text,text,uuid,uuid)','EXECUTE');   -- false, true
--   SELECT count(*) FROM public.point_wallets WHERE balance < 0;                                             -- 0
--   적용 전 합계 불변식 쿼리를 다시 돌려 세 값이 같은지 본다.
--
-- 롤백 드라이런에서 확인할 시나리오(DO 블록 끝에서 RAISE EXCEPTION으로 전체를 되돌린다. 실제 행을 남기지 않는다)
--   1. 옛 호출 모양이 그대로 되는지: award_points를 7개 인자(위치)·8개 인자(위치)·이름 지정으로 한 번씩 불러 «is not unique» 없이 원장 줄이 생긴다.
--   2. 합계 불변식: Σ지갑 = 발행 − 회수 = Σ원장이 시나리오 전후로 같다.
--   3. 고정 트리거: 동기화형(grant_inventory_item_locked)·캡슐형·믹스형 잠금 입히기 3가지를 재현한다.
--      챕터 없는 유저의 첫 잠긴 개체는 0, 둘째는 등급별 정책값, 챕터 있는 유저의 첫 개체는 정책값이다. 정책값을 바꿔도 이미 고정된 값은 변하지 않는다.
--   4. 열기: 잔액 충분 → 원장 두 줄(차감 −N, 획득 +M)과 이력 한 줄, 응답 키 6개. 필요 포인트 0 → 차감 줄 없음.
--      잔액 부족 → insufficient_points와 required·balance, 개체·지갑·원장 불변. 이미 연 개체 → not_locked. 남의 개체·없는 개체 → item_not_found.
--      이용 정지 유저 → user_suspended. 같은 개체를 두 번 열기 → 두 번째는 not_locked이고 차감은 한 번뿐.
--      인벤토리가 가득 찬 유저도 연다. point_awarded_at이 이미 찬 개체는 획득 줄 없이 차감만 남는다.

-- ----------------------------------------------------------------
-- 1. award_points — 9번째 인자 p_source_inventory_item_id (원장에 개체를 연결)
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.award_points(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.award_points(
  p_user_id UUID,
  p_amount INTEGER,              -- 양수=적립, 음수=차감
  p_reason TEXT,
  p_source_badge_id UUID DEFAULT NULL,
  p_source_mission_id UUID DEFAULT NULL,
  p_admin_reason_label TEXT DEFAULT NULL,
  p_admin_reason_note TEXT DEFAULT NULL,
  p_source_item_book_id UUID DEFAULT NULL,
  p_source_inventory_item_id UUID DEFAULT NULL
) RETURNS public.point_transactions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.point_transactions;
BEGIN
  INSERT INTO public.point_transactions
    (user_id, amount, reason, source_badge_id, source_mission_id, admin_reason_label, admin_reason_note,
     source_item_book_id, source_inventory_item_id)
  VALUES
    (p_user_id, p_amount, p_reason, p_source_badge_id, p_source_mission_id, p_admin_reason_label, p_admin_reason_note,
     p_source_item_book_id, p_source_inventory_item_id)
  RETURNING * INTO v_tx;

  INSERT INTO public.point_wallets (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.point_wallets.balance + p_amount, updated_at = now();

  IF p_amount > 0 THEN
    UPDATE public.point_treasury SET total_minted = total_minted + p_amount, updated_at = now() WHERE id = 1;
  ELSE
    UPDATE public.point_treasury SET total_reclaimed = total_reclaimed + (-p_amount), updated_at = now() WHERE id = 1;
  END IF;

  RETURN v_tx;
END;
$$;

COMMENT ON FUNCTION public.award_points IS
  '잼 포인트 잔액 변경의 유일한 경로. 원장 삽입 + 잔액 갱신 + treasury 집계를 원자적으로 처리. 원장 출처 연결은 배지·미션·컬렉션·개체(p_source_inventory_item_id). 서버(service role)에서만 호출.';

REVOKE ALL ON FUNCTION public.award_points(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_points(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT, UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_points(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT, UUID, UUID) TO service_role;

-- ----------------------------------------------------------------
-- 2. 필요 포인트 고정 트리거 — 잠긴 채로 되는 순간 unlock_points_required를 채운다
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_items_fix_unlock_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_points INTEGER;
BEGIN
  -- 잠기지 않았거나 이미 고정돼 있으면 건드리지 않는다(고정한 값은 정책이 바뀌어도 변하지 않는다).
  IF NOT NEW.locked OR NEW.unlock_points_required IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.inventory_id IS NOT NULL THEN
    SELECT user_id INTO v_user_id FROM public.inventory WHERE id = NEW.inventory_id;
  END IF;

  -- 퀘스트의 첫 잠긴 배지는 포인트 없이 연다: 챕터가 아직 없고 이 개체 말고는 잠긴 적 있는 개체가 없으면 0.
  IF v_user_id IS NOT NULL THEN
    -- 두 경로가 동시에 «첫 하나»가 되지 않도록 유저 단위로 직렬화한다(트랜잭션이 끝나면 풀린다).
    PERFORM pg_advisory_xact_lock(hashtext('locked_first_free:' || v_user_id::TEXT));

    IF NOT EXISTS (SELECT 1 FROM public.user_chapters WHERE user_id = v_user_id AND chapter_no IS NOT NULL)
       AND NOT EXISTS (
         SELECT 1
           FROM public.inventory_items ii
           JOIN public.inventory inv ON inv.id = ii.inventory_id
          WHERE inv.user_id = v_user_id AND ii.id <> NEW.id AND ii.lock_reason IS NOT NULL
       )
    THEN
      NEW.unlock_points_required := 0;
      RETURN NEW;
    END IF;
  END IF;

  -- 그 밖에는 배지 등급별 정책값. 배지나 정책 행이 없으면 비워 둔다(열 때 다시 정책값으로 읽는다). 예외는 던지지 않는다.
  SELECT CASE COALESCE(b.rarity::TEXT, 'common')
           WHEN 'rare' THEN p.locked_points_rare
           WHEN 'epic' THEN p.locked_points_epic
           WHEN 'mystic' THEN p.locked_points_mystic
           ELSE p.locked_points_common
         END
    INTO v_points
    FROM public.badges b
    CROSS JOIN public.jam_policy p
   WHERE b.id = NEW.badge_id AND p.id = 1;

  NEW.unlock_points_required := v_points;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.inventory_items_fix_unlock_points() IS
  '잠긴 채로 되는 순간 inventory_items.unlock_points_required가 비어 있으면 채운다. 퀘스트 전 유저의 첫 잠긴 개체는 0, 그 밖에는 배지 등급별 jam_policy.locked_points_*. 값만 채우고 예외를 던지지 않는다. 티켓 20261028_1737.';

REVOKE ALL ON FUNCTION public.inventory_items_fix_unlock_points() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_items_fix_unlock_points() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_inventory_items_fix_unlock_points ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_fix_unlock_points
  BEFORE INSERT OR UPDATE OF locked ON public.inventory_items
  FOR EACH ROW
  WHEN (NEW.locked AND NEW.unlock_points_required IS NULL)
  EXECUTE FUNCTION public.inventory_items_fix_unlock_points();

-- ----------------------------------------------------------------
-- 3. 잠긴 개체를 포인트로 열기
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.locked_item_open_points(p_user_id UUID, p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_required INTEGER;
  v_balance INTEGER;
  v_awarded INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_user_id AND lifted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_suspended');
  END IF;

  SELECT ii.id, ii.badge_id, ii.serial_number, ii.locked, ii.unlock_points_required, ii.point_awarded_at,
         COALESCE(b.point_reward, 0) AS point_reward,
         COALESCE(ii.unlock_points_required, (
           SELECT CASE COALESCE(b.rarity::TEXT, 'common')
                    WHEN 'rare' THEN p.locked_points_rare
                    WHEN 'epic' THEN p.locked_points_epic
                    WHEN 'mystic' THEN p.locked_points_mystic
                    ELSE p.locked_points_common
                  END
             FROM public.jam_policy p WHERE p.id = 1
         ), 0) AS required_points
    INTO v_item
    FROM public.inventory_items ii
    JOIN public.inventory inv ON inv.id = ii.inventory_id
    JOIN public.badges b ON b.id = ii.badge_id
   WHERE ii.id = p_item_id AND inv.user_id = p_user_id
     AND ii.destroyed_at IS NULL AND ii.dropped_at IS NULL
   FOR UPDATE OF ii;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;
  IF NOT v_item.locked THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_locked');
  END IF;

  v_required := v_item.required_points;

  -- 지갑 행을 잠그고 잔액을 읽는다. 행이 없으면 잔액 0으로 본다(빈 지갑 행을 만들지 않는다).
  IF v_required > 0 THEN
    SELECT balance INTO v_balance FROM public.point_wallets WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
      v_balance := 0;
    END IF;
    IF v_balance < v_required THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'insufficient_points',
        'required', v_required, 'balance', v_balance);
    END IF;

    PERFORM public.award_points(
      p_user_id, -v_required, 'locked_unlock_cost',
      NULL, NULL, NULL, NULL, NULL, p_item_id
    );
  END IF;

  UPDATE public.inventory_items SET locked = FALSE, unlocked_at = now() WHERE id = p_item_id;

  IF v_item.point_reward > 0 AND v_item.point_awarded_at IS NULL THEN
    PERFORM public.award_points(p_user_id, v_item.point_reward, 'badge_point_reward', v_item.badge_id);
    UPDATE public.inventory_items SET point_awarded_at = now() WHERE id = p_item_id;
    v_awarded := v_item.point_reward;
  END IF;

  INSERT INTO public.inventory_item_events (inventory_item_id, badge_id, serial_number, user_id, event_type, points_awarded)
    VALUES (p_item_id, v_item.badge_id, v_item.serial_number, p_user_id, 'unlocked', NULLIF(v_awarded, 0));

  SELECT COALESCE(balance, 0) INTO v_balance FROM public.point_wallets WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'itemId', p_item_id,
    'badgeId', v_item.badge_id,
    'serialNumber', v_item.serial_number,
    'pointsAwarded', v_awarded,
    'pointsSpent', GREATEST(v_required, 0),
    'pointBalance', COALESCE(v_balance, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.locked_item_open_points(UUID, UUID) IS
  '잠긴 개체를 포인트로 열기. 지갑 행 잠금과 잔액 확인 뒤 차감 줄(locked_unlock_cost, 개체 연결), 열림, 획득 줄(badge_point_reward, 한 번만), 이력(unlocked)을 한 트랜잭션으로 남긴다. 잔액이 모자라면 아무것도 바꾸지 않고 insufficient_points를 돌려준다. 이용 정지 중 거부. 인벤토리 빈칸이 필요 없다. service_role 전용. 티켓 20261028_1737.';

REVOKE ALL ON FUNCTION public.locked_item_open_points(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.locked_item_open_points(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.locked_item_open_points(UUID, UUID) TO service_role;

-- 되돌림 SQL
-- 이 함수를 부르는 새 코드(2회차의 openLockedItem)를 먼저 되돌린 뒤에 지운다(코드가 먼저 남아 있으면 열기가 전부 실패한다).
-- 이미 남은 locked_unlock_cost 줄과 개체에 고정된 unlock_points_required 값은 그대로 남는다(300의 열·사유는 이 파일이 지우지 않는다).
-- award_points는 9개 인자를 지우고 157의 8개 인자 본문으로 되돌린다. 9번째 인자를 쓰는 호출(locked_item_open_points)이 먼저 없어져야 한다.
-- DROP TRIGGER IF EXISTS trg_inventory_items_fix_unlock_points ON public.inventory_items;
-- DROP FUNCTION IF EXISTS public.inventory_items_fix_unlock_points();
-- DROP FUNCTION IF EXISTS public.locked_item_open_points(UUID, UUID);
-- DROP FUNCTION IF EXISTS public.award_points(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT, UUID, UUID);
-- CREATE OR REPLACE FUNCTION public.award_points(
--   p_user_id UUID,
--   p_amount INTEGER,
--   p_reason TEXT,
--   p_source_badge_id UUID DEFAULT NULL,
--   p_source_mission_id UUID DEFAULT NULL,
--   p_admin_reason_label TEXT DEFAULT NULL,
--   p_admin_reason_note TEXT DEFAULT NULL,
--   p_source_item_book_id UUID DEFAULT NULL
-- ) RETURNS public.point_transactions
-- LANGUAGE plpgsql SECURITY DEFINER
-- SET search_path = public
-- AS $fn$
-- DECLARE
--   v_tx public.point_transactions;
-- BEGIN
--   INSERT INTO public.point_transactions
--     (user_id, amount, reason, source_badge_id, source_mission_id, admin_reason_label, admin_reason_note, source_item_book_id)
--   VALUES
--     (p_user_id, p_amount, p_reason, p_source_badge_id, p_source_mission_id, p_admin_reason_label, p_admin_reason_note, p_source_item_book_id)
--   RETURNING * INTO v_tx;
--
--   INSERT INTO public.point_wallets (user_id, balance)
--   VALUES (p_user_id, p_amount)
--   ON CONFLICT (user_id) DO UPDATE
--     SET balance = public.point_wallets.balance + p_amount, updated_at = now();
--
--   IF p_amount > 0 THEN
--     UPDATE public.point_treasury SET total_minted = total_minted + p_amount, updated_at = now() WHERE id = 1;
--   ELSE
--     UPDATE public.point_treasury SET total_reclaimed = total_reclaimed + (-p_amount), updated_at = now() WHERE id = 1;
--   END IF;
--
--   RETURN v_tx;
-- END;
-- $fn$;
-- REVOKE ALL ON FUNCTION public.award_points(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC;
-- REVOKE ALL ON FUNCTION public.award_points(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT, UUID) FROM anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.award_points(UUID, INTEGER, TEXT, UUID, UUID, TEXT, TEXT, UUID) TO service_role;
