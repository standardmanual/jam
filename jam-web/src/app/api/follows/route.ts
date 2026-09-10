// POST /api/follows
// 팔로우 추가 (승인 없이 바로 팔로우 — Twitter/X 방식)

import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification, dailyGroupKey } from '@/lib/notifications'
import { evaluateUsageBadges } from '@/lib/badge-engine/usageBadges'
import { buildEarnedBadgePayload, notifyActivityBadgesEarned, type EarnedBadgeSummary } from '@/lib/strava/sync'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { target_user_id?: string }
  const targetUserId = body.target_user_id

  if (!targetUserId) {
    return NextResponse.json({ error: 'MISSING_TARGET' }, { status: 400 })
  }

  // 자기 자신 팔로우 방지 (DB CHECK와 이중 검증)
  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'SELF_FOLLOW' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_follows')
    .insert({ follower_id: user.id, following_id: targetUserId })

  if (error) {
    // 중복 팔로우 (unique 위반)
    if (error.code === '23505') {
      return NextResponse.json({ ok: true, already: true })
    }
    console.error('[follows] insert 오류:', error.message)
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
  }

  // 소식 #26(팔로우) — 티켓 20260824_019 → 20260827_014
  //
  // 받는 사람은 **팔로우당한 쪽**(targetUserId)이다. 팔로우한 본인에게는 만들지 않는다
  // (PRD §2-2 "자기 행동의 메아리를 넣지 않는다" — 방금 버튼을 눌러 결과를 봤다).
  //
  // #27(맞팔 성립)은 제거됐다. 맞팔은 유저가 방금 자기 손으로 성립시킨 결과라 같은
  // §2-2에 해당한다. 다만 **그냥 지우면 소식이 통째로 사라지는 경우**가 생긴다 —
  // 기존 로직은 맞팔 시 `mutual_follow` 하나만 만들고 `followed`를 만들지 않았다.
  //
  //   내가 먼저 팔로우 → 상대가 되팔로우 : 상대의 행동이므로 나에게 `followed`가 필요하다
  //   상대가 먼저 팔로우 → 내가 되팔로우 : 내 행동이라 **나에게는** 소식이 없다(원래 없다)
  //
  // 두 경우 모두 "팔로우당한 쪽에 `followed`"로 정리된다. 맞팔 여부를 따질 필요가 없어
  // 역방향 조회도 함께 제거했다.
  await createNotification({
    userId: targetUserId,
    type: 'followed',
    actorUserId: user.id,
    // 24시간 묶음 — "예린님 외 3명이 팔로우해요"
    groupKey: dailyGroupKey('followed'),
    payload: { actor_ids: [user.id] },
    // 이름 2명까지 나열(PRD §3 L2)하려면 actor_user_id 1개로는 부족하다.
    // 중복 제거된 actor_ids의 길이가 곧 actor_count(고유 인원)가 된다 — 언팔 후
    // 재팔로우가 인원을 부풀리지 않는다.
    appendKeys: ['actor_ids'],
  })

  // JAM! 카테고리 — 서비스 사용량 배지 (티켓 20260910_1557).
  //
  // 팔로우 성공(신규 insert, 중복 아님) 직후 **양쪽 유저**를 평가한다 — 팔로우한 사람
  // (user.id)의 following_count, 팔로우당한 사람(targetUserId)의 follower_count. 각각
  // 독립적으로 try/catch로 감싸 한쪽이 실패해도 다른 쪽·원본 팔로우 응답(200)에 영향을
  // 주지 않는다. 응답에는 **팔로우한 사람 본인**이 이번 액션으로 획득한 배지만 싣는다
  // (팔로우당한 사람의 획득 정보는 싣지 않음 — §2-2 자기 행동의 메아리 원칙과 동일한 이유로
  // 프론트 노출 대상이 아니다).
  let earnedBadges: EarnedBadgeSummary[] = []
  // SyncButton(/api/strava/sync)과 동일한 계약을 맞춘다 — buildEarnedBadgePayload가 이미
  // 계산해두는 값인데 이전까지는 응답에서 누락돼 있었다 (티켓 20260910_2056).
  let earnedBadgesMore = 0
  let isFirstBadgeEver = false
  try {
    const { count: followingCount } = await supabase
      .from('user_follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', user.id)
    const actorEarned = await evaluateUsageBadges(user.id, 'following_count', followingCount ?? 0)
    if (actorEarned.length > 0) {
      const service = createServiceClient()
      const payload = await buildEarnedBadgePayload(service, actorEarned.map((b) => b.id), user.id)
      earnedBadges = payload.earnedBadges
      earnedBadgesMore = payload.earnedBadgesMore
      isFirstBadgeEver = payload.isFirstBadgeEver
      // 알림함 반영 (티켓 20260910_2258) — 동기화 경로(sync.ts)가 쓰는 결산 함수를 그대로
      // 재사용한다. 새 NotificationType 없이 기존 activity_recap 문구·아이콘 그대로 나간다.
      // activityIds는 빈 배열 — 팔로우 액션에는 귀속시킬 Strava 활동이 없다.
      await notifyActivityBadgesEarned(service, user.id, actorEarned.map((b) => b.id), [])
    }
  } catch (usageBadgeError) {
    console.error('[follows] following_count 사용량 배지 평가 실패:', usageBadgeError)
  }

  try {
    const { count: followerCount } = await supabase
      .from('user_follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', targetUserId)
    const targetEarned = await evaluateUsageBadges(targetUserId, 'follower_count', followerCount ?? 0)
    if (targetEarned.length > 0) {
      // 팔로우당한 사람(targetUserId) 본인에게 알림 — §2-2 "자기 행동의 메아리" 원칙은
      // 팔로우한 사람(user.id)에게만 적용된다. targetUserId는 이 액션을 스스로 하지
      // 않았으므로 배지 획득 알림을 받아야 정상이다.
      const service = createServiceClient()
      await notifyActivityBadgesEarned(service, targetUserId, targetEarned.map((b) => b.id), [])
    }
  } catch (usageBadgeError) {
    console.error('[follows] follower_count 사용량 배지 평가 실패:', usageBadgeError)
  }

  return NextResponse.json({ ok: true, earnedBadges, earnedBadgesMore, isFirstBadgeEver })
}
