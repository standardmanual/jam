import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'

interface ReassignResult {
  itemId: string
  ok: boolean
  error?: string
}

/**
 * 고아(Orphaned) 아이템배지 재배정(어드민 전용, 티켓 20260829_2150).
 * body: { itemIds: string[], targetUserId: string }
 *
 * 대상 유저 1명에게 여러 개체를 한 번에 재배정할 수 있다. 개체마다
 * admin_reassign_orphaned_item() RPC를 독립적으로 호출해 개체별 성공/실패를
 * 구분한다(대상 인벤토리가 중간에 꽉 차면 그 이후 개체부터 inventory_full로
 * 실패하지만, 이미 처리된 개체는 롤백되지 않는다 — 티켓 §"일괄 처리 트랜잭션
 * 경계 확정"). 재배정된 유저에게 알림은 보내지 않는다(티켓 §"조용히 지급" — 기존
 * 배지획득 알림 파이프라인 재사용 안 함, 의도적 결정).
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const itemIds = (body as { itemIds?: unknown } | null)?.itemIds
  const targetUserId = (body as { targetUserId?: unknown } | null)?.targetUserId

  if (!Array.isArray(itemIds) || itemIds.length === 0 || !itemIds.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: '재배정할 개체를 지정하지 않았습니다.' }, { status: 400 })
  }
  if (typeof targetUserId !== 'string' || !targetUserId) {
    return NextResponse.json({ error: '재배정 대상 유저를 지정하지 않았습니다.' }, { status: 400 })
  }

  const service = createServiceClient()

  const results: ReassignResult[] = []
  // 순차 처리 — 같은 대상 유저의 inventory row를 여러 개체가 공유하므로(FOR UPDATE 락),
  // 동시 호출 시 불필요한 락 대기가 생긴다. 순차 처리가 used_slots 증가 순서도 더 예측
  // 가능하게 만든다.
  for (const itemId of itemIds as string[]) {
    const { data: rpcResult, error: rpcError } = await service.rpc('admin_reassign_orphaned_item', {
      p_item_id: itemId,
      p_admin_id: admin.id,
      p_target_user_id: targetUserId,
    })

    if (rpcError) {
      console.error('[admin/item-badges/orphaned/reassign] RPC 오류:', rpcError)
      results.push({ itemId, ok: false, error: 'reassign_failed' })
      continue
    }

    const result = rpcResult as { ok: boolean; error?: string }
    results.push({ itemId, ok: result.ok, error: result.ok ? undefined : result.error })
  }

  return NextResponse.json({ results })
}
