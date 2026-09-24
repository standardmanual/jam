/**
 * 어드민 검색 API 공용 정제(티켓 20260924_0941) — PostgREST 필터 문법(쉼표·괄호)과 LIKE
 * 와일드카드를 깨는 문자를 공백으로 바꾸고 100자로 자른다.
 *
 * `api/admin/users/search`·`api/admin/itembooks/search`가 각자 인라인으로 두던
 * `raw.replace(/[,()%_*\\]/g, ' ')` 정제를 이 함수로 합친다 — 두 라우트가 정확히 같은
 * 정규식을 복사해 쓰고 있었다.
 */
const UNSAFE_SEARCH_CHARS_RE = /[,()%_*\\]/g

/** 검색어 최대 길이 — 과도하게 긴 입력이 `ilike` 패턴에 그대로 들어가는 것을 막는다 */
export const MAX_SEARCH_TERM_LENGTH = 100

export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(UNSAFE_SEARCH_CHARS_RE, ' ').trim().slice(0, MAX_SEARCH_TERM_LENGTH)
}
