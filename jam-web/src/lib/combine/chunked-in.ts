/**
 * `.in('id', ids)`에 ID가 수백 개 실리면 요청 주소가 HTTP 헤더 한도(약 16KB)를 넘어
 * `fetch failed … HTTP headers exceeded server limits`로 실패한다(티켓 20261104_2316).
 * 믹스 화면은 레시피가 늘수록 보상·후보 배지 ID가 늘어 이 한도에 걸리므로, ID를 묶음으로
 * 나눠 조회한 뒤 합친다. UUID 한 개가 주소에서 약 40바이트라 100개면 4KB 안쪽이다.
 */
export const COMBINE_IN_CHUNK_SIZE = 100

export function chunkList<T>(items: T[], size: number = COMBINE_IN_CHUNK_SIZE): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

type ChunkResult<Row, Err> = { data: Row[] | null; error: Err | null }

/**
 * ID 목록을 묶음으로 나눠 `run`을 병렬로 실행하고 결과 행을 이어 붙인다.
 * 일부 묶음만 실패하면 성공한 묶음의 행은 그대로 돌려주고, 첫 오류를 `error`로 함께 돌려준다 —
 * 호출부가 기존처럼 오류를 로그로 남기면서 화면은 가능한 만큼 그린다.
 */
export async function selectInChunks<Row, Err = { message: string }>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<ChunkResult<Row, Err>>,
  size: number = COMBINE_IN_CHUNK_SIZE,
): Promise<{ data: Row[]; error: Err | null }> {
  if (ids.length === 0) return { data: [], error: null }
  const results = await Promise.all(chunkList(ids, size).map((chunk) => run(chunk)))
  const data: Row[] = []
  let error: Err | null = null
  for (const result of results) {
    if (result.error && error === null) error = result.error
    if (result.data) data.push(...result.data)
  }
  return { data, error }
}
