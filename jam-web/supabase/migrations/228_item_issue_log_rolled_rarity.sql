-- 228_item_issue_log_rolled_rarity.sql
-- 아이템 배지 발급 기록에 «뽑힌 등급» 칸을 더한다 (티켓 20261017_1424 2회, 운영 로직 6.2·6.6절)
--
-- item_issue_log(227)에 칸 1개를 더한다. NULL을 허용하고 기본값이 없어 기존 행(지금 0행)과 칸 이름을 모르는 코드에 영향이 없다.
-- 기존 객체는 건드리지 않는다.
--
-- 규칙
--   - rolled_rarity: 등급 추첨에서 처음 뽑힌 등급이다. 그 등급에 발급할 후보가 소속 트라이브 컬렉션에 없어 한 등급 내려 다시 뽑았으면
--     rarity(실제로 준 등급)와 다르다. 내려가지 않았으면 rarity와 같거나 NULL이다.
--     운영이 «어느 등급이 후보가 없어 내려갔는가»를 컨텐츠 채움 상태의 신호로 볼 수 있게 한다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'item_issue_log' AND column_name = 'rolled_rarity';   -- 1행, nullable

ALTER TABLE public.item_issue_log
  ADD COLUMN IF NOT EXISTS rolled_rarity public.badge_rarity;

COMMENT ON COLUMN public.item_issue_log.rolled_rarity IS
  '등급 추첨에서 처음 뽑힌 등급. 후보가 없어 한 등급 내려 다시 뽑았으면 rarity(실제로 준 등급)와 다르다. NULL이면 내려가지 않음.';

-- 되돌림 SQL
-- 새로 만든 칸만 지운다. 이 칸을 쓰는 새 코드(동기화 아이템 배지 발급의 기록 쓰기)는 같은 시점에 되돌려야 한다.
-- ALTER TABLE public.item_issue_log DROP COLUMN IF EXISTS rolled_rarity;
