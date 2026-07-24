import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { MissionRow, UserMissionCompletionRow, UserMissionParticipationRow } from '@/types/database'
import LocalDate from '@/components/LocalDate'

function timeLeft(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return '종료'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간`
  return `${h}시간 ${m}분`
}

// Phase13: 보상은 배지 복수 + 포인트 조합 — 목록에서는 간단히 요약
function rewardSummary(m: MissionRow): string {
  const parts: string[] = []
  const badgeCount = m.reward_badge_ids?.length ?? 0
  if (badgeCount > 0) parts.push(`배지 ${badgeCount}개`)
  if (m.reward_points) parts.push(`${m.reward_points}P`)
  return parts.length > 0 ? parts.join(' + ') : '없음'
}

export default async function MissionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const now = new Date().toISOString()

  const [{ data: missionsRaw }, { data: completionsRaw }, { data: participationsRaw }] = await Promise.all([
    service.from('missions').select('*').gte('ends_at', now).order('ends_at', { ascending: true }),
    service.from('user_mission_completions').select('mission_id, completed_at').eq('user_id', user.id),
    service.from('user_mission_participations').select('mission_id, progress_value').eq('user_id', user.id),
  ])

  const missions = (missionsRaw ?? []) as MissionRow[]
  const completions = (completionsRaw ?? []) as Pick<UserMissionCompletionRow, 'mission_id' | 'completed_at'>[]
  const participations = (participationsRaw ?? []) as Pick<UserMissionParticipationRow, 'mission_id' | 'progress_value'>[]

  const completionMap = new Map(completions.map((c) => [c.mission_id, c.completed_at]))
  const participationSet = new Set(participations.map((p) => p.mission_id))

  const active = missions.filter((m) => new Date(m.starts_at) <= new Date())
  const upcoming = missions.filter((m) => new Date(m.starts_at) > new Date())

  return (
    <div className="flex flex-col min-h-full px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 bg-jam-yellow">
      <div className="mb-6">
        <p className="text-jam-ink/60 text-sm font-bold">단기 목표</p>
        <h1 className="text-4xl font-black text-jam-ink leading-tight">미션</h1>
      </div>

      {active.length === 0 && upcoming.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-5xl mb-4">🎯</p>
            <p className="text-jam-ink/60 font-bold">진행 중인 미션이 없어요</p>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <section className="mb-8">
          <p className="text-[10px] font-black text-jam-ink/50 uppercase tracking-widest mb-3">진행 중</p>
          <div className="flex flex-col gap-3">
            {active.map((m) => {
              const done = completionMap.has(m.id)
              const joined = participationSet.has(m.id)
              return (
                <Link
                  key={m.id}
                  href={`/missions/${m.id}`}
                  className={`rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-4 block active:scale-[0.98] transition-transform ${done ? 'bg-jam-lime' : 'bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-black text-sm text-jam-ink">{m.title}</h3>
                        {done && (
                          <span className="text-[10px] font-black bg-jam-ink text-white px-2 py-0.5 rounded-lg">완료</span>
                        )}
                        {!done && joined && (
                          <span className="text-[10px] font-black bg-jam-ink/10 text-jam-ink px-2 py-0.5 rounded-lg">참가중</span>
                        )}
                      </div>
                      {m.description && (
                        <p className="text-jam-ink/60 text-xs font-semibold">{m.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-jam-ink/50 font-semibold">{timeLeft(m.ends_at)} 남음</p>
                      {m.max_completions && (
                        <p className="text-xs text-[#FC4C02] font-black mt-0.5">
                          선착순 {m.max_completions.toLocaleString()}명
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-jam-ink/50 font-bold">
                      보상: {rewardSummary(m)}
                    </span>
                    <span className="text-[10px] font-black text-jam-ink/30 uppercase">{m.mission_type}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <p className="text-[10px] font-black text-jam-ink/50 uppercase tracking-widest mb-3">예정</p>
          <div className="flex flex-col gap-3">
            {upcoming.map((m) => (
              <Link
                key={m.id}
                href={`/missions/${m.id}`}
                className="bg-white/50 border-[3px] border-jam-ink/30 rounded-2xl p-4 block"
              >
                <h3 className="font-black text-sm text-jam-ink/60 mb-1">{m.title}</h3>
                <p className="text-xs text-jam-ink/40 font-semibold">
                  <LocalDate iso={m.starts_at} options={{ year: 'numeric', month: 'numeric', day: 'numeric' }} /> 시작
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
