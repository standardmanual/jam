/**
 * JAM! 행동 지표 계산의 공용 페이징 읽기 (서버 사이드 전용, 티켓 20261001_0633, 상위 20260930_1456 ③)
 *
 * 드랍·픽업 지표(`jamActionDropMetrics.ts`)에 비공개로 있던 `selectAllPages`를 옮겨 왔다 — 활동일 지표
 * (`jamActionDayMetrics.ts`)도 같은 방식으로 행을 읽기 때문이다. 동작은 옮기기 전과 같다.
 *
 * `.order('id').range()` 페이지를 끝까지 읽고, `MAX_PAGES` 페이지를 넘어 행이 더 있으면 **오류를 던진다**
 * (잘린 값으로 임계를 잘못 넘기지 않도록 fail-closed). 던진 오류는 `evaluateJamActionBadges`가 그 지표만
 * 건너뛰는 것으로 받는다.
 */

/** 한 페이지 행 수 — PostgREST 기본 응답 상한(1,000행)과 같다 (`itembook/checker.ts`의 페이징과 같은 선례) */
export const PAGE_SIZE = 1000
/** 이 페이지 수를 넘겨 행이 더 있으면 오류 — 한 유저의 대상 행이 이만큼 쌓이면 RPC로 옮길 때다 */
export const MAX_PAGES = 30

export type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message?: string } | null }>

/**
 * `.order('id').range()` 페이지를 끝까지 읽는다. `MAX_PAGES` 페이지를 모두 채우고도 다음 페이지에 행이
 * 더 있으면 오류를 던진다(정확히 `MAX_PAGES * PAGE_SIZE`행이면 통과한다).
 *
 * @param tag 오류 메시지 접두어에 들어갈 모듈 이름(예: `jamActionDropMetrics`) — 로그에서 어느 계산인지 알아보도록 호출부가 넘긴다
 * @param label 오류 메시지에 들어갈 조회 대상 이름(예: `내가 놓은 드랍`)
 */
export async function selectAllPages<T>(
  tag: string,
  label: string,
  pageOf: (from: number, to: number) => PageResult<T>
): Promise<T[]> {
  const rows: T[] = []
  for (let page = 0; page <= MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await pageOf(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`[${tag}] ${label} 조회 오류: ${error.message ?? '알 수 없는 오류'}`)
    const batch = data ?? []
    if (page === MAX_PAGES) {
      if (batch.length > 0) {
        throw new Error(`[${tag}] ${label}이 ${MAX_PAGES}페이지(${MAX_PAGES * PAGE_SIZE}행)를 넘었다 — RPC 전환 필요`)
      }
      break
    }
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return rows
}
