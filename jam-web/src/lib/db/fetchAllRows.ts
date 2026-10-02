/**
 * 페이징 조회 도우미 — `notifications/batch/shared.ts`에서 옮겨 왔다 (티켓 20261002_2306, 상위 20260930_1500 ⑧-b).
 *
 * 순수 모듈이다. `node:`·Supabase·서버 모듈을 값으로 가져오지 않는다. 예약 등록 핸들러(`opsInbox/execute/dropSchedule.ts`)가 드랍 서버 함수를
 * 거쳐 이 함수를 끌어오는데, 서버 전용 모듈(`createServiceClient`)을 값으로 가져오는 `shared.ts`를 거치면 핸들러 폴더의 순수 모듈 계약이 깨져서 따로 뺐다.
 * `shared.ts`는 같은 이름을 다시 내보내므로 기존 호출부(`ambient-drop/index.ts`·`drop-engine/index.ts` 등)는 고치지 않는다. 동작과 오류 문장(`[notifications-batch]` 접두)은 그대로다.
 *
 * ## 이 파일이 강제하는 것
 *
 * **페이징 조회에는 항상 안정 정렬이 붙는다.** `fetchAllRows`가 쿼리 빌더를 직접 받아 `.order()`를 자기가 붙이므로 호출부가 잊을 수 없다.
 * `ORDER BY` 없는 `LIMIT/OFFSET` 페이징은 페이지 간 행 중복·누락을 만들고, 에러가 나지 않아 무증상이다.
 */

/** PostgREST 기본 상한 — 한 번에 받아올 수 있는 최대 행 수 */
export const PAGE_SIZE = 1000

/**
 * `.in()` 한 번에 실을 값의 최대 개수.
 *
 * PostgREST는 `.in()` 목록을 **URL 쿼리스트링**에 싣는다. Cloudflare의 URL 상한이 16KB라
 * UUID(36자 + 구분자)를 400개 넘게 실으면 한계에 근접한다. 걸리는 순간 조회가 실패하고
 * `runStep`이 잡아 **그 단계만 조용히 0건**이 된다(로그 한 줄뿐인 무증상 0건).
 * 아이템북 소속 배지는 TRIBES.md 목표치가 트라이브 10 × 90종 = 900종이라 실제로 도달한다.
 */
export const IN_CHUNK_SIZE = 200

/**
 * 페이징 조회에 필요한 최소 인터페이스.
 * Supabase의 select 빌더가 구조적으로 그대로 들어맞는다(캐스팅 불필요).
 */
export interface PagedQuery<T> {
  order(column: string, options?: { ascending?: boolean }): PagedQuery<T>
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>
}

function ordered<T>(query: PagedQuery<T>, orderBy: string | string[]): PagedQuery<T> {
  const columns = typeof orderBy === 'string' ? [orderBy] : orderBy
  let cursor = query
  for (const column of columns) cursor = cursor.order(column, { ascending: true })
  return cursor
}

/**
 * PostgREST 기본 상한(1000행)에 걸려 **조용히 잘리는 것**을 막는 페이징 조회.
 *
 * ## `orderBy`가 선택 인자가 아닌 이유
 *
 * Postgres는 `ORDER BY` 없는 쿼리의 행 순서를 **보장하지 않는다.** `LIMIT/OFFSET`만으로
 * 페이징하면 페이지마다 물리적 순서가 달라질 수 있어 **같은 행이 두 번 오거나 아예 빠진다**
 * (그리고 에러가 나지 않아 무증상이다). 그래서 이 헬퍼는 쿼리 빌더를 직접 받아
 * **정렬을 자기가 붙인다** — 호출부가 잊을 수 없는 구조로 만든 것이다.
 *
 * `orderBy`에는 **유니크한 컬럼(대개 PK)**을 준다. 중복 값이 있는 컬럼으로 정렬하면
 * 동순위 안에서 순서가 다시 흔들려 같은 문제가 남는다. 복합 PK는 배열로 전부 넘긴다.
 *
 * @param query 페이지마다 **새로 만드는** 빌더. 빌더는 재사용하면 `.order()`가 누적되고
 *              `.range()`가 덮어써지므로 반드시 팩토리로 받는다.
 */
export async function fetchAllRows<T>(
  label: string,
  orderBy: string | string[],
  query: () => PagedQuery<T>,
  pageSize = PAGE_SIZE
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await ordered(query(), orderBy).range(from, from + pageSize - 1)
    if (error) {
      // 부분 결과로 소식을 만들면 "일부 유저만 빠진" 상태가 되므로 던져서 단계를 통째로 중단한다.
      // 단계 격리(runStep)가 나머지 10종을 살린다.
      throw new Error(`[notifications-batch] ${label} 조회 실패: ${error.message}`)
    }
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

/**
 * `.in()` 목록이 큰 조회 — 값을 `IN_CHUNK_SIZE`씩 쪼개 조회하고 결과를 합친다.
 *
 * 값은 **중복을 제거한 뒤** 쪼갠다. 같은 값이 서로 다른 청크에 들어가면 같은 행이 두 번
 * 담긴다(청크 분할이 새로 만드는 유일한 사고 경로라 여기서 막는다).
 */
export async function fetchAllRowsIn<T, V>(
  label: string,
  orderBy: string | string[],
  values: readonly V[],
  query: (chunk: V[]) => PagedQuery<T>,
  chunkSize = IN_CHUNK_SIZE
): Promise<T[]> {
  const unique = [...new Set(values)]
  if (unique.length === 0) return []

  const all: T[] = []
  for (let i = 0; i < unique.length; i += chunkSize) {
    const slice = unique.slice(i, i + chunkSize)
    all.push(
      ...(await fetchAllRows<T>(`${label}[${i}~${i + slice.length - 1}]`, orderBy, () => query(slice)))
    )
  }
  return all
}
