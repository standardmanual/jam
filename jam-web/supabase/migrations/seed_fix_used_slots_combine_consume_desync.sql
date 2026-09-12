-- seed_fix_used_slots_combine_consume_desync.sql
--
-- 증상: sihyunrr@gmail.com 계정의 인벤토리 화면은 비어 보이는데(자유 아이템 0개,
-- 20개 전부 아이템북 슬롯에 장착됨) 슬롯 프로그레스바는 "5/10"으로 표시됨.
--
-- 원인: jam-web/src/lib/combine/index.ts의 combineItems()가 아이템 조합(믹스) 시
-- 재료 아이템을 소각(destroyed_at 세팅 + inventory_id를 NULL로 비움)하면서
-- inventory.used_slots를 감소시키는 처리를 누락했다. 이 계정은 2026-09-09 15:10:24에
-- 재료 5개를 소비했고, 그 5칸이 반환되지 않은 채 캐시 카운터에 남아 있었다.
--
-- 068_used_slots_slot_policy_fix.sql이 확정한 정책과 동일한 공식으로, 이 계정 한 건만
-- 재계산해 정정한다(다른 7개 유저 계정은 이미 캐시값과 실제 상태가 일치함을 확인했다).
-- 근본 원인(combine/index.ts의 카운터 미반영)은 별도 티켓으로 코드 수정한다.

UPDATE public.inventory i
SET used_slots = (
  SELECT COUNT(*)
  FROM public.inventory_items ii
  WHERE ii.inventory_id = i.id
    AND ii.dropped_at IS NULL
    AND ii.slotted_in IS NULL
)
WHERE i.user_id = '3649ed39-2be2-402e-82ae-41e0cd328105';
