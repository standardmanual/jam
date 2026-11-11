import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { MissionStatusDisplayType } from '@/types/database'
import { compareMissionRank, filterRankableParticipants } from '@/lib/missions/ranking'
import { loadMissionTribeAccess } from '@/lib/missions/visibility-server'
import { isMissionOpenToUser } from '@/lib/missions/tribe-access'
import { getSuspendedUserIds } from '@/lib/suspension/suspension'
import { excludedTestUserIds } from '@/lib/env/test-accounts'
import { getDisplayName } from '@/lib/utils'
import { d } from '@/lib/i18n'

type Params = { params: Promise<{ id: string }> }

interface RankingEntry {
  userId: string
  /** 표시용 이름 — display_name 우선, 없으면 username, 그마저 없으면 '익명' (라우팅 불가) */
  displayName: string
  /** 라우팅용 원본 users.username 컬럼값 — 탈퇴 등으로 유저 레코드가 없으면 null */
  username: string | null
  avatarUrl: string | null
  progressValue: number
  isCompleted: boolean
  completedAt: string | null
  rank: number
}

// GET /api/missions/[id]/status — 미션 상황(랭킹형만). 참가자 전용(미참가 403). 랭킹형이 아닌 미션은 «없는 미션»이다(티켓 20261111_0856).
export async function GET(_req: Request, { params }: Params) {
  const { id: missionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  const service = createServiceClient()

  // 미션 조회
  const { data: missionRaw } = await service
    .from('missions')
    .select('id, status_display_type, visible_rank_count')
    .eq('id', missionId)
    .maybeSingle() as { data: { id: string; status_display_type: MissionStatusDisplayType; visible_rank_count: number | null } | null }

  if (!missionRaw) return NextResponse.json({ error: d.missions.missionNotFound }, { status: 404 })
  // 달성형은 상황 화면을 주지 않는다(상세에 «랭킹» 버튼이 없고 화면 페이지도 상세로 돌려보낸다, 티켓 20261111_0850). 참가자·정지 조회에 들어가기 전에 끊는다
  if (missionRaw.status_display_type !== 'ranking') return NextResponse.json({ error: d.missions.missionNotFound }, { status: 404 })

  // 트라이브 제한 (티켓 20261019_1311) — 참가할 수 있는 트라이브가 아닌 미션은 «없는 미션»이다(존재를 알리지 않는다).
  // 이미 완료한 미션은 트라이브가 바뀌어도 본다. 접근을 읽지 못하면 보여 주지 않는다(fail-closed).
  try {
    const tribeAccess = await loadMissionTribeAccess(user.id, [missionId])
    if (!isMissionOpenToUser(tribeAccess, missionId)) {
      const { data: myCompletion } = await service
        .from('user_mission_completions')
        .select('id')
        .eq('mission_id', missionId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!myCompletion) return NextResponse.json({ error: d.missions.missionNotFound }, { status: 404 })
    }
  } catch (err) {
    console.error('[missions/status] 트라이브 접근 조회 오류:', err)
    return NextResponse.json({ error: d.missions.statusLoadError }, { status: 500 })
  }

  // 참가 여부 확인 — 미참가자는 미션 상황 조회 불가
  const { data: myParticipation } = await service
    .from('user_mission_participations')
    .select('user_id')
    .eq('mission_id', missionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!myParticipation) {
    return NextResponse.json({ error: d.missions.statusForbidden }, { status: 403 })
  }

  // 전체 참가자 + 완료자 조회
  const [{ data: participationsRaw }, { data: completionsRaw }] = await Promise.all([
    service.from('user_mission_participations').select('user_id, progress_value').eq('mission_id', missionId),
    service.from('user_mission_completions').select('user_id, completed_at').eq('mission_id', missionId),
  ])

  // 프로덕션에서는 스테이징 전용 테스트 계정을 미션 상황(랭킹/달성)에서 제외한다.
  const excludedIds = excludedTestUserIds()
  const allParticipations = ((participationsRaw ?? []) as { user_id: string; progress_value: number }[])
    .filter((p) => !excludedIds.includes(p.user_id))
    .map((p) => ({ userId: p.user_id, progress_value: p.progress_value }))
  const completions = ((completionsRaw ?? []) as { user_id: string; completed_at: string }[])
    .filter((c) => !excludedIds.includes(c.user_id))

  const completionMap = new Map<string, string>()
  completions.forEach((c) => completionMap.set(c.user_id, c.completed_at))

  // 이용 정지 중인 유저는 다른 유저가 보는 순위·달성자 목록에서 뺀다(티켓 20261019_1311, 운영 로직 13.2절).
  // 본인 화면에는 본인이 계속 보이고, 정지가 풀리면 다시 보인다. 025 배치의 소식 #23도 같은 방식으로 뺀다.
  // 정지 여부를 읽지 못하면 목록을 내리지 않는다 — 정지 중인 유저가 조회 실패 틈에 노출되면 안 된다.
  let suspendedIds: Set<string>
  try {
    suspendedIds = await getSuspendedUserIds(service, allParticipations.map((p) => p.userId))
  } catch (err) {
    console.error('[missions/status] 이용 정지 조회 오류:', err)
    return NextResponse.json({ error: d.missions.statusLoadError }, { status: 500 })
  }
  const participations = filterRankableParticipants(allParticipations, suspendedIds, user.id)

  // 유저 프로필 조회
  const userIds = participations.map((p) => p.userId)
  const { data: usersRaw } = userIds.length > 0
    ? await service.from('users').select('id, username, display_name, avatar_url').in('id', userIds)
    : { data: [] }
  const users = (usersRaw ?? []) as { id: string; username: string | null; display_name: string | null; avatar_url: string | null }[]
  const userMap = new Map<string, { username: string | null; display_name: string | null; avatar_url: string | null }>()
  users.forEach((u) => userMap.set(u.id, { username: u.username, display_name: u.display_name, avatar_url: u.avatar_url }))

  const totalParticipants = participations.length
  const limit = missionRaw.visible_rank_count ?? Number.MAX_SAFE_INTEGER

  // 20260830_0113: 표시 이름 우선, 없으면 username 폴백까지 서버가 미리 계산해 내려준다
  const nameOf = (userId: string) => {
    const u = userMap.get(userId)
    return (u && getDisplayName(u)) || d.profile.anonymous
  }
  // 20260831_2038: 표시용 이름(nameOf)은 display_name 우선이라 라우팅용 username과 다를 수
  // 있다 — 프로필 링크는 반드시 원본 users.username 컬럼값을 그대로 써야 한다(탈퇴 등으로
  // 레코드가 없으면 null → 프런트에서 href를 붙이지 않는다).
  const usernameOf = (userId: string) => userMap.get(userId)?.username ?? null
  const avatarOf = (userId: string) => userMap.get(userId)?.avatar_url ?? null

  // 랭킹형 — isCompleted DESC, completedAt ASC, progressValue DESC
  const ranked: RankingEntry[] = participations
    .map((p) => {
      const completedAt = completionMap.get(p.userId) ?? null
      return {
        userId: p.userId,
        displayName: nameOf(p.userId),
        username: usernameOf(p.userId),
        avatarUrl: avatarOf(p.userId),
        progressValue: p.progress_value ?? 0,
        isCompleted: completedAt !== null,
        completedAt,
        rank: 0,
      }
    })
    // 정렬 규칙은 lib/missions/ranking.ts가 단일 진실이다 — 025 배치의 소식 #23(순위 상승)이
    // 같은 비교 함수를 써야 "5위로 올라섰어요"와 이 화면의 등수가 어긋나지 않는다.
    .sort(compareMissionRank)
    .map((e, i) => ({ ...e, rank: i + 1 }))

  const entries = ranked.slice(0, limit)
  const me = ranked.find((e) => e.userId === user.id) ?? null

  return NextResponse.json({ type: 'ranking', entries, me, totalParticipants })
}
