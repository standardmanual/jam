/**
 * 프로필 숫자 줄의 표기(티켓 20261108_1216 사용자 결정 2).
 * 999,999까지는 쉼표(`586`, `12,345`), 1,000,000부터 소수 한 자리 `1.0M`·`1.2M`.
 * 소수 한 자리는 버림이다 — 1,999,999는 `1.9M`(반올림하면 `2.0M`으로 부풀려진다).
 */
export function compactCount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const value = Math.max(0, Math.trunc(n))
  if (value < 1_000_000) return value.toLocaleString('ko-KR')
  const tenths = Math.floor(value / 100_000)
  return `${Math.floor(tenths / 10)}.${tenths % 10}M`
}
