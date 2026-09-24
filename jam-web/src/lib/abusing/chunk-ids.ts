/**
 * 제재·POI 차단 일괄 쓰기의 묶음 크기(티켓 20260924_0952, 상위 티켓 §2). `.in('id', ...)` 목록이
 * URL 16KB 상한에 걸리지 않도록 200건씩 나눈다 — `lib/admin/bulk/server.ts`와 같은 기준이다.
 * 그 파일은 `next/server`·인증을 끌고 와서 엔진 경로가 쓰는 이 폴더에서 가져올 수 없어 따로 둔다.
 */
export const SANCTION_WRITE_CHUNK_SIZE = 200

export function chunkIds(ids: string[], size: number = SANCTION_WRITE_CHUNK_SIZE): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size))
  return chunks
}
