/**
 * 트라이브 존재 확인 재료 (티켓 20261001_1152).
 *
 * 운영 묶음 항목의 `tribe_id`가 실제 트라이브인지 보려면 `tribes` 목록이 필요하다. 검증 함수(`validate.ts`)는 순수 함수라 DB를
 * 부르지 않으므로, 제출 라우트(`route.ts`)와 직접 수정(`decide.ts`)이 이 함수로 목록을 가져와 `ctx.tribeIds`로 넘긴다.
 * 두 곳이 같은 목록·같은 규칙으로 판정해야 하므로 조회는 이 한 곳에만 둔다.
 */
import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * `tribes`에 있는 트라이브 ID 전체(소문자). 생성 타입(`database.generated.ts`)의 `tribes` 행에 삭제 표시 열(`deleted_at`)이 없고
 * 관리자 삭제 API(`app/api/admin/tribes/[id]/route.ts`)가 행을 지우므로, 있는 행이 곧 있는 트라이브다(`is_active`가 꺼진 트라이브도
 * 있는 트라이브로 본다). 조회가 실패하면 예외를 던진다 — 부르는 쪽이 저장하지 않고 500으로 돌려준다.
 */
export async function loadTribeIds(service: ServiceClient): Promise<Set<string>> {
  const { data, error } = await service.from('tribes').select('id')
  if (error) throw new Error(`트라이브 목록 조회 실패: ${error.message}`)
  return new Set((data ?? []).map((row) => row.id.toLowerCase()))
}
