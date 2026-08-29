-- ============================================================
-- Migration 108: 아이템배지 개체 정체성 모델 — 드랍/픽업 시 일련번호 유지 + CustodyEvent
--
-- 티켓: 20260829_2101
--
-- 배경(요약 — 티켓 문서 참고):
--   현재 poi_drops는 badges("종류")만 참조하고, 유저 드랍은 원본 inventory_items를
--   소프트 삭제한 뒤 poi_drops.badge_id만 복사하며, pickup_drop()은 완전히 새로운
--   inventory_items row를 INSERT해 새 일련번호를 부여한다 — "발급 시점에 확정된
--   일련번호가 소멸할 때까지 유지"라는 의도와 정반대로 동작하고 있었다.
--
-- 이 마이그레이션이 하는 일:
--   1. poi_drops.inventory_item_id 추가 — 이제 poi_drops는 항상 "이미 발급된
--      inventory_items row"를 참조한다(badge_id 컬럼은 조인 편의를 위해 유지 — 값은
--      항상 연결된 inventory_items.badge_id와 일치하며 드리프트되지 않는다).
--   2. inventory_items.destroyed_at 추가 — 개체 파괴(Consume/Expire)는 소프트 삭제로
--      확정. assign_random_serial()의 유니크 체크를 destroyed_at IS NULL로 좁힌다.
--   3. inventory_items.inventory_id를 nullable화 + FK를 CASCADE→SET NULL로 전환 —
--      계정 탈퇴 시 inventory_items가 하드 삭제되지 않고 Orphaned 상태로 전이된다.
--   4. poi_drops.dropper_user_id FK를 CASCADE→SET NULL로 전환 — 드랍한 사람이 탈퇴해도
--      아직 픽업되지 않은 유저 드랍(무기한 대기가 정책)이 poi_drops row 자체와 함께
--      사라지지 않는다(picked_up_by는 이미 SET NULL이었다 — 일관성 정합).
--   5. poi_drops.expires_at 기본값 제거 + CHECK 완화 — 유저 드랍은 기한 개념이 없다.
--   6. custody_events 신규 테이블 — Minted/UserDrop/Pickup/Expire/Slot/Unslot/Consume/
--      Orphan 8종 append-only 이력. from/to/actor는 유저명을 스냅샷 값으로 저장한다
--      (라이브 FK 조인에만 의존하지 않음 — 탈퇴 후에도 이름이 남아야 하므로).
--   7. RPC 재작성 — create_user_drop()(신규), pickup_drop()(신규 INSERT 제거, 소유자만
--      UPDATE + obtained_at을 현재 소유자 기준 획득 시각으로 갱신), expire_stale_poi_drops()
--      (cron이 호출), mint_and_place_ambient_drop()(신규 — 앰비언트 배치 1건의 선발급+
--      poi_drops 연결+Minted 기록을 원자적으로 묶음) — 전부 상태 변경과 같은 트랜잭션
--      안에서 custody_events도 함께 INSERT한다.
--   8. BEFORE DELETE ON public.users 트리거 — 탈퇴 직전 Held/Slotted 개체에 Orphan
--      이벤트를 기록한다. 이 저장소에는 앱 레벨 "탈퇴 처리 로직"이 아직 없어(계정 삭제는
--      Supabase Admin API/대시보드에서 직접 auth.users를 지움) DB 트리거로 구현했다 —
--      어떤 경로로 삭제되든(app 코드가 생겨도) 항상 실행되므로 오히려 더 안전하다.
--   9. 기존 활성(is_available=true, 미픽업) poi_drops 백필 — 유저 드랍은 소프트 삭제된
--      origin inventory_items와 재연결하고, origin이 없는 경우(구모델 시스템 드랍은
--      픽업 시점에만 개체를 발급했음)는 지금 시점에 소급 발급한다. 이미 완료된
--      (is_available=false) 과거 드랍은 대상에서 제외 — CustodyEvent 이력 없이 시작해도
--      무방하다는 정책 확정(티켓 §"기존 데이터 마이그레이션 정책").
-- ============================================================

-- ----------------------------------------------------------------
-- 1. poi_drops.inventory_item_id
-- ----------------------------------------------------------------
ALTER TABLE public.poi_drops
  ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_poi_drops_inventory_item ON public.poi_drops (inventory_item_id);

COMMENT ON COLUMN public.poi_drops.inventory_item_id IS
  '이 드랍이 가리키는 실제 개체(inventory_items). source가 user/system 무엇이든 항상 "이미
   발급된" row를 참조한다 — 픽업은 소유권 이전일 뿐 재발급이 아니다(티켓 20260829_2101).';

COMMENT ON COLUMN public.poi_drops.badge_id IS
  '조인 편의를 위한 파생 컬럼 — 항상 연결된 inventory_item_id의 badge_id와 일치하며
   드리프트되지 않는다(둘 다 row 생성 시 한 번만 함께 설정, 이후 갱신 없음). 정본은
   inventory_items.badge_id.';

-- ----------------------------------------------------------------
-- 2. inventory_items.destroyed_at — 개체 파괴(Consume/Expire) 소프트 삭제
-- ----------------------------------------------------------------
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS destroyed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.inventory_items.destroyed_at IS
  '개체 파괴(조합 소모 Consume / 미픽업 만료 Expire) 시점 — 소프트 삭제. row와
  custody_events 이력은 파괴 후에도 남고, 일련번호만 assign_random_serial()의
  유니크 체크에서 재사용 가능해진다(티켓 20260829_2101). 파괴 시 inventory_id도 함께
  NULL로 비운다 — 기존 코드베이스 전반의 "owned = inventory_id IS NOT NULL" 조회 관례가
  destroyed_at 컬럼 자체를 모르는 채로도 자동으로 파괴된 개체를 걸러내게 하기 위함
  (수십 곳의 조회 코드를 일일이 고치는 대신, 이 컬럼 하나의 규약으로 정합성 확보).';

-- 2-1. serial_number 전역 UNIQUE(001_initial_schema.sql) → destroyed_at IS NULL 부분 유니크
-- 인덱스로 전환. 이 전환 없이는 "소프트 삭제로 확정" 결정(§개체 파괴 방식) 자체가 DB
-- 레벨에서 동작할 수 없다 — assign_random_serial()이 애플리케이션 레벨에서
-- `destroyed_at IS NULL` 조건으로 빈 번호를 찾아도, 컬럼에 걸린 전역 UNIQUE 제약이 파괴된
-- 행이 갖고 있던 값과의 중복을 여전히 막아 INSERT가 항상 unique violation으로 실패한다.
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_serial_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_serial_number_active
  ON public.inventory_items (serial_number)
  WHERE destroyed_at IS NULL;

-- ----------------------------------------------------------------
-- 3. inventory_items.inventory_id — nullable화 + FK CASCADE → SET NULL
--    (계정 탈퇴 시 inventory_items가 하드 삭제되지 않고 Orphaned로 전이)
-- ----------------------------------------------------------------
ALTER TABLE public.inventory_items ALTER COLUMN inventory_id DROP NOT NULL;

ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_inventory_id_fkey;
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_inventory_id_fkey
  FOREIGN KEY (inventory_id) REFERENCES public.inventory(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.inventory_items.inventory_id IS
  'NULL = 현재 소유자 없음. Dropped/AtPoi(활성 poi_drops가 이 개체를 참조 중) 또는
  Orphaned(소유자 계정 탈퇴, 참조하는 활성 poi_drops 없음) 중 하나 — 구분은
  poi_drops.inventory_item_id 존재 여부로 판정한다(티켓 20260829_2101).';

-- ----------------------------------------------------------------
-- 4. poi_drops.dropper_user_id — FK CASCADE → SET NULL + NOT NULL 해제
--    (picked_up_by는 이미 SET NULL이었다 — 드랍한 사람이 탈퇴해도 무기한 대기 중인
--    유저 드랍이 poi_drops row 통째로 사라지면 안 된다. NULL이 되면 기존 표시 로직이
--    이미 '익명'으로 폴백한다.)
--
--    게이트 리뷰 지적(2차, 2026-08-29): 컬럼 자체가 004_phase7_user_drops.sql에서
--    NOT NULL로 선언돼 있었다 — FK만 SET NULL로 바꾸고 이 DROP NOT NULL을 빠뜨리면,
--    유저 탈퇴 시 CASCADE가 NULL을 세팅하려는 순간 NOT NULL 위반으로 DELETE 트랜잭션
--    전체가 하드 에러로 실패한다(이전 CASCADE 방식보다 더 나쁜 회귀). 아래 CHECK
--    완화(§5)와 반드시 함께 가야 한다 — 컬럼만 nullable화하고 CHECK을 안 고치면
--    이번엔 CHECK 위반으로 같은 실패가 재현된다.
-- ----------------------------------------------------------------
ALTER TABLE public.poi_drops ALTER COLUMN dropper_user_id DROP NOT NULL;

ALTER TABLE public.poi_drops DROP CONSTRAINT IF EXISTS poi_drops_dropper_user_id_fkey;
ALTER TABLE public.poi_drops
  ADD CONSTRAINT poi_drops_dropper_user_id_fkey
  FOREIGN KEY (dropper_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------
-- 5. poi_drops.expires_at — 기본값 제거 + CHECK 완화 (유저 드랍 = 무기한 대기)
--
--    게이트 리뷰 지적(2차, 2026-08-29): source='user' AND dropper_user_id IS NOT NULL을
--    그대로 요구하면, 드랍한 사람이 탈퇴해 위 §4의 SET NULL이 실행되는 순간 이 CHECK을
--    위반해 UPDATE가 실패한다 — "유저 드랍인데 드랍한 사람이 탈퇴해 고아가 된 상태"를
--    정상 상태로 허용해야 한다(dropper_user_id IS NULL도 허용).
-- ----------------------------------------------------------------
ALTER TABLE public.poi_drops ALTER COLUMN expires_at DROP DEFAULT;

ALTER TABLE public.poi_drops DROP CONSTRAINT IF EXISTS poi_drops_source_consistency;
ALTER TABLE public.poi_drops
  ADD CONSTRAINT poi_drops_source_consistency CHECK (
    (source = 'user') OR
    (source = 'system' AND dropper_user_id IS NULL)
  );

-- 이미 활성 상태인 과거 유저 드랍도 새 정책(무기한 대기)에 맞춘다 — 기존 30일 만료값을
-- 그대로 두면 이 마이그레이션 이후에도 예전 규칙대로 소각돼버린다.
UPDATE public.poi_drops
SET expires_at = NULL
WHERE is_available = TRUE AND source = 'user' AND expires_at IS NOT NULL;

-- ----------------------------------------------------------------
-- 6. assign_random_serial() — destroyed_at IS NULL 조건 추가 + 앰비언트 판별 방식 변경
--
--    기존에는 drop_id → poi_drops.source 조인으로 앰비언트 여부를 판별했으나, 앰비언트
--    드랍이 이제 poi_drops row 생성 "이전" 시점에 InventoryItem을 선발급하므로(배치
--    시점 pre-mint, src/lib/ambient-drop/index.ts) 그 순간엔 drop_id가 아직 없다.
--    obtained_by='ambient_drop' 값으로 직접 판별한다.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_random_serial()
RETURNS TRIGGER AS $$
DECLARE
  candidate INTEGER;
  tries INTEGER := 0;
  range_min INTEGER := 1;
BEGIN
  IF NEW.serial_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.obtained_by = 'ambient_drop' THEN
    range_min := 50001;
  END IF;

  LOOP
    candidate := range_min + floor(random() * (999999 - range_min + 1))::INTEGER;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.inventory_items WHERE serial_number = candidate AND destroyed_at IS NULL
    );
    tries := tries + 1;
    IF tries > 50 THEN
      RAISE EXCEPTION 'assign_random_serial: 50회 시도 내 빈 일련번호를 찾지 못함 (범위 확장 필요)';
    END IF;
  END LOOP;
  NEW.serial_number := candidate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- 7. custody_events — append-only 이력 (어드민 조회 요구, 티켓 20260829_2139가 후속 소비)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custody_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id  UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  event_type         TEXT NOT NULL CHECK (event_type IN (
                        'Minted', 'UserDrop', 'Pickup', 'Expire', 'Slot', 'Unslot', 'Consume', 'Orphan'
                      )),
  -- 라이브 FK는 편의용(유저가 아직 존재하면 조인 가능) — 탈퇴하면 SET NULL로 비지만
  -- *_username 스냅샷은 그대로 남는다(스냅샷 불변식, 라이브 조인에 의존 금지).
  from_user_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  from_username      TEXT,
  to_user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  to_username        TEXT,
  actor_user_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_username     TEXT,
  poi_id             UUID REFERENCES public.poi(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custody_events_item ON public.custody_events (inventory_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_custody_events_type ON public.custody_events (event_type);

-- RLS 활성화 + 정책 없음 = service_role 전용 (074_engine_decision_log_rls.sql과 동일 관례,
-- anon/authenticated 키로는 어떤 행도 조회·수정할 수 없다). 어드민 조회는 후속 티켓의
-- service_role API를 통해서만 노출한다.
ALTER TABLE public.custody_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.custody_events IS
  'InventoryItem 개체 하나에 점유(custody) 변화가 생길 때마다 쌓이는 수정 불가능한 이력.
  8종 이벤트가 상태 전이 다이어그램의 화살표와 1:1 대응한다(티켓 20260829_2101). Minted는
  ①드랍엔진 직접지급, ②앰비언트 드랍 배치 시점에만 기록되며, 이번 마이그레이션에서는
  ②(src/lib/ambient-drop)만 실제로 연결했다 — ①(활동 보상 직접 지급)은 이 티켓 스코프 밖.';

-- ----------------------------------------------------------------
-- 8. create_user_drop() — 유저 드랍 생성 (신규 RPC)
--    개체를 소프트 삭제하지 않고, poi_drops.inventory_item_id로 연결 + 소유자 필드만 비운다.
--    "표준 불변식 1: 원자적 소유권 이전"에 따라 SELECT ... FOR UPDATE로 배타 락을 건다.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_user_drop(
  p_dropper_id       UUID,
  p_poi_id           UUID,
  p_inventory_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inv       RECORD;
  v_item      RECORD;
  v_drop_id   UUID;
  v_username  TEXT;
BEGIN
  SELECT * INTO v_inv FROM public.inventory WHERE user_id = p_dropper_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  SELECT * INTO v_item FROM public.inventory_items WHERE id = p_inventory_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  IF v_item.destroyed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  IF v_item.inventory_id IS DISTINCT FROM v_inv.id THEN
    -- 게이트 리뷰 지적(2026-08-29): 개체 정체성 모델에서 "이미 드랍됨"은 더 이상
    -- inventory_items의 자체 컬럼(dropped_at 등)으로 판별할 수 없다 — 드랍되는 순간
    -- inventory_id가 NULL로 비워지므로, 소유권 불일치(위 조건)에 already_dropped와
    -- item_not_found(존재하지 않거나 남의 아이템)가 함께 걸려 already_dropped 분기가
    -- 도달 불가능했다. 여기서 "내가 드랍해 지금 poi_drops에 활성 상태로 걸려있는
    -- 아이템인지"를 직접 확인해 두 경우를 다시 구분한다(기존 에러 코드 매핑 유지).
    IF EXISTS (
      SELECT 1 FROM public.poi_drops
      WHERE inventory_item_id = v_item.id AND dropper_user_id = p_dropper_id AND is_available = TRUE
    ) THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'already_dropped');
    END IF;
    -- 존재하지 않거나 내 소유가 아닌 아이템 — 둘을 구분해 돌려주지 않는다
    -- (남의 아이템 id 존재 여부를 알려주는 셈이 된다. 기존 route.ts와 동일한 원칙).
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  IF v_item.slotted_in IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_slotted');
  END IF;

  INSERT INTO public.poi_drops (dropper_user_id, poi_id, badge_id, inventory_item_id, source)
  VALUES (p_dropper_id, p_poi_id, v_item.badge_id, v_item.id, 'user')
  RETURNING id INTO v_drop_id;

  UPDATE public.inventory_items SET inventory_id = NULL WHERE id = v_item.id;
  UPDATE public.inventory SET used_slots = GREATEST(0, used_slots - 1) WHERE id = v_inv.id;

  SELECT username INTO v_username FROM public.users WHERE id = p_dropper_id;

  INSERT INTO public.custody_events (inventory_item_id, event_type, from_user_id, from_username, poi_id)
  VALUES (v_item.id, 'UserDrop', p_dropper_id, v_username, p_poi_id);

  RETURN jsonb_build_object('ok', TRUE, 'drop_id', v_drop_id);
END;
$$;

-- ----------------------------------------------------------------
-- 9. pickup_drop() 재작성 — 신규 INSERT 제거, 기존 개체의 소유자만 UPDATE.
--    일련번호가 절대 바뀌지 않는다(개체 정체성 유지). 원자적 락 패턴은 유지.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pickup_drop(
  p_drop_id       UUID,
  p_picker_id     UUID,
  p_inventory_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_drop          RECORD;
  v_item          RECORD;
  v_inv           RECORD;
  v_from_username TEXT;
  v_to_username   TEXT;
BEGIN
  SELECT * INTO v_drop
  FROM public.poi_drops
  WHERE id = p_drop_id AND is_available = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_picked_up');
  END IF;

  IF v_drop.inventory_item_id IS NULL THEN
    -- 이론상 도달하지 않아야 함(백필로 전부 채움) — 방어적 처리.
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  SELECT * INTO v_item FROM public.inventory_items WHERE id = v_drop.inventory_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'item_not_found');
  END IF;

  SELECT * INTO v_inv
  FROM public.inventory
  WHERE id = p_inventory_id AND user_id = p_picker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_not_found');
  END IF;

  IF v_inv.used_slots >= v_inv.max_slots THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'inventory_full');
  END IF;

  UPDATE public.poi_drops
  SET picked_up_by  = p_picker_id,
      picked_up_at  = NOW(),
      is_available  = FALSE
  WHERE id = p_drop_id;

  -- 신규 row INSERT 없음 — 기존 개체의 소유자만 옮긴다(일련번호 불변). 게이트 리뷰
  -- 지적(2026-08-29): obtained_at은 "최초 발급(Minted) 시각"이 아니라 "현재 소유자가
  -- 이 개체를 얻은 시각"으로 코드베이스 전반(ItemEarnHistory 획득일 표시, 인벤토리/조합/
  -- 컬렉션 페이지의 obtained_at 정렬, following/collections 알림 배치의 obtained_at>=since
  -- 24시간 필터)이 이미 가정하고 있다 — 소유권 이전 시 반드시 함께 갱신해야 한다.
  UPDATE public.inventory_items
  SET inventory_id = p_inventory_id,
      obtained_at  = NOW()
  WHERE id = v_item.id;

  UPDATE public.inventory
  SET used_slots = used_slots + 1
  WHERE id = p_inventory_id;

  IF v_drop.dropper_user_id IS NOT NULL THEN
    SELECT username INTO v_from_username FROM public.users WHERE id = v_drop.dropper_user_id;
  END IF;
  SELECT username INTO v_to_username FROM public.users WHERE id = p_picker_id;

  INSERT INTO public.custody_events (
    inventory_item_id, event_type, from_user_id, from_username, to_user_id, to_username, poi_id
  )
  VALUES (
    v_item.id, 'Pickup', v_drop.dropper_user_id, v_from_username, p_picker_id, v_to_username, v_drop.poi_id
  );

  RETURN jsonb_build_object('ok', TRUE, 'inventory_item_id', v_item.id);
END;
$$;

-- ----------------------------------------------------------------
-- 9-1. mint_and_place_ambient_drop() — 앰비언트(시스템) 드랍 1건을 선발급(pre-mint) +
--      poi_drops 연결 + Minted 이벤트 기록까지 한 트랜잭션으로 묶는다(신규 RPC).
--
--      게이트 리뷰 지적(2026-08-29): 기존 src/lib/ambient-drop/index.ts는 이 세 작업을
--      "개체 선발급 N건 INSERT(개별)" → "poi_drops 배치 INSERT(1건)" → "custody_events
--      배치 INSERT(1건)"로 애플리케이션 레벨에서 순차 실행했다. 가운데 poi_drops 배치
--      INSERT가 통째로 실패하면, 이미 발급된 inventory_items는 poi_drops·custody_events
--      어디에도 연결되지 못한 채 영구 고아로 남는다(일련번호만 점유). 이 RPC로 개체 1건
--      단위 원자성을 확보한다 — PostgREST가 RPC 호출 1건을 트랜잭션 1개로 실행하므로,
--      함수 본문 중 어느 INSERT든 실패하면 이 함수가 수행한 모든 변경(선발급 포함)이
--      자동으로 롤백된다(별도 EXCEPTION 처리 불필요).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mint_and_place_ambient_drop(
  p_poi_id   UUID,
  p_badge_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id UUID;
  v_drop_id UUID;
BEGIN
  INSERT INTO public.inventory_items (inventory_id, badge_id, obtained_by)
  VALUES (NULL, p_badge_id, 'ambient_drop')
  RETURNING id INTO v_item_id;

  INSERT INTO public.poi_drops (poi_id, badge_id, inventory_item_id, source, dropper_user_id, expires_at)
  VALUES (p_poi_id, p_badge_id, v_item_id, 'system', NULL, NULL)
  RETURNING id INTO v_drop_id;

  -- Minted 이벤트 — 배치 시점에 InventoryItem이 확정된 순간을 기록한다(to_user 없음 — AtPoi로 배치).
  INSERT INTO public.custody_events (inventory_item_id, event_type, poi_id)
  VALUES (v_item_id, 'Minted', p_poi_id);

  RETURN jsonb_build_object('ok', TRUE, 'drop_id', v_drop_id, 'inventory_item_id', v_item_id);
END;
$$;

-- ----------------------------------------------------------------
-- 10. expire_stale_poi_drops() — cron(/api/cron/poi-cleanup)이 호출하는 배치 RPC.
--     기존 두 갈래(①expires_at 만료 ②연결 배지 소프트 삭제) 정리 로직을 그대로 유지하되,
--     이제 poi_drops가 항상 실제 개체를 참조하므로 그 개체도 함께 파괴(소프트 삭제)하고
--     Expire 이벤트를 남긴다 — 이전에는 poi_drops만 is_available=false로 바뀌고 개체
--     자체(과거엔 애초에 없었음)는 손대지 않았다.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_poi_drops()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

-- ----------------------------------------------------------------
-- 11. 계정 탈퇴 시 Orphan 이벤트 — BEFORE DELETE ON public.users 트리거
--
--     이 저장소에는 앱 레벨 "탈퇴 처리 로직"이 아직 없다(grep 결과 계정 삭제 라우트 없음 —
--     현재는 Supabase Admin API/대시보드에서 auth.users를 직접 지우는 방식으로 추정).
--     티켓은 "탈퇴 처리 로직이 users row 삭제 직전에 Orphan 이벤트를 기록해야 함"을
--     요구하는데, 그 로직 자체가 없으므로 DB 트리거로 구현했다 — 어떤 경로로 삭제되든
--     (앱 코드가 나중에 추가되어도, 대시보드에서 직접 지워도) 항상 실행되므로 이게 더
--     견고한 번역이라고 판단했다(구현 요약 alerts 참고).
--
--     BEFORE DELETE라 OLD.username이 아직 살아있는 시점에 스냅샷을 뜬다. INSERT되는
--     custody_events.from_user_id는 이 함수가 끝난 직후 users row가 실제로 삭제되면서
--     그 자신의 FK(ON DELETE SET NULL)에 의해 다시 NULL로 비워진다 — 의도된 동작이다
--     (from_username 스냅샷만 영구 보존, 스냅샷 불변식과 정합).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_orphan_custody_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.custody_events (inventory_item_id, event_type, from_user_id, from_username)
  SELECT ii.id, 'Orphan', OLD.id, OLD.username
  FROM public.inventory_items ii
  JOIN public.inventory inv ON inv.id = ii.inventory_id
  WHERE inv.user_id = OLD.id
    AND ii.destroyed_at IS NULL;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_orphan_custody_events ON public.users;
CREATE TRIGGER trg_log_orphan_custody_events
BEFORE DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.log_orphan_custody_events();

-- ----------------------------------------------------------------
-- 12. 백필 — 기존 활성(is_available=true, 미픽업) poi_drops에 inventory_item_id 연결
--     완료된(is_available=false) 과거 드랍은 대상에서 제외(정책 확정, 티켓 §10).
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_row RECORD;
  v_new_item_id UUID;
BEGIN
  -- 12-1. 유저 드랍 — 드랍 당시 소프트 삭제된 origin 개체가 남아있으므로 재연결한다.
  UPDATE public.poi_drops pd
  SET inventory_item_id = ii.id
  FROM public.inventory_items ii
  WHERE pd.is_available = TRUE
    AND pd.inventory_item_id IS NULL
    AND ii.drop_id = pd.id;

  -- 방금 연결한 origin 개체는 신규 모델 기준 소유자가 없어야 한다(Dropped = inventory_id NULL).
  UPDATE public.inventory_items ii
  SET inventory_id = NULL
  FROM public.poi_drops pd
  WHERE pd.inventory_item_id = ii.id
    AND pd.is_available = TRUE
    AND ii.inventory_id IS NOT NULL;

  -- 12-2. 위에서도 매칭되지 않은 활성 드랍 — 대부분 과거 시스템(앰비언트) 드랍이다.
  -- 구모델은 픽업 시점에만 개체를 발급했으므로 origin 개체 자체가 없었다. 지금 시점에
  -- 소급 발급(pre-mint)한다 — assign_random_serial() 트리거가 일련번호를 새로 확정한다.
  FOR v_row IN
    SELECT id, badge_id, source FROM public.poi_drops
    WHERE is_available = TRUE AND inventory_item_id IS NULL
  LOOP
    INSERT INTO public.inventory_items (inventory_id, badge_id, obtained_by)
    VALUES (NULL, v_row.badge_id, CASE WHEN v_row.source = 'system' THEN 'ambient_drop' ELSE 'drop' END)
    RETURNING id INTO v_new_item_id;

    UPDATE public.poi_drops SET inventory_item_id = v_new_item_id WHERE id = v_row.id;
  END LOOP;
END $$;
