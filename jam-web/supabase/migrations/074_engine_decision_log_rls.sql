-- engine_decision_log 테이블 RLS 미적용 보안 취약점 수정
-- 073_engine_decision_log.sql 주석에는 "drop_policy와 동일하게 RLS 미적용"이라 되어있었으나,
-- 실제로는 drop_policy 등 다른 어드민 전용 테이블들은 RLS가 켜진 채 정책만 없는 상태(=service_role만 접근 가능)였고
-- 이 테이블만 RLS 자체가 빠져 anon 키로 전체 데이터 조회/수정이 가능했음 (Supabase 보안 어드바이저 critical 감지, 2026-08-03)

ALTER TABLE public.engine_decision_log ENABLE ROW LEVEL SECURITY;
