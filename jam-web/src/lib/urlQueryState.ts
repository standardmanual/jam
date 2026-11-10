/**
 * 화면 안 선택 상태(탭·필터·정렬·페이지)를 쿼리 URL에 싣고 읽는 순수 함수 모음 (티켓 20261110_1217).
 *
 * 규칙은 세 가지다.
 * - 읽기: 허용한 값만 통과시키고, 모르는 값·빈 값·중복 키(`?tab=a&tab=b`)는 기본값으로 본다.
 *   중복 키를 기본값으로 떨어뜨리는 이유는 `searchParams.ts` 상단 설명과 같다.
 * - 쓰기: 기본값은 쿼리에서 뺀다(`null`). 기본 선택의 주소는 지금과 같게 깨끗하게 남는다.
 * - 합치기: 이미 있는 다른 쿼리(`?u=`, `?from=` 등)와 해시는 그대로 보존하고 요청한 키만 바꾼다.
 */

/** `useSearchParams()`(ReadonlyURLSearchParams)와 `URLSearchParams` 둘 다 받는 최소 모양 */
export interface QuerySource {
  get(name: string): string | null
  getAll(name: string): string[]
  toString(): string
}

/** 키가 정확히 한 번 나온 값만 돌려준다. 없거나 중복이면 null. */
export function readSingleParam(params: QuerySource, key: string): string | null {
  const values = params.getAll(key)
  return values.length === 1 ? values[0] : null
}

/** 허용 목록에 있는 값이면 그 값, 아니면 기본값. */
export function readEnumParam<T extends string>(
  params: QuerySource,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = readSingleParam(params, key)
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback
}

/** 1 이상의 정수 문자열만 통과(`2`). `0`·`-1`·`1.5`·`abc`·`007`은 기본값 1. */
export function readPageParam(params: QuerySource, key: string): number {
  const raw = readSingleParam(params, key)
  if (raw === null || !/^[1-9]\d{0,8}$/.test(raw)) return 1
  return Number(raw)
}

/**
 * 현재 쿼리에 `updates`를 덮어 쓴 주소를 만든다. 값이 `null`이면 그 키를 지운다.
 * 키 순서와 나머지 쿼리는 유지하고, `hash`(예: `#followers`)는 그대로 뒤에 붙인다.
 */
export function buildQueryHref(
  pathname: string,
  current: QuerySource,
  updates: Record<string, string | null>,
  hash = '',
): string {
  const next = new URLSearchParams(current.toString())
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) next.delete(key)
    else next.set(key, value)
  }
  const qs = next.toString()
  return `${pathname}${qs ? `?${qs}` : ''}${hash}`
}
