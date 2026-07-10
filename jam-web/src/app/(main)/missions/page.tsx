import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { MissionRow, UserMissionCompletionRow } from '@/types/database'

function timeLeft(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return '종료'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간`
  return `${h}시간 ${m}분`
}

const rewardTypeLabel: Record<string, string> = {
  badge: '배지',
  points: 'JAM 포인트',
  item_badge: '아이템 배지',
}

export default async function MissionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const now = new Date().toISOString()

  const [{ data: missionsRaw }, { data: completionsRaw }] = await Promise.all([
    service.from('missions').select('*').gte('ends_at', now).order('ends_at', { ascending: true }),
    service.from('user_mission_completions').select('mission_id, completed_at').eq('user_id', user.id),
  ])

  const missions = (missionsRaw ?? []) as MissionRow[]
  const completions = (completionsRaw ?? []) as Pick<UserMissionCompletionRow, 'mission_id' | 'completed_at'>[]
  const completionMap = new Map(completions.map((c) => [c.mission_id, c.completed_at]))

  const active = missions.filter((m) => new Date(m.starts_at) <= new Date())
  const upcoming = missions.filter((m) => new Date(m.starts_at) > new Date())

  return (
    <div className="flex flex-col min-h-full px-5 py-5">
      <h1 className="text-2xl font-black mb-1">미션</h1>
      <p className="text-white/40 text-sm mb-6">단기 목표를 달성하고 특별 보상을 받으세요</p>

      {active.length === 0 && upcoming.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/30 text-center">현재 진행 중인 미션이 없어요</p>
        </div>
      )}

      {active.length > 0 && (
        <section className="mb-8">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-3">진행 중</p>
          <div className="flex flex-col gap-3">
            {active.map((m) => {
              const done = completionMap.has(m.id)
              return (
                <div
                  key={m.id}
                  className={`border rounded-2xl p-4 ${done ? 'border-[#AEEA00]/30 bg-[#AEEA00]/5' : 'border-white/10 bg-white/5'}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-sm">{m.title}</h3>
                        {done && <span className="text-[#AEEA00] text-xs font-bold bg-[#AEEA00]/10 px-2 py-0.5 rounded-full">완료</span>}
                      </div>
                      {m.description && <p className="text-white/50 text-xs">{m.description}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-white/30">{timeLeft(m.ends_at)} 남음</p>
                      {m.max_completions && (
                        <p className="text-xs text-amber-400 mt-0.5">선착순 {m.max_completions.toLocaleString()}명</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/40">
                      보상: {rewardTypeLabel[m.reward_type] ?? m.reward_type}
                      {m.reward_points ? ` ${m.reward_points}P` : ''}
                    </span>
                    <span className="text-xs text-white/30">{m.mission_type}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <p className="text-xs text-white/40 uppercase tracking-widest mb-3">예정</p>
          <div className="flex flex-col gap-3">
            {upcoming.map((m) => (
              <div key={m.id} className="border border-white/5 rounded-2xl p-4 opacity-50">
                <h3 className="font-bold text-sm mb-1">{m.title}</h3>
                <p className="text-xs text-white/40">
                  {new Date(m.starts_at).toLocaleDateString('ko-KR')} 시작
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
