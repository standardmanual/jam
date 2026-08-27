// POST /api/follows
// 팔로우 추가 (승인 없이 바로 팔로우 — Twitter/X 방식)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createNotification, dailyGroupKey } from '@/lib/notifications'

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
    // @ts-expect-error Supabase insert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 user_follows 스키마와 일치
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

  return NextResponse.json({ ok: true })
}
