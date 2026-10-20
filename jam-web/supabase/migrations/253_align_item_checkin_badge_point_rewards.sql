-- 253_align_item_checkin_badge_point_rewards.sql
-- JAM 2.0 포인트: 아이템 배지·체크인 배지의 포인트 값을 운영 로직 14.1절의 등급별 값으로 맞춘다 (티켓 20261019_1314, 사용자 결정 2026-10-20 «지금 바로 적용»)
--
-- 데이터 변경(UPDATE)이다. 새 칸·새 표·새 함수는 없고 옛 객체의 정의도 바꾸지 않는다.
-- 14.1절: 체크인 배지와 아이템 배지는 등급별 Common 10, Rare 20, Epic 50, Mystic 100을 준다(예외 없음). 공용 DB의 두 종류 배지는 전부 0이었다.
--   (2026-10-20 읽기 전용 확인: 삭제되지 않은 아이템 배지 270개와 체크인 배지 1,832개가 모두 Common이고 point_reward = 0.)
--
-- 규칙
--   - 대상: badges.type IN ('item', 'checkin') AND deleted_at IS NULL AND point_reward = 0 (이미 다른 값을 정해 둔 배지는 건드리지 않는다).
--   - 값: common 10, rare 20, epic 50, mystic 100. rarity가 비어 있는 행은 건드리지 않는다.
--   - 액티비티 배지는 건드리지 않는다. 새 계열 시드(245·248)가 이미 규칙 값을 넣고, 기존 재활용 배지는 컨텐츠 확정(티켓 20261018_1816) 때 맞춘다.
--     퀘스트 완료 배지(Common, 100포인트)처럼 규칙 값과 다른 예외가 있어 등급 기준 일괄 변경이 위험하다.
--   - 포인트는 앞으로 받는 배지부터 준다(이미 받은 배지에는 소급하지 않는다). 아이템 배지는 열린 개체가 될 때, 체크인 배지는 처음 받을 때 준다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT type, rarity, point_reward, count(*) FROM public.badges
--    WHERE type IN ('item','checkin') AND deleted_at IS NULL GROUP BY 1,2,3 ORDER BY 1,2,3;          -- item/common/10 = 270, checkin/common/10 = 1832
--   SELECT count(*) FROM public.badges WHERE type = 'activity' AND point_reward <> 0;                   -- 이 변경 전과 같다(액티비티 배지는 건드리지 않았다)

UPDATE public.badges
   SET point_reward = CASE rarity
         WHEN 'common' THEN 10
         WHEN 'rare'   THEN 20
         WHEN 'epic'   THEN 50
         WHEN 'mystic' THEN 100
       END
 WHERE type IN ('item', 'checkin')
   AND deleted_at IS NULL
   AND point_reward = 0
   AND rarity IS NOT NULL;

-- 되돌림 SQL
-- 적용 전에는 대상 배지 2,102개가 모두 point_reward = 0이었다. 적용 직후에 되돌린다면 같은 조건으로 0으로 돌린다.
-- 그 사이 어드민이 이 배지들의 값을 직접 바꿨다면 그 값도 0이 되므로, 되돌리기 전에 바뀐 행이 있는지 먼저 확인한다.
-- UPDATE public.badges SET point_reward = 0
--  WHERE type IN ('item', 'checkin') AND deleted_at IS NULL AND point_reward IN (10, 20, 50, 100);
