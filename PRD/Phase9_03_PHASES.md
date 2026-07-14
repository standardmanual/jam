# JAM! Phase 9 구현 단계 계획

> 작성일: 2026-07-14

---

## Phase 9-A: 스키마 마이그레이션 + 인증 흐름 수정 (기반 작업)

### 목표
데이터베이스 변경과 auth 콜백 수정. 이 단계 완료 후 기존 유저는 다음 로그인 시 온보딩 페이지로 이동하게 됨.

### 태스크

**9-A-1: DB 마이그레이션**
- `jam-web/supabase/migrations/020_username_onboarding.sql` 작성
- `display_name` → `username` rename + NULL 허용 + UNIQUE + CHECK 제약
- Supabase Storage `avatars` 버킷 생성 + RLS 정책
- Supabase 로컬 또는 대시보드에서 마이그레이션 실행

**9-A-2: TypeScript 타입 업데이트**
- `src/types/database.ts` — `UserRow.display_name` → `UserRow.username: string | null`
- 전체 코드베이스에서 `display_name` 참조를 `username`으로 일괄 교체

**9-A-3: `display_name` 참조 교체**
- `src/app/auth/callback/route.ts` — upsert 로직 변경 + username 체크 + 구글 avatar_url 저장
- `src/app/(main)/profile/page.tsx` — `display_name` → `username`
- 기타 `display_name` 참조 파일 전수 조사

### 완료 기준
- `tsc --noEmit` 오류 없음
- 로컬에서 신규 구글 로그인 시 `/onboarding`으로 리다이렉트됨
- 기존 유저(username 있음)는 `/`로 바로 이동

---

## Phase 9-B: 온보딩 페이지 구현

### 목표
`/onboarding` 페이지를 username 생성 UI로 완성. 현재 해당 페이지는 즉시 `/`로 리다이렉트하는 스텁.

### 태스크

**9-B-1: 아이디 중복 확인 API**
- `src/app/api/username/check/route.ts` 생성 (GET)
- 쿼리 파라미터 `?username=...` 수신
- 서버에서 포맷 유효성 + `users.username` 중복 조회
- 응답: `{ available: boolean }`
- Supabase service client 사용 (RLS 우회)

**9-B-2: 온보딩 완료 API**
- `src/app/api/onboarding/complete/route.ts` 생성 (POST)
- 인증 필요 (Supabase JWT 검증)
- username 포맷 재검증 + 저장
- 응답: `{ success: true }` or `{ error: string }`

**9-B-3: 온보딩 페이지 UI**
- `src/app/(main)/onboarding/page.tsx` 전면 재작성
- `'use client'` 컴포넌트
- 구글 프로필 이미지 표시 (현재 유저의 `avatar_url`)
- `@` 접두사 고정 + 입력 필드
- debounce 500ms 실시간 유효성 검사
- 중복 확인 API 호출 (유효한 포맷일 때만)
- 상태별 UI: 검사중(로딩) / 사용가능(초록) / 불가(빨강)
- [생성하기] 버튼: 사용 가능 상태일 때만 활성화
- 제출 시 `/api/onboarding/complete` POST → 성공 시 `router.push('/')`

### 완료 기준
- 신규 유저가 온보딩 페이지에서 username 입력 → 홈 이동
- 중복 username 입력 시 에러 메시지 표시
- 유효하지 않은 포맷 시 에러 메시지 표시
- [생성하기] 버튼이 유효 상태일 때만 클릭 가능

---

## Phase 9-C: 프로필 페이지 편집 기능

### 목표
기존 `/profile` 페이지에 username 변경 + 프로필 사진 변경 기능 추가.

### 태스크

**9-C-1: 아바타 업로드 API**
- `src/app/api/profile/avatar/route.ts` 생성 (POST)
- `multipart/form-data`로 이미지 파일 수신
- 허용 형식 검증 (JPEG, PNG, WebP)
- 크기 제한 5MB 검증
- Supabase Storage `avatars/{userId}/{timestamp}.{ext}` 업로드
- 기존 커스텀 파일(구글 URL 아닌 것) 삭제
- `users.avatar_url` 업데이트
- 응답: `{ avatar_url: string }`

**9-C-2: 프로필 편집 UI**
- `/profile/edit/page.tsx` 신규 페이지 생성 (또는 인라인 편집 모드)
- 현재 프로필 사진 + [사진 변경] 버튼 → `<input type="file" accept="image/*">`
- 사진 선택 시 미리보기 + 자동 업로드
- username 입력 필드 (현재 값 초기값)
- username 변경 시 실시간 유효성/중복 체크 (9-B의 API 재활용)
- [저장] 버튼: username 변경사항 있을 때만 활성화
- 저장 시 `PATCH /api/profile` 호출

**9-C-3: 프로필 업데이트 API**
- `src/app/api/profile/route.ts` 신규 또는 기존에 PATCH 메서드 추가
- Body: `{ username?: string }`
- username 포맷 재검증 + 중복 체크 + `users` 업데이트

### 완료 기준
- 프로필 페이지에서 사진 변경 시 즉시 반영
- username 변경 후 저장 시 프로필에 반영
- 자신의 현재 username은 "이미 사용 중" 에러 발생 안 함 (자기 자신 제외 중복 체크)

---

## 단계별 의존성

```
9-A (DB + 타입 + 인증) → 9-B (온보딩 페이지) → 9-C (프로필 편집)
```

9-A 없이는 9-B, 9-C 개발 불가. 9-B 완료 후 9-C는 독립적으로 진행 가능.

---

## 예상 파일 목록

### 신규 생성
```
jam-web/supabase/migrations/020_username_onboarding.sql
jam-web/src/app/api/username/check/route.ts
jam-web/src/app/api/onboarding/complete/route.ts
jam-web/src/app/api/profile/avatar/route.ts
jam-web/src/app/(main)/profile/edit/page.tsx  (또는 인라인)
```

### 수정
```
jam-web/src/types/database.ts
jam-web/src/app/auth/callback/route.ts
jam-web/src/app/(main)/onboarding/page.tsx
jam-web/src/app/(main)/profile/page.tsx
(display_name 참조 파일 추가 수정 가능)
```
