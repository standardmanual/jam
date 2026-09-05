/**
 * 배지 카탈로그 일괄 작업 — **영향을 본 뒤에만 쓴다** (티켓 20260905_0034)
 *
 * 한 요청에 두 단계가 있다(계열 일괄 재계산 `api/admin/badge-families/recalculate`와 같은 형태).
 *   ① `confirm_token` 없음 → **영향 분석(dry-run)만** 돌려준다. 아무것도 쓰지 않는다.
 *   ② `confirm_token` + `confirm_phrase` → 지금 DB로 계획을 **다시 세워** 토큰을 대조하고,
 *      확인 문구까지 맞을 때만 쓴다.
 *
 * 계획을 다시 세우는 이유: 어드민이 분석을 본 뒤 다른 사람이 배지를 고치거나 유저가 배지를
 * 획득했을 수 있다. 그때 그대로 실행하면 «본 적 없는 영향»을 커밋하게 된다.
 *
 * ⚠️ **하드삭제 경로는 없다.** 폐기는 소프트삭제(`deleted_at`)이고 되살리기도 일괄로 있다
 * (2026-09-05 사용자 확정, 티켓 판단 ①). `badges`에 `is_active` 컬럼은 존재하지 않는다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { invalidateUnclaimedDrops } from '@/lib/admin/poi-drops'
import { chunkBadgeIds, collectBadgeReferences } from '@/lib/admin/badge-references'
import {
  BULK_ACTIONS,
  BULK_ACTION_LABEL,
  buildBulkPlan,
  findBulkConfirmError,
  type BulkAction,
  type BulkTargetFilter,
} from '@/lib/admin/badge-bulk'
import {
  fetchBulkTargetsByFilter,
  fetchBulkTargetsByIds,
  isUnboundedFilter,
  recordBulkRun,
} from '@/lib/admin/badge-bulk-query'
import type { BadgeRarity, BadgeType } from '@/types/database'

// 대량 선택(예: 「종류=아이템 · 상태=전부」 3,600건)은 참조 조회가 수십 회 왕복이라
// 기본 함수 시간 상한을 넘길 수 있다. 이 저장소의 무거운 어드민 라우트 관례를 따른다
// (선례: api/admin/strava-backfill/route.ts). — 게이트 리뷰 WARN, 티켓 20260905_0034
export const maxDuration = 60

const BADGE_TYPES: BadgeType[] = ['activity', 'item', 'checkin']
const RARITIES: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

function parseFilter(raw: unknown): BulkTargetFilter | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  const status = f.status === 'inactive' || f.status === 'all' ? f.status : 'active'
  const type = typeof f.type === 'string' && BADGE_TYPES.includes(f.type as BadgeType) ? (f.type as BadgeType) : null
  const rarity =
    typeof f.rarity === 'string' && RARITIES.includes(f.rarity as BadgeRarity) ? (f.rarity as BadgeRarity) : null
  return {
    type,
    rarity,
    status,
    activityType: typeof f.activity_type === 'string' && f.activity_type ? f.activity_type : null,
    q: typeof f.q === 'string' && f.q.trim() ? f.q.trim() : null,
    familyKey: typeof f.family_key === 'string' && f.family_key ? f.family_key : null,
  }
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const action = body.action as BulkAction
  if (!BULK_ACTIONS.includes(action)) {
    return NextResponse.json({ error: '실행할 작업을 선택해주세요.' }, { status: 400 })
  }

  // 대상 확정 — id가 오면 «화면이 실제로 본 목록»을 그대로 쓰고, 아니면 필터로 전량을 훑는다.
  const explicitIds = Array.isArray(body.badge_ids)
    ? (body.badge_ids as unknown[]).filter((id): id is string => typeof id === 'string')
    : []
  const filter = parseFilter(body.filter)

  if (explicitIds.length === 0 && !filter) {
    return NextResponse.json({ error: '대상을 지정해주세요. 필터를 고르거나 배지를 선택해주세요.' }, { status: 400 })
  }
  // 좁히는 축이 하나도 없는 필터는 카탈로그 전체(5,000종 이상)를 대상으로 삼는다 — 막는다.
  if (explicitIds.length === 0 && filter && isUnboundedFilter(filter)) {
    return NextResponse.json(
      { error: '대상을 좁혀주세요. 종류·종목·등급·계열 키·검색어 중 하나는 지정해야 해요.' },
      { status: 400 }
    )
  }

  const { targets, error: targetError } =
    explicitIds.length > 0 ? await fetchBulkTargetsByIds(explicitIds) : await fetchBulkTargetsByFilter(filter!)

  // 부분 목록으로 실행하면 «전부 처리했다»고 보고하고 일부만 처리한 상태가 된다 — 막는다.
  if (targetError) {
    console.error('[badges/bulk] 대상 조회 실패:', targetError)
    return NextResponse.json(
      { error: '대상을 불러오지 못했어요. 잠시 뒤 다시 시도해주세요. 계속되면 개발자에게 전달해주세요.' },
      { status: 500 }
    )
  }
  if (targets.length === 0) {
    return NextResponse.json({ error: '조건에 맞는 배지가 없습니다. 필터를 바꿔 보세요.' }, { status: 404 })
  }

  const supabase = createServiceClient()
  const references = await collectBadgeReferences(
    supabase,
    targets.map((t) => t.id)
  )
  const plan = buildBulkPlan(action, targets, references)

  // ① 분석 단계 — 아무것도 쓰지 않는다
  if (body.confirm_token === undefined || body.confirm_token === null) {
    return NextResponse.json({ plan })
  }

  // ② 실행 단계
  const confirmError = findBulkConfirmError(plan, body.confirm_token, body.confirm_phrase)
  if (confirmError) return NextResponse.json({ error: confirmError, plan }, { status: 409 })

  const ids = plan.actionableIds
  let affected = 0

  if (action === 'deactivate' || action === 'restore') {
    const deletedAt = action === 'deactivate' ? new Date().toISOString() : null
    for (const chunk of chunkBadgeIds(ids)) {
      const { data, error } = await supabase
        .from('badges')
        .update({ deleted_at: deletedAt })
        .in('id', chunk)
        .select('id')
      if (error) {
        // Postgres 원문(계열 정합성 트리거의 EXCEPTION 포함)을 그대로 노출하지 않는다.
        console.error('[badges/bulk] 상태 변경 실패:', error.message)
        return NextResponse.json(
          { error: `일부만 처리됐습니다(${affected}건 처리 후 중단). ${error.message}`, plan, affected },
          { status: 400 }
        )
      }
      affected += (data ?? []).length
    }

    // 폐기 방향일 때만 미픽업 드랍을 함께 무효화한다 — 단건 PATCH와 같은 규칙이다.
    // 되살릴 때 드랍을 자동 부활시키지 않는다(관리자가 명시적으로 새로 드랍해야 한다).
    if (action === 'deactivate') {
      for (const chunk of chunkBadgeIds(ids)) {
        await invalidateUnclaimedDrops(supabase, chunk, 'admin badges bulk')
      }
    }
  } else {
    // 획득 이력 삭제 — **활동·체크인 획득 이력만** 지운다.
    // 포인트 원장(`point_transactions`)은 불변 기록이라 건드리지 않고, 아이템 개체
    // (`inventory_items`)·드랍은 «소유물»이라 배지 폐기와 함께 지울 대상이 아니다.
    for (const chunk of chunkBadgeIds(ids)) {
      const { count: activityCount, error: activityError } = await supabase
        .from('user_activity_badges')
        .delete({ count: 'exact' })
        .in('badge_id', chunk)
      if (activityError) {
        console.error('[badges/bulk] 활동 배지 획득 이력 삭제 실패:', activityError.message)
        return NextResponse.json(
          { error: `일부만 삭제됐습니다(${affected}건 삭제 후 중단). ${activityError.message}`, plan, affected },
          { status: 400 }
        )
      }
      affected += activityCount ?? 0

      const { count: checkinCount, error: checkinError } = await supabase
        .from('user_checkin_badge_earns')
        .delete({ count: 'exact' })
        .in('badge_id', chunk)
      if (checkinError) {
        console.error('[badges/bulk] 체크인 배지 획득 이력 삭제 실패:', checkinError.message)
        return NextResponse.json(
          { error: `일부만 삭제됐습니다(${affected}건 삭제 후 중단). ${checkinError.message}`, plan, affected },
          { status: 400 }
        )
      }
      affected += checkinCount ?? 0
    }
  }

  await recordBulkRun({
    adminUserId: admin.id,
    adminEmail: admin.email,
    action,
    targetCount: ids.length,
    affectedCount: affected,
    detail: {
      label: BULK_ACTION_LABEL[action],
      filter: explicitIds.length > 0 ? null : filter,
      // 전량을 넣지 않는다 — 재현에 필요한 앞부분과 건수만 남긴다.
      badge_ids_head: ids.slice(0, 20),
      badge_id_count: ids.length,
      reference_counts: references.counts,
      skipped: plan.skipped.length,
    },
  })

  return NextResponse.json({ ok: true, affected, plan })
}
