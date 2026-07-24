'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/components/ui/Toast'
import type { MissionRow, MissionCondition } from '@/types/database'

export interface RewardBadgeInfo {
  id: string
  name: string
  image_url: string | null
}

interface Props {
  mission: MissionRow
  isParticipating: boolean
  isCompleted: boolean
  progressValue: number
  rewardBadges: RewardBadgeInfo[]
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

export default function MissionDetailClient({ mission, isParticipating, isCompleted, progressValue, rewardBadges }: Props) {
  const [participating, setParticipating] = useState(isParticipating)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const condition = mission.condition_json as MissionCondition
  const goal = missionGoalText(mission.mission_type, condition)
  const progressPct = goal.target > 0 ? Math.min(100, (progressValue / goal.target) * 100) : 0
  const isActive = new Date(mission.starts_at) <= new Date() && new Date(mission.ends_at) > new Date()
  // 달성형(poi_visit/item_collect) — 진행 바 대신 달성/미달성 배지로 표시
  const isAchievementType = mission.mission_type === 'poi_visit' || mission.mission_type === 'item_collect'
  const achieved = isCompleted || progressValue >= 1

  async function handleJoin() {
    setLoading(true)
    try {
      const res = await fetch(`/api/missions/${mission.id}/join`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast(data.error ?? '오류가 발생했어요.', 'error'); return }
      setParticipating(true)
      setConfirming(false)
      toast('미션에 참가했어요!', 'success')
      router.refresh()
    } catch {
      toast('네트워크 오류가 발생했어요. 다시 시도해주세요.', 'error')
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
        isAchievementType ? (
          <div className="bg-white border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] p-4 mb-4">
            <p className="text-[10px] font-black text-jam-ink/50 uppercase tracking-widest mb-3">나의 진행 상황</p>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-jam-ink/60">{goal.label}</p>
              {achieved ? (
                <span className="text-sm font-black bg-jam-lime border-[2px] border-jam-ink text-jam-ink px-3 py-1.5 rounded-xl">✓ 달성</span>
              ) : (
                <span className="text-sm font-black bg-jam-ink/10 border-[2px] border-jam-ink/20 text-jam-ink/50 px-3 py-1.5 rounded-xl">미달성</span>
              )}
            </div>
          </div>
        ) : (
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
        )
      )}

      {/* 보상 */}
      <div className="bg-white border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] p-4 mb-6">
        <p className="text-[10px] font-black text-jam-ink/50 uppercase tracking-widest mb-2">보상</p>
        {rewardBadges.length === 0 && !mission.reward_points ? (
          <p className="text-sm font-black text-jam-ink/40">보상 없음</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rewardBadges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {rewardBadges.map((b) => (
                  <span key={b.id} className="flex items-center gap-1.5 text-xs font-black text-jam-ink bg-jam-yellow border-[2px] border-jam-ink px-2 py-1 rounded-lg">
                    {b.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.image_url} alt="" className="w-4 h-4 object-contain" />
                    )}
                    {b.name}
                  </span>
                ))}
              </div>
            )}
            {mission.reward_points ? (
              <p className="text-sm font-black text-jam-ink">JAM 포인트 {mission.reward_points}P</p>
            ) : null}
          </div>
        )}
        {mission.max_completions && (
          <p className="text-xs text-[#FC4C02] font-black mt-1">선착순 {mission.max_completions.toLocaleString()}명</p>
        )}
      </div>

      {/* 미션 상황 — 참가자만 노출 */}
      {(participating || isCompleted) && (
        <Link
          href={`/missions/${mission.id}/status`}
          className="w-full py-3 mb-4 rounded-2xl bg-white border-[3px] border-jam-ink text-jam-ink font-black text-sm text-center shadow-[3px_3px_0_0_#161616] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          📊 미션 상황 보기
        </Link>
      )}

      {/* 참가 버튼 — 참가 취소는 불가(Phase13). 네이티브 confirm() 대신 인앱 확인 UI 사용
          (모바일/PWA에서 연속 confirm() 호출이 브라우저에 의해 조용히 차단되는 문제 회피) */}
      {isActive && !isCompleted && !participating && (
        confirming ? (
          <div className="rounded-2xl border-[3px] border-jam-ink bg-white p-4 shadow-[3px_3px_0_0_#161616]">
            <p className="text-sm font-black text-jam-ink text-center mb-3">한번 참가하면 취소할 수 없어요. 참가할까요?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-jam-ink/10 text-jam-ink font-black text-sm active:scale-95 transition-all disabled:opacity-30"
              >
                취소
              </button>
              <button
                onClick={handleJoin}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-jam-ink text-white font-black text-sm active:scale-95 transition-all disabled:opacity-30"
              >
                {loading ? '처리 중...' : '참가 확정'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => setConfirming(true)}
              className="w-full py-4 rounded-2xl bg-jam-ink text-white font-black text-base active:scale-95 transition-all shadow-[3px_3px_0_0_#161616]"
            >
              미션 참가하기
            </button>
            <p className="text-xs text-jam-ink/50 font-semibold text-center mt-2">참가 후에는 취소할 수 없어요.</p>
          </>
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
