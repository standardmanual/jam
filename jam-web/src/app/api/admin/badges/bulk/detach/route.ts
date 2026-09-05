/**
 * 참조 개별 해제 (티켓 20260905_0034 — 참조 정리)
 *
 * 폐기 대상을 가리키는 콘텐츠에서 **그 배지만** 빼낸다. 대상 콘텐츠(투데이 카드·미션)는
 * 지우지 않는다 — 카드나 미션 자체는 계속 살아 있고, 끊어질 참조만 정리하는 것이 목적이다.
 *
 * 해제 가능한 자리는 `BADGE_REFERENCE_SOURCES`의 `detachable`이 정한다. 믹스 레시피 재료는
 * 일부러 제외했다 — 재료 2~3개 조합이 곧 레시피의 정체성이라, 하나만 빼면 다른 레시피가 된다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { BADGE_REFERENCE_SOURCE_BY_KEY, type BadgeReferenceKey } from '@/lib/admin/badge-references'
import { recordBulkRun } from '@/lib/admin/badge-bulk-query'

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const sourceKey = body.source_key as BadgeReferenceKey
  const rowId = typeof body.row_id === 'string' ? body.row_id : ''
  const badgeIds = Array.isArray(body.badge_ids)
    ? (body.badge_ids as unknown[]).filter((id): id is string => typeof id === 'string')
    : []

  const source = BADGE_REFERENCE_SOURCE_BY_KEY.get(sourceKey)
  if (!source || !source.detachable) {
    return NextResponse.json(
      { error: `해제할 수 없습니다. 이 자리(${sourceKey ?? '알 수 없음'})는 개별 해제를 지원하지 않아요.` },
      { status: 400 }
    )
  }
  if (!rowId || badgeIds.length === 0) {
    return NextResponse.json({ error: '해제할 대상을 지정해주세요.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const targetSet = new Set(badgeIds)
  let label = ''
  let remaining = 0

  if (sourceKey === 'today_cards') {
    const { data, error } = await supabase.from('today_cards').select('id, title, badge_ids').eq('id', rowId).single()
    if (error || !data) return NextResponse.json({ error: '투데이 카드를 찾을 수 없습니다.' }, { status: 404 })
    const card = data as { id: string; title: string; badge_ids: string[] | null }
    label = card.title
    const next = (card.badge_ids ?? []).filter((id) => !targetSet.has(id))
    if (next.length === (card.badge_ids ?? []).length) {
      return NextResponse.json({ error: '해제할 참조가 없습니다. 이미 정리된 카드예요.' }, { status: 409 })
    }
    const { error: updateError } = await supabase.from('today_cards').update({ badge_ids: next }).eq('id', rowId)
    if (updateError) {
      console.error('[badges/bulk/detach] 투데이 카드 갱신 실패:', updateError.message)
      return NextResponse.json({ error: `해제하지 못했습니다. ${updateError.message}` }, { status: 400 })
    }
    remaining = next.length
  } else {
    const { data, error } = await supabase
      .from('missions')
      .select('id, title, reward_badge_ids, gated_badge_id')
      .eq('id', rowId)
      .single()
    if (error || !data) return NextResponse.json({ error: '미션을 찾을 수 없습니다.' }, { status: 404 })
    const mission = data as {
      id: string
      title: string
      reward_badge_ids: string[] | null
      gated_badge_id: string | null
    }
    label = mission.title

    if (sourceKey === 'missions_reward') {
      const next = (mission.reward_badge_ids ?? []).filter((id) => !targetSet.has(id))
      if (next.length === (mission.reward_badge_ids ?? []).length) {
        return NextResponse.json({ error: '해제할 참조가 없습니다. 이미 정리된 미션이에요.' }, { status: 409 })
      }
      const { error: updateError } = await supabase
        .from('missions')
        .update({ reward_badge_ids: next })
        .eq('id', rowId)
      if (updateError) {
        console.error('[badges/bulk/detach] 미션 보상 갱신 실패:', updateError.message)
        return NextResponse.json({ error: `해제하지 못했습니다. ${updateError.message}` }, { status: 400 })
      }
      remaining = next.length
    } else {
      if (!mission.gated_badge_id || !targetSet.has(mission.gated_badge_id)) {
        return NextResponse.json({ error: '해제할 참조가 없습니다. 이미 정리된 미션이에요.' }, { status: 409 })
      }
      const { error: updateError } = await supabase
        .from('missions')
        .update({ gated_badge_id: null })
        .eq('id', rowId)
      if (updateError) {
        console.error('[badges/bulk/detach] 미션 게이트 갱신 실패:', updateError.message)
        return NextResponse.json({ error: `해제하지 못했습니다. ${updateError.message}` }, { status: 400 })
      }
      remaining = 0
    }
  }

  await recordBulkRun({
    adminUserId: admin.id,
    adminEmail: admin.email,
    action: 'detach_reference',
    targetCount: badgeIds.length,
    affectedCount: 1,
    detail: { source: source.location, row_id: rowId, label, badge_ids: badgeIds.slice(0, 20), remaining },
  })

  return NextResponse.json({ ok: true, remaining })
}
