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
function normalize(value: unknown): string | null {
  // 문자열이 아닌 값(숫자·객체 등)은 `.trim()`이 던지지 않도록 «값 없음»으로 본다. 그런 값은
  // 저장 라우트가 `imageUrlTypeError`로 먼저 400 처리하므로 여기까지 오지 않는 것이 정상이다.
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * 본문의 이미지 컬럼 값이 문자열·null·undefined 중 하나인지 검사한다(티켓 20260926_0203).
 * 숫자·객체·배열·불리언이면 저장 라우트가 400으로 거절할 문구를, 아니면 null을 돌려준다.
 * 거절(무시가 아니라)을 택한 이유: 무시하면 update 페이로드에 그 값이 그대로 실려 DB 오류 원문이
 * 500으로 나가거나 값이 조용히 문자열로 바뀌어 저장된다.
 */
export function imageUrlTypeError(value: unknown): string | null {
  if (value === undefined || value === null || typeof value === 'string') return null
  return '이미지 주소는 문자열이어야 합니다.'
}

export function imageSourceReset(
  existing: string | null | undefined,
  next: string | null | undefined
): { image_source?: null } {
  if (next === undefined) return {}
  return normalize(existing) === normalize(next) ? {} : { image_source: null }
}
