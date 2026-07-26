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

## 2026-07-26 — phase15-lead: DDL 직접 실행 전부 실패 (재시도 금지)
- **Management API** (`POST https://api.supabase.com/v1/projects/{ref}/database/query`, Bearer=service_role JWT) → **401 `{"message":"JWT failed verification"}`**. 이 API는 Supabase 개인 액세스 토큰(PAT, `sbp_...`)이 필요한데 .env.local엔 없음.
- **SQL-exec RPC** (`exec_sql`/`execute_sql`/`exec`/`sql`/`run_sql`) → 전부 **404 PGRST202** (그런 함수 없음). PostgREST엔 DDL 실행 RPC 미존재.
- **pg 직접 연결** → `node_modules/pg` 미설치 + DB 비밀번호/커넥션스트링/pooler 리전 정보 전무. service_role는 JWT(PostgREST/GoTrue용)일 뿐 postgres role 비밀번호가 아니라 TCP 직결 불가.
- **결론: DDL(CREATE TABLE)은 이 세션에서 실행 불가.** `supabase/migrations/048_today_cards.sql`을 정확히 작성해두고, **유저가 Supabase 대시보드 SQL Editor에 붙여넣어 실행해야 함.** 테이블 생성 후엔 `.from('today_cards').insert()`(PostgREST)로 샘플 20개 삽입 가능 → 시드 실행 스크립트도 준비해둠(`/tmp` node 스크립트 + `supabase/seed_phase15_today_cards_20.sql`).
- 확인: `GET /rest/v1/today_cards` → 404 PGRST205 (테이블 아직 없음).

---

## 2026-07-26 — 메인세션: phase15-today 사전 정보
- DB 직접 접근: jam-web/.env.local에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 있음(gitignore됨). TLS는 `security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain > /tmp/system-ca.pem` 후 NODE_EXTRA_CA_CERTS로 우회.
- 프로젝트 ref: ceehnkzdbecxwzxrhhns (URL: https://ceehnkzdbecxwzxrhhns.supabase.co)
- supabase-js service_role로는 PostgREST CRUD(INSERT/UPDATE/SELECT)만 가능, DDL(CREATE TABLE)은 불가 — DDL 실행 방법은 phase15-lead가 직접 조사 필요(Supabase Management API 등). 안 되면 SQL 파일만 준비하고 메인세션에 보고.
- 마이그레이션 최신 번호는 047(047_reallow_pickup_own_drop.sql)까지 사용됨 — 다음은 048, 단 실물 ls로 재확인 필수(이 프로젝트 중복번호 전례 많음: 012, 044/045, 045/046 등).
- 홈 화면 구조/DB 스키마 조사 결과는 Phase15_01/02_PRD.md에 이미 반영됨 — today_cards 없음, 활동로그 원본 테이블 없음(활동기반 자동세그먼트 불가, Phase2로 미룸).

---

## 2026-07-25 — 메인세션: phase14-dropmenu 사전 조사 요약 (PRD 작성 시 확인됨)
- `/drops` 화면: `src/app/(main)/drops/page.tsx` → `DropsClient.tsx`. 현재 헤더 타이틀 + 드랍/픽업 모드탭 + 카드형(비풀스크린) 지도.
- 지도: `src/components/map/MapView.tsx` (네이버 지도, dynamic ssr:false). 마커 색: 초록(available_drops_count>0) / 회색(범위내 드랍없음) / 흐림(범위밖). `available_drops_count` 집계는 이미 source(user/system) 구분 없이 카운트 — 앰비언트 드랍도 이미 초록으로 표시되고 있음(추가 작업 불필요, 확인만).
- 드랍 API: `POST /api/drops` (src/app/api/drops/route.ts) — 50m 검증(`isUserNearPoi`), 변경 없음.
- 픽업 API: `POST /api/drops/[dropId]/pickup` — 50m+어뷰징 검증, `pickup_drop()` RPC. 변경 없음.
- POI별 배지 목록: `GET /api/drops/poi/[poiId]` — 이미 배열 반환(`is_ambient` 필드 포함), 변경 없음. Step C에서 이 API를 "픽업모드일 때만"이 아니라 POI 클릭마다 항상 먼저 호출하도록 호출 시점만 바꾸면 됨.
- 인벤토리 그리드: `src/app/(main)/inventory/page.tsx`에 3열 그리드가 인라인으로 있음 — Step A에서 `src/components/inventory/InventoryGrid.tsx`로 추출 필요(신규 컴포넌트).
- 배지 상세: `src/app/(main)/badges/[id]/page.tsx` — 기존 페이지 스타일을 참고해 픽업용 오버레이(`BadgeDetailSheet`, 신규)를 만들되 페이지 이동이 아닌 시트/모달로.
- DB 스키마 변경 전혀 없음 (Phase14_02_DATA_MODEL.md §1) — poi_drops가 이미 POI당 여러 행 허용.

---

# phase13-lead 발견사항 (2026-07-24)

- **tsc 베이스라인 292 에러**: 전부 기존 `__tests__/*.test.ts`가 describe/it/expect 전역을 쓰는데 러너(@types/jest 등) 미설치라서 남는 pre-existing 에러. 프로덕션 코드는 0에러. → 신규 테스트는 러너 전역 대신 `node:assert` + 자체 실행 루프로 작성해야 에러 0 유지(`checker-logic.test.ts` 참고). `npx tsx <file>`로 실행.
- **마이그레이션 번호**: 실제 최신 045(045 두 개), 다음은 **046** 사용함.
- **인벤토리 슬롯 테이블명**: `inventory`(id,used_slots,max_slots) + `inventory_items`(inventory_id,badge_id,obtained_by). drop/pickup.ts 패턴 재사용. 아이템배지 지급 시 used_slots+1 수동 갱신 필요.
- **배지 지급 테이블**: activity배지=`user_activity_badges`(user_id,badge_id,triggered_by), item배지=`inventory_items`. 배지 자체 point_reward는 DB트리거가 아니라 코드에서 awardPoints 호출로 재현해야 함(badge-engine과 동일).
- **미션 어드민은 편집 라우트 없음**: POST 생성 / DELETE만. body 통째 insert라 신규 컬럼은 필드명만 맞으면 자동 저장.
- **피드 컴포넌트 메타 접근**: HomeFeedSection/ProfileClient는 metadata를 `Record<string,...>`로 loose 캐스팅해 읽음 → FeedEventMeta 타입 변경이 컴파일 깨지 않음. 배열 필드(awarded_badge_names)는 `Array.isArray` 가드 후 사용.
- **ProfileClient.tsx pre-existing lint 에러 2건**(L351 window.location.hash, L651 strava `<a>`) — 내 작업과 무관, 그대로 둠.
