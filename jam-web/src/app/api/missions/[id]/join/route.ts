import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { recordFeedEvent } from '@/lib/activity-feed'
import { loadMissionVisibilityContext } from '@/lib/missions/visibility-server'
import {
  isMissionExposed,
  resolveMissionVisibility,
  type MissionVisibilityContext,
  type MissionVisibilityInput,
} from '@/lib/missions/visibility'
import { isMissionOpenToUser } from '@/lib/missions/tribe-access'
import { assertNotSuspended, UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE, type UserSuspendedResponse } from '@/lib/suspension/suspension-contract'
import { RARITY_LABEL } from '@/lib/rarity'
import { d, t } from '@/lib/i18n'

type Params = { params: Promise<{ id: string }> }

// POST /api/missions/[id]/join — 미션 참가
export async function POST(_req: Request, { params }: Params) {
  const { id: missionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  const service = createServiceClient()

  // 이용 정지 중이면 참가하지 않는다(티켓 20261019_1311, 운영 로직 13.2절). 미션 조회보다 앞서 막는다.
  // 정지 여부를 읽지 못하면 던져 참가시키지 않는다 — 정지 중인 유저가 조회 실패 틈에 참가하면 안 된다.
  try {
    await assertNotSuspended(service, user.id)
  } catch (err) {
    if (err instanceof UserSuspendedError) {
      const suspended: UserSuspendedResponse = { error: d.suspension.missionJoinBlocked, code: USER_SUSPENDED_CODE }
      return NextResponse.json(suspended, { status: 403 })
    }
    console.error('[missions/join] 이용 정지 조회 오류:', err)
    return NextResponse.json({ error: d.missions.joinProcessError }, { status: 500 })
  }

  // 미션 존재 + 아직 진행 중인지 확인.
  // 게이팅 컬럼을 이름으로 명시하지 않고 select('*')를 쓰는 이유: 마이그레이션 101(그리고
  // 게이트 미션 컬럼을 더하는 135)이 아직 실행되지 않은 환경에서 없는 컬럼을 명시하면 쿼리
  // 자체가 실패해 참가가 전부 막힌다 (staging·프로덕션이 DB를 공유하므로 배포 순서 사고에
  // 대비). 컬럼이 없으면 그 필드가 undefined가 되어 게이팅만 적용되지 않는다.
  const { data: mission } = await service
    .from('missions')
    .select('*')
    .eq('id', missionId)
    .single() as {
      data:
        | ({
            id: string
            title: string
            ends_at: string | null
            starts_at: string
            exposure_mode: import('@/types/database').MissionExposureMode | null | undefined
            exposure_at: string | null | undefined
          } & MissionVisibilityInput)
        | null
    }

  if (!mission) return NextResponse.json({ error: d.missions.missionNotFound }, { status: 404 })
  // 관리자 수동 노출 제어(티켓 20260912_0139) — 숨김/노출 예정 미션은 없는 것과 동일하게
  // 취급한다(존재 여부를 노출하지 않는다).
  if (!isMissionExposed(mission)) {
    return NextResponse.json({ error: d.missions.missionNotFound }, { status: 404 })
  }
  // ends_at이 null이면 상시 미션(종료 없음) — 종료 체크 건너뜀
  if (mission.ends_at !== null && new Date(mission.ends_at) < new Date()) {
    return NextResponse.json({ error: d.missions.alreadyEndedError }, { status: 400 })
  }

  // 20260825_028 서버 가드 — UI에서 숨기더라도 URL 직접 호출을 막지 못하므로
  // 완료·잠금 여부를 목록/상세와 같은 규칙(visibility.ts)으로 여기서도 검사한다.
  let visibilityContext: MissionVisibilityContext
  try {
    visibilityContext = await loadMissionVisibilityContext(user.id, [mission])
  } catch (err) {
    // 트라이브 접근을 읽지 못하면 제한 미션이 새지 않도록 참가시키지 않는다(fail-closed)
    console.error('[missions/join] 노출 판정 조회 오류:', err)
    return NextResponse.json({ error: d.missions.joinProcessError }, { status: 500 })
  }

  // 참가할 수 있는 트라이브가 아니면 «없는 미션»과 같은 404다(티켓 20261019_1311) — 존재를 알리지 않는다.
  // 잠금(403) 판정보다 먼저 처리한다. 이미 완료한 미션은 아래 completed 분기(409)로 간다.
  if (
    visibilityContext.tribeAccess &&
    !visibilityContext.completedMissionIds.has(mission.id) &&
    !isMissionOpenToUser(visibilityContext.tribeAccess, mission.id)
  ) {
    return NextResponse.json({ error: d.missions.missionNotFound }, { status: 404 })
  }

  const { visibility, requiredBadge } = resolveMissionVisibility(mission, visibilityContext)

  if (visibility === 'completed') {
    // 재참가해도 user_mission_completions의 UNIQUE 제약 때문에 재완료·재보상이 불가능하다
    return NextResponse.json({ error: d.missions.joinErrorCompleted }, { status: 409 })
  }
  if (visibility !== 'open') {
    const error = requiredBadge
      ? t(d.missions.joinErrorLocked, {
          badge: requiredBadge.name,
          rarity: RARITY_LABEL[requiredBadge.rarity] ?? requiredBadge.rarity,
        })
      : d.missions.joinErrorLockedGeneric
    return NextResponse.json({ error }, { status: 403 })
  }

  const { error } = await service
    .from('user_mission_participations')
    .insert({ user_id: user.id, mission_id: missionId })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: d.missions.alreadyJoinedError }, { status: 409 })
    }
    return NextResponse.json({ error: d.missions.joinProcessError }, { status: 500 })
  }

  await recordFeedEvent(user.id, 'mission_joined', { mission_id: missionId, mission_title: mission.title })

  return NextResponse.json({ success: true })
}

// 참가 취소(DELETE)는 Phase13에서 폐지 — 한번 참가하면 되돌릴 수 없다.
