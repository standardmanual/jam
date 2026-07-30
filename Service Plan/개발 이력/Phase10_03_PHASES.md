# JAM! Phase 10 구현 단계 — 유저 검색

> 작성일: 2026-07-21

---

## Step 1: 검색 API (핵심)

- `jam-web/src/app/api/users/search/route.ts` (GET)
- 세션 검증 → 미로그인 401
- `q` 파라미터: trim, 2자 미만이면 빈 결과 반환, `%`·`_` 제거
- 서비스 클라이언트로 `users` 조회: `username IS NOT NULL` + (`username ilike` OR `email ilike`)
- 정확 일치 우선 정렬, LIMIT 30
- 응답에 email 미포함

**완료 기준**: curl로 username/이메일 검색 각각 정상 응답, 비로그인 401

## Step 2: 검색 결과 페이지

- `jam-web/src/app/(main)/search/page.tsx` (서버 컴포넌트, `searchParams.q`)
- 로그인 검증 → 미로그인 리다이렉트
- 결과 카드: 아바타 + username + region + 활동종목 → `Link href={`/${username}`}`
- 빈 결과/q 없음 상태 처리
- 페이지 상단에 검색창 재노출 (재검색 가능)

**완료 기준**: `/search?q=...` 직접 접근으로 결과 확인, 카드 클릭 시 프로필 이동

## Step 3: 홈 검색 UI

- `jam-web/src/app/(main)/page.tsx` — 스트라바 동기화 카드 아래에 검색 컴포넌트 삽입
- 검색 폼은 클라이언트 컴포넌트 (`UserSearchBar.tsx` 신규): input + 버튼, submit 시 `router.push('/search?q=' + encodeURIComponent(q))`
- 빈 검색어 제출 무시

**완료 기준**: 홈 → 검색 → 결과 → 프로필 전체 플로우 동작

## Step 4: 검증 + 문서

- `npx tsc --noEmit` 0 에러
- 브라우저 플로우 검증 (dev server)
- `PRD/SERVICE_OPERATIONS_YYYYMMDD_HHMM.md` 신규 생성 (API 라우트 추가에 해당)
- commit + push

---

## 확장 후보 (이번 범위 아님)

| 기능 | 시점 |
|------|------|
| 실시간 자동완성 (debounce + 드롭다운) | 유저 피드백 후 |
| trigram 인덱스 마이그레이션 | 유저 수만 명 도달 시 |
| 팔로우 버튼 결과 카드 내 노출 | 소셜 기능 고도화 시 |
