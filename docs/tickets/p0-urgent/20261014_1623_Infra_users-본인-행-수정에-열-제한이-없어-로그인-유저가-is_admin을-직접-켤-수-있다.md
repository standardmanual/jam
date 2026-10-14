---
id: "20261014_1623"
category: Infra
priority: P0
status: OPEN
created: 2026-10-14
closed:
---

# [Infra] users 본인 행 수정에 열 제한이 없어 로그인 유저가 is_admin을 직접 켤 수 있다

## 핵심 요약

- 요구사항: 클라이언트 역할(`authenticated`·`anon`)이 `public.users.is_admin`을 쓰지 못하게 막는다. 서버(서비스 롤)와 대시보드는 그대로 쓸 수 있어야 한다.
- 구현 계획: 마이그레이션 `219_users_block_client_is_admin_write.sql`(작성 완료)로 `BEFORE INSERT OR UPDATE OF is_admin` 트리거를 건다. 권한 회수 방식은 쓰지 않는다.
- 관련 파일: `jam-web/supabase/migrations/219_users_block_client_is_admin_write.sql`, `jam-web/src/lib/admin/auth.ts`(`hasAdminAccess`), `jam-web/src/app/api/admin/users/[id]/admin-role/route.ts`(정상 쓰기 경로)

## 배경 / 문제 정의

### 확인한 사실 (2026-10-14 16:30경 KST, Supabase MCP 읽기 전용 쿼리로 라이브 DB 확인)

- 정책: `users: 본인만 수정`은 `FOR UPDATE USING (auth.uid() = id)`이고 `WITH CHECK`가 없다. 대상 역할은 `public`이다.
- 권한: `authenticated`·`anon` 모두 `public.users`의 UPDATE·INSERT 권한이 있고 `is_admin` 열의 UPDATE 권한도 있다(`has_column_privilege`가 둘 다 true).
- 트리거: `trg_log_orphan_custody_events`(BEFORE DELETE, 감사 로그 삽입)와 `trg_users_updated_at`(BEFORE UPDATE, `updated_at` 갱신)뿐이다. `is_admin` 변경을 막는 것은 없다.
- 앱: `lib/admin/auth.ts`의 `hasAdminAccess`가 `ADMIN_EMAILS`에 없으면 `users.is_admin`을 읽어 신뢰한다. `is_admin`을 쓰는 코드는 `api/admin/users/[id]/admin-role/route.ts` 하나뿐이다.
- 클라이언트 화면 두 곳(`onboarding/page.tsx`, `profile/edit/page.tsx`)은 `users`를 읽기만 한다.
- 이 구조는 `001_initial_schema_rerun.sql`(정책)과 `106_users_is_admin.sql`(열 추가)에서 생겼다. 이번 배포가 만든 것이 아니다. 민지 모드 ② 보안 점검이 마이그레이션 읽기로 짚었고, 위 내용은 라이브 DB에서 직접 확인했다.

### 영향 (추론, 악용은 시도하지 않았다)

- 로그인한 유저가 anon 키(공개 값)와 본인 JWT로 PostgREST에 본인 행의 `is_admin = true`를 보내면 어드민이 된다. 어드민은 서비스 롤 API 전체를 쓴다.
- 연쇄: `stage.j-a-m.app`은 쿠키 없는 방문자에게 `dev-tester` 계정 세션을 준다(티켓 20261006_1527). 이 계정은 같은 DB의 유효한 유저다. 그 토큰으로 위 요청이 가능하고, 프로덕션에는 `STAGING_MODE`가 없어 `hasAdminAccess`의 staging 차단이 꺼져 있다. 그래서 이론상 로그인하지 않은 방문자도 프로덕션 어드민에 닿을 수 있다. **이 연쇄는 세션 토큰을 프로덕션에 그대로 쓸 수 있는지 직접 검증하지 않았다(확신도 보통).**
- 현재 상태: 사용자 8명 중 `is_admin`이 켜진 계정은 2개이고, `dev-tester`는 꺼져 있다. 악용 흔적은 찾지 못했다. 다만 `is_admin` 변경 이력을 남기는 감사 로그가 없어 과거에 잠깐 켰다 끈 경우는 알 수 없다.

## 상세 요구사항

- 클라이언트 역할의 `is_admin` 변경(INSERT로 true 생성, UPDATE로 값 변경)은 `42501`로 거부된다.
- 서비스 롤과 `postgres`는 변경할 수 있다. 어드민 화면의 권한 부여·회수가 계속 동작한다.
- 다른 열의 쓰기에는 영향이 없다.

## 구현 계획

1. 마이그레이션 219를 사용자 승인 후 실행한다(CLAUDE.md 규칙 6, 공용 DB라 즉시 프로덕션에 반영된다).
2. 파일 끝의 검증 쿼리 ②로 클라이언트 역할 변경이 막히는지 확인한다(예외로 전체가 롤백되므로 데이터는 남지 않는다).
3. 어드민 2명이 모두 의도한 계정인지 사용자가 확인한다.

## 후속 검토 (이 티켓의 범위 밖)

- `users`의 다른 민감 열이 같은 방식으로 클라이언트에서 쓰일 수 있다: `gps_daily_distance_km`·`gps_daily_distance_date`(하루 이동 거리 상한 우회), `initial_sync_done`(첫 동기화 제한 우회), `last_location_*`.
- `strava_connections`도 본인 행 INSERT·UPDATE가 열려 있다(타인 행에는 영향 없음).
- `is_admin` 변경 이력을 남기는 감사 로그가 없다.

## 완료 조건

### 구현 범위
- 마이그레이션 219 파일이 되돌림 SQL을 포함하고 `deploy-gate`를 통과한다.

### 후속 범위 (담당: 카리나, 시점: 사용자 승인 뒤)
- 219 실행, 검증 쿼리 ①②의 결과 확인, 어드민 화면의 권한 부여 경로가 서비스 롤로 계속 동작함을 확인.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 
