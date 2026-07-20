# JAM! Phase 10 데이터 모델 — 유저 검색

> 작성일: 2026-07-21

---

## 1. 결론: 스키마 변경 없음

유저 검색은 기존 `users` 테이블만 사용한다. 신규 테이블·컬럼 불필요.

### 사용 컬럼

| 컬럼 | 용도 |
|------|------|
| `id` | 결과 식별 (key) |
| `username` | 검색 대상 + 결과 표시 + 프로필 링크 (`/{username}`) |
| `email` | 검색 대상 (결과에 노출하지 않음) |
| `avatar_url` | 결과 카드 아바타 |
| `region` | 결과 카드 부가 정보 |
| `activity_types` | 결과 카드 부가 정보 |

---

## 2. 쿼리 설계

```sql
-- 개념 쿼리 (실제로는 Supabase JS client의 .or() + .ilike() 사용)
SELECT id, username, avatar_url, region, activity_types
FROM users
WHERE username IS NOT NULL
  AND (username ILIKE '%{q}%' OR email ILIKE '%{q}%')
ORDER BY (lower(username) = lower('{q}')) DESC, username ASC
LIMIT 30;
```

- `username IS NOT NULL` — 프로필 URL이 없는 유저 제외
- 검색어의 `%`, `_` 는 서버에서 제거/이스케이프 후 바인딩
- 이메일 검색은 서비스 클라이언트(service role)로 수행 — RLS로 email 컬럼이 타 유저에게 막혀 있어도 검색 가능하되, **응답에는 email을 포함하지 않는다**

---

## 3. 인덱스 (선택)

현재 유저 규모(초기 서비스)에서는 seq scan으로 충분. 유저가 수만 명 이상으로 늘면 아래 추가:

```sql
-- 부분 일치(ilike '%q%') 가속용 trigram 인덱스
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_username_trgm ON users USING gin (username gin_trgm_ops);
CREATE INDEX idx_users_email_trgm ON users USING gin (email gin_trgm_ops);
```

→ Phase 10에서는 **마이그레이션 생성하지 않음**. [NEEDS CLARIFICATION: 유저 수 증가 시점에 재검토]

---

## 4. API 응답 형태

```typescript
// GET /api/users/search?q=...
interface UserSearchResult {
  id: string
  username: string          // NOT NULL 보장 (필터 조건)
  avatar_url: string | null
  region: string | null
  activity_types: string[] | null
}
// 응답: { results: UserSearchResult[] }
// email은 절대 포함하지 않음
```
