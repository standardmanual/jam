import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { recordFeedEvent } from '@/lib/activity-feed'
import { loadMissionVisibilityContext } from '@/lib/missions/visibility-server'
import { resolveMissionVisibility, type MissionVisibilityInput } from '@/lib/missions/visibility'
import { RARITY_LABEL } from '@/lib/rarity'
import { d, t } from '@/lib/i18n'

type Params = { params: Promise<{ id: string }> }

// POST /api/missions/[id]/join — 미션 참가
export async function POST(_req: Request, { params }: Params) {
  const { id: missionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const service = createServiceClient()

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
        | ({ id: string; title: string; ends_at: string | null } & MissionVisibilityInput)
        | null
    }

  if (!mission) return NextResponse.json({ error: '미션을 찾을 수 없어요.' }, { status: 404 })
  // ends_at이 null이면 상시 미션(종료 없음) — 종료 체크 건너뜀
  if (mission.ends_at !== null && new Date(mission.ends_at) < new Date()) {
    return NextResponse.json({ error: '이미 종료된 미션이에요.' }, { status: 400 })
  }

  // 20260825_028 서버 가드 — UI에서 숨기더라도 URL 직접 호출을 막지 못하므로
  // 완료·잠금 여부를 목록/상세와 같은 규칙(visibility.ts)으로 여기서도 검사한다.
  const visibilityContext = await loadMissionVisibilityContext(user.id, [mission])
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
      return NextResponse.json({ error: '이미 참가 중인 미션이에요.' }, { status: 409 })
    }
    return NextResponse.json({ error: '참가 처리 중 오류가 발생했어요.' }, { status: 500 })
  }

  await recordFeedEvent(user.id, 'mission_joined', { mission_id: missionId, mission_title: mission.title })

  return NextResponse.json({ success: true })
}

// 참가 취소(DELETE)는 Phase13에서 폐지 — 한번 참가하면 되돌릴 수 없다.
