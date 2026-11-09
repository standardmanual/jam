/**
 * 유저 검색 or-필터 — 아이디(username)와 표시 이름(display_name)으로만 일치시킨다.
 *
 * 이메일(`email`)은 조건에 넣지 않는다. 넣으면 로그인한 누구나 검색어를 바꿔 가며
 * 다른 유저의 이메일 조각이 존재하는지 알아낼 수 있다(티켓 20261014_1624).
 * 호출부: api/users/search/route.ts, (main)/search/page.tsx — 둘이 같은 조건을 쓴다.
 */
export function buildUserSearchFilter(sanitized: string): string {
  const pattern = `%${sanitized}%`
  return `username.ilike.${pattern},display_name.ilike.${pattern}`
}
