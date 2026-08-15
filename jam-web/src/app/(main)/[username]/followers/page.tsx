import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { FollowButton } from '../FollowButton'
import ListRowCard from '@/components/ui/ListRowCard'
import TopNav from '@/components/ui/TopNav'
import { UserIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'

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
  const { data: targetRaw } = await service
    .from('users')
    .select('id, username')
    .eq('username', username.toLowerCase())
    .maybeSingle()
  if (!targetRaw) notFound()
  const target = targetRaw as { id: string; username: string }

  // 팔로워 목록
  const { data: followsRaw } = await service
    .from('user_follows')
    .select('follower_id, created_at')
    .eq('following_id', target.id)
    .order('created_at', { ascending: false })
    .limit(100)

  const follows = (followsRaw ?? []) as { follower_id: string; created_at: string }[]
  const followerIds = follows.map((f) => f.follower_id)

  const usersMap: Record<string, { id: string; username: string | null; avatar_url: string | null }> = {}
  if (followerIds.length > 0) {
    const { data: usersRaw } = await service
      .from('users')
      .select('id, username, avatar_url')
      .in('id', followerIds)
    for (const u of (usersRaw ?? []) as { id: string; username: string | null; avatar_url: string | null }[]) {
      usersMap[u.id] = u
    }
  }

  // 내가 팔로우 중인 사람들
  const { data: myFollowsRaw } = await service
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', user.id)
  const myFollowing = new Set((myFollowsRaw ?? []).map((f: { following_id: string }) => f.following_id))

  const followerList = follows
    .map((f) => ({
      ...usersMap[f.follower_id],
      isFollowing: myFollowing.has(f.follower_id),
    }))
    .filter((u) => u.id)

  return (
    <div className="min-h-full bg-surface text-text">
      <TopNav title={t(d.social.followersCount, { count: followerList.length })} backHref={`/${username}`} />

      <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)] pb-[var(--spacing-32)] flex flex-col gap-[var(--spacing-16)]">
        {followerList.length === 0 ? (
          <div className="text-center py-[var(--spacing-40)]">
            <p className="text-text/50 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{d.social.emptyFollowers}</p>
          </div>
        ) : (
          followerList.map((u) => (
            <ListRowCard
              key={u.id}
              trailing={u.id !== user.id ? <FollowButton targetUserId={u.id} initialFollowing={u.isFollowing} /> : undefined}
            >
              <Link href={`/${u.username}`} className="flex items-center gap-[var(--spacing-16)] flex-1 min-w-0 active:opacity-70 transition-opacity">
                {u.avatar_url ? (
                  <Image src={u.avatar_url} alt={u.username ?? ''} width={40} height={40} className="w-10 h-10 rounded-full object-cover shrink-0 shadow-[inset_0_0_0_1px_var(--color-border)]" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-text/50" />
                  </div>
                )}
                <span className="text-[length:var(--text-body)] leading-[var(--leading-body)] truncate">{u.username}</span>
              </Link>
            </ListRowCard>
          ))
        )}
      </div>
    </div>
  )
}
