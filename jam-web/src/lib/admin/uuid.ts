/**
 * UUID 형식 판정 — 어드민 라우트가 id·후보 ID 목록을 DB 조회(`.eq('id', …)`·`.in('id', …)`)에
 * 넘기기 전에 거르는 데 쓴다(티켓 20260926_1509). 형식이 틀린 값이 그대로 가면 Postgres가
 * `invalid input syntax for type uuid` 오류를 내고 그 원문이 응답에 실릴 수 있다.
 * 정규식은 이 파일 한 곳에만 둔다(`export-ids.ts`도 이 함수를 쓴다).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
