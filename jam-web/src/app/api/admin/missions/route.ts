import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, requireAdminRead } from '@/lib/admin/auth'
import {
  DEFAULT_MISSION_STATUS_DISPLAY_TYPE,
  checkMissionCondition,
  checkMissionConditionValue,
} from '@/lib/missions/condition-keys'
import { findGateMissionSaveError } from '@/lib/missions/gateMissions'
import type { MissionType } from '@/types/database'

export async function GET(req: NextRequest) {
  const authError = await requireAdminRead(req)
  if (authError) return authError

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('missions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json()

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

  // 제작 경로(image_source)는 본문으로 정할 수 없다 — 생성 시점은 NULL(미상)이고 적용 탭·등록
  // 스크립트가 이후에 채운다(티켓 20260925_2023 방침 A). 수정 라우트(2003)와 같은 규칙이다.
  const safeBody = { ...body }
  delete safeBody.image_source

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('missions')
    .insert(safeBody)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // 저장은 됐지만 판정하지 않는 조건이 있으면 경고를 응답에 함께 싣는다(티켓 20261019_1312).
  return NextResponse.json(conditionWarning ? { ...data, warning: conditionWarning } : data)
}
