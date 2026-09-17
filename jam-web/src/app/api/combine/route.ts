/**
 * POST /api/combine
 * Body: { recipe_id: string, item_ids: string[] } — 유저가 선택한 레시피 id와 그 레시피의
 * 아이템 슬롯에 채운 인벤토리 아이템 개체 ID 목록(티켓 20260917_1427, 레시피 선택형 전환).
 * 서버는 `recipe_id`로 지정된 레시피 하나만 검증한다(전체 레시피 스캔 없음).
 *
 * 응답은 `CombineResult`에 사용자 노출 `message`를 더해 내려준다(티켓 20260915_2240,
 * ADR 0001 서버-클라이언트 단일 진실 소스) — 이 route가 `d.combine.*`로 최종 문구를
 * 완성하고, 클라이언트(`CombineClient.tsx`)는 그 문구를 그대로 신뢰해 노출한다.
 *  - 성공: { success: true, path: 'recipe', resultBadges, pointsAwarded, message? }
 *    (레시피는 매칭됐지만 보상이 전부 비어 재료만 소각된 경우에만 message를 붙인다)
 *  - 실패: { success: false, reason: 'no_recipe_match'|'items_not_found'|'invalid_count'|
 *    'recipe_not_found', pointsAwarded, message }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { combineRecipeAttempt } from '@/lib/combine/index'
import { d, t } from '@/lib/i18n'
import type { CombineFailReason } from '@/types/database'

const FAIL_REASON_MESSAGE: Record<CombineFailReason, string> = {
  invalid_count: d.combine.selectRangeError,
  items_not_found: d.combine.itemsNotFound,
  no_recipe_match: d.combine.recipeFail,
  recipe_not_found: d.combine.recipeNotFound,
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const recipeId: unknown = body?.recipe_id
  const itemIds: unknown = body?.item_ids

  if (typeof recipeId !== 'string' || !recipeId) {
    return NextResponse.json(
      { success: false, reason: 'recipe_not_found', pointsAwarded: 0, message: d.combine.recipeNotFound },
      { status: 400 }
    )
  }

  if (!Array.isArray(itemIds) || itemIds.length < 1 || itemIds.length > 10) {
    return NextResponse.json(
      { success: false, reason: 'invalid_count', pointsAwarded: 0, message: d.combine.selectRangeError },
      { status: 400 }
    )
  }

  const result = await combineRecipeAttempt(user.id, recipeId, itemIds as string[])

  if (!result.success) {
    let message = FAIL_REASON_MESSAGE[result.reason] ?? d.combine.genericFail
    if (result.pointsAwarded > 0) {
      // §3 표기 규칙(천 단위 콤마) + [현상]과 [그래도 포인트가 남았어요] 두 문장을
      // 잇는 마침표를 여기서 채운다(ko.ts는 원문에 마침표를 미리 넣지 않는다 — 단일
      // 문장으로만 쓰일 때는 마침표를 찍지 않는 §3 규칙과 충돌하지 않기 위해).
      const pointsText = t(d.combine.consolationPoints, { points: result.pointsAwarded.toLocaleString() })
      message = `${message.replace(/[.]+$/, '')}. ${pointsText}`
    }
    return NextResponse.json({ ...result, message })
  }

  // 20260910_1515: 레시피는 매칭됐지만(success: true) 보상 배지가 전부 지급되지 않고
  // 포인트도 0인 경우 — 재료는 이미 소각됐으니 유저에게는 실패에 가깝다. 서버가 이 상태를
  // 판단해 메시지를 붙인다(과거에는 CombineClient.tsx가 이 조건을 직접 재판정했다).
  if (result.resultBadges.length === 0 && result.pointsAwarded === 0) {
    return NextResponse.json({ ...result, message: d.combine.recipeFail })
  }

  return NextResponse.json(result)
}
