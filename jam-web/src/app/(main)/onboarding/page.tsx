'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { KR_REGIONS, type KrRegion, ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import type { ActivityType, Database } from '@/types/database'

type UserUpdate = Database['public']['Tables']['users']['Update']

const ACTIVITIES: { type: ActivityType; emoji: string }[] = [
  { type: 'cycling', emoji: '🚴' },
  { type: 'running', emoji: '🏃' },
  { type: 'hiking', emoji: '🏔️' },
  { type: 'walking', emoji: '🚶' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [selectedActivities, setSelectedActivities] = useState<ActivityType[]>([])
  const [selectedRegion, setSelectedRegion] = useState<KrRegion | ''>('')
  const [loading, setLoading] = useState(false)
  const [validationError, setValidationError] = useState('')

  const toggleActivity = (type: ActivityType) => {
    setSelectedActivities((prev) =>
      prev.includes(type) ? prev.filter((a) => a !== type) : [...prev, type]
    )
  }

  const handleSubmit = async () => {
    if (selectedActivities.length === 0) {
      setValidationError('활동 종목을 1개 이상 선택해주세요.')
      return
    }
    setValidationError('')
    setLoading(true)

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

    if (error) {
      console.error('[JAM!] 온보딩 저장 오류:', error.message)
      setValidationError('저장에 실패했어요. 다시 시도해주세요.')
      setLoading(false)
      return
    }

    router.push('/')
  }

  return (
    <div className="min-h-full bg-black text-white flex flex-col px-6 py-10">
      <div className="flex-1">
        <h1 className="text-2xl font-black mb-2">어떤 활동을 즐기세요?</h1>
        <p className="text-gray-400 text-sm mb-8">복수 선택 가능해요.</p>

        {/* 활동 종목 선택 */}
        <div className="grid grid-cols-2 gap-3 mb-10">
          {ACTIVITIES.map(({ type, emoji }) => {
            const selected = selectedActivities.includes(type)
            return (
              <button
                key={type}
                onClick={() => toggleActivity(type)}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl py-6 border-2 transition-all active:scale-95 ${
                  selected
                    ? 'border-white bg-white/10'
                    : 'border-gray-700 bg-gray-900'
                }`}
              >
                <span className="text-3xl">{emoji}</span>
                <span className="text-sm font-semibold">
                  {ACTIVITY_TYPE_LABELS[type]}
                </span>
              </button>
            )
          })}
        </div>

        {/* 지역 선택 */}
        <div>
          <h2 className="text-lg font-bold mb-3">지역을 선택하세요</h2>
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
        </div>
      </div>

      {/* 에러 메시지 */}
      {validationError && (
        <p className="text-red-400 text-sm text-center mb-4">{validationError}</p>
      )}

      {/* 시작하기 버튼 */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-4 rounded-2xl bg-white text-black font-bold text-base active:scale-95 transition-transform disabled:opacity-50"
      >
        {loading ? '저장 중...' : '시작하기'}
      </button>
    </div>
  )
}
