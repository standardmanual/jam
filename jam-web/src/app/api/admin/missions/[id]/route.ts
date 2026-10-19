import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { checkMissionCondition, checkMissionConditionValue, rankingConditionError } from '@/lib/missions/condition-keys'
import { findGateMissionSaveError } from '@/lib/missions/gateMissions'
import { collectMissionReferences, MISSION_REFERENCE_SOURCES, summarizeReference } from '@/lib/admin/reference-guards'
import { imageSourceReset, imageUrlTypeError } from '@/lib/admin/imageSourceReset'
import type { MissionRow } from '@/types/database'
import type { MissionType } from '@/types/database'

// DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20260926_1602). 현상 → 원인 → 해결책 순서.
const READ_ERROR_MESSAGE = '미션 정보를 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
const SAVE_ERROR_MESSAGE = '미션을 저장하지 못했어요. 서버에서 저장 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
const DELETE_ERROR_MESSAGE = '미션을 삭제하지 못했어요. 서버에서 삭제 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'

// PATCH /api/admin/missions/[id] — 기존 미션 수정.
// 티켓 20260813_001: status_display_type을 'individual'로 전환하는 등 이미 활성화된
// 미션도 운영자가 수정할 수 있어야 해서 신설.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const body = await req.json()

  const imageUrlError = imageUrlTypeError(body.image_url)
  if (imageUrlError) return NextResponse.json({ error: imageUrlError }, { status: 400 })

  const supabase = createServiceClient()

  // condition_json 키 검증 (티켓 20260905_1141). 부분 갱신이라 body에 condition_json이
  // 없을 수 있고, 그때는 기존 조건을 건드리지 않는 갱신이므로 조건 자체는 검사하지 않는다.
  //
  // 티켓 20261019_1312 — 순위형 미션에는 밤 조건과 캡슐 연 횟수를 저장할 수 없다. 이 규칙은 조건과
  // 틀(status_display_type)의 «조합»이라 둘 중 하나만 바뀌어도 «갱신 후의 상태»로 합쳐서 검사한다
  // (조건만 보면 «틀만 순위형으로 바꾸는» 요청이 통과한다). 아래 게이트 필드 검사와 같은 방식이다.
  const conditionChanged = body.condition_json !== undefined
  const frameChanged = body.status_display_type !== undefined
  let conditionWarning: string | null = null
  if (conditionChanged || frameChanged) {
    // pending 키 차단 여부가 미션 타입에 따라 갈리고 틀은 기존 값이 필요할 수 있어 «갱신 후의» 값이 필요하다.
    // 폼은 항상 mission_type·status_display_type을 함께 보내지만, 없으면 기존 행에서 가져온다.
    let existingRow: { mission_type: MissionType; condition_json: unknown; status_display_type: string } | null = null
    if (body.mission_type === undefined || body.status_display_type === undefined || !conditionChanged) {
      const { data: existing } = await supabase
        .from('missions')
        .select('mission_type, condition_json, status_display_type')
        .eq('id', id)
        .single<{ mission_type: MissionType; condition_json: unknown; status_display_type: string }>()
      if (!existing) {
        return NextResponse.json({ error: '미션을 찾지 못했어요. 목록을 새로고침한 뒤 다시 시도해주세요.' }, { status: 404 })
      }
      existingRow = existing
    }
    const missionType = (body.mission_type ?? existingRow?.mission_type) as MissionType
    const frame = body.status_display_type ?? existingRow?.status_display_type

    if (conditionChanged) {
      const { error: conditionError, warning } = checkMissionCondition(missionType, body.condition_json, frame)
      if (conditionError) {
        return NextResponse.json({ error: conditionError }, { status: 400 })
      }
      conditionWarning = warning

      // condition_json 값 검증 (티켓 20260905_1327) — 기존 6건처럼 badge_id/poi_id가
      // null이거나, 수치 타입 목표가 0 이하면 그 미션은 영원히 달성되지 않는다. 「저장하려는
      // 새 값」을 검증하는 것이라 유효한 값으로 고치는 수정 저장(복구 경로)은 막지 않는다.
      const { error: valueError } = checkMissionConditionValue(missionType, body.condition_json)
      if (valueError) {
        return NextResponse.json({ error: valueError }, { status: 400 })
      }
    } else {
      // 틀만 바뀐다 — 조건은 기존 행 그대로라 키·값 검사를 다시 하지 않고(기존 행의 옛 문제가 틀 변경까지
      // 막지 않게) 순위형 금지만 본다.
      const rankingError = rankingConditionError(existingRow?.condition_json, frame)
      if (rankingError) {
        return NextResponse.json({ error: rankingError }, { status: 400 })
      }
    }
  }

  // 게이트 필드 검증 (티켓 20260905_0033). PATCH는 부분 갱신이라 body에 세 필드가 다
  // 들어오지 않을 수 있다 — 「갱신 후의 상태」로 합쳐서 검사해야 «축만 지우고 단계를
  // 남기는» 조합이 통과하지 않는다.
  const gateKeys = ['gate_axis', 'gate_stage', 'visibility_rule_json', 'gated_badge_id'] as const
  if (gateKeys.some((k) => body[k] !== undefined)) {
    // ⚠️ 컬럼명을 나열하지 않고 `*`로 읽는다. 나열하면 마이그레이션 135가 아직 실행되지
    // 않은 DB에서 PostgREST가 42703(컬럼 없음)을 돌려주고, 이 경로는 어드민 미션 수정
    // **전부**가 지나가는 길이라(목록 화면이 항상 gated_badge_id를 함께 보낸다) 게이트와
    // 무관한 미션 수정까지 막힌다. `*`로 읽으면 미실행 DB에서는 세 필드가 그냥 빠진 채로
    // 오고, merged가 전부 undefined가 되어 예전과 같은 검증 결과(통과)가 된다.
    const { data: existing, error: existingError } = await supabase
      .from('missions')
      .select('*')
      .eq('id', id)
      .single<Pick<MissionRow, (typeof gateKeys)[number]>>()
    if (existingError) {
      // 조회 자체가 실패한 것을 「없는 미션」으로 뭉뚱그리면 원인을 못 찾는다.
      console.error('[missions PATCH 게이트 조회 오류]', existingError)
      return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ error: '미션을 찾지 못했어요. 목록을 새로고침한 뒤 다시 시도해주세요.' }, { status: 404 })
    }
    const merged = Object.fromEntries(
      gateKeys.map((k) => [k, body[k] !== undefined ? body[k] : existing[k]])
    )
    const gateError = findGateMissionSaveError(merged)
    if (gateError) {
      return NextResponse.json({ error: gateError }, { status: 400 })
    }
  }

  // 이미지(썸네일)가 실제로 바뀔 때만 제작 경로를 NULL(미상)로 되돌린다(티켓 20260925_1940
  // 방침 A). 폼은 매번 전체 필드를 보내므로 기존 값과 비교하고, 본문에 image_url이 없으면
  // 기존 행을 조회하지 않는다.
  let imageSourcePatch: { image_source?: null } = {}
  if (body.image_url !== undefined) {
    const { data: existingImage, error: existingImageError } = await supabase
      .from('missions')
      .select('image_url')
      .eq('id', id)
      .maybeSingle<{ image_url: string | null }>()
    if (existingImageError) {
      console.error('[missions PATCH 이미지 조회 오류]', existingImageError)
      return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
    }
    if (!existingImage) {
      return NextResponse.json({ error: '미션을 찾지 못했어요. 목록을 새로고침한 뒤 다시 시도해주세요.' }, { status: 404 })
    }
    imageSourcePatch = imageSourceReset(existingImage.image_url, body.image_url)
  }

  // 제작 경로(image_source)는 본문으로 바꿀 수 없다 — 이미지 변경 시 초기화(위)와 적용 탭·등록
  // 스크립트로만 바뀐다(티켓 20260925_2003 방침 A). 배지·컬렉션·홈피드 저장 라우트와 같은 규칙이다.
  const safeBody = { ...body }
  delete safeBody.image_source

  const { data, error } = await supabase
    .from('missions')
    .update({ ...safeBody, ...imageSourcePatch } as never)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[missions PATCH 저장 오류]', error)
    return NextResponse.json({ error: SAVE_ERROR_MESSAGE }, { status: 500 })
  }
  // 저장은 됐지만 판정하지 않는 조건이 있으면 경고를 응답에 함께 싣는다(티켓 20261019_1312).
  return NextResponse.json(conditionWarning ? { ...data, warning: conditionWarning } : data)
}

/**
 * 하드 삭제 — 참조 가드는 `lib/admin/reference-guards.ts`가 단일 출처다(티켓 20260907_1134).
 * 참여·완료 이력·랭킹 스냅샷은 CASCADE라 그냥 삭제하면 유저 기록이 조용히 사라지고,
 * 포인트 원장(`source_mission_id`)은 NO ACTION이라 FK 위반으로 삭제 자체가 실패한다.
 * 미션은 소프트 삭제 개념이 없으므로(상태는 시작/종료일에서 파생) 참조가 있으면 삭제 대신
 * 종료일을 지나게 두도록 안내한다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const supabase = createServiceClient()

  const { data: existing, error: fetchError } = await supabase.from('missions').select('id').eq('id', id).single()
  if (fetchError || !existing) {
    return NextResponse.json({ error: '미션을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { counts, error: refError } = await collectMissionReferences(supabase, [id])
  if (refError) {
    console.error('[missions DELETE] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', refError)
    return NextResponse.json(
      { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
      { status: 500 }
    )
  }

  const summary = summarizeReference(MISSION_REFERENCE_SOURCES, counts.get(id)!)
  if (summary.blockingTotal > 0) {
    return NextResponse.json(
      {
        error: `삭제할 수 없습니다. 이 미션에 이미 참여·완료 이력이 ${summary.blockingTotal}건 있습니다(${summary.hitLabels}). 종료일을 지난 날짜로 수정해 노출만 막아주세요.`,
      },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('missions').delete().eq('id', id)
  if (error) {
    console.error('[missions DELETE 삭제 오류]', error)
    return NextResponse.json({ error: DELETE_ERROR_MESSAGE }, { status: 500 })
  }

  // 삭제를 막지 않는 참조(투데이 카드·랭킹 규칙 연결, SET NULL)는 삭제 뒤에 알린다(티켓 20260925_2105).
  // 없으면 기존 응답 `{ ok: true }` 그대로다.
  if (summary.noticeLabels) {
    return NextResponse.json({ ok: true, notice: `삭제했어요. 연결이 풀린 곳이 있어요 (${summary.noticeLabels}).` })
  }
  return NextResponse.json({ ok: true })
}
