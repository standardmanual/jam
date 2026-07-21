# JAM! 서비스 운영 문서 — 변경분 (2026-07-21 09:18)

> **이 버전의 변경 내용:** Phase 10 유저 검색 기능 추가 — 검색 API(`/api/users/search`) 신설 + `/search` 결과 페이지 + 홈 검색바  
> 이전 버전: SERVICE_OPERATIONS_20260720_1300.md

---

## [신규] 유저 검색 (Phase 10)

### 개요

로그인 유저가 다른 유저를 아이디(username) 또는 이메일로 검색하고, 결과에서 클릭하여 기존 프로필 페이지(`/[username]`)로 이동할 수 있다. 스키마 변경 없음 (기존 `users` 테이블만 사용).

### 신규 파일

| 파일 | 역할 |
|------|------|
| `jam-web/src/app/api/users/search/route.ts` | 검색 API (GET) |
| `jam-web/src/app/(main)/search/page.tsx` | 검색 결과 페이지 (서버 컴포넌트) |
| `jam-web/src/app/(main)/UserSearchBar.tsx` | 검색 폼 (클라이언트 컴포넌트) |
| `jam-web/src/app/api/users/search/__tests__/search-logic.test.ts` | 전처리·정렬 스펙 테스트 |

수정: `jam-web/src/app/(main)/page.tsx` — 스트라바 동기화 카드 아래 `<UserSearchBar />` 삽입 (4줄).

### 검색 로직 (API·페이지 공통)

1. **인증**: `createClient().auth.getUser()` — 미로그인 시 API는 401, 페이지는 `/login` 리다이렉트
2. **전처리**: trim → 2자 미만이면 빈 결과 → `%`, `_`(ilike 와일드카드) 및 `,`, `(`, `)`(PostgREST or-필터 구분자) 제거 → 제거 후 2자 미만이면 빈 결과
3. **조회**: `createServiceClient()`(service role, email 검색 위해 RLS 우회)로
   `username IS NOT NULL` AND (`username ilike '%q%'` OR `email ilike '%q%'`), LIMIT 30
4. **정렬**: 정확 일치(lower 비교) 우선 → username 오름차순 (JS 후처리)
5. **응답 화이트리스트**: `{ id, username, avatar_url, region, activity_types }` — **email은 select 단계부터 제외, 응답·화면 어디에도 노출하지 않음**

### 운영 유의사항

- username이 NULL인 유저(온보딩 미완료)는 검색 결과에 노출되지 않는다 — 프로필 URL이 없기 때문.
- 검색은 부분 일치(ilike)이며 현재 인덱스 없음. 유저 수만 명 도달 시 pg_trgm 인덱스 검토 (Phase10_02_DATA_MODEL.md 참고).
- 결과 페이지는 API를 경유하지 않고 서버 컴포넌트에서 동일 로직을 직접 실행한다. 로직 변경 시 **route.ts와 page.tsx 두 곳을 함께** 수정하고, `__tests__/search-logic.test.ts` 스펙도 갱신할 것.

---

기타 섹션은 이전 버전(SERVICE_OPERATIONS_20260720_1300.md)과 동일.
