-- 079_fix_handle_new_user_missing_inventory.sql
-- 운영 DB의 handle_new_user() 트리거 함수에서 인벤토리(inventory) 생성 구문이
-- 누락된 회귀를 복구한다. 레포 마이그레이션(001_initial_schema_rerun.sql)에는
-- INSERT INTO public.inventory 구문이 있었으나, 실제 운영 DB에 걸려있던 함수
-- 정의에는 이 구문이 빠진 채로 재정의되어 있었다(추적 안 된 변경).
--
-- 영향: 2026-08-04 이후 가입한 신규 유저 3명(9irrun, kangwonc, jeeni)이 인벤토리
-- 행이 없어 아이템 드랍 엔진(tryItemDrop)이 매 동기화마다 조용히 no-op — 콘솔
-- 에러만 남기고 engine_decision_log에도 기록되지 않아 어드민에서 감지 불가했음.
-- (Service Plan/History/Migration/Ticket/20260811_001_Service_인벤토리-미생성-아이템배지-미발급.md 참고)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, username, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NULL,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.inventory (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
