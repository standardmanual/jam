/**
 * POST /api/combine/tier-up — 등급 올리기 (티켓 20261022_2119 2회, 20261023_1648 2회, 운영 로직 8.4절)
 * Body: { itemIds: string[], collectionId: string } — 같은 등급의 아이템 배지 개체 id 5개와, 받을 컬렉션(아이템북) id. 레시피를 고르지 않는다.
 *
 * 규칙과 순서는 `lib/combine/tierUp.ts`가 갖고 있다. 이 라우트는 로그인 확인, 본문 모양 확인, 결과를 상태 코드와 사용자 문구로 바꾸는 일만 한다.
 * 굴림은 서버에서만 한다 — 본문에는 재료 개체 id와 고른 컬렉션 id뿐이고 확률이나 결과를 정하는 값은 받지 않는다.
 *
 * 상태 코드는 `/api/combine`과 같은 규칙이다.
 *  - 401 로그인 필요 · 400 본문 모양이 틀림(`invalid_count`)
 *  - 403 이용 정지 중(`code: 'user_suspended'`) — 소각 전
 *  - 409 잠긴 개체가 섞임(`locked_item_not_allowed`) · 받지 않은 결과가 남음(`pending_results_exist`) — 둘 다 `code` 키를 더하고 소각 전이다
 *  - 200 그 밖의 거절(`items_not_found`·`invalid_materials`·`invalid_collection`·`no_candidate`·엔진이 돌려준 `invalid_count`)은 `{ success: false, reason, pointsAwarded: 0, message }`다. 모두 소각 전이다.
 *    `collectionId`가 없거나 문자열이 아니어도 400이 아니라 `invalid_collection` 200이다(본문 모양 오류로 400을 내는 것은 재료 개수뿐이다)
 *  - 200 성공: `{ success: true, path: 'tier_up', materialRarity, resultBadges, pointsAwarded: 0, resultStatus: 'granted'|'pending', pendingCount?, freeSlots? }`.
 *    `resultBadges`의 각 줄은 `{ id, name, rarity, imageUrl }`이다(`imageUrl`은 `badges.image_url`, 없으면 null — 레시피가 없어 응답이 그림 주소를 직접 싣는다).
 *    빈칸이 모자라 결과를 받지 않은 상태로 남기면 `pending`이고 안내 `message`가 붙는다. 받기는 `POST /api/combine/pending`이다. 잠긴 결과는 이름·id를 가린다
 *  - 500 읽기 실패 같은 오류. 결과 지급 실패는 재료가 소각된 뒤라 로그에 남고 500으로 내려간다
 * JAM! 행동 지표(`jamTriggersForCombineResult`)는 부르지 않는다 — 레시피 믹스의 지표다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TIER_UP_MATERIAL_COUNT, tierUp, type TierUpFailReason } from '@/lib/combine/tierUp'
import { d } from '@/lib/i18n'
import { LOCKED_ITEM_NOT_ALLOWED_CODE } from '@/lib/inventory/lockedItem'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE, type UserSuspendedResponse } from '@/lib/suspension/suspension-contract'

const FAIL_REASON_MESSAGE: Record<TierUpFailReason, string> = {
  invalid_count: d.combine.tierUp.invalidCount,
  items_not_found: d.combine.itemsNotFound,
  locked_item_not_allowed: d.lockedItem.combine,
  pending_results_exist: d.combine.pendingResultsExist,
  invalid_materials: d.combine.tierUp.invalidMaterials,
  invalid_collection: d.combine.tierUp.invalidCollection,
  no_candidate: d.combine.tierUp.noCandidate,
}

/** 받지 않은 결과가 있어 거절할 때 `code` 키로 내리는 값 — 클라이언트가 «받기»로 안내한다(`reason`과 같은 값) */
const PENDING_RESULTS_EXIST_CODE = 'pending_results_exist'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const itemIds: unknown = body?.itemIds
  const collectionId: unknown = body?.collectionId

  if (
    !Array.isArray(itemIds) ||
    itemIds.length !== TIER_UP_MATERIAL_COUNT ||
    itemIds.some((id) => typeof id !== 'string' || !id)
  ) {
    return NextResponse.json(
      { success: false, reason: 'invalid_count', pointsAwarded: 0, message: d.combine.tierUp.invalidCount },
      { status: 400 }
    )
  }

  let result: Awaited<ReturnType<typeof tierUp>>
  try {
    // 컬렉션 id가 문자열이 아니면 빈 문자열로 넘긴다 — 엔진이 소각 전에 `invalid_collection`으로 거절한다
    result = await tierUp(user.id, itemIds as string[], typeof collectionId === 'string' ? collectionId : '')
  } catch (attemptError) {
    // 이용 정지 중이면 소각 전에 던진다 — 재료가 그대로다. 정지 여부를 읽지 못해도 던지므로 아래에서 500으로 닫힌다.
    if (attemptError instanceof UserSuspendedError) {
      const suspended: UserSuspendedResponse = { error: d.suspension.combineBlocked, code: USER_SUSPENDED_CODE }
      return NextResponse.json(suspended, { status: 403 })
    }
    console.error('[combine/tier-up] 등급 올리기 처리 오류:', attemptError)
    return NextResponse.json({ error: d.combine.genericFail }, { status: 500 })
  }

  if (!result.success) {
    // 잠긴 개체가 섞인 재료와 받지 않은 결과가 남은 경우는 믹스와 같이 `code`를 더해 409로 알린다(소각 전)
    if (result.reason === LOCKED_ITEM_NOT_ALLOWED_CODE) {
      return NextResponse.json({ ...result, code: LOCKED_ITEM_NOT_ALLOWED_CODE, message: d.lockedItem.combine }, { status: 409 })
    }
    if (result.reason === PENDING_RESULTS_EXIST_CODE) {
      return NextResponse.json({ ...result, code: PENDING_RESULTS_EXIST_CODE, message: d.combine.pendingResultsExist }, { status: 409 })
    }
    return NextResponse.json({ ...result, message: FAIL_REASON_MESSAGE[result.reason] ?? d.combine.genericFail })
  }

  if (result.resultStatus === 'pending') {
    return NextResponse.json({ ...result, message: d.combine.resultPending })
  }

  return NextResponse.json(result)
}
