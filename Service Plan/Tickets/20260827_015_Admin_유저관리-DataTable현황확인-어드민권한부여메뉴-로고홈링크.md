---
id: 20260827_015
category: Admin
status: CLOSED
created: 2026-08-27
closed: 2026-08-27
---

# [Admin] 유저 관리 DataTable 현황 확인 · 어드민 권한 부여 메뉴 · 로고 홈 링크

## 배경 / 문제 정의
사용자가 어드민 화면 개선 3건을 요청:
1. 유저 조회 화면도 데이터 테이블(DataTable)로 재구성
2. 특정 유저에게 어드민 권한을 부여할 수 있는 메뉴 추가
3. JAM 로고를 누르면 홈으로 이동하는 링크 적용

사전 조사 결과:
- **1번은 이미 완료됨.** 티켓 `20260826_015`(DataTable 나머지 9개 화면 롤아웃)에서
  `jam-web/src/app/admin/users/UsersTable.tsx`가 공용 DataTable(`@tanstack/react-table` v9)로
  이미 전환되어 있다. 정렬·컬럼 표시 토글은 있으나, 유저 대량 조치가 정책상 민감하다는 이유로
  행 선택 체크박스·필터 Toolbar·일괄 액션은 의도적으로 생략된 상태(주석 확인).
  → 이번 티켓에서는 **추가 구현 없이 현황을 재확인하고 완료 기록만 남긴다.**
- 2번은 현재 어드민 접근 제어가 DB role 컬럼이 아니라 `ADMIN_EMAILS` 환경변수 화이트리스트
  방식이라(`jam-web/src/proxy.ts`, `jam-web/src/app/admin/layout.tsx`,
  `jam-web/src/lib/admin/auth.ts` 3곳에서 중복 체크) 신규 구현이 필요.
  사용자 확인 결과 **DB 컬럼 추가 + 환경변수 병행(OR)** 방식으로 결정:
  `users.is_admin` 컬럼을 추가하고, 위 3곳의 판정 로직을
  `ADMIN_EMAILS 화이트리스트 OR is_admin=true` 로 변경한다. 기존 화이트리스트 계정은
  그대로 유지(마이그레이션 불필요, OR 조건이라 자동으로 접근 유지됨).
- 3번은 `jam-web/src/components/admin/AdminSidebar.tsx`의 로고가 `<div>`로만 되어 있고
  `Link`가 없어 홈(`/admin` 대시보드)으로 이동하는 링크를 추가.

## 상세 요구사항

### 서비스/코드베이스 관점
- **1. 유저 DataTable**: 추가 구현 없음. `UsersTable.tsx` 현재 상태(정렬·컬럼 토글만, 행 선택/일괄
  액션 없음)가 의도된 설계임을 완료 기록에 명시.
- **2. 어드민 권한 부여 메뉴**:
  - DB 마이그레이션: `users` 테이블에 `is_admin boolean NOT NULL DEFAULT false` 컬럼 추가.
    (jam-developer는 `jam-web/supabase/migrations/0XX_users_is_admin.sql` 파일만 작성,
    **직접 실행하지 않는다** — 실행은 사용자 승인 후 오케스트레이터가 4단계에서 처리)
  - 인증 로직 3곳 수정 — 화이트리스트 OR `is_admin` 컬럼 조회:
    - `jam-web/src/proxy.ts` (미들웨어 역할, `/admin` 경로 게이트)
    - `jam-web/src/app/admin/layout.tsx` (서버 컴포넌트 defense-in-depth 체크)
    - `jam-web/src/lib/admin/auth.ts` (`getAdminUser()`/`requireAdmin()` API 라우트 헬퍼)
  - 어드민 UI: 유저 상세 화면(`jam-web/src/app/admin/users/[id]/`) 또는 유저 목록 화면에
    "어드민 권한 부여/해제" 토글 UI + 서버 액션(API 라우트) 추가.
    - shadcn/ui `Switch` 또는 `Checkbox` 컴포넌트 사용 (feedback_admin_ui_shadcn 메모 준수)
    - 권한 변경은 되돌릴 수 있는 액션이지만 민감하므로, 실행 전 확인 다이얼로그(AlertDialog) 권장
    - 본인 스스로의 어드민 권한을 해제하는 경우에 대한 처리 고려(허용/차단 여부는 개발자 판단,
      단순화 우선 — 과도한 방어 로직 지양)
- **3. 로고 홈 링크**: `AdminSidebar.tsx`의 로고 `<div>`를 `next/link`의 `Link href="/admin"`으로
  감싸거나 교체. 기존 스타일(className) 유지.

### UI/UX 관점 (해당 시)
- 권한 부여 토글은 실수로 클릭해 어드민 권한이 부여/해제되지 않도록 확인 단계를 둘 것.
- 로고에 hover 시 클릭 가능함을 시각적으로 암시(cursor-pointer 등, 기존 사이드바 메뉴 항목과
  일관된 hover 스타일).

## 구현 계획
1. SQL 마이그레이션 파일 작성 (`users.is_admin` 컬럼, 실행은 4단계에서 오케스트레이터가 처리)
2. `lib/admin/auth.ts`에 `is_admin` 조회 로직 추가 → 화이트리스트 OR 컬럼 판정 헬퍼로 통합
3. `proxy.ts`, `admin/layout.tsx`에서 동일 헬퍼(또는 동등 로직) 사용하도록 수정
4. 유저 목록/상세 화면에 권한 부여 토글 UI + API 라우트(`PATCH /api/admin/users/[id]/admin-role`
   형태) 추가
5. `AdminSidebar.tsx` 로고에 `/admin` 홈 링크 적용
6. 유저 DataTable 현황은 코드 확인만 하고 완료 기록에 기술

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

**1. 유저 DataTable 현황 확인 — 추가 구현 없음**
`jam-web/src/app/admin/users/UsersTable.tsx` 코드 확인 결과, 티켓 `20260826_015`에서 이미
공용 `@tanstack/react-table` 기반 `DataTable`로 전환되어 있음을 재확인했다. 정렬(`SortingState`)과
컬럼 표시 토글(`DataTableViewOptions`)만 제공하고, 행 선택 체크박스·필터 Toolbar·일괄 액션은
파일 상단 주석(31~35행)에 "유저 계정 일괄 삭제/정지는 정책상 민감해 이번 티켓 범위 밖" 이라고
명시된 의도된 설계다. 이 티켓에서는 코드를 수정하지 않았다.

**2. 어드민 권한 부여 메뉴 (DB 컬럼 + 화이트리스트 OR 조건)**
- `jam-web/supabase/migrations/106_users_is_admin.sql`: `users.is_admin boolean NOT NULL
  DEFAULT false` 컬럼 추가 SQL 작성 (직접 실행하지 않음 — 오케스트레이터가 사용자 승인 후 실행).
- `jam-web/src/lib/admin/auth.ts`에 `hasAdminAccess(userId, email)` 공용 헬퍼 신설:
  `ADMIN_EMAILS` 화이트리스트에 있으면 DB 조회 없이 즉시 허용(단락 평가로 기존 성능 유지),
  없으면 `createServiceClient()`로 `users.is_admin` 컬럼을 조회해 OR 판정. `getAdminUser()`가
  이 헬퍼를 사용하도록 리팩터링.
- `jam-web/src/proxy.ts`·`jam-web/src/app/admin/layout.tsx`의 어드민 게이트 로직을 각각
  화이트리스트 인라인 체크에서 `hasAdminAccess()` 호출로 교체 — 판정 로직이 3곳에서
  1곳(`lib/admin/auth.ts`)으로 통합됨.
- `PATCH /api/admin/users/[id]/admin-role` API 라우트 신설: `requireAdmin` 동등 검사
  (`getAdminUser`) 후 대상 유저의 `is_admin` 컬럼을 토글.
- `jam-web/src/app/admin/users/[id]/AdminRoleToggle.tsx` 신규 클라이언트 컴포넌트: shadcn
  `Switch` + `AlertDialog`(확인 다이얼로그, `[data-admin-theme]` 포털 스코프 패턴 적용)로
  유저 상세 화면에 권한 부여/해제 토글 UI 추가. 화이트리스트 계정에는 "이미 화이트리스트로
  어드민 권한이 있다"는 안내를 별도 표시(토글 자체는 막지 않음 — 단순화 우선).
  본인 스스로의 어드민 권한 해제도 별도 차단 로직 없이 허용(티켓 명시 방침).
- `jam-web/src/types/database.ts`(손으로 쓴 도메인 타입)와
  `jam-web/src/types/database.generated.ts`(Supabase 자동 생성 타입, 마이그레이션 미실행
  상태라 수동으로 미리 동기화)에 `is_admin: boolean` 필드 추가.

**3. 로고 홈 링크**
`jam-web/src/components/admin/AdminSidebar.tsx`의 `SidebarHeader` 내부 `<div>`를 `<Link
href="/admin">`으로 교체. 기존 className(레이아웃·collapse 대응)은 그대로 유지하고
`hover:bg-sidebar-accent transition-colors`만 추가해 클릭 가능함을 시각적으로 암시.

### 변경된 파일
```
jam-web/supabase/migrations/106_users_is_admin.sql (신규, jam-prod에 실행 완료)
jam-web/src/lib/admin/auth.ts
jam-web/src/proxy.ts
jam-web/src/app/admin/layout.tsx
jam-web/src/app/api/admin/users/[id]/admin-role/route.ts (신규)
jam-web/src/app/admin/users/[id]/AdminRoleToggle.tsx (신규)
jam-web/src/app/admin/users/[id]/page.tsx
jam-web/src/components/admin/AdminSidebar.tsx
jam-web/src/types/database.ts
jam-web/src/types/database.generated.ts
```

### 테스트 결과
- [x] `npx tsc --noEmit` 통과 (신규/변경 파일 전체)
- [x] `npx eslint` 통과 (신규/변경 파일 전체, 경고/에러 없음)
- [x] `106_users_is_admin.sql`을 jam-prod(`ceehnkzdbecxwzxrhhns`)에 오케스트레이터가 직접 실행
      (staging·프로덕션 공용 DB이므로 즉시 반영됨)
- [x] `is_admin` 컬럼 반영 후 Supabase MCP `generate_typescript_types`로 타입 재생성 —
      개발자가 미리 맞춰둔 `is_admin: boolean` 타입이 실제 생성 결과와 정확히 일치함을 확인
      (다른 필드 순서·타 티켓의 enum 값만 갱신됨, `is_admin` 자체는 diff 없음)
- [x] `admin-role/route.ts`의 `@ts-expect-error`가 타입 재생성 후에도 필요함을 재확인
      (Supabase 라이브러리 공통 제약 — `drops.ts` 등 다른 라우트와 동일 패턴, 사유 주석만 갱신)
- [x] staging 배포 확인: `vercel inspect`로 최신 staging 빌드(`jam-git-staging-*` alias)가
      Ready 상태임을 확인
- [ ] 어드민 화면 실기기(브라우저) 검증 — 어드민은 로그인 세션이 필요해 스테이징에서 자동
      검증 불가(기존 관례). 프로덕션 승격(`/jam-ship`) 후 실제 로그인해 권한 토글·로고 링크
      동작을 눈으로 확인 필요

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

`AdminRoleToggle.tsx`의 안내 문구·확인 다이얼로그 텍스트는 일반 유저(플레이어) 대상이 아니라
어드민(운영자) 내부 화면 전용이라 가이드라인의 배지/거래 톤 규정 적용 대상이 아니다. 같은
폴더의 `ResetUserButton.tsx` 확인 모달과 어조·구조(해요체, 굵게 강조, 되돌릴 수 없는 작업
경고)를 맞췄다.
- [x] 문장 규칙: 해요체, 간결함, 마침표 위치 정확 확인
- [x] 용어 일관성: 기존 어드민 화면 용어("어드민 권한", "부여/해제")와 동일하게 사용
- [ ] 톤앤매너 / 에러 메시지 3단계 구조 / 표기 규칙: 어드민 내부 도구 텍스트라 해당 없음

### 배포 정보
- 배포일: 2026-08-27
- 환경: staging (Supabase는 staging·프로덕션 공용 단일 DB라 `is_admin` 컬럼은 이미 프로덕션에도
  반영됨. 코드는 staging에만 배포됨 — main 승격은 별도 사용자 승인 필요)
- 커밋: `8b687db2`(구현), `f6f97e12`(타입 재생성), staging 병합 `c0b3498f`

### 주요 의사결정 / 핵심 메모
> 어드민 권한 판정 방식: DB 컬럼(`is_admin`) 추가 + 기존 `ADMIN_EMAILS` 환경변수 화이트리스트
> 병행(OR 조건). 사용자 확인 하에 결정 — 기존 화이트리스트 계정 마이그레이션 불필요.
>
> `npm run db:types`는 로컬에 `supabase` CLI가 설치돼 있지 않아 실패(빈 파일로 덮어씀 —
> 즉시 git checkout으로 복구). 대신 Supabase MCP `generate_typescript_types`로 받은 JSON의
> `types` 필드를 파일에 직접 기록해 우회함. 이후 유사 작업에서는 CLI 설치 여부를 먼저
> 확인하거나 이 MCP 방식을 기본으로 쓸 것.

### 잔여 이슈
- 어드민 권한 토글·로고 링크의 브라우저 실기기 검증은 프로덕션 승격 후 수행 필요(어드민은
  스테이징에서 로그인 세션 기반 검증이 불가능한 기존 제약).
- 로컬 개발 환경에 `supabase` CLI 미설치 — `npm run db:types`를 정상적으로 쓰려면 별도 설치 필요
  (이번 티켓 범위 밖, 발견 사항으로만 기록).
