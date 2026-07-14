// GET /api/users/[username]/stats
// 프로필 통계 바: 팔로워/팔로잉/뱃지/아이템북 수 + isFollowing
// Auth 선택 (비로그인도 조회 가능, isFollowing은 false)

import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params

  // 로그인 유저 확인 (선택)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const service = createServiceClient()

  // username → userId
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetRaw } = await (service as any)
    .from('users')
    .select('id')
    .eq('username', username.toLowerCase())
    .maybeSingle()

  if (!targetRaw) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  const targetId = (targetRaw as { id: string }).id

  const [
    { count: followerCount },
    { count: followingCount },
    { count: badgeCount },
    { count: itemBookCount },
    followingRes,
  ] = await Promise.all([
    // 팔로워 수: 나를 팔로우하는 사람
    service
      .from('user_follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', targetId),
    // 팔로잉 수: 내가 팔로우하는 사람
    service
      .from('user_follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', targetId),
    // 뱃지 수
    service
      .from('user_activity_badges')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', targetId),
    // 아이템북 수 (완성한 아이템북 기준 — item_books는 유저 소유 개념이 없음)
    service
      .from('user_item_book_completions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', targetId),
    // 로그인 유저가 이 유저를 팔로우 중인지
    user && user.id !== targetId
      ? service
          .from('user_follows')
          .select('id', { head: true, count: 'exact' })
          .eq('follower_id', user.id)
          .eq('following_id', targetId)
      : Promise.resolve({ count: 0 }),
  ])

  const isFollowing = (followingRes.count ?? 0) > 0

  return NextResponse.json({
    followerCount: followerCount ?? 0,
    followingCount: followingCount ?? 0,
    badgeCount: badgeCount ?? 0,
    itemBookCount: itemBookCount ?? 0,
    isFollowing,
  })
}
