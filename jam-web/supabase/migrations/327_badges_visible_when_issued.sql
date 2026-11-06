-- 327_badges_visible_when_issued.sql
-- 한 번이라도 발급된 아이템 배지는 컬렉션이 비활성이어도 읽히게 한다 (티켓 20261106_1124, 1단계: 배지)
--
-- 왜
--   어드민에서 컬렉션을 비활성하는 뜻은 «신규로 아이템 배지를 생성해 발급하는 것을 막는 것»이다(사용자 2026-11-06 결정).
--   그런데 `badges: 전체 읽기 허용` 정책(216)은 비활성 컬렉션 소속 배지를 모두에게 숨겨서, 그 배지의 개체를 이미 가진 사람도
--   인벤토리 화면에서 못 본다. 칸은 10/10인데 8개만 보이고 «가득 찼어요»가 나오는 증상의 원인이다(티켓 20261106_1044).
--
-- 하는 일 (한 트랜잭션 — 정책을 지우고 만드는 사이에 읽기가 비지 않는다)
--   1. 발급 기록 표 `public.issued_item_badges`를 만든다. «개체(inventory_items)가 한 번이라도 만들어진 배지»의 id를 한 행씩 둔다.
--      RLS를 켜고 인증 유저 읽기 정책 하나만 둔다. 쓰기 정책은 없다(트리거와 service_role만 쓴다).
--   2. 기존 개체의 배지를 백필한다(INSERT … SELECT DISTINCT). 적용 시점의 값이다.
--   3. 개체 INSERT 트리거로 새로 만들어지는 개체의 배지를 표에 기록한다. 개체가 만들어지는 모든 경로(민트·시스템 드랍·조합·캡슐·
--      어드민 재배정)가 inventory_items INSERT라 한 곳에서 잡는다. 트리거 함수는 SECURITY DEFINER — 개체를 만드는 쪽(authenticated)에게
--      표의 쓰기 권한을 주지 않기 위해서다.
--   4. `badges: 전체 읽기 허용` 정책을 지우고 다시 만든다. 첫 번째 조건(활동 배지 공개 시각)은 216 글자 그대로 두고,
--      두 번째 조건 끝에 `OR EXISTS (발급 기록 표)`를 더한다. 값싼 조건(item_book_id IS NULL, 컬렉션 노출)을 앞에 둔다.
--
-- 하지 않는 것
--   - 개체가 한 번도 만들어지지 않은 비활성·예약 컬렉션 배지는 지금처럼 숨는다(오픈 때 is_active 하나로 켜는 계획, 292).
--   - 신규 발급을 막는 쪽(드랍 엔진·컬렉션 완성 판정)은 이미 컬렉션 노출 판정을 쓰므로 바꾸지 않는다.
--   - 컬렉션(item_books) 읽기 정책은 건드리지 않는다(2단계 20261106_1125).
--   - 정책의 `is_active` 조건 자체를 지우지 않는다(예약 컬렉션 배지 수천 개가 한꺼번에 노출된다).
--   - 개체가 모두 파괴돼도 표의 행은 지우지 않는다(한 번 보인 배지는 계속 보인다).
--   - 정책 이름은 216처럼 그대로 둔다.
--
-- 성능 근거: 정책에서 행마다 함수를 부르는 방식은 컬렉션 33개 조회를 2.0ms→9.7ms, 배지 전체 읽기를 2ms→30ms로 늦췄다.
--   표를 EXISTS로 보는 이 방식은 1.8ms, 2.4ms로 적용 전 수준이다(티켓 「성능 측정」).
--
-- 되돌림: 327_badges_visible_when_issued_down.sql (정책을 216 조건으로 복원한 뒤 트리거 → 트리거 함수 → 표 순서로 지운다)
--
-- 이 파일은 실행하지 않는다. 적용은 카리나가 드라이런(적용→점검→되돌림→원상 대조→예외 취소) 뒤에 한다.

BEGIN;

CREATE TABLE public.issued_item_badges (
  badge_id        uuid        PRIMARY KEY REFERENCES public.badges(id) ON DELETE CASCADE,
  first_issued_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.issued_item_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "issued_item_badges: 인증 유저 읽기" ON public.issued_item_badges
  FOR SELECT TO authenticated
  USING (true);

INSERT INTO public.issued_item_badges (badge_id)
SELECT DISTINCT badge_id FROM public.inventory_items
ON CONFLICT (badge_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trg_inventory_items_mark_issued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.issued_item_badges (badge_id)
  VALUES (NEW.badge_id)
  ON CONFLICT (badge_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_inventory_items_mark_issued() FROM PUBLIC;

CREATE TRIGGER trg_inventory_items_mark_issued
  AFTER INSERT ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_inventory_items_mark_issued();

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
      OR EXISTS (
        SELECT 1 FROM public.issued_item_badges s
        WHERE s.badge_id = badges.id
      )
    )
  );

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
-- 1) 정책 본문에 발급 기록 표가 들어갔는지:
--   SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'badges' AND policyname = 'badges: 전체 읽기 허용';
-- 2) 표 행 수(2026-11-06 기준 323행 안팎)와 RLS 켜짐:
--   SELECT count(*) FROM public.issued_item_badges;
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.issued_item_badges'::regclass;
-- 3) 트리거와 함수 권한(PUBLIC 없음):
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.inventory_items'::regclass AND tgname = 'trg_inventory_items_mark_issued';
--   SELECT proacl FROM pg_proc WHERE proname = 'trg_inventory_items_mark_issued';
-- 4) authenticated로 읽을 때: 개체가 만들어진 적 있는 비활성 컬렉션 배지는 읽히고, 개체가 한 번도 없는 비활성 컬렉션 배지는 읽히지 않는다.
