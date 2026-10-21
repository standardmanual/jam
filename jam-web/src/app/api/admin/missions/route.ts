import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, requireAdminRead } from '@/lib/admin/auth'
import {
  DEFAULT_MISSION_STATUS_DISPLAY_TYPE,
  checkMissionCondition,
  checkMissionConditionValue,
} from '@/lib/missions/condition-keys'
import { findGateMissionSaveError } from '@/lib/missions/gateMissions'
import { validateGatedBadge, validateMissionRewardBadges } from '@/lib/missions/reward-badges'
import { READ_ERROR_MESSAGE, SAVE_ERROR_MESSAGE } from '@/lib/admin/mission-save-messages'
import {
  TRIBE_CREATE_CLEANUP_FAILED_MESSAGE,
  TRIBE_NOT_FOUND_MESSAGE,
  findMissingTribeIds,
  parseMissionTribeSelection,
  replaceAllowedTribes,
} from '@/lib/admin/mission-tribes'
import type { MissionType } from '@/types/database'

export async function GET(req: NextRequest) {
  const authError = await requireAdminRead(req)
  if (authError) return authError

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('missions')
    .select('*')
    .order('created_at', { ascending: false })

  // DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20261019_1318).
  if (error) {
    console.error('[missions GET 조회 오류]', error)
    return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json()

  // 참가할 수 있는 트라이브(티켓 20261019_1318). `scope`가 없으면 건드리지 않는다. 형식 검사만 먼저 하고
  // 트라이브가 실제로 있는지는 아래에서 DB로 확인한다.
  const tribeParse = parseMissionTribeSelection(body)
  if (!tribeParse.ok) return NextResponse.json({ error: tribeParse.error }, { status: 400 })
  const tribeSelection = tribeParse.selection

  // condition_json 키 검증 (티켓 20260905_1141) — 어드민 폼이 자유 JSON textarea라
  // 오타 키가 그대로 저장되면 그 미션은 fail-closed에 걸려 «영구 미달성»이 된다.
  //
  // 티켓 20261019_1312 — 틀(status_display_type)을 함께 검사한다: 순위형에는 밤 조건과 캡슐 연 횟수를 저장할 수
  // 없다. 틀을 비워 보내면 DB 기본값(순위형)이 들어가므로 같은 값으로 검사한다.
  const { error: conditionError, warning: conditionWarning } = checkMissionCondition(
    body.mission_type as MissionType,
    body.condition_json,
    body.status_display_type ?? DEFAULT_MISSION_STATUS_DISPLAY_TYPE
  )
  if (conditionError) {
    return NextResponse.json({ error: conditionError }, { status: 400 })
  }

  // condition_json 값 검증 (티켓 20260905_1327) — 키는 유효해도 값이 비었거나(item_collect의
  // badge_id: null 등) 0 이하면 그 미션은 영원히 달성되지 않는다.
  const { error: valueError } = checkMissionConditionValue(
    body.mission_type as MissionType,
    body.condition_json
  )
  if (valueError) {
    return NextResponse.json({ error: valueError }, { status: 400 })
  }

  // 게이트 필드 검증 (티켓 20260905_0033) — 축·단계는 짝이어야 하고, 노출 조건은 형태가
  // 깨지면 그 미션이 아무에게도 열리지 않는다(visibility.ts가 fail-closed로 잠근다).
  const gateError = findGateMissionSaveError(body)
  if (gateError) {
    return NextResponse.json({ error: gateError }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 보상 배지·게이트 배지 검증 (티켓 20261019_1313 2회, 티켓 20261019_0012) — 존재·삭제 제외·유형(액티비티·아이템만)·
  // 숨김 거절·중복 제거. 숨김 배지는 받기 전에 이름이 보이면 안 되는데 보상·게이트 배지는 받기 전에 화면에 보이기 때문이다.
  const rewardCheck = await validateMissionRewardBadges(supabase, body.reward_badge_ids)
  if (!rewardCheck.ok) return NextResponse.json({ error: rewardCheck.error }, { status: rewardCheck.status })
  const gatedCheck = await validateGatedBadge(supabase, body.gated_badge_id)
  if (!gatedCheck.ok) return NextResponse.json({ error: gatedCheck.error }, { status: gatedCheck.status })

  if (tribeSelection && tribeSelection.tribeIds.length > 0) {
    try {
      if ((await findMissingTribeIds(supabase, tribeSelection.tribeIds)).length > 0) {
        return NextResponse.json({ error: TRIBE_NOT_FOUND_MESSAGE }, { status: 400 })
      }
    } catch (err) {
      console.error('[missions POST 트라이브 조회 오류]', err)
      return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
    }
  }

  // 제작 경로(image_source)는 본문으로 정할 수 없다 — 생성 시점은 NULL(미상)이고 적용 탭·등록
  // 스크립트가 이후에 채운다(티켓 20260925_2023 방침 A). 수정 라우트(2003)와 같은 규칙이다.
  const safeBody = { ...body }
  delete safeBody.image_source
  // 트라이브 필드는 missions 칸이 아니라 별도 표에 저장한다(티켓 20261019_1318).
  delete safeBody.scope
  delete safeBody.allowed_tribe_ids
  // 중복을 없앤 보상 배지 목록을 저장한다(보내지 않았으면 본문 그대로).
  if (rewardCheck.ids !== null) safeBody.reward_badge_ids = rewardCheck.ids

  const { data, error } = await supabase
    .from('missions')
    .insert(safeBody)
    .select()
    .single()

  if (error) {
    console.error('[missions POST 저장 오류]', error)
    return NextResponse.json({ error: SAVE_ERROR_MESSAGE }, { status: 500 })
  }

  // 트라이브 미션이면 허용 트라이브를 저장한다. 실패하면 방금 만든 미션을 지운다 — 남겨 두면 트라이브 제한 없이
  // 모두에게 열린 공통 미션이 된다. 공통 미션은 저장할 행이 없다.
  if (tribeSelection && tribeSelection.tribeIds.length > 0) {
    try {
      await replaceAllowedTribes(supabase, data.id, tribeSelection.tribeIds, [])
    } catch (err) {
      console.error('[missions POST 트라이브 저장 오류]', err)
      const { error: cleanupError } = await supabase.from('missions').delete().eq('id', data.id)
      if (cleanupError) {
        console.error('[missions POST 트라이브 저장 실패 뒤 미션 정리 오류]', data.id, cleanupError)
        return NextResponse.json({ error: TRIBE_CREATE_CLEANUP_FAILED_MESSAGE }, { status: 500 })
      }
      return NextResponse.json({ error: SAVE_ERROR_MESSAGE }, { status: 500 })
    }
  }
  // 저장은 됐지만 판정하지 않는 조건이 있으면 경고를 응답에 함께 싣는다(티켓 20261019_1312).
  return NextResponse.json(conditionWarning ? { ...data, warning: conditionWarning } : data)
}
