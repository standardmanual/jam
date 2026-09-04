-- 129_inventory_policy_max_slots.sql
--
-- 인벤토리 최대 슬롯 수(inventory.max_slots) 전역 정책을 어드민이 조정할 수 있게 한다.
-- 지금까지는 컬럼 DEFAULT 50(001_initial_schema.sql:137)에만 의존하는 하드코딩값이었고,
-- 어드민 코드 전체에서 max_slots를 조회하는 곳(api/admin/simulate/route.ts)은 있어도
-- 수정하는 경로가 없어 값을 바꾸려면 SQL을 직접 실행해야 했다 (티켓 20260904_1623).
--
-- drop_policy/combine_policy와 동일한 싱글톤 정책 테이블 패턴을 따른다. 이 정책값은
-- 두 경로로 반영된다:
--   1. 기존 유저 — 어드민 API(src/app/api/admin/inventory-policy/route.ts)가 저장 시
--      아래 set_inventory_max_slots() 함수를 호출해 inventory 테이블 전체를 일괄 UPDATE한다.
--      (이 마이그레이션 자체는 기존 inventory row를 건드리지 않는다 — 실행 시점에는
--      정책 인프라만 생기고, 실제 값 변경은 어드민이 화면에서 저장을 눌러야 발생한다)
--   2. 신규 유저 — handle_new_user() 트리거가 INSERT 시 inventory_policy.max_slots를
--      읽어와 반영한다 (컬럼 DEFAULT 50 대신). 이후 정책값을 재조정해도 마이그레이션이
--      필요 없다.

-- ----------------------------------------------------------------
-- 1. inventory_policy (싱글톤 — id=1 고정, drop_policy/combine_policy와 동일 패턴)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_policy (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_slots INTEGER NOT NULL DEFAULT 50 CHECK (max_slots >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- drop_policy 등 다른 어드민 전용 싱글톤 정책 테이블과 동일하게 RLS를 켜고 정책은
-- 두지 않는다 = service_role만 접근 가능 (074_engine_decision_log_rls.sql 참고).
ALTER TABLE public.inventory_policy ENABLE ROW LEVEL SECURITY;

INSERT INTO public.inventory_policy (id, max_slots) VALUES (1, 50) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 2. handle_new_user() 트리거 갱신 — 신규 인벤토리에 정책값을 반영
--    (기존 정의: 079_fix_handle_new_user_missing_inventory.sql. 시그니처가 바뀌지
--    않으므로 109_revoke_security_definer_public_execute.sql이 걸어둔 REVOKE/GRANT는
--    CREATE OR REPLACE 이후에도 그대로 유지된다)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_max_slots INTEGER;
BEGIN
  INSERT INTO public.users (id, email, username, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NULL,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT max_slots INTO v_max_slots FROM public.inventory_policy WHERE id = 1;
  IF v_max_slots IS NULL THEN
    v_max_slots := 50; -- 정책 행이 없을 때(비정상 상태)만 기존 컬럼 DEFAULT와 동일한 값으로 폴백
  END IF;

  INSERT INTO public.inventory (user_id, max_slots)
  VALUES (NEW.id, v_max_slots)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------
-- 3. set_inventory_max_slots(p_max_slots) — 기존 유저 일괄 UPDATE + 정책값 저장을
--    한 함수 안에서 원자적으로 처리한다 (supabase-js는 여러 테이블에 걸친 트랜잭션을
--    지원하지 않으므로, "일부만 반영되는" 상태를 막기 위해 DB 함수로 묶는다).
--
--    이미 새 최대치보다 많은 아이템을 보유한 유저가 있으면 inventory의
--    used_slots_within_limit CHECK(used_slots <= max_slots, 001_initial_schema.sql:141)에
--    걸려 UPDATE가 즉시 실패한다 — 그 실패를 기다리지 않고 사전에 카운트를 세어 몇 명이
--    걸리는지 알려주는 예외로 바꿔 어드민 API가 [현상]-[원인]-[해결책] 메시지를 만들 수
--    있게 한다.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_inventory_max_slots(p_max_slots INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_over_count INTEGER;
  v_updated_count INTEGER;
BEGIN
  IF p_max_slots IS NULL OR p_max_slots < 1 THEN
    RAISE EXCEPTION 'INVENTORY_MAX_SLOTS_INVALID: max_slots는 1 이상의 정수여야 합니다. (받은 값: %)', p_max_slots;
  END IF;

  SELECT count(*) INTO v_over_count FROM public.inventory WHERE used_slots > p_max_slots;
  IF v_over_count > 0 THEN
    RAISE EXCEPTION 'INVENTORY_MAX_SLOTS_OVER_LIMIT: %명의 유저가 이미 %개보다 많은 아이템을 보유하고 있어 적용할 수 없습니다.', v_over_count, p_max_slots;
  END IF;

  UPDATE public.inventory SET max_slots = p_max_slots WHERE used_slots >= 0;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  INSERT INTO public.inventory_policy (id, max_slots, updated_at)
  VALUES (1, p_max_slots, now())
  ON CONFLICT (id) DO UPDATE SET max_slots = EXCLUDED.max_slots, updated_at = EXCLUDED.updated_at;

  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- PostgreSQL은 함수 생성 시 기본적으로 PUBLIC에 EXECUTE 권한을 부여하고, anon/authenticated는
-- PUBLIC 멤버라 REVOKE 없이는 PostgREST(/rest/v1/rpc/set_inventory_max_slots)로 누구나 전체
-- 유저 인벤토리 최대치를 바꿀 수 있다 (109_revoke_security_definer_public_execute.sql과 동일한
-- 위험 — 이 함수는 SECURITY DEFINER가 아니지만 REVOKE 필요성은 동일하다: 함수는 호출자
-- 권한으로 실행되므로 anon 키로 호출되면 anon 권한으로 실행되어 RLS에 걸려 실패하겠지만,
-- 애초에 어드민 전용 기능을 PostgREST에 노출해 둘 이유가 없다).
REVOKE EXECUTE ON FUNCTION public.set_inventory_max_slots(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_inventory_max_slots(INTEGER) TO service_role;
