-- 332: 백업 표 gate_key_backup_20261031에 행 단위 보안(RLS)을 켠다 (티켓 20261103_1116)
-- 정책을 두지 않으므로 공개 키(anon)·로그인 키(authenticated)로는 읽고 쓸 수 없고 서버 키(service_role)만 접근한다.
-- 같은 날짜대의 gate_mission_backup_20261028과 같은 모양이다.
-- 확인: SELECT relrowsecurity FROM pg_class WHERE oid = 'public.gate_key_backup_20261031'::regclass;  -- true
ALTER TABLE "public"."gate_key_backup_20261031" ENABLE ROW LEVEL SECURITY;
