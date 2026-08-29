-- ============================================================
-- Migration 110: 고아(Orphaned) 아이템배지 관리 액션 — 영구 폐기·재배정
--
-- 티켓: 20260829_2150
--
-- 배경(요약 — 티켓 문서 참고):
--   108_item_identity_custody_model.sql에서 계정 탈퇴 시 소유자를 잃은 개체를
--   삭제하지 않고 `Orphaned` 상태로 보존하도록 바꿨다. 이 마이그레이션은 그
--   `Orphaned` 개체를 어드민이 실제로 처리할 수 있는 두 액션(영구 폐기·재배정)을
--   DB 레벨에 추가한다.
--
-- 이 마이그레이션이 하는 일:
--   1. custody_events.event_type CHECK 제약(기존 8종)에 'AdminDestroy',
--      'AdminReassign' 2종 추가 — Orphaned에서 나가는 전이를 표현하는 신규 이벤트.
--   2. admin_destroy_orphaned_item() RPC — Orphaned → Destroyed. 기존
--      Destroyed 소프트 삭제(destroyed_at) 방식·일련번호 재사용 풀 반환 메커니즘을
--      그대로 재사용한다(expire_stale_poi_drops()와 동일 패턴). actor_user_id/
--      actor_username에 액션을 수행한 어드민의 식별자를 채운다.
--   3. admin_reassign_orphaned_item() RPC — Orphaned → Held. 대상 유저
--      inventory.max_slots 제약을 픽업(pickup_drop)과 동일하게 적용, 꽉 찬 경우
--      inventory_full로 실패 처리한다. to_user=재배정 대상, actor=수행 어드민.
--   4. 두 RPC 모두 SELECT ... FOR UPDATE로 개체(및 대상 인벤토리)에 배타 락을 걸어
--      "표준 불변식 1: 원자적 소유권 이전"을 지킨다. 여러 개체를 다건 처리할 때는
--      애플리케이션(API 라우트)이 개체마다 이 RPC를 독립적으로 호출한다 — PostgREST가
--      RPC 호출 1건을 트랜잭션 1개로 실행하므로 개체별 독립 트랜잭션 경계가 자연히
--      보장되고, 일부 개체가 실패해도 나머지 호출에는 영향이 없다(티켓 §"일괄 처리
--      트랜잭션 경계 확정").
--   5. 109_revoke_security_definer_public_execute.sql과 동일한 이유로 anon/
--      authenticated의 EXECUTE 권한을 회수하고 service_role에만 남긴다 — 두 RPC 모두
--      호출자 검증 없이 파라미터로 받은 p_admin_id/p_target_user_id를 그대로 신뢰하므로,
--      anon 키로 PostgREST를 직접 호출하면 어드민 권한 검사(getAdminUser())를 건너뛰고
--      임의 개체를 폐기/재배정할 수 있다.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. custody_events.event_type CHECK 제약 확장
-- ----------------------------------------------------------------
ALTER TABLE public.custody_events DROP CONSTRAINT IF EXISTS custody_events_event_type_check;
ALTER TABLE public.custody_events
  ADD CONSTRAINT custody_events_event_type_check CHECK (event_type IN (
    'Minted', 'UserDrop', 'Pickup', 'Expire', 'Slot', 'Unslot', 'Consume', 'Orphan',
    'AdminDestroy', 'AdminReassign'
  ));

-- ----------------------------------------------------------------
-- 2. admin_destroy_orphaned_item() — Orphaned → Destroyed (영구 폐기)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_destroy_orphaned_item(
  p_item_id  UUID,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item           RECORD;
  v_admin_username TEXT;
BEGIN
  SELECT * INTO v_item FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  IF v_item.destroyed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_destroyed');
  END IF;

  -- Orphaned 판정: 소유자 없음(inventory_id NULL) + 참조하는 활성 poi_drops 없음
  -- (src/lib/admin/item-badge-status.ts의 deriveItemBadgeStatus()와 동일 기준).
  -- 목록 조회와 실제 액션 실행 사이 시간차로 상태가 이미 바뀐 경우(예: 다른 어드민이
  -- 먼저 처리)를 방어한다.
  IF v_item.inventory_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_orphaned');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.poi_drops WHERE inventory_item_id = v_item.id AND is_available = TRUE
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_orphaned');
  END IF;

  UPDATE public.inventory_items SET destroyed_at = NOW() WHERE id = p_item_id;

  SELECT username INTO v_admin_username FROM public.users WHERE id = p_admin_id;

  INSERT INTO public.custody_events (inventory_item_id, event_type, actor_user_id, actor_username)
  VALUES (p_item_id, 'AdminDestroy', p_admin_id, v_admin_username);

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- ----------------------------------------------------------------
-- 3. admin_reassign_orphaned_item() — Orphaned → Held (재배정, 알림 없음)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reassign_orphaned_item(
  p_item_id        UUID,
  p_admin_id       UUID,
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item            RECORD;
  v_inv             RECORD;
  v_admin_username  TEXT;
  v_target_username TEXT;
BEGIN
  SELECT * INTO v_item FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  IF v_item.destroyed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_orphaned');
  END IF;

  IF v_item.inventory_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_orphaned');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.poi_drops WHERE inventory_item_id = v_item.id AND is_available = TRUE
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_orphaned');
  END IF;

  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  -- pickup_drop()과 동일한 인벤토리 용량 정책 (티켓 §"인벤토리 용량 제약 적용").
  IF v_inv.used_slots >= v_inv.max_slots THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_full');
  END IF;

  -- slotted_in을 명시적으로 비운다: 정상 경로(계정 탈퇴 CASCADE)라면 이미 NULL이어야
  -- 하지만(user_item_book_slots.user_id ON DELETE CASCADE → slotted_in ON DELETE SET
  -- NULL이 같은 탈퇴 트랜잭션 안에서 연쇄 실행됨), 티켓이 "재배정은 항상 Held로 귀결"을
  -- 명시하므로 어떤 경로로든 stale한 slotted_in이 남아 있으면 상태 파생 로직이
  -- Held 대신 Slotted로 오판하게 된다 — 방어적으로 한 번 더 비운다.
  UPDATE public.inventory_items
  SET inventory_id = v_inv.id,
      obtained_at  = NOW(),
      slotted_in   = NULL
  WHERE id = p_item_id;

  UPDATE public.inventory SET used_slots = used_slots + 1 WHERE id = v_inv.id;

  SELECT username INTO v_admin_username FROM public.users WHERE id = p_admin_id;
  SELECT username INTO v_target_username FROM public.users WHERE id = p_target_user_id;

  -- from_user 없음 — 직전 소유자는 이미 Orphan 이벤트에 스냅샷돼 있다(티켓 §"신규 CustodyEvent 이벤트 타입 필요").
  INSERT INTO public.custody_events (
    inventory_item_id, event_type, to_user_id, to_username, actor_user_id, actor_username
  )
  VALUES (
    p_item_id, 'AdminReassign', p_target_user_id, v_target_username, p_admin_id, v_admin_username
  );

  RETURN jsonb_build_object('ok', TRUE, 'inventory_item_id', p_item_id);
END;
$$;

-- ----------------------------------------------------------------
-- 4. anon/authenticated EXECUTE 권한 회수 (109와 동일한 방어, 신규 함수 2종)
--
-- 2026-08-30 실행 중 발견·수정: 109는 `FROM PUBLIC`만으로 anon/authenticated의
-- EXECUTE 권한이 실제로 제거됐지만(당시 대상은 기존 함수), 이번처럼 같은 마이그레이션
-- 안에서 방금 CREATE한 신규 함수는 Supabase 기본 권한 설정으로 anon/authenticated에
-- PUBLIC 경유가 아니라 **개별 GRANT**가 자동으로 걸린다 — `FROM PUBLIC`만으로는
-- 이 개별 GRANT가 회수되지 않는다(실행 후 information_schema.role_routine_grants로
-- 직접 확인해 anon/authenticated가 여전히 EXECUTE 가능함을 발견, 즉시 아래로 수정).
-- 반드시 anon, authenticated를 REVOKE 대상에 명시해야 한다.
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_destroy_orphaned_item(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reassign_orphaned_item(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_destroy_orphaned_item(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reassign_orphaned_item(uuid, uuid, uuid) TO service_role;
