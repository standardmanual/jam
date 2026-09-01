/**
 * 유닛 테스트 전역 세이프가드 — 티켓 20260831_1327
 *
 * Supabase는 staging·프로덕션 공용 단일 DB다. `.env.local`이 있는 로컬 환경에서
 * `createServiceClient()`/`createClient()`를 모킹하지 않은 테스트가 실수로 실 DB에
 * 접속하면(읽기든 쓰기든) 사고로 이어진다. 매 테스트 파일 실행 전에 관련 env를 비워
 * 모킹 누락이 "조용히 실 DB 연결"이 아니라 "즉시 에러"로 드러나게 한다
 * (`.env.local`이 없는 CI와 동일한 실패 양상을 로컬에서도 재현).
 *
 * `vi.mock('@/lib/supabase/server', ...)`로 이미 모킹된 테스트는 이 env와 무관하게
 * 정상 동작한다 — 모킹된 모듈은 실제 구현을 아예 호출하지 않기 때문이다.
 */
delete process.env.NEXT_PUBLIC_SUPABASE_URL
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
delete process.env.SUPABASE_SERVICE_ROLE_KEY
