-- 티켓 20260909_1045: today_cards.created_by FK를 ON DELETE SET NULL로 재정의
--
-- 배경: today_cards.created_by는 어드민이 투데이카드를 생성할 때 실제 관리자 id를 채워 넣는
-- 실사용 컬럼이다(jam-web/src/app/api/admin/today/route.ts POST 핸들러). 기존 FK는
-- ON DELETE 절이 없어 기본값인 NO ACTION으로 동작했다 — 어드민 계정을 완전 삭제하는 기능과
-- 충돌하면 FK 위반으로 500 에러가 발생할 수 있었다.
--
-- 조치: 컬럼은 유지하고, FK 제약만 ON DELETE SET NULL로 재정의한다. 어드민 계정이 삭제돼도
-- 해당 어드민이 만든 today_cards 행은 남고 created_by만 NULL로 바뀐다.

ALTER TABLE public.today_cards
  DROP CONSTRAINT IF EXISTS today_cards_created_by_fkey;

ALTER TABLE public.today_cards
  ADD CONSTRAINT today_cards_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
