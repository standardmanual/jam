-- 237_inventory_slot_alert.sql
-- JAM 2.0 남은 인벤토리 칸 알림의 DB 부분 (티켓 20261018_0056, 운영 로직 6.4절)
--
-- 전부 덧붙이기다. 새 알림 종류 값 하나(inventory_slots_low), inventory의 새 칸 하나(slot_alert_stage), 새 함수 하나(inventory_slot_alert_step)다.
-- 옛 칸·옛 함수·옛 알림 종류의 뜻은 바꾸지 않는다. 옛 프로덕션 코드는 새 객체를 쓰지 않는다. 알림을 만드는 쪽은 새 코드뿐이다(DB 트리거를 두지 않는다:
-- 옛 프로덕션 코드의 지급에서도 알림이 생겨 옛 알림 화면에 «알 수 없는 소식»이 보일 수 있다). 옛 알림 화면은 모르는 종류를 `d.notifications.unknown`으로 처리한다.
--
-- 규칙(운영 로직 6.4절)
--   - 남은 칸이 3칸일 때와 1칸일 때만 알림 메뉴로 알린다. 단계(stage)는 지금 남은 칸으로 정한다: 4칸 이상이면 0, 2~3칸이면 3, 0~1칸이면 1.
--   - 단계가 «나빠질 때»(0→3, 0→1, 3→1)만 알린다. 단계가 같거나 좋아지면 알리지 않고 단계만 지금 값으로 갱신한다.
--     그래서 빈칸을 만들어 단계가 풀리면(1→3, 3→0 등) 다시 줄어들 때 알림을 한 번 더 보낼 수 있다.
--   - inventory_slot_alert_step이 인벤토리 행을 잠그고 단계를 읽고 쓰므로 같은 단계의 알림이 두 번 나가지 않는다. 이 함수는 «보낼지»만 정해 돌려주고,
--     알림 행을 만드는 일은 앱(createNotification)이 한다. 알림 생성이 실패하면 그 알림은 사라진다(앱이 로그를 남긴다).
--   - 서버(service_role)만 실행한다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT unnest(enum_range(NULL::public.notification_type))::text AS v ORDER BY 1;                         -- inventory_slots_low 포함
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='inventory' AND column_name='slot_alert_stage';                -- 1행, 기본 0
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'inventory_slot_alert_step';                       -- 1행, true
--   SELECT has_function_privilege('authenticated', 'public.inventory_slot_alert_step(uuid)', 'EXECUTE');      -- false

-- (1) 새 알림 종류
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'inventory_slots_low';

-- (2) 마지막으로 보낸 단계
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS slot_alert_stage SMALLINT NOT NULL DEFAULT 0 CHECK (slot_alert_stage IN (0, 1, 3));

COMMENT ON COLUMN public.inventory.slot_alert_stage IS
  '남은 칸 알림의 마지막 단계: 0(알리지 않음, 남은 칸 4 이상), 3(남은 칸 2~3), 1(남은 칸 0~1). 단계가 나빠질 때만 알리고, 좋아지면 낮춰 다시 알릴 수 있게 한다. 기본 0.';

-- (3) 알릴지 정하고 단계를 갱신한다
CREATE OR REPLACE FUNCTION public.inventory_slot_alert_step(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_free INTEGER;
  v_stage SMALLINT;
  v_notify BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  v_free := GREATEST(0, v_inv.max_slots - v_inv.used_slots);
  v_stage := CASE WHEN v_free <= 1 THEN 1 WHEN v_free <= 3 THEN 3 ELSE 0 END;

  -- 단계의 «나쁨»은 0 < 3 < 1 순서다(남은 칸이 적을수록 나쁨)
  IF (v_stage = 3 AND v_inv.slot_alert_stage = 0) OR (v_stage = 1 AND v_inv.slot_alert_stage IN (0, 3)) THEN
    v_notify := TRUE;
  END IF;

  IF v_stage <> v_inv.slot_alert_stage THEN
    UPDATE public.inventory SET slot_alert_stage = v_stage WHERE id = v_inv.id;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'notify', v_notify, 'stage', v_stage, 'free', v_free);
END;
$$;

COMMENT ON FUNCTION public.inventory_slot_alert_step(UUID) IS
  '남은 칸으로 알림 단계(0·3·1)를 정하고, 단계가 나빠졌으면 notify를 true로 돌려주며 단계를 갱신한다. 인벤토리 행 잠금 안에서 하므로 같은 단계의 알림이 두 번 나가지 않는다. service_role 전용.';

REVOKE ALL ON FUNCTION public.inventory_slot_alert_step(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_slot_alert_step(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_slot_alert_step(UUID) TO service_role;

-- 되돌림 SQL
-- 새 함수와 칸을 지운다. 알림 종류 값(inventory_slots_low)은 PostgreSQL이 enum 값 삭제를 지원하지 않아 남는다(이 값을 쓰는 코드가 없으면 무해하다).
-- 이미 만들어진 inventory_slots_low 알림 행은 남으므로 필요하면 먼저 지운다(DELETE FROM public.notifications WHERE type = 'inventory_slots_low').
-- 이 객체를 쓰는 새 코드(지급 직후 알림 검사)는 같은 시점에 되돌려야 한다.
-- DROP FUNCTION IF EXISTS public.inventory_slot_alert_step(UUID);
-- ALTER TABLE public.inventory DROP COLUMN IF EXISTS slot_alert_stage;
