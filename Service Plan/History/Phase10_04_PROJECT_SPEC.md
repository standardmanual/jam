# JAM! Phase 10 프로젝트 스펙 — 유저 검색

> 작성일: 2026-07-21

---

## 1. 기술 스택 (기존 유지)

| 영역 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | Next.js App Router (기존) | 프로젝트 표준. `/search` 서버 컴포넌트 + searchParams 패턴은 어드민 배지 필터에서 이미 검증됨 |
| DB | Supabase `users` 테이블 (기존) | 스키마 변경 없음 |
| 검색 | Postgres `ilike` 부분 일치 | 초기 규모에 충분. 전문 검색엔진 불필요 |
| 인증 | 기존 Supabase 세션 검증 패턴 | `/[username]` 페이지와 동일 |

## 2. 파일 구성

```
jam-web/src/app/api/users/search/route.ts       # 신규 — 검색 API (GET)
jam-web/src/app/(main)/search/page.tsx          # 신규 — 결과 페이지
jam-web/src/app/(main)/UserSearchBar.tsx        # 신규 — 검색 폼 (client)
jam-web/src/app/(main)/page.tsx                 # 수정 — 검색바 삽입
```

## 3. 구현 규칙

- 이메일은 검색 조건으로만 사용. **API 응답·화면 어디에도 email을 출력하지 않는다.**
- `username IS NOT NULL` 필터 필수 — NULL username 유저가 결과에 섞이면 프로필 링크가 404.
- 검색어 전처리: `q.trim()`, 2자 미만 빈 결과, `%`·`_` 제거.
- 이메일 조회는 service role 클라이언트 사용 (RLS 우회), 단 응답 필드는 화이트리스트로 제한.
- 프로필 링크는 기존 `/[username]` 라우트를 그대로 사용 — 프로필 페이지 수정 금지.
- UI 스타일은 홈 기존 카드 톤(`bg-white/5 border-white/10 rounded-2xl`, 포인트 `#AEEA00`)을 따른다.

## 4. 절대 하지 마

- `users` 테이블 스키마 변경 / 신규 마이그레이션 생성 (이번 Phase 범위 아님)
- 검색 결과에 email·id 외 민감 정보 노출
- 클라이언트에서 supabase 직접 쿼리 (반드시 API 라우트 경유)
- `/[username]/page.tsx` 수정
- 실시간 자동완성 구현 (범위 밖)

## 5. 완료 체크리스트

- [ ] API: username 검색 / 이메일 검색 / 비로그인 401 / 결과에 email 없음
- [ ] 결과 페이지: 목록·빈 상태·프로필 이동
- [ ] 홈: 검색바 노출 위치(스트라바 카드 아래)·전환 동작
- [ ] `npx tsc --noEmit` 0 에러
- [ ] SERVICE_OPERATIONS 신규 버전 문서 생성
- [ ] commit + push
