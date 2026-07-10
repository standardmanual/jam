'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { KR_REGIONS, type KrRegion, ACTIVITY_TYPE_LABELS, formatRelativeTime } from '@/lib/utils'
import type { ActivityType, UserRow, StravaConnectionRow, Database } from '@/types/database'

type UserUpdate = Database['public']['Tables']['users']['Update']

const ACTIVITIES: { type: ActivityType; emoji: string }[] = [
  { type: 'cycling', emoji: '🚴' },
  { type: 'running', emoji: '🏃' },
  { type: 'hiking', emoji: '🏔️' },
  { type: 'walking', emoji: '🚶' },
]

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserRow | null>(null)
  const [strava, setStrava] = useState<StravaConnectionRow | null>(null)
  const [selectedActivities, setSelectedActivities] = useState<ActivityType[]>([])
  const [selectedRegion, setSelectedRegion] = useState<KrRegion | ''>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const [profileResult, stravaResult] = await Promise.all([
        supabase.from('users').select('*').eq('id', user.id).single(),
        supabase.from('strava_connections').select('*').eq('user_id', user.id).maybeSingle(),
      ])

      const profileData = profileResult.data as UserRow | null
      const stravaData = stravaResult.data as StravaConnectionRow | null

      if (profileData) {
        setProfile(profileData)
        setSelectedActivities(profileData.activity_types ?? [])
        setSelectedRegion((profileData.region as KrRegion) ?? '')
      }
      setStrava(stravaData ?? null)
      setLoading(false)
    }

    load()
  }, [router])

  const toggleActivity = (type: ActivityType) => {
    setSelectedActivities((prev) =>
      prev.includes(type) ? prev.filter((a) => a !== type) : [...prev, type]
    )
  }

  const handleSave = async () => {
    if (selectedActivities.length === 0) {
      setSaveMessage('활동 종목을 1개 이상 선택해주세요.')
      return
    }
    setSaving(true)
    setSaveMessage('')

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const updatePayload: UserUpdate = {
      activity_types: selectedActivities,
      region: selectedRegion || '서울특별시',
    }
    // @ts-expect-error supabase-js 제네릭 추론 이슈
    const { error } = await supabase.from('users').update(updatePayload).eq('id', user.id)

    setSaving(false)
    setSaveMessage(error ? '저장에 실패했어요.' : '저장되었어요!')
  }

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

      {/* 활동 종목 */}
      <section>
        <h2 className="font-black text-base mb-3">활동 종목</h2>
        <div className="grid grid-cols-2 gap-3">
          {ACTIVITIES.map(({ type, emoji }) => {
            const selected = selectedActivities.includes(type)
            return (
              <button
                key={type}
                onClick={() => toggleActivity(type)}
                className={`flex items-center gap-3 rounded-2xl px-4 py-4 border-[3px] border-jam-ink transition-all active:scale-95 text-left ${
                  selected
                    ? 'bg-jam-lime shadow-[3px_3px_0_0_#161616]'
                    : 'bg-white/60'
                }`}
              >
                <span className="text-2xl">{emoji}</span>
                <span className="text-sm font-black">
                  {ACTIVITY_TYPE_LABELS[type]}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* 지역 */}
      <section>
        <h2 className="font-black text-base mb-3">지역</h2>
        <div className="flex flex-wrap gap-2">
          {KR_REGIONS.map((region) => {
            const selected = selectedRegion === region
            const short = region
              .replace('특별시', '')
              .replace('광역시', '')
              .replace('특별자치시', '')
              .replace('특별자치도', '')
              .replace('도', '')
            return (
              <button
                key={region}
                onClick={() => setSelectedRegion(region)}
                className={`px-3.5 py-2 rounded-full text-sm font-bold border-2 border-jam-ink transition-all active:scale-95 ${
                  selected
                    ? 'bg-jam-ink text-white'
                    : 'bg-white/60 text-jam-ink/60'
                }`}
              >
                {short}
              </button>
            )
          })}
        </div>
      </section>

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

      {saveMessage && (
        <p className={`text-sm font-bold text-center ${saveMessage.includes('실패') ? 'text-red-700' : 'text-jam-ink'}`}>
          {saveMessage}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 rounded-2xl bg-jam-ink text-white font-black text-base active:scale-95 transition-all disabled:opacity-40 border-[3px] border-jam-ink shadow-[3px_3px_0_0_rgba(0,0,0,0.3)]"
      >
        {saving ? '저장 중...' : '저장하기'}
      </button>

      <button
        onClick={handleLogout}
        className="w-full py-4 rounded-2xl border-[3px] border-jam-ink text-jam-ink font-black text-base active:scale-95 transition-all bg-white/60"
      >
        로그아웃
      </button>
    </div>
  )
}
