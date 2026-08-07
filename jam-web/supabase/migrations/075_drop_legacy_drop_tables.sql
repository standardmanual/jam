-- 레거시 드랍 테이블 삭제 (드랍엔진 v2 전환 후 미사용)
-- drop_events/drop_claims/drop_probability는 드랍엔진 v1 시절 어드민 이벤트형 드랍에 사용하던 테이블.
-- 드랍엔진 v2(migration 034~) 이후 drop_policy/user_drop_state/poi_drops(source=system)로 완전 대체.
-- src/lib/drop/pickup.ts의 processDropPickups() 함수가 이 테이블을 참조했으나 어디서도 호출되지 않아 데드코드로 확인됨.

DROP TABLE IF EXISTS public.drop_claims;
DROP TABLE IF EXISTS public.drop_events;
DROP TABLE IF EXISTS public.drop_probability;
