'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import type { MissionRow, MissionCondition } from '@/types/database'

interface Props {
  mission: MissionRow
  isParticipating: boolean
  isCompleted: boolean
  progressValue: number
}

const rewardTypeLabel: Record<string, string> = {
  badge: '배지',
  points: 'JAM 포인트',
  item_badge: '아이템 배지',
}

function missionGoalText(type: string, condition: MissionCondition): { label: string; unit: string; target: number } {
  switch (type) {
    case 'distance':
      return { label: '달성 거리', unit: 'km', target: condition.distance_km ?? 0 }
    case 'activity_count':
      return { label: '활동 횟수', unit: '회', target: condition.count ?? 0 }
    case 'poi_visit':
      return { label: 'POI 방문', unit: '곳', target: 1 }
    case 'item_collect':
      return { label: '아이템 수집', unit: '개', target: 1 }
    default:
      return { label: '목표', unit: '', target: 0 }
  }
}

function timeLeft(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return '종료됨'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간 남음`
  return `${h}시간 ${m}분 남음`
}

export default function MissionDetailClient({ mission, isParticipating, isCompleted, progressValue }: Props) {
  const [participating, setParticipating] = useState(isParticipating)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const condition = mission.condition_json as MissionCondition
  const goal = missionGoalText(mission.mission_type, condition)
  const progressPct = goal.target > 0 ? Math.min(100, (progressValue / goal.target) * 100) : 0
  const isActive = new Date(mission.starts_at) <= new Date() && new Date(mission.ends_at) > new Date()

  async function handleJoin() {
    setLoading(true)
    try {
      const res = await fetch(`/api/missions/${mission.id}/join`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast(data.error ?? '오류가 발생했어요.', 'error'); return }
      setParticipating(true)
      toast('미션에 참가했어요!', 'success')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try {
      const res = await fetch(`/api/missions/${mission.id}/join`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { toast(data.error ?? '오류가 발생했어요.', 'error'); return }
      setParticipating(false)
      toast('미션 참가를 취소했어요.', 'info')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-full px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 bg-jam-yellow">
      {/* 뒤로가기 */}
      <button
        onClick={() => router.back()}
        className="text-jam-ink/60 text-sm font-bold mb-4 self-start active:opacity-60"
      >
        ← 미션 목록
      </button>

      {/* 상태 배지 */}
      <div className="flex items-center gap-2 mb-3">
        {isCompleted && (
          <span className="text-[10px] font-black bg-jam-ink text-white px-2 py-1 rounded-lg">완료</span>
        )}
        {!isCompleted && participating && (
          <span className="text-[10px] font-black bg-jam-ink text-white px-2 py-1 rounded-lg">참가중</span>
        )}
        {!isActive && !isCompleted && (
          <span className="text-[10px] font-black bg-jam-ink/20 text-jam-ink px-2 py-1 rounded-lg">예정</span>
        )}
        <span className="text-xs text-jam-ink/50 font-semibold">{timeLeft(mission.ends_at)}</span>
      </div>

      <h1 className="text-3xl font-black text-jam-ink leading-tight mb-2">{mission.title}</h1>
      {mission.description && (
        <p className="text-jam-ink/60 text-sm font-semibold mb-6">{mission.description}</p>
      )}

      {/* 달성 조건 */}
      <div className="bg-white border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] p-4 mb-4">
        <p className="text-[10px] font-black text-jam-ink/50 uppercase tracking-widest mb-3">달성 조건</p>
        <div className="flex items-end justify-between mb-2">
          <div>
            <p className="text-xs text-jam-ink/50 font-semibold mb-0.5">{goal.label}</p>
            <p className="text-2xl font-black text-jam-ink">
              {goal.target}{goal.unit}
            </p>
          </div>
          {condition.activity_type && (
            <span className="text-xs font-black text-jam-ink bg-jam-yellow border-[2px] border-jam-ink px-2 py-1 rounded-lg capitalize">
              {condition.activity_type}
            </span>
          )}
        </div>
      </div>

      {/* 진행 상황 */}
      {(participating || isCompleted) && goal.target > 0 && (
        <div className="bg-white border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] p-4 mb-4">
          <p className="text-[10px] font-black text-jam-ink/50 uppercase tracking-widest mb-3">나의 진행 상황</p>
          <div className="flex items-end justify-between mb-2">
            <p className="text-2xl font-black text-jam-ink">
              {isCompleted ? goal.target : progressValue.toFixed(mission.mission_type === 'distance' ? 1 : 0)}
              <span className="text-sm font-bold text-jam-ink/50 ml-1">{goal.unit}</span>
            </p>
            <p className="text-sm text-jam-ink/50 font-semibold">/ {goal.target}{goal.unit}</p>
          </div>
          <div className="h-2.5 bg-jam-ink/10 rounded-full overflow-hidden border border-jam-ink/20">
            <div
              className={`h-full rounded-full transition-all ${isCompleted ? 'bg-jam-lime' : 'bg-jam-ink'}`}
              style={{ width: `${isCompleted ? 100 : progressPct}%` }}
            />
          </div>
          <p className="text-xs text-jam-ink/50 font-semibold mt-1 text-right">
            {isCompleted ? '달성 완료!' : `${Math.round(progressPct)}% 달성`}
          </p>
        </div>
      )}

      {/* 보상 */}
      <div className="bg-white border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] p-4 mb-6">
        <p className="text-[10px] font-black text-jam-ink/50 uppercase tracking-widest mb-2">보상</p>
        <p className="text-sm font-black text-jam-ink">
          {rewardTypeLabel[mission.reward_type] ?? mission.reward_type}
          {mission.reward_points ? ` ${mission.reward_points}P` : ''}
        </p>
        {mission.max_completions && (
          <p className="text-xs text-[#FC4C02] font-black mt-1">선착순 {mission.max_completions.toLocaleString()}명</p>
        )}
      </div>

      {/* 참가/취소 버튼 */}
      {isActive && !isCompleted && (
        participating ? (
          <button
            onClick={handleCancel}
            disabled={loading}
            className="w-full py-4 rounded-2xl border-[3px] border-jam-ink text-jam-ink font-black text-base active:scale-95 transition-all disabled:opacity-30 shadow-[3px_3px_0_0_#161616]"
          >
            {loading ? '처리 중...' : '참가 취소'}
          </button>
        ) : (
          <button
            onClick={handleJoin}
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-jam-ink text-white font-black text-base active:scale-95 transition-all disabled:opacity-30 shadow-[3px_3px_0_0_#161616]"
          >
            {loading ? '처리 중...' : '미션 참가하기'}
          </button>
        )
      )}

      {isCompleted && (
        <div className="w-full py-4 rounded-2xl bg-jam-lime border-[3px] border-jam-ink text-jam-ink font-black text-base text-center shadow-[3px_3px_0_0_#161616]">
          🎉 달성 완료!
        </div>
      )}
    </div>
  )
}
