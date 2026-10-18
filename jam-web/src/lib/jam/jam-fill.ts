/**
 * 잼 채우기 입력 — 캡슐과 잠긴 아이템 배지가 같이 쓰는 순수 로직 (티켓 20261018_0054 1회, 운영 로직 7.2절)
 *
 * 같은 동작이 두 곳에서 다르면 안 되므로 기본값과 입력 보정을 한 곳에 둔다. 상한 판정의 정답은 서버(`capsule_fill`·`locked_item_fill`)다.
 * 이 파일은 입력창을 서버가 거절하기 쉬운 값(0, 비숫자, 남은 양 초과)으로 두지 않게 맞출 뿐이다.
 *
 * 클라이언트·서버 경계: 아무것도 가져오지 않는 순수 모듈이다.
 */

/** 채우기 입력의 기본값. 남은 양이고, 가진 잼이 모자라면 가진 양이다. 둘 중 하나라도 0 이하면 0이다 */
export function defaultFillAmount(remaining: number, balance: number): number {
  return maxFillAmount(remaining, balance)
}

/** 한 번에 채울 수 있는 상한 — 남은 양과 가진 잼 중 작은 쪽. 음수나 숫자가 아닌 값은 0으로 본다 */
export function maxFillAmount(remaining: number, balance: number): number {
  const r = Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : 0
  const b = Number.isFinite(balance) ? Math.max(0, Math.floor(balance)) : 0
  return Math.min(r, b)
}

/**
 * 입력창 값을 보정한다. 숫자가 아닌 글자는 지우고, 앞의 0은 떼고, 상한(`max`)을 넘으면 상한으로 맞춘다.
 * 비어 있으면 빈 문자열을 그대로 돌려준다(지우는 중에 0이 끼어들지 않게).
 */
export function sanitizeFillInput(raw: string, max: number): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '')
  if (digits === '') return ''
  // 아주 긴 숫자는 Number로 바꾸면 정밀도를 잃으므로 자릿수로 먼저 거른다
  if (digits.length > String(max).length) return String(max)
  const n = Number(digits)
  return n > max ? String(max) : digits
}

/** 입력창 값을 채울 양으로 읽는다. 1 이상의 정수가 아니면 null이다 */
export function parseFillAmount(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= 1 ? n : null
}
