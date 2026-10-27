/**
 * 상황판 「대기」 칸에 합칠 개발 요청 읽기 (티켓 20261026_2028 3회차, 어드민 상황판 PRD §8). 서버에서만 쓴다.
 *
 * 아직 티켓이 되지 않은(`requested`) 요청만 읽어 `BoardRequestInput`으로 바꾼다. 읽기 실패는 던진다
 * (`loadDevBoard`가 `sources.requests = 'error'`로 담는다). 요청 본문(`detail`)과 정책 ID는 보드에 쓰지 않아 싣지 않는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { listDevRequests } from '@/lib/admin/devRequests/store'
import type { BoardRequestInput } from './types'

type ServiceClient = ReturnType<typeof createServiceClient>

export async function listBoardRequests(service: ServiceClient): Promise<BoardRequestInput[]> {
  const requests = await listDevRequests(service, { status: 'requested' })
  return requests.map((request) => ({
    no: request.no,
    title: request.title,
    origin: request.origin,
    status: request.status,
  }))
}
