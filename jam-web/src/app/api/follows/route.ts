// POST /api/follows
// 팔로우 추가 (승인 없이 바로 팔로우 — Twitter/X 방식)

import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
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

  // 소식 #26(팔로우) / #27(맞팔 성립) — 티켓 20260824_019
  //
  // 받는 사람은 **팔로우당한 쪽**(targetUserId)이다. 팔로우한 본인에게는 만들지 않는다
  // (PRD §2-2 "자기 행동의 메아리를 넣지 않는다" — 방금 버튼을 눌러 결과를 봤다).
  //
  // #26/#27 순서 판단: 상대가 이미 나를 팔로우 중이었다면 맞팔이 성립하므로
  // **`mutual_follow` 하나만 남기고 `followed`는 만들지 않는다.** 같은 사건
  // ("A가 B를 팔로우했다")이 알림함에 두 줄로 보이는 걸 막는 판단으로, PRD §3 ④의
  // "#22는 완료와 보상을 한 건으로 합친다 — 따로 보내면 같은 사건이 두 줄로 보인다"와
  // 같은 원칙이다. 둘 중 맞팔이 더 강한 신호(개별·압축 금지)라 그쪽을 남긴다.
  const service = createServiceClient()
  const { data: reverseFollow, error: reverseError } = await service
    .from('user_follows')
    .select('id')
    .eq('follower_id', targetUserId)
    .eq('following_id', user.id)
    .maybeSingle()

  if (reverseError) {
    // 맞팔 여부를 못 읽어도 팔로우 자체는 이미 성공했다 — 소식만 포기하고 진행
    console.error('[follows] 맞팔 여부 조회 오류 — 소식 생성 생략:', reverseError)
  } else if (reverseFollow) {
    await createNotification({
      userId: targetUserId,
      type: 'mutual_follow',
      actorUserId: user.id,
      // 개별 소식 (L1 압축 금지)
    })
  } else {
    await createNotification({
      userId: targetUserId,
      type: 'followed',
      actorUserId: user.id,
      // 24시간 묶음 — "예린님 외 3명이 시현님을 팔로우해요"
      groupKey: dailyGroupKey('followed'),
    })
  }

  return NextResponse.json({ ok: true })
}
