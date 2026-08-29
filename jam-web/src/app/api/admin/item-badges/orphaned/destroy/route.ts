import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'

interface DestroyResult {
  itemId: string
  ok: boolean
  error?: string
}

/**
 * 고아(Orphaned) 아이템배지 영구 폐기(어드민 전용, 티켓 20260829_2150).
 * body: { itemIds: string[] }
 *
 * 다건 일괄 처리 지원 — 개체마다 admin_destroy_orphaned_item() RPC를 독립적으로
 * 호출한다(RPC 호출 1건 = 트랜잭션 1개). 일부 개체가 실패해도 나머지는 계속
 * 처리하고, 개체별 성공/실패를 results 배열로 그대로 반환한다(전체 롤백 안 함 —
 * 티켓 §"일괄 처리 트랜잭션 경계 확정").
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const itemIds = (body as { itemIds?: unknown } | null)?.itemIds

  if (!Array.isArray(itemIds) || itemIds.length === 0 || !itemIds.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: '폐기할 개체를 지정하지 않았습니다.' }, { status: 400 })
  }

  const service = createServiceClient()

  const results: DestroyResult[] = []
  for (const itemId of itemIds as string[]) {
    // @ts-expect-error 'admin_destroy_orphaned_item' RPC 함수가 src/types/database.ts의
    // Functions에 미등록 (기존 pickup_drop/create_user_drop과 동일한 상황)
    const { data: rpcResult, error: rpcError } = await service.rpc('admin_destroy_orphaned_item', {
      p_item_id: itemId,
      p_admin_id: admin.id,
    })

    if (rpcError) {
      console.error('[admin/item-badges/orphaned/destroy] RPC 오류:', rpcError)
      results.push({ itemId, ok: false, error: 'destroy_failed' })
      continue
    }

    const result = rpcResult as { ok: boolean; error?: string }
    results.push({ itemId, ok: result.ok, error: result.ok ? undefined : result.error })
  }

  return NextResponse.json({ results })
}
