'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface RankingEntry {
  userId: string
  username: string
  avatarUrl: string | null
  progressValue: number
  isCompleted: boolean
  completedAt: string | null
  rank: number
}

interface AchievementEntry {
  userId: string
  username: string
  avatarUrl: string | null
  achieved: boolean
  achievedAt: string | null
}

type StatusResponse =
  | { type: 'ranking'; entries: RankingEntry[]; me: RankingEntry | null; totalParticipants: number }
  | { type: 'achievement'; entries: AchievementEntry[]; me: AchievementEntry | null; totalParticipants: number }

interface Props {
  missionId: string
  missionTitle: string
  displayType: string
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="w-8 h-8 rounded-full object-cover border-[2px] border-jam-ink" />
  }
  return (
    <div className="w-8 h-8 rounded-full bg-jam-ink/10 border-[2px] border-jam-ink flex items-center justify-center text-xs font-black text-jam-ink">
      {name.slice(0, 1)}
    </div>
  )
}

export default function MissionStatusClient({ missionId, missionTitle, displayType }: Props) {
  const router = useRouter()
  const [data, setData] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/missions/${missionId}/status`)
        const json = await res.json()
        if (!alive) return
        if (!res.ok) { setError(json.error ?? '불러오지 못했어요.'); return }
        setData(json as StatusResponse)
      } catch {
        if (alive) setError('불러오지 못했어요.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [missionId])

  const isMeInEntries = (userId: string) =>
    data?.type === 'ranking'
      ? data.me?.userId === userId
      : data?.type === 'achievement'
        ? data.me?.userId === userId
        : false

  return (
    <div className="flex flex-col min-h-full px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 bg-jam-yellow">
      <button onClick={() => router.back()} className="text-jam-ink/60 text-sm font-bold mb-4 self-start active:opacity-60">
        ← 미션 상세
      </button>

      <p className="text-[10px] font-black text-jam-ink/50 uppercase tracking-widest mb-1">미션 상황</p>
      <h1 className="text-2xl font-black text-jam-ink leading-tight mb-1">{missionTitle}</h1>
      <p className="text-xs text-jam-ink/50 font-bold mb-5">
        {displayType === 'achievement' ? '달성 현황' : '랭킹'}
        {data ? ` · 참가자 ${data.totalParticipants}명` : ''}
      </p>

      {loading && <p className="text-jam-ink/50 font-bold text-sm">불러오는 중...</p>}
      {error && <p className="text-jam-ink/60 font-bold text-sm">{error}</p>}

      {data?.type === 'ranking' && (
        <div className="flex flex-col gap-2">
          {data.entries.map((e) => (
            <RankingRow key={e.userId} e={e} highlight={isMeInEntries(e.userId)} />
          ))}
          {data.me && !data.entries.some((e) => e.userId === data.me!.userId) && (
            <>
              <p className="text-[10px] font-black text-jam-ink/40 text-center my-1">— 내 순위 —</p>
              <RankingRow e={data.me} highlight />
            </>
          )}
          {data.entries.length === 0 && !data.me && (
            <p className="text-jam-ink/50 font-bold text-sm">아직 참가자가 없어요.</p>
          )}
        </div>
      )}

      {data?.type === 'achievement' && (
        <div className="flex flex-col gap-2">
          {data.entries.map((e) => (
            <AchievementRow key={e.userId} e={e} highlight={isMeInEntries(e.userId)} />
          ))}
          {data.me && !data.entries.some((e) => e.userId === data.me!.userId) && (
            <>
              <p className="text-[10px] font-black text-jam-ink/40 text-center my-1">— 나 —</p>
              <AchievementRow e={data.me} highlight />
            </>
          )}
          {data.entries.length === 0 && !data.me && (
            <p className="text-jam-ink/50 font-bold text-sm">아직 참가자가 없어요.</p>
          )}
        </div>
      )}
    </div>
  )
}

function RankingRow({ e, highlight }: { e: RankingEntry; highlight: boolean }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] ${highlight ? 'bg-jam-lime' : e.isCompleted ? 'bg-white' : 'bg-white/70'}`}>
      <span className="text-base font-black text-jam-ink w-7 text-center shrink-0">{e.rank}</span>
      <Avatar url={e.avatarUrl} name={e.username} />
      <span className="flex-1 font-black text-sm text-jam-ink truncate">{e.username}{highlight ? ' (나)' : ''}</span>
      {e.isCompleted ? (
        <span className="text-xs font-black bg-jam-ink text-white px-2 py-1 rounded-lg shrink-0">완료</span>
      ) : (
        <span className="text-sm font-black text-jam-ink/70 shrink-0">{e.progressValue.toFixed(e.progressValue % 1 === 0 ? 0 : 1)}</span>
      )}
    </div>
  )
}

function AchievementRow({ e, highlight }: { e: AchievementEntry; highlight: boolean }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] ${highlight ? 'bg-jam-lime' : 'bg-white'}`}>
      <Avatar url={e.avatarUrl} name={e.username} />
      <span className="flex-1 font-black text-sm text-jam-ink truncate">{e.username}{highlight ? ' (나)' : ''}</span>
      {e.achieved ? (
        <span className="text-xs font-black bg-jam-lime border-[2px] border-jam-ink text-jam-ink px-2 py-1 rounded-lg shrink-0">✓ 달성</span>
      ) : (
        <span className="text-xs font-black bg-jam-ink/10 border-[2px] border-jam-ink/20 text-jam-ink/50 px-2 py-1 rounded-lg shrink-0">미달성</span>
      )}
    </div>
  )
}
