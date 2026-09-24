/**
 * 어드민 목록 공용 정확 집계(티켓 20260924_0941) — 트라이브별 배지 수처럼 "부모 id마다 자식
 * 행이 몇 개인가"를 셀 때, 자식 테이블을 통째로 불러와 client에서 세는 기존 방식은
 * PostgREST 기본 상한(1,000행)에 걸리면 조용히 잘린다(상위 티켓 §범위 밖 발견물 —
 * `tribes/page.tsx:10` 등). `countRowsByKey`는 두 상한을 모두 넘겨서 정확히 센다:
 *
 * - `.in()` 목록은 200개씩 나눠 싣는다(URL 16KB 상한, `notifications/batch/shared.ts`의
 *   `IN_CHUNK_SIZE`와 동일한 근거).
 * - 각 묶음은 1,000행 상한에 걸리지 않도록 `.range()`로 끝까지 읽는다.
 *
 * 페이징 안정성을 위해 `keyColumn` 하나만으로 정렬하지 않는다 — 값이 중복되는 컬럼으로만
 * 정렬하면 동순위 안에서 순서가 흔들려 페이지 경계에서 행이 새거나 겹칠 수 있다
 * (`notifications/batch/shared.ts`가 이미 겪은 문제와 같다). 그래서 각 행의 고유 식별자
 * (`id`)를 함께 select해 `[keyColumn, id]` 복합 정렬로 안정적인 페이징을 보장한다.
 */

export interface CountRowsResult {
  data: Record<string, unknown>[] | null
  error: { message: string } | null
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스 */
export interface CountRowsQuery {
  eq(column: string, value: unknown): CountRowsQuery
  in(column: string, values: string[]): CountRowsQuery
  order(column: string, options?: { ascending?: boolean }): CountRowsQuery
  range(from: number, to: number): PromiseLike<CountRowsResult>
}

export interface CountRowsClient {
  from(table: string): { select(columns: string): CountRowsQuery }
}

/** `.in()` 한 번에 싣는 id 개수(URL 16KB 상한 여유 기준) */
const ID_CHUNK_SIZE = 200
/** 한 페이지에서 읽는 행 수(PostgREST 기본 상한) */
const PAGE_SIZE = 1000

/**
 * `ids`(부모 id 집합) 각각에 대해 `table.keyColumn`이 그 값인 행이 몇 개인지 정확히 센다.
 * 요청한 `ids` 전부가 결과 키로 존재한다 — 자식 행이 하나도 없는 id는 0으로 채운다.
 *
 * @param extraFilter 추가 조건(예: `deleted_at IS NULL`)이 필요하면 `.eq()`를 체이닝해
 *   돌려준다. `.in(keyColumn, ...)`·`.order()`·`.range()`는 이 함수가 직접 건다.
 */
export async function countRowsByKey(
  client: CountRowsClient,
  table: string,
  keyColumn: string,
  ids: string[],
  extraFilter?: (query: CountRowsQuery) => CountRowsQuery
): Promise<Record<string, number>> {
  const uniqueIds = [...new Set(ids)]
  const counts: Record<string, number> = {}
  for (const id of uniqueIds) counts[id] = 0
  if (uniqueIds.length === 0) return counts

  for (let i = 0; i < uniqueIds.length; i += ID_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + ID_CHUNK_SIZE)

    let from = 0
    for (;;) {
      let query = client.from(table).select(`${keyColumn}, id`)
      if (extraFilter) query = extraFilter(query)
      query = query.in(keyColumn, chunk).order(keyColumn).order('id')

      const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
      if (error) {
        throw new Error(`[countRowsByKey] ${table}.${keyColumn} 조회 실패: ${error.message}`)
      }

      const rows = data ?? []
      for (const row of rows) {
        const key = String(row[keyColumn])
        counts[key] = (counts[key] ?? 0) + 1
      }
      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  return counts
}
