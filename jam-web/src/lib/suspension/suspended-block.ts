/**
 * 이용 정지 403 판별 — 클라이언트에서 쓰는 순수 함수 (티켓 20261018_0054 1회)
 *
 * 정지 중 막힌 API는 403 + `code: 'user_suspended'`를 내려준다(`suspension-contract.ts`). 동기화 흐름(`strava/sync-flow.ts`)과
 * 캡슐 채우기·열기(`capsule/capsule-client.ts`)가 같은 판별을 쓰도록 한 곳에 둔다. 호출부는 이 판별이 참이면 일반 실패가 아니라
 * 정지 안내(info)를 낸다.
 *
 * 클라이언트·서버 경계: 순수 모듈이다. `suspension-contract`(상수)만 가져온다.
 */
import { USER_SUSPENDED_CODE } from './suspension-contract'

/** 상태 코드와 본문(이미 읽은 JSON)이 정지 403인가 */
export function isSuspendedBody(status: number, body: unknown): boolean {
  if (status !== 403) return false
  return (body as { code?: unknown } | null)?.code === USER_SUSPENDED_CODE
}

/** 403 + `code: 'user_suspended'`인가. 403의 본문만 읽는다(본문을 이미 읽었다면 `isSuspendedBody`를 쓴다). */
export async function isSuspendedBlock(res: Response): Promise<boolean> {
  if (res.status !== 403) return false
  const body = (await res.json().catch(() => null)) as unknown
  return isSuspendedBody(res.status, body)
}
