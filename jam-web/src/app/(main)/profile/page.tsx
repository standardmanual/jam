'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeTime } from '@/lib/utils'
import type { UserRow, StravaConnectionRow } from '@/types/database'

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserRow | null>(null)
  const [strava, setStrava] = useState<StravaConnectionRow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const [profileResult, stravaResult] = await Promise.all([
        supabase.from('users').select('*').eq('id', user.id).single(),
        supabase.from('strava_connections').select('*').eq('user_id', user.id).maybeSingle(),
      ])

      setProfile((profileResult.data as UserRow | null))
      setStrava((stravaResult.data as StravaConnectionRow | null))
      setLoading(false)
    }

    load()
  }, [router])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="h-full bg-jam-pink flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-jam-ink border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-jam-pink text-jam-ink px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-10 flex flex-col gap-6">
      {/* 프로필 헤더 */}
      <div className="flex items-center gap-4">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt="프로필"
            className="w-16 h-16 rounded-2xl object-cover border-[3px] border-jam-ink"
          />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-white border-[3px] border-jam-ink flex items-center justify-center text-2xl">
            👤
          </div>
        )}
        <div>
          <p className="font-black text-xl">{profile?.display_name ?? '익명'}</p>
          <p className="text-jam-ink/60 text-sm font-semibold">{profile?.email}</p>
        </div>
      </div>

      {/* Strava 연동 */}
      <section className="bg-jam-cream rounded-3xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-5">
        <h2 className="font-black text-base mb-3">Strava 연동</h2>
        {strava ? (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FC4C02] border border-jam-ink" />
            <span className="text-sm font-black text-[#FC4C02]">연동됨</span>
            {strava.last_synced_at && (
              <span className="text-sm text-jam-ink/50 font-semibold ml-1">
                · {formatRelativeTime(strava.last_synced_at)}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-jam-ink/50 font-semibold">연동 안됨</span>
            <a
              href="/api/strava/auth"
              className="px-4 py-2 rounded-xl bg-[#FC4C02] text-white text-sm font-black active:scale-95 transition-transform border-2 border-jam-ink"
            >
              Strava 연동
            </a>
          </div>
        )}
      </section>

      <button
        onClick={handleLogout}
        className="w-full py-4 rounded-2xl border-[3px] border-jam-ink text-jam-ink font-black text-base active:scale-95 transition-all bg-white/60"
      >
        로그아웃
      </button>
    </div>
  )
}
