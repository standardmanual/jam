'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { MissionRow } from '@/types/database'

export interface MissionListItem extends MissionRow {
  joined: boolean
  done: boolean
}

interface Props {
  ongoing: MissionListItem[] // 종료되지 않은 미션 전체 (시작 전 포함)
  ended: MissionListItem[] // 종료된 미션 중 내가 참여했던 것만
}

type Tab = 'ongoing' | 'joined' | 'ended'

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

const TABS: { key: Tab; label: string }[] = [
  { key: 'ongoing', label: '진행중' },
  { key: 'joined', label: '참여중' },
  { key: 'ended', label: '종료' },
]

export default function MissionsListClient({ ongoing, ended }: Props) {
  const [tab, setTab] = useState<Tab>('ongoing')

  const list =
    tab === 'ongoing' ? ongoing :
    tab === 'joined' ? ongoing.filter((m) => m.joined) :
    ended

  const emptyText =
    tab === 'ongoing' ? '진행 중인 미션이 없어요' :
    tab === 'joined' ? '참여 중인 미션이 없어요' :
    '종료된 참여 미션이 없어요'

  return (
    <>
      <div className="flex gap-1 mb-6 bg-jam-ink/5 p-1 rounded-2xl border-[3px] border-jam-ink">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-colors ${
              tab === t.key ? 'bg-jam-ink text-white' : 'text-jam-ink/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="text-center">
            <p className="text-5xl mb-4">🎯</p>
            <p className="text-jam-ink/60 font-bold">{emptyText}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((m) => {
            const started = new Date(m.starts_at) <= new Date()
            return (
              <Link
                key={m.id}
                href={`/missions/${m.id}`}
                className={`rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-4 block active:scale-[0.98] transition-transform ${
                  m.done ? 'bg-jam-lime' : started ? 'bg-white' : 'bg-white/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className={`font-black text-sm ${started ? 'text-jam-ink' : 'text-jam-ink/60'}`}>{m.title}</h3>
                      {m.done && (
                        <span className="text-[10px] font-black bg-jam-ink text-white px-2 py-0.5 rounded-lg">완료</span>
                      )}
                      {!m.done && m.joined && (
                        <span className="text-[10px] font-black bg-jam-ink/10 text-jam-ink px-2 py-0.5 rounded-lg">참가중</span>
                      )}
                      {!started && (
                        <span className="text-[10px] font-black bg-jam-ink/10 text-jam-ink/60 px-2 py-0.5 rounded-lg">예정</span>
                      )}
                    </div>
                    {m.description && (
                      <p className="text-jam-ink/60 text-xs font-semibold">{m.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-jam-ink/50 font-semibold">
                      {tab === 'ended' ? '종료됨' : `${timeLeft(m.ends_at)} 남음`}
                    </p>
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
      )}
    </>
  )
}
