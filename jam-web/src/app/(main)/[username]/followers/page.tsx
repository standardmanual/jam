import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { FollowButton } from '../FollowButton'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetRaw } = await (service as any)
    .from('users')
    .select('id, username')
    .eq('username', username.toLowerCase())
    .maybeSingle()
  if (!targetRaw) notFound()
  const target = targetRaw as { id: string; username: string }

  // 팔로워 목록
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: followsRaw } = await (service as any)
    .from('user_follows')
    .select('follower_id, created_at')
    .eq('following_id', target.id)
    .order('created_at', { ascending: false })
    .limit(100)

  const follows = (followsRaw ?? []) as { follower_id: string; created_at: string }[]
  const followerIds = follows.map((f) => f.follower_id)

  const usersMap: Record<string, { id: string; username: string | null; avatar_url: string | null }> = {}
  if (followerIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: usersRaw } = await (service as any)
      .from('users')
      .select('id, username, avatar_url')
      .in('id', followerIds)
    for (const u of (usersRaw ?? []) as { id: string; username: string | null; avatar_url: string | null }[]) {
      usersMap[u.id] = u
    }
  }

  // 내가 팔로우 중인 사람들
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: myFollowsRaw } = await (service as any)
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
    <div className="min-h-full bg-jam-cream">
      <div className="sticky top-0 bg-jam-cream border-b-[2px] border-jam-ink px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3 flex items-center gap-3 z-10">
        <Link href={`/${username}`} className="font-black text-jam-ink text-xl">←</Link>
        <h1 className="font-black text-lg text-jam-ink">팔로워 {followerList.length}명</h1>
      </div>

      <div className="px-5 py-4 flex flex-col gap-3">
        {followerList.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-jam-ink/50 font-bold text-sm">팔로워가 없어요</p>
          </div>
        ) : (
          followerList.map((u) => (
            <div key={u.id} className="flex items-center gap-3 bg-white border-[2px] border-jam-ink rounded-2xl px-4 py-3 shadow-[2px_2px_0_0_#161616]">
              <Link href={`/${u.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                {u.avatar_url ? (
                  <Image src={u.avatar_url} alt={u.username ?? ''} width={40} height={40} className="w-10 h-10 rounded-full object-cover border-[2px] border-jam-ink shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-jam-cream border-[2px] border-jam-ink flex items-center justify-center text-lg shrink-0">👤</div>
                )}
                <span className="font-black text-sm text-jam-ink truncate">{u.username}</span>
              </Link>
              {u.id !== user.id && (
                <FollowButton targetUserId={u.id} initialFollowing={u.isFollowing} />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
