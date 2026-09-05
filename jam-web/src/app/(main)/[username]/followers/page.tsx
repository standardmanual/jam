import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { FollowButton } from '../FollowButton'
import ListRowCard from '@/components/ui/ListRowCard'
import TopNav from '@/components/ui/TopNav'
import { UserIcon, UsersIcon } from '@/components/ui/icons'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { d, t } from '@/lib/i18n'
import { excludedTestUserIds } from '@/lib/env/test-accounts'
import { getDisplayName } from '@/lib/utils'

interface Props {
  params: Promise<{ username: string }>
}

export default async function FollowersPage({ params }: Props) {
  const { username } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  // username → userId
  const { data: targetRaw, error: targetError } = await service
    .from('users')
    .select('id, username, display_name')
    .eq('username', username.toLowerCase())
    .maybeSingle()
  // 20260901_1848: 조회 실패도 !targetRaw로 걸려 404(notFound)로 위장된다 — 로그로 구분
  if (targetError) console.error('[followers/page] 대상 유저(users) 조회 실패', targetError)
  if (!targetRaw) notFound()
  const target = targetRaw as { id: string; username: string; display_name: string | null }
  const isOwnProfile = target.id === user.id
  const subjectName = getDisplayName(target) || d.profile.anonymous

  // 팔로워 목록
  const { data: followsRaw, error: followsError } = await service
    .from('user_follows')
    .select('follower_id, created_at')
    .eq('following_id', target.id)
    .order('created_at', { ascending: false })
    .limit(100)
  if (followsError) console.error('[followers/page] user_follows(팔로워) 조회 실패', followsError)

  // 프로덕션에서는 스테이징 전용 테스트 계정을 팔로워 목록에서 제외한다.
  const excludedIds = excludedTestUserIds()
  const follows = ((followsRaw ?? []) as { follower_id: string; created_at: string }[])
    .filter((f) => !excludedIds.includes(f.follower_id))
  const followerIds = follows.map((f) => f.follower_id)

  const usersMap: Record<string, { id: string; username: string | null; display_name: string | null; avatar_url: string | null }> = {}
  if (followerIds.length > 0) {
    const { data: usersRaw, error: usersError } = await service
      .from('users')
      .select('id, username, display_name, avatar_url')
      .in('id', followerIds)
    if (usersError) console.error('[followers/page] 팔로워 유저 정보 조회 실패', usersError)
    for (const u of (usersRaw ?? []) as { id: string; username: string | null; display_name: string | null; avatar_url: string | null }[]) {
      usersMap[u.id] = u
    }
  }

  // 내가 팔로우 중인 사람들
  const { data: myFollowsRaw, error: myFollowsError } = await service
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', user.id)
  if (myFollowsError) console.error('[followers/page] 내 팔로잉 목록 조회 실패', myFollowsError)
  const myFollowing = new Set((myFollowsRaw ?? []).map((f: { following_id: string }) => f.following_id))

  const followerList = follows
    .map((f) => ({
      ...usersMap[f.follower_id],
      isFollowing: myFollowing.has(f.follower_id),
    }))
    .filter((u) => u.id)

  return (
    <div className="min-h-full bg-surface text-text">
      <TopNav title={getDisplayName(target)} backHref={`/${username}`} />

      <div className="px-[var(--spacing-16)] pt-0 pb-[var(--spacing-32)] flex flex-col gap-[var(--spacing-16)]">
        {followerList.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="w-8 h-8" />}
            title={isOwnProfile ? d.social.emptyFollowers : t(d.social.emptyFollowersOther, { name: subjectName })}
            description={isOwnProfile ? d.social.emptyFollowersBody : undefined}
          />
        ) : (
          followerList.map((u) => (
            <ListRowCard
              key={u.id}
              trailing={u.id !== user.id ? <FollowButton targetUserId={u.id} initialFollowing={u.isFollowing} /> : undefined}
            >
              <Link href={`/${u.username}`} className="flex items-center gap-[var(--spacing-16)] flex-1 min-w-0 active:opacity-70 transition-opacity">
                {u.avatar_url ? (
                  <Image src={u.avatar_url} alt={getDisplayName(u)} width={40} height={40} className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-text/50" />
                  </div>
                )}
                <span className="text-[length:var(--text-body)] leading-[var(--leading-body)] truncate">{getDisplayName(u)}</span>
              </Link>
            </ListRowCard>
          ))
        )}
      </div>
    </div>
  )
}
