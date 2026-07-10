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
    // @ts-expect-error supabase-js 제네릭 추론 이슈 — update() 파라미터가 never로 추론됨 (Database 타입 개선 필요)
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
      <div className="h-full bg-black flex items-center justify-center">
        <div className="text-gray-400 text-sm">불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-black text-white px-6 py-10">
      {/* 프로필 헤더 */}
      <div className="flex items-center gap-4 mb-10">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt="프로필 이미지"
            className="w-16 h-16 rounded-full object-cover"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-2xl">
            👤
          </div>
        )}
        <div>
          <p className="font-bold text-lg">{profile?.display_name ?? '익명'}</p>
          <p className="text-gray-400 text-sm">{profile?.email}</p>
        </div>
      </div>

      {/* 활동 종목 편집 */}
      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">활동 종목</h2>
        <div className="grid grid-cols-2 gap-3">
          {ACTIVITIES.map(({ type, emoji }) => {
            const selected = selectedActivities.includes(type)
            return (
              <button
                key={type}
                onClick={() => toggleActivity(type)}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl py-5 border-2 transition-all active:scale-95 ${
                  selected
                    ? 'border-white bg-white/10'
                    : 'border-gray-700 bg-gray-900'
                }`}
              >
                <span className="text-2xl">{emoji}</span>
                <span className="text-sm font-semibold">
                  {ACTIVITY_TYPE_LABELS[type]}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* 지역 편집 */}
      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">지역</h2>
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
                className={`px-4 py-2 rounded-full text-sm border transition-all active:scale-95 ${
                  selected
                    ? 'border-white bg-white text-black font-semibold'
                    : 'border-gray-700 text-gray-400'
                }`}
              >
                {short}
              </button>
            )
          })}
        </div>
      </section>

      {/* Strava 연동 상태 */}
      <section className="mb-8 rounded-2xl bg-gray-900 border border-gray-700 p-5">
        <h2 className="text-base font-bold mb-2">Strava 연동</h2>
        {strava ? (
          <div className="text-sm text-gray-400">
            <span className="text-green-400 font-semibold">연동됨</span>
            {strava.last_synced_at && (
              <span className="ml-2">
                · 마지막 동기화: {formatRelativeTime(strava.last_synced_at)}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">연동 안됨</span>
            <a
              href="/api/strava/auth"
              className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold active:scale-95 transition-transform"
            >
              Strava 연동하기
            </a>
          </div>
        )}
      </section>

      {/* 저장 메시지 */}
      {saveMessage && (
        <p
          className={`text-sm text-center mb-4 ${
            saveMessage.includes('실패') ? 'text-red-400' : 'text-green-400'
          }`}
        >
          {saveMessage}
        </p>
      )}

      {/* 저장 버튼 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 rounded-2xl bg-white text-black font-bold text-base mb-4 active:scale-95 transition-transform disabled:opacity-50"
      >
        {saving ? '저장 중...' : '저장하기'}
      </button>

      {/* 로그아웃 */}
      <button
        onClick={handleLogout}
        className="w-full py-4 rounded-2xl border border-gray-700 text-gray-400 text-base active:scale-95 transition-transform"
      >
        로그아웃
      </button>
    </div>
  )
}
