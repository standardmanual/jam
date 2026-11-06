-- 328_issued_item_books.sql
-- 개체가 한 번이라도 만들어진 컬렉션은 비활성이어도 컬렉션과 그 모든 칸(배지)이 읽히게 한다 (티켓 20261106_1227, 2단계 T1)
--
-- 왜
--   어드민에서 컬렉션을 비활성하는 뜻은 «신규로 아이템 배지를 생성해 발급하는 것을 막는 것»이다(사용자 2026-11-06 결정).
--   1단계(327)는 개체가 만들어진 «배지»만 읽히게 했다. 그러면 컬렉션 안의 나머지 칸은 여전히 숨고, 컬렉션 자체(item_books)도 읽히지 않아
--   컬렉션 상세가 칸 수와 분모가 줄어든 채 «2칸 중 2칸 완성» 같은 가짜 완성을 보여 줄 수 있다(서버 완성 판정은 전체 칸을 센다).
--   그래서 «열람 가능 = 공개됨 OR 발급 기록 있음»을 컬렉션 단위로 올린다(상위 티켓 20261106_1125).
--
-- 하는 일 (한 트랜잭션 — 정책을 지우고 만드는 사이에 읽기가 비지 않는다)
--   1. 발급 기록 표 `public.issued_item_books`를 만든다. «소속 배지의 개체(inventory_items)가 한 번이라도 만들어진 컬렉션»의 id를
--      한 행씩 둔다. RLS를 켜고 인증 유저 읽기 정책 하나만 둔다. 쓰기 정책은 없다(트리거와 service_role만 쓴다).
--   2. 기존 개체의 컬렉션을 백필한다(INSERT … SELECT DISTINCT). 적용 시점의 값이다(2026-11-06 기준 약 78행).
--   3. 트리거 ① — `inventory_items` AFTER INSERT가 새 개체 배지의 item_book_id(NULL이면 건너뜀)를 기록한다.
--      개체가 만들어지는 모든 경로(민트·시스템 드랍·조합·캡슐·어드민 재배정)가 inventory_items INSERT라 한 곳에서 잡는다
--      (서비스 코드에서 supabase-js로 직접 insert하는 곳은 없고, SQL 함수 004·007·044·047·108·173·240번이 만든다).
--      inventory_items.badge_id를 UPDATE로 바꾸는 경로는 없다(2026-11-06 확인).
--   4. 트리거 ② — `badges` AFTER UPDATE OF item_book_id가 «이미 개체가 만들어진 배지»(issued_item_badges에 있음)를
--      다른 컬렉션으로 옮길 때 새 컬렉션을 기록한다(어드민 배정 경로 api/admin/badges/[id]/assign).
--      두 트리거 함수는 SECURITY DEFINER — 개체를 만들고 배지를 옮기는 쪽(authenticated·service_role 경로)에게 표의 쓰기 권한을
--      주지 않기 위해서다.
--   5. `item_books: 전체 읽기 허용` 정책을 지우고 다시 만든다. 첫 조건(공개됨)은 현재 본문 글자 그대로 두고
--      `OR EXISTS (발급 기록 표)`를 더한다.
--   6. `badges: 전체 읽기 허용` 정책을 지우고 다시 만든다. 활동 배지 공개 시각 조건과 컬렉션 노출 조건은 현재 본문 그대로 두고,
--      1단계(327)의 배지 단위 조건 `EXISTS(issued_item_badges)`를 컬렉션 단위 `EXISTS(issued_item_books)`로 바꾼다.
--      컬렉션 단위 조건이 배지 단위 조건의 상위 집합이다(배지 개체가 있으면 그 컬렉션이 기록된다).
--      두 정책은 issued_item_books만 참조하므로 정책끼리 서로를 부르는 재귀가 없다.
--
-- 하지 않는 것
--   - 1단계의 `issued_item_badges` 표와 트리거는 지우지 않는다(재시험 부담을 줄이고, 정리는 성능 측정 뒤 후속으로).
--   - 개체가 한 번도 만들어지지 않은 비활성·예약 컬렉션과 그 배지는 지금처럼 숨는다(오픈 때 is_active 하나로 켜는 계획, 292).
--   - 신규 발급을 막는 쪽(드랍 엔진·컬렉션 완성 판정)은 이미 컬렉션 노출 판정을 쓰므로 바꾸지 않는다.
--   - 직접 주소로 접근하는 차단 로직은 추가하지 않는다. 읽기 정책만 바꾼다.
--   - 개체가 모두 파괴돼도 표의 행은 지우지 않는다(한 번 보인 컬렉션은 계속 보인다).
--   - 정책 이름은 215·216처럼 그대로 둔다. 대상 역할(TO authenticated)과 명령(FOR SELECT)도 그대로다.
--
-- 성능 근거: 정책에서 행마다 함수를 부르는 방식은 컬렉션 33개 조회를 2.0ms→9.7ms로 늦췄다(1단계 교훈).
--   이 파일은 작은 보조 표를 PK로 EXISTS 조회하는 방식만 쓴다.
--
-- 되돌림: 328_issued_item_books_down.sql (정책을 옛 본문으로 복원한 뒤 트리거 → 트리거 함수 → 표 순서로 지운다)
--
-- 이 파일은 실행하지 않는다. 적용은 카리나가 드라이런(적용→측정→되돌림→원상 대조→예외 취소) 뒤에 한다.

BEGIN;

CREATE TABLE public.issued_item_books (
  item_book_id    uuid        PRIMARY KEY REFERENCES public.item_books(id) ON DELETE CASCADE,
  first_issued_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.issued_item_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "issued_item_books: 인증 유저 읽기" ON public.issued_item_books
  FOR SELECT TO authenticated
  USING (true);

INSERT INTO public.issued_item_books (item_book_id)
SELECT DISTINCT b.item_book_id
FROM public.inventory_items ii
JOIN public.badges b ON b.id = ii.badge_id
WHERE b.item_book_id IS NOT NULL
ON CONFLICT (item_book_id) DO NOTHING;

-- 트리거 ①: 새 개체의 배지가 속한 컬렉션을 기록한다
CREATE OR REPLACE FUNCTION public.trg_inventory_items_mark_book_issued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_book_id uuid;
BEGIN
  SELECT item_book_id INTO v_book_id FROM public.badges WHERE id = NEW.badge_id;
  IF v_book_id IS NOT NULL THEN
    INSERT INTO public.issued_item_books (item_book_id)
    VALUES (v_book_id)
    ON CONFLICT (item_book_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Supabase가 새 함수에 기본으로 주는 anon·authenticated 실행 권한까지 회수한다(109번 패턴). 트리거는 실행 권한 없이도 돈다
REVOKE ALL ON FUNCTION public.trg_inventory_items_mark_book_issued() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_inventory_items_mark_book_issued
  AFTER INSERT ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_inventory_items_mark_book_issued();

-- 트리거 ②: 이미 개체가 만들어진 배지를 다른 컬렉션으로 옮기면 새 컬렉션을 기록한다
CREATE OR REPLACE FUNCTION public.trg_badges_mark_book_issued_on_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.item_book_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.issued_item_badges s WHERE s.badge_id = NEW.id) THEN
    INSERT INTO public.issued_item_books (item_book_id)
    VALUES (NEW.item_book_id)
    ON CONFLICT (item_book_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_badges_mark_book_issued_on_move() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_badges_mark_book_issued_on_move
  AFTER UPDATE OF item_book_id ON public.badges
  FOR EACH ROW
  WHEN (NEW.item_book_id IS DISTINCT FROM OLD.item_book_id)
  EXECUTE FUNCTION public.trg_badges_mark_book_issued_on_move();

-- item_books 읽기 정책: 첫 조건은 215 글자 그대로, 뒤에 발급 기록을 더한다
DROP POLICY "item_books: 전체 읽기 허용" ON public.item_books;

CREATE POLICY "item_books: 전체 읽기 허용" ON public.item_books
  FOR SELECT TO authenticated
  USING (
    (is_active = TRUE AND (valid_from IS NULL OR valid_from <= now()))
    OR EXISTS (
      SELECT 1 FROM public.issued_item_books s
      WHERE s.item_book_id = item_books.id
    )
  );

-- badges 읽기 정책: 327의 배지 단위 조건을 컬렉션 단위 조건으로 바꾼다
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
        SELECT 1 FROM public.issued_item_books s
        WHERE s.item_book_id = badges.item_book_id
      )
    )
  );

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
-- 1) 정책 본문과 대상 역할(두 정책 모두 authenticated, SELECT):
--   SELECT tablename, policyname, cmd, roles, qual FROM pg_policies
--    WHERE schemaname = 'public' AND tablename IN ('item_books', 'badges') AND policyname LIKE '%전체 읽기 허용';
-- 2) 표 행 수(2026-11-06 기준 78행 안팎)와 RLS 켜짐:
--   SELECT count(*) FROM public.issued_item_books;
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.issued_item_books'::regclass;
-- 3) 트리거와 함수 권한(anon·authenticated 없음):
--   SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('trg_inventory_items_mark_book_issued', 'trg_badges_mark_book_issued_on_move');
--   SELECT proname, proacl FROM pg_proc WHERE proname IN ('trg_inventory_items_mark_book_issued', 'trg_badges_mark_book_issued_on_move');
-- 4) authenticated로 읽을 때: 개체가 만들어진 적 있는 비활성 컬렉션은 item_books에서 읽히고 그 컬렉션의 모든 배지가 읽히며,
--    개체가 한 번도 없는 비활성 컬렉션과 그 배지는 읽히지 않는다.
-- 5) 트리거 시험(취소되는 트랜잭션): 발급 기록 없는 비활성 컬렉션의 배지로 개체를 만들면 그 컬렉션이 기록되고 읽힌다.
--    발급된 배지를 다른 컬렉션으로 옮기면 새 컬렉션이 기록된다.
