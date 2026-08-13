'use client'

import { useEffect, useState } from 'react'
import TopNav from '@/components/ui/TopNav'
import Card from '@/components/ui/Card'
import { UserIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'

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

interface IndividualStatus {
  progressValue: number
  achieved: boolean
  achievedAt: string | null
}

type StatusResponse =
  | { type: 'ranking'; entries: RankingEntry[]; me: RankingEntry | null; totalParticipants: number }
  | { type: 'achievement'; entries: AchievementEntry[]; me: AchievementEntry | null; totalParticipants: number }
  | { type: 'individual'; me: IndividualStatus }

interface Props {
  missionId: string
  missionTitle: string
  displayType: string
}

function Avatar({ url }: { url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
  }
  return (
    <div className="w-8 h-8 rounded-full shadow-[inset_0_0_0_1px_var(--color-border-inverse)] flex items-center justify-center shrink-0">
      <UserIcon className="w-4 h-4 text-text-inverse/50" />
    </div>
  )
}

export default function MissionStatusClient({ missionId, missionTitle, displayType }: Props) {
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
        if (!res.ok) { setError(json.error ?? d.missions.statusLoadError); return }
        setData(json as StatusResponse)
      } catch {
        if (alive) setError(d.missions.statusLoadError)
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
    <div className="min-h-full bg-surface text-text">
      <TopNav title={d.missions.backToDetail} />

      <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)] pb-[var(--spacing-32)]">
        <p className="text-[10px] uppercase text-text/50 mb-1">{d.missions.statusEyebrow}</p>
        <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] mb-1">{missionTitle}</h1>
        <p className="text-[11px] text-text/50 mb-[var(--spacing-24)]">
          {displayType === 'individual'
            ? d.missions.statusIndividualLabel
            : displayType === 'achievement' ? d.missions.statusAchievementLabel : d.missions.statusRankingLabel}
          {data && data.type !== 'individual' ? ` · ${t(d.missions.statusParticipants, { count: data.totalParticipants })}` : ''}
        </p>

        {loading && <p className="text-text/50 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{d.missions.statusLoading}</p>}
        {error && <p className="text-text/60 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{error}</p>}

        {data?.type === 'ranking' && (
          <div className="flex flex-col gap-2">
            {data.entries.map((e) => (
              <RankingRow key={e.userId} e={e} highlight={isMeInEntries(e.userId)} />
            ))}
            {data.me && !data.entries.some((e) => e.userId === data.me!.userId) && (
              <>
                <p className="text-[10px] text-text/40 text-center my-1">{d.missions.statusMeRanking}</p>
                <RankingRow e={data.me} highlight />
              </>
            )}
            {data.entries.length === 0 && !data.me && (
              <p className="text-text/50 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{d.missions.statusNoParticipants}</p>
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
                <p className="text-[10px] text-text/40 text-center my-1">{d.missions.statusMeAchievement}</p>
                <AchievementRow e={data.me} highlight />
              </>
            )}
            {data.entries.length === 0 && !data.me && (
              <p className="text-text/50 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{d.missions.statusNoParticipants}</p>
            )}
          </div>
        )}

        {/* 개인형 — 다른 참가자 없이 본인 진행상황/달성여부만 표시 */}
        {data?.type === 'individual' && (
          <Card>
            <div className="flex items-center justify-between">
              <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">
                {d.missions.myProgressTitle}
              </span>
              {data.me.achieved ? (
                <span className="text-[10px] leading-none px-2 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] shrink-0">
                  {d.missions.achieved}
                </span>
              ) : (
                <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/70 shrink-0">
                  {data.me.progressValue.toFixed(data.me.progressValue % 1 === 0 ? 0 : 1)}
                </span>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function RankingRow({ e, highlight }: { e: RankingEntry; highlight: boolean }) {
  return (
    <Card className={highlight ? '' : 'opacity-90'}>
      <div className="flex items-center gap-[var(--spacing-16)]">
        <span className="text-[length:var(--text-body)] leading-[var(--leading-body)] w-7 text-center shrink-0">{e.rank}</span>
        <Avatar url={e.avatarUrl} />
        <span className="flex-1 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] truncate">{e.username}{highlight ? d.missions.statusMeSuffix : ''}</span>
        {e.isCompleted ? (
          <span className="text-[10px] leading-none px-2 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] shrink-0">{d.missions.tagDone}</span>
        ) : (
          <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/70 shrink-0">{e.progressValue.toFixed(e.progressValue % 1 === 0 ? 0 : 1)}</span>
        )}
      </div>
    </Card>
  )
}

function AchievementRow({ e, highlight }: { e: AchievementEntry; highlight: boolean }) {
  return (
    <Card className={highlight ? '' : 'opacity-90'}>
      <div className="flex items-center gap-[var(--spacing-16)]">
        <Avatar url={e.avatarUrl} />
        <span className="flex-1 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] truncate">{e.username}{highlight ? d.missions.statusMeSuffix : ''}</span>
        {e.achieved ? (
          <span className="text-[10px] leading-none px-2 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] shrink-0">{d.missions.achieved}</span>
        ) : (
          <span className="text-[10px] leading-none text-text-inverse/40 px-2 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] shrink-0">{d.missions.notAchieved}</span>
        )}
      </div>
    </Card>
  )
}
