/**
 * 폼 저장 라우트(배지·미션·컬렉션·홈피드)가 이미지 컬럼을 바꿀 때 제작 경로(`image_source`)를
 * 함께 되돌리는 판정 — 티켓 20260925_1940 방침 A.
 *
 * `image_source`는 에셋 제너레이터 적용 탭·등록 스크립트가 기록한다. 운영자가 폼에서 이미지를
 * 다른 것으로 바꾸면 기록된 경로가 실제 이미지와 어긋나므로 NULL(미상)로 되돌린다.
 * 폼은 저장할 때마다 전체 필드를 보내므로 «값이 실제로 바뀐 경우»만 되돌린다.
 *
 * 기존 값과 다음 값을 받아 update 페이로드에 펼쳐 넣을 조각을 돌려준다:
 * - 다음 값이 `undefined`(본문에 이미지 컬럼 없음) → 미변경, `{}`
 * - `null`·빈 문자열·공백뿐인 문자열은 모두 «값 없음»으로 정규화해 비교한다
 * - 정규화한 값이 다르면 `{ image_source: null }`
 */
function normalize(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function imageSourceReset(
  existing: string | null | undefined,
  next: string | null | undefined
): { image_source?: null } {
  if (next === undefined) return {}
  return normalize(existing) === normalize(next) ? {} : { image_source: null }
}
