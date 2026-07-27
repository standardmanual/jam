'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ActivityType, MissionCondition, MissionRow, MissionType } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'

export interface MissionListItem extends MissionRow {
  joined: boolean
  done: boolean
}

interface Props {
  ongoing: MissionListItem[] // 종료되지 않은 미션 전체 (시작 전 포함)
  ended: MissionListItem[] // 종료된 미션 중 내가 참여했던 것만
}

type Tab = 'ongoing' | 'joined' | 'ended'
type SortKey = 'default' | 'ending_soon' | 'newest'

const NEW_MISSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7일 이내 생성 = 신규

const MISSION_TYPE_LABELS: Record<MissionType, string> = {
  distance: '거리',
  activity_count: '횟수',
  poi_visit: '장소 방문',
  item_collect: '아이템 수집',
}

const ACTIVITY_TYPES: ActivityType[] = ['running', 'cycling', 'trail_running', 'hiking', 'walking']
const MISSION_TYPES: MissionType[] = ['distance', 'activity_count', 'poi_visit', 'item_collect']

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default', label: '기본순' },
  { key: 'ending_soon', label: '종료임박순' },
  { key: 'newest', label: '신규순' },
]

function isNewMission(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() <= NEW_MISSION_WINDOW_MS
}

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
  const [sortKey, setSortKey] = useState<SortKey>('default')
  const [activityFilter, setActivityFilter] = useState<ActivityType | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<MissionType | 'all'>('all')
  const [filterOpen, setFilterOpen] = useState(false)

  const activeFilterCount = (activityFilter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0)

  const baseList =
    tab === 'ongoing' ? ongoing :
    tab === 'joined' ? ongoing.filter((m) => m.joined) :
    ended

  const list = useMemo(() => {
    let result = baseList.filter((m) => {
      const condition = m.condition_json as MissionCondition
      if (typeFilter !== 'all' && m.mission_type !== typeFilter) return false
      if (activityFilter !== 'all' && condition.activity_type && condition.activity_type !== activityFilter) return false
      // 활동종류 필터가 걸려있는데 미션 자체에 activity_type 조건이 없으면(종목 무관 미션) 제외
      if (activityFilter !== 'all' && !condition.activity_type) return false
      return true
    })

    if (sortKey === 'ending_soon') {
      result = [...result].sort((a, b) => new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime())
    } else if (sortKey === 'newest') {
      result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    return result
  }, [baseList, sortKey, activityFilter, typeFilter])

  const emptyText =
    activeFilterCount > 0 ? '조건에 맞는 미션이 없어요' :
    tab === 'ongoing' ? '진행 중인 미션이 없어요' :
    tab === 'joined' ? '참여 중인 미션이 없어요' :
    '종료된 참여 미션이 없어요'

  function resetFilters() {
    setActivityFilter('all')
    setTypeFilter('all')
  }

  return (
    <>
      {/* 정렬 */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex gap-1 flex-1 bg-jam-ink/5 p-1 rounded-xl border-[2px] border-jam-ink">
          {SORT_OPTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSortKey(s.key)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-colors ${
                sortKey === s.key ? 'bg-jam-ink text-white' : 'text-jam-ink/60'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFilterOpen((v) => !v)}
          className={`shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl border-[2px] border-jam-ink text-xs font-black transition-colors ${
            filterOpen || activeFilterCount > 0 ? 'bg-jam-ink text-white' : 'bg-white text-jam-ink'
          }`}
        >
          필터
          {activeFilterCount > 0 && (
            <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center ${
              filterOpen ? 'bg-white text-jam-ink' : 'bg-jam-ink text-white'
            }`}>
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* 필터 패널 */}
      {filterOpen && (
        <div className="bg-white border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] p-4 mb-4 flex flex-col gap-3">
          <div>
            <p className="text-[10px] font-black text-jam-ink/50 uppercase tracking-widest mb-2">활동 종류</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActivityFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black border-[2px] border-jam-ink ${
                  activityFilter === 'all' ? 'bg-jam-ink text-white' : 'bg-white text-jam-ink'
                }`}
              >
                전체
              </button>
              {ACTIVITY_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setActivityFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black border-[2px] border-jam-ink ${
                    activityFilter === t ? 'bg-jam-ink text-white' : 'bg-white text-jam-ink'
                  }`}
                >
                  {ACTIVITY_TYPE_LABELS[t] ?? t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black text-jam-ink/50 uppercase tracking-widest mb-2">미션 유형</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black border-[2px] border-jam-ink ${
                  typeFilter === 'all' ? 'bg-jam-ink text-white' : 'bg-white text-jam-ink'
                }`}
              >
                전체
              </button>
              {MISSION_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black border-[2px] border-jam-ink ${
                    typeFilter === t ? 'bg-jam-ink text-white' : 'bg-white text-jam-ink'
                  }`}
                >
                  {MISSION_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="self-start text-xs font-bold text-jam-ink/50 underline">
              필터 초기화
            </button>
          )}
        </div>
      )}

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
                      {isNewMission(m.created_at) && (
                        <span className="text-[10px] font-black bg-[#FC4C02] text-white px-2 py-0.5 rounded-lg">NEW</span>
                      )}
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
