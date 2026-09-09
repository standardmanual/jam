-- 147: Supabase 보안 어드바이저 rls_disabled_in_public 12건 해소
-- 배경: 2026-09-09 보안 스캔에서 public 스키마의 RLS 미적용 테이블 12개가 ERROR로 보고됨
-- (사용자 직접 지시로 확인·처리).
--
-- ① ambient_drop_config — 앰비언트 드랍 설정을 담는 실제 운영 테이블
--    (src/lib/ambient-drop/config.ts). service_role 클라이언트 전용으로 설계돼 있었으나
--    RLS가 꺼져 있어 PostgREST를 통해 anon/authenticated 키로도 직접 읽고 쓸 수 있었다.
--    정책 없이 RLS만 켜서 service_role만 접근 가능하게 잠근다(기존 서버 코드는 전부
--    createServiceClient()로 접근하므로 기능 영향 없음).
--
-- ② 백업 테이블 9개 — 전부 위험한 스키마/데이터 변경 전 안전망 스냅샷이며, 실측으로
--    안정화를 확인해 삭제한다:
--    - backup_20260831_badges/missions/today_cards/user_activity_feed/engine_decision_log:
--      원본 테이블 모두 2026-09-08까지 정상 활동 확인, 관련 티켓(20260831_1115·20260831_2100)
--      CLOSED.
--    - backup_20260905_badges_activity/mission_children/missions_legacy_gate:
--      원본 테이블(badges_activity/mission_children/missions_legacy_gate) 자체가
--      2026-09-06 게이트미션 재설계(티켓 20260906_2231)로 이미 폐기되어 현재 존재하지
--      않음 — 되돌릴 대상 자체가 없어 무의미.
--    - bak20260906_cadence_backfill_141: 마이그레이션 141(avgCadence ×2 재정규화)의
--      안전망. 실측 결과 러닝 케이던스 중앙값 172.1(재정규화 목표 173 근사), 미정규화
--      잔여 1건뿐으로 안정화 확인됨.
--
-- ③ 최근 백업 2개는 아직 보류 대상이라 삭제하지 않고 RLS만 켠다(보안 경고만 해소):
--    - bak20260907_missions_pre_v5_cleanup (2026-09-07, seed_cleanup_pre_v5_missions.sql
--      안전망)
--    - poi_backup_144 (144_poi_category_restructure.sql 안전망)
--
-- 이 파일은 실행 기록용이다 — 실제 실행은 MCP로 이미 완료했다(오케스트레이터 직접 실행,
-- CLAUDE.md 규칙 5에 따름).

-- ① 운영 테이블 RLS 활성화 (정책 없음 = service_role만 접근 가능)
ALTER TABLE public.ambient_drop_config ENABLE ROW LEVEL SECURITY;

-- ② 안정화 확인된 백업 테이블 삭제
DROP TABLE IF EXISTS public.backup_20260831_badges;
DROP TABLE IF EXISTS public.backup_20260831_missions;
DROP TABLE IF EXISTS public.backup_20260831_today_cards;
DROP TABLE IF EXISTS public.backup_20260831_user_activity_feed;
DROP TABLE IF EXISTS public.backup_20260831_engine_decision_log;
DROP TABLE IF EXISTS public.backup_20260905_badges_activity;
DROP TABLE IF EXISTS public.backup_20260905_mission_children;
DROP TABLE IF EXISTS public.backup_20260905_missions_legacy_gate;
DROP TABLE IF EXISTS public.bak20260906_cadence_backfill_141;

-- ③ 보류 중인 최근 백업은 RLS만 활성화 (정책 없음 = service_role만 접근 가능)
ALTER TABLE public.bak20260907_missions_pre_v5_cleanup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poi_backup_144 ENABLE ROW LEVEL SECURITY;
