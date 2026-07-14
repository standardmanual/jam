import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: Props) {
  const { username } = await params
  return {
    title: `${username} — JAM!`,
  }
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params
  const service = createServiceClient()

  type ProfileData = { id: string; username: string | null; avatar_url: string | null; created_at: string }

  // username은 소문자로 저장됨 — 대소문자 무관 접근 허용
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profileRaw } = await (service as any)
    .from('users')
    .select('id, username, avatar_url, created_at')
    .eq('username', username.toLowerCase())
    .maybeSingle()

  const profile = profileRaw as ProfileData | null
  if (!profile) notFound()

  // 획득한 활동 배지
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: badgesRaw } = await (service as any)
    .from('user_activity_badges')
    .select('earned_at, badges(id, name, image_url, rarity)')
    .eq('user_id', profile.id)
    .order('earned_at', { ascending: false })
    .limit(60)

  type BadgeRef = { id: string; name: string; image_url: string | null; rarity: string }
  type BadgeRow = { earned_at: string; badges: BadgeRef | null }

  const badges = ((badgesRaw ?? []) as BadgeRow[]).map((row) => ({
    earned_at: row.earned_at,
    badge: row.badges,
  })).filter((r): r is { earned_at: string; badge: BadgeRef } => r.badge !== null)

  return (
    <div className="min-h-full bg-jam-cream px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-24">
      {/* 프로필 헤더 */}
      <div className="flex flex-col items-center text-center mb-8 pt-4">
        <div className="w-24 h-24 rounded-full overflow-hidden border-[3px] border-jam-ink shadow-[4px_4px_0_0_#161616] mb-4 bg-white flex items-center justify-center">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.username ?? username}
              width={96}
              height={96}
              className="object-cover w-full h-full"
            />
          ) : (
            <span className="text-4xl">👤</span>
          )}
        </div>
        <h1 className="text-2xl font-black text-jam-ink">{profile.username}</h1>
        <p className="text-jam-ink/40 text-xs font-semibold mt-1">
          {new Date(profile.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })} 가입
        </p>

        {/* 통계 */}
        <div className="flex gap-6 mt-4">
          <div className="text-center">
            <p className="text-2xl font-black text-jam-ink">{badges.length}</p>
            <p className="text-xs text-jam-ink/50 font-bold">획득 배지</p>
          </div>
        </div>
      </div>

      {/* 구분선 */}
      <div className="border-t-[2px] border-jam-ink/10 mb-6" />

      {/* 배지 그리드 */}
      {badges.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-5xl mb-3">🏅</span>
          <p className="text-jam-ink/50 font-bold text-sm">아직 획득한 배지가 없어요</p>
        </div>
      ) : (
        <>
          <p className="text-[10px] font-black text-jam-ink/40 uppercase tracking-widest mb-3">획득 배지</p>
          <div className="grid grid-cols-3 gap-3">
            {badges.map((r: { earned_at: string; badge: BadgeRef }, i: number) => {
              const b = r.badge
              return (
                <Link
                  key={`${b.id}-${i}`}
                  href={`/badges/${b.id}`}
                  className="flex flex-col items-center bg-white border-[2px] border-jam-ink/20 rounded-2xl p-3 gap-2 active:scale-95 transition-transform"
                >
                  <div className="w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center bg-jam-cream">
                    {b.image_url ? (
                      <Image
                        src={b.image_url}
                        alt={b.name}
                        width={80}
                        height={80}
                        className="object-contain w-full h-full p-1"
                      />
                    ) : (
                      <span className="text-3xl">🏅</span>
                    )}
                  </div>
                  <p className="text-[11px] text-jam-ink text-center leading-tight line-clamp-2 font-bold w-full">
                    {b.name}
                  </p>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
