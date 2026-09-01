// GET /api/users/[username]/following
// 이 유저가 팔로우하는 사람 목록 (최근 팔로우 순, 최대 100명)
// Auth 선택 — 로그인 시 각 유저에 대한 isFollowing 포함

import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserFollowRow, UserRow } from '@/types/database'
import { excludedTestUserIds } from '@/lib/env/test-accounts'

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
  const { data: targetRaw, error: targetError } = await service
    .from('users')
    .select('id')
    .eq('username', username.toLowerCase())
    .maybeSingle()
  // 20260901_1848: 조회 실패도 !targetRaw로 걸려 404로 위장된다 — 로그로 구분
  if (targetError) console.error('[api/users/[username]/following] 대상 유저(users) 조회 실패', targetError)

  if (!targetRaw) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  const targetId = (targetRaw as { id: string }).id

  // 팔로우 관계: follower_id = targetId → following_id 목록
  const { data: followsRaw, error: followsError } = await service
    .from('user_follows')
    .select('following_id, created_at')
    .eq('follower_id', targetId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (followsError) console.error('[api/users/[username]/following] user_follows 조회 실패', followsError)

  // 프로덕션에서는 스테이징 전용 테스트 계정을 팔로잉 목록에서 제외한다.
  const excludedIds = excludedTestUserIds()
  const follows = ((followsRaw ?? []) as Pick<UserFollowRow, 'following_id' | 'created_at'>[])
    .filter((f) => !excludedIds.includes(f.following_id))
  const userIds = follows.map((f) => f.following_id)

  if (userIds.length === 0) {
    return NextResponse.json({ users: [] })
  }

  // 유저 정보 조회
  const { data: usersRaw, error: usersError } = await service
    .from('users')
    .select('id, username, display_name, avatar_url')
    .in('id', userIds)
  if (usersError) console.error('[api/users/[username]/following] 팔로잉 유저 정보 조회 실패', usersError)

  const userMap = new Map<string, Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url'>>()
  for (const u of (usersRaw ?? []) as Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url'>[]) {
    userMap.set(u.id, u)
  }

  // 로그인 유저가 팔로우 중인 대상 집합
  let followingSet = new Set<string>()
  if (user) {
    const { data: myFollowsRaw, error: myFollowsError } = await service
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .in('following_id', userIds)
    if (myFollowsError) console.error('[api/users/[username]/following] 내 팔로잉 목록 조회 실패', myFollowsError)
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
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        isFollowing: followingSet.has(u.id),
      }
    })
    .filter((u): u is NonNullable<typeof u> => u !== null)

  return NextResponse.json({ users })
}
