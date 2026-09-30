/**
 * 제출 본문 해시 (티켓 20260930_1816) — 같은 `bundle_id`를 다시 냈을 때 「같은 내용인가」를 가르는 값이다.
 * 키 순서를 정렬한 JSON의 SHA-256이라, 키 순서만 다른 본문은 같은 해시가 된다(배열 순서는 의미가 있어 유지한다).
 * 서버(Node) 전용이다 — `node:crypto`를 쓴다.
 */
import { createHash } from 'node:crypto'

/** 객체 키를 재귀적으로 정렬한 JSON 문자열. 배열 순서는 바꾸지 않는다. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const body = Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
      .join(',')
    return `{${body}}`
  }
  return JSON.stringify(value)
}

export function computeRawHash(raw: unknown): string {
  return createHash('sha256').update(stableStringify(raw)).digest('hex')
}
