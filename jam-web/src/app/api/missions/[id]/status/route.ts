import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { MissionStatusDisplayType } from '@/types/database'
import { compareMissionRank } from '@/lib/missions/ranking'
import { excludedTestUserIds } from '@/lib/env/test-accounts'

type Params = { params: Promise<{ id: string }> }

interface RankingEntry {
  userId: string
  username: string
  avatarUrl: string | null
  progressValue: number
  isCompleted: boolean
  completedAt: string | null
  rank: number
}

interface AchievementEntry {
  userId: string
  username: string
  avatarUrl: string | null
  achieved: boolean
  achievedAt: string | null
}

interface IndividualStatus {
  progressValue: number
  achieved: boolean
  achievedAt: string | null
}

// GET /api/missions/[id]/status — 미션 상황(랭킹형/달성형). 참가자 전용(미참가 403).
export async function GET(_req: Request, { params }: Params) {
  const { id: missionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const service = createServiceClient()

  // 미션 조회
  const { data: missionRaw } = await service
    .from('missions')
    .select('id, status_display_type, visible_rank_count')
    .eq('id', missionId)
    .maybeSingle() as { data: { id: string; status_display_type: MissionStatusDisplayType; visible_rank_count: number | null } | null }

  if (!missionRaw) return NextResponse.json({ error: '미션을 찾을 수 없어요.' }, { status: 404 })

  // 참가 여부 확인 — 미참가자는 미션 상황 조회 불가
  const { data: myParticipation } = await service
    .from('user_mission_participations')
    .select('user_id')
    .eq('mission_id', missionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!myParticipation) {
    return NextResponse.json({ error: '참가한 유저만 미션 상황을 볼 수 있어요.' }, { status: 403 })
  }

  // 개인형 — 티켓 20260813_001: 다른 참가자 조회 없이 본인 진행상황/달성여부만 반환
  if (missionRaw.status_display_type === 'individual') {
    const [{ data: myParticipationFull }, { data: myCompletion }] = await Promise.all([
      service.from('user_mission_participations').select('progress_value').eq('mission_id', missionId).eq('user_id', user.id).maybeSingle(),
      service.from('user_mission_completions').select('completed_at').eq('mission_id', missionId).eq('user_id', user.id).maybeSingle(),
    ])
    const progressValue = (myParticipationFull as { progress_value: number } | null)?.progress_value ?? 0
    const achievedAt = (myCompletion as { completed_at: string } | null)?.completed_at ?? null

    const individual: IndividualStatus = { progressValue, achieved: achievedAt !== null, achievedAt }
    return NextResponse.json({ type: 'individual', me: individual })
  }

  // 전체 참가자 + 완료자 조회
  const [{ data: participationsRaw }, { data: completionsRaw }] = await Promise.all([
    service.from('user_mission_participations').select('user_id, progress_value').eq('mission_id', missionId),
    service.from('user_mission_completions').select('user_id, completed_at').eq('mission_id', missionId),
  ])

  // 프로덕션에서는 스테이징 전용 테스트 계정을 미션 상황(랭킹/달성)에서 제외한다.
  const excludedIds = excludedTestUserIds()
  const participations = ((participationsRaw ?? []) as { user_id: string; progress_value: number }[])
    .filter((p) => !excludedIds.includes(p.user_id))
  const completions = ((completionsRaw ?? []) as { user_id: string; completed_at: string }[])
    .filter((c) => !excludedIds.includes(c.user_id))

  const completionMap = new Map<string, string>()
  completions.forEach((c) => completionMap.set(c.user_id, c.completed_at))

  // 유저 프로필 조회
  const userIds = participations.map((p) => p.user_id)
  const { data: usersRaw } = userIds.length > 0
    ? await service.from('users').select('id, username, avatar_url').in('id', userIds)
    : { data: [] }
  const users = (usersRaw ?? []) as { id: string; username: string | null; avatar_url: string | null }[]
  const userMap = new Map<string, { username: string | null; avatar_url: string | null }>()
  users.forEach((u) => userMap.set(u.id, { username: u.username, avatar_url: u.avatar_url }))

  const totalParticipants = participations.length
  const limit = missionRaw.visible_rank_count ?? Number.MAX_SAFE_INTEGER

  const nameOf = (userId: string) => userMap.get(userId)?.username ?? '익명'
  const avatarOf = (userId: string) => userMap.get(userId)?.avatar_url ?? null

  if (missionRaw.status_display_type === 'achievement') {
    // 달성형 — 순위 없음, 달성자 우선 정렬(먼저 달성한 순)
    const all: AchievementEntry[] = participations.map((p) => {
      const achievedAt = completionMap.get(p.user_id) ?? null
      return {
        userId: p.user_id,
        username: nameOf(p.user_id),
        avatarUrl: avatarOf(p.user_id),
        achieved: achievedAt !== null,
        achievedAt,
      }
    })
    all.sort((a, b) => {
      if (a.achieved !== b.achieved) return a.achieved ? -1 : 1
      if (a.achieved && b.achieved) return (a.achievedAt ?? '').localeCompare(b.achievedAt ?? '')
      return 0
    })

    const entries = all.slice(0, limit)
    const me = all.find((e) => e.userId === user.id) ?? null

    return NextResponse.json({ type: 'achievement', entries, me, totalParticipants })
  }

  // 랭킹형 — isCompleted DESC, completedAt ASC, progressValue DESC
  const ranked: RankingEntry[] = participations
    .map((p) => {
      const completedAt = completionMap.get(p.user_id) ?? null
      return {
        userId: p.user_id,
        username: nameOf(p.user_id),
        avatarUrl: avatarOf(p.user_id),
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
