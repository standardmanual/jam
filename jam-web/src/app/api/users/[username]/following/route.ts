// GET /api/users/[username]/following
// 이 유저가 팔로우하는 사람 목록 (최근 팔로우 순, 최대 100명)
// Auth 선택 — 로그인 시 각 유저에 대한 isFollowing 포함

import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserFollowRow, UserRow } from '@/types/database'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params

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

  // 팔로우 관계: follower_id = targetId → following_id 목록
  const { data: followsRaw } = await service
    .from('user_follows')
    .select('following_id, created_at')
    .eq('follower_id', targetId)
    .order('created_at', { ascending: false })
    .limit(100)

  const follows = (followsRaw ?? []) as Pick<UserFollowRow, 'following_id' | 'created_at'>[]
  const userIds = follows.map((f) => f.following_id)

  if (userIds.length === 0) {
    return NextResponse.json({ users: [] })
  }

  // 유저 정보 조회
  const { data: usersRaw } = await service
    .from('users')
    .select('id, username, avatar_url')
    .in('id', userIds)

  const userMap = new Map<string, Pick<UserRow, 'id' | 'username' | 'avatar_url'>>()
  for (const u of (usersRaw ?? []) as Pick<UserRow, 'id' | 'username' | 'avatar_url'>[]) {
    userMap.set(u.id, u)
  }

  // 로그인 유저가 팔로우 중인 대상 집합
  let followingSet = new Set<string>()
  if (user) {
    const { data: myFollowsRaw } = await service
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .in('following_id', userIds)
    followingSet = new Set(
      ((myFollowsRaw ?? []) as Pick<UserFollowRow, 'following_id'>[]).map((f) => f.following_id)
    )
  }

  // follows 순서(최근순) 유지
  const users = follows
    .map((f) => {
      const u = userMap.get(f.following_id)
      if (!u) return null
      return {
        id: u.id,
        username: u.username,
        avatar_url: u.avatar_url,
        isFollowing: followingSet.has(u.id),
      }
    })
    .filter((u): u is NonNullable<typeof u> => u !== null)

  return NextResponse.json({ users })
}
