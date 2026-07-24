# 발견 사항 & 공유 자료

## 2026-07-23 — 메인세션: 코드베이스 공통 패턴 (이전 phase10 팀에서 확인, 이번에도 유효)

- **인증 패턴**: `const supabase = await createClient(); const { data:{ user } } = await supabase.auth.getUser();` → user 없으면 401 (참고: `src/app/api/combine/route.ts`)
- **service role**: `createServiceClient()` (동기 함수, await 불필요) — `src/lib/supabase/server.ts`에 `createClient`/`createServiceClient` 둘 다 존재. `award_points()` RPC 호출은 반드시 service role 클라이언트로.
- **supabase select 결과 타입 캐스팅 컨벤션**: `src/app/admin/users/page.tsx` L6-12처럼 `as Pick<UserRow, '...'>[]` 형태로 명시적 캐스팅할 것. 캐스팅 없이 `.not()/.or()` 등을 체이닝하면 `data`가 `never[]`로 추론되어 tsc 에러 남 (이전 세션에서 `users/search/route.ts`가 이 문제로 에러 발생한 사례 있음 — points 관련 API route 작성 시 처음부터 캐스팅 적용해서 같은 실수 반복하지 말 것).
- **PostgREST `.or()` 필터 이스케이프 주의**: 유저 입력을 필터 문자열에 보간할 때 콤마/괄호 처리 확인 필요(포인트 시스템에서는 자유텍스트 검색이 적으므로 영향 적지만, 어드민 유저 검색 재사용 시 주의).
- **npm install 상태**: 세션 시작 시 `jam-web/node_modules`가 없을 수 있음 — tsc 실행 전 `npm install` 먼저 시도(이전에 12초 내 정상 설치됨, 환경 문제 아니었음).
- **마이그레이션 번호**: 현재 최신은 044. 이번 작업은 045부터 사용.

## 2026-07-24 — 메인세션: phase13-mission 시작 메모
- 마이그레이션 번호는 phase12에서 045 사용됨 — phase13-lead는 실제 파일 목록(`ls jam-web/supabase/migrations/`)으로 최신 번호 재확인 후 다음 번호 사용할 것 (여기 기록된 044/045는 참고용, 신뢰 금지)
- Phase13 관련 checker.ts/rewards.ts/missions API 경로: `jam-web/src/lib/missions/checker.ts`, `jam-web/src/lib/missions/rewards.ts`(신규), `jam-web/src/app/api/missions/[id]/join/route.ts`, `jam-web/src/app/api/missions/[id]/status/route.ts`(신규), `jam-web/src/app/(main)/missions/[id]/MissionDetailClient.tsx`, `jam-web/src/app/admin/missions/MissionList.tsx`, `jam-web/src/app/api/admin/missions/route.ts`, `jam-web/src/lib/activity-feed/index.ts`

---

# DEAD_ENDS (시도했으나 실패한 접근)

(phase13-mission 작업에서 실패한 접근이 나오면 여기에: 시도 → 실패 이유 → 근거 형식으로 기록)

---

# phase13-lead 발견사항 (2026-07-24)

- **tsc 베이스라인 292 에러**: 전부 기존 `__tests__/*.test.ts`가 describe/it/expect 전역을 쓰는데 러너(@types/jest 등) 미설치라서 남는 pre-existing 에러. 프로덕션 코드는 0에러. → 신규 테스트는 러너 전역 대신 `node:assert` + 자체 실행 루프로 작성해야 에러 0 유지(`checker-logic.test.ts` 참고). `npx tsx <file>`로 실행.
- **마이그레이션 번호**: 실제 최신 045(045 두 개), 다음은 **046** 사용함.
- **인벤토리 슬롯 테이블명**: `inventory`(id,used_slots,max_slots) + `inventory_items`(inventory_id,badge_id,obtained_by). drop/pickup.ts 패턴 재사용. 아이템배지 지급 시 used_slots+1 수동 갱신 필요.
- **배지 지급 테이블**: activity배지=`user_activity_badges`(user_id,badge_id,triggered_by), item배지=`inventory_items`. 배지 자체 point_reward는 DB트리거가 아니라 코드에서 awardPoints 호출로 재현해야 함(badge-engine과 동일).
- **미션 어드민은 편집 라우트 없음**: POST 생성 / DELETE만. body 통째 insert라 신규 컬럼은 필드명만 맞으면 자동 저장.
- **피드 컴포넌트 메타 접근**: HomeFeedSection/ProfileClient는 metadata를 `Record<string,...>`로 loose 캐스팅해 읽음 → FeedEventMeta 타입 변경이 컴파일 깨지 않음. 배열 필드(awarded_badge_names)는 `Array.isArray` 가드 후 사용.
- **ProfileClient.tsx pre-existing lint 에러 2건**(L351 window.location.hash, L651 strava `<a>`) — 내 작업과 무관, 그대로 둠.
