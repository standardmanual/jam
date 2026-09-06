-- seed_cleanup_pre_v5_missions.sql — v4/구 미션 30건 삭제 (2026-09-07, 사용자 직접 지시)
--
-- 배경: 티켓 20260906_2231이 게이트 미션 40종(engine_condition, 53행)을 시딩한 뒤,
-- "오늘 생성한 게이트 미션 이외의 미션을 모두 삭제해" 요청에 따라 v4 시절 미션 30건
-- (activity_count 10 · checkin 4 · distance 10 · item_collect 6, 전부 2026-07-24 생성)을
-- 정리했다.
--
-- 사전 확인(실행 전 실측) — 실사용 흔적 0건, 삭제해도 손실 없음:
--   user_mission_completions   0건 참조
--   user_mission_participations 0건 참조
--   point_transactions          0건 참조 (source_mission_id, ON DELETE NO ACTION라 있었으면 삭제 자체가 막혔을 것)
--   mission_rank_snapshots      0건 참조
--   today_cards                10건 참조 — ON DELETE SET NULL이라 자동으로 mission_id만 비워짐
--                               (이미 티켓 20260906_0940이 "폐기된 배지를 가리키는 스테일 카드"로
--                               지목하고 "대응하지 않기로 확정"한 콘텐츠 정리 대상과 같은 종류)
--
-- 안전장치: 삭제 전 bak20260907_missions_pre_v5_cleanup 테이블에 30행 전체를 스냅샷했다.
--
-- 이 파일은 실행 기록용이다 — 실제 실행은 MCP로 이미 완료했다(오케스트레이터 직접 실행,
-- CLAUDE.md 규칙 5의 "이미 실행했더라도 SQL 파일은 반드시 남긴다"에 따름).

CREATE TABLE public.bak20260907_missions_pre_v5_cleanup AS
SELECT * FROM public.missions WHERE mission_type != 'engine_condition';

DELETE FROM public.missions WHERE mission_type != 'engine_condition';

-- 검증: SELECT mission_type, count(*) FROM public.missions GROUP BY 1;
--   → engine_condition 53건만 남아야 한다.
