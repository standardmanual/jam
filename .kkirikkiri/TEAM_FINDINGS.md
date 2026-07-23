# 발견 사항 & 공유 자료

## 2026-07-23 — 메인세션: 코드베이스 공통 패턴 (이전 phase10 팀에서 확인, 이번에도 유효)

- **인증 패턴**: `const supabase = await createClient(); const { data:{ user } } = await supabase.auth.getUser();` → user 없으면 401 (참고: `src/app/api/combine/route.ts`)
- **service role**: `createServiceClient()` (동기 함수, await 불필요) — `src/lib/supabase/server.ts`에 `createClient`/`createServiceClient` 둘 다 존재. `award_points()` RPC 호출은 반드시 service role 클라이언트로.
- **supabase select 결과 타입 캐스팅 컨벤션**: `src/app/admin/users/page.tsx` L6-12처럼 `as Pick<UserRow, '...'>[]` 형태로 명시적 캐스팅할 것. 캐스팅 없이 `.not()/.or()` 등을 체이닝하면 `data`가 `never[]`로 추론되어 tsc 에러 남 (이전 세션에서 `users/search/route.ts`가 이 문제로 에러 발생한 사례 있음 — points 관련 API route 작성 시 처음부터 캐스팅 적용해서 같은 실수 반복하지 말 것).
- **PostgREST `.or()` 필터 이스케이프 주의**: 유저 입력을 필터 문자열에 보간할 때 콤마/괄호 처리 확인 필요(포인트 시스템에서는 자유텍스트 검색이 적으므로 영향 적지만, 어드민 유저 검색 재사용 시 주의).
- **npm install 상태**: 세션 시작 시 `jam-web/node_modules`가 없을 수 있음 — tsc 실행 전 `npm install` 먼저 시도(이전에 12초 내 정상 설치됨, 환경 문제 아니었음).
- **마이그레이션 번호**: 현재 최신은 044. 이번 작업은 045부터 사용.

---

# DEAD_ENDS (시도했으나 실패한 접근)

(이번 phase12-points 작업에서 실패한 접근이 나오면 여기에: 시도 → 실패 이유 → 근거 형식으로 기록)
